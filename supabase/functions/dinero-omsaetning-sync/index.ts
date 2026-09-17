import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Natlig synkronisering af betalt omsaetning fra Dinero, til brug som en
// sammenligningskolonne i Overskud-rapporten (se App.jsx: OverskudRapport).
//
// Kaldes af pg_cron ligesom de andre natlige jobs (compute-daily-km,
// daglige-paamindelser m.fl.) - ingen bruger er logget ind naar det koerer, saa der
// tjekkes ikke nogen bruger-JWT her, kun at kaldet i det hele taget kommer ind.
//
// Dineros /invoices-endpoint kan IKKE filtrere paa Date eller Status
// ("Unsupported Property" - maalt, ikke gaettet), saa alle fakturaer hentes og
// filtreres her. Det lyder af meget, men er hurtigt: ca. 13.500 fakturaer hentes paa
// under 3 sekunder fordelt paa 14 sider af 1000 (Dineros egen graense).
//
// "page" (IKKE "pageNumber") er den rigtige side-parameter, og den er 0-indekseret:
// side 0 er den foerste/nyeste portion, ikke side 1. Det er ogsaa maalt - et tidligt
// forsoeg der startede ved side 1 manglede praecis de nyeste 1000 fakturaer.
const DINERO_CLIENT_ID = Deno.env.get("DINERO_CLIENT_ID") ?? "";
const DINERO_CLIENT_SECRET = Deno.env.get("DINERO_CLIENT_SECRET") ?? "";
const DINERO_API_KEY = Deno.env.get("DINERO_API_KEY") ?? "";
const DINERO_ORG_ID = Deno.env.get("DINERO_ORG_ID") ?? "324545";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const JOB = "dinero-omsaetning-sync";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

async function getDineroToken(): Promise<string> {
  const encoded = btoa(`${DINERO_CLIENT_ID}:${DINERO_CLIENT_SECRET}`);
  const res = await fetch("https://authz.dinero.dk/dineroapi/oauth/token", {
    method: "POST",
    headers: { Authorization: `Basic ${encoded}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "password", scope: "read write", username: DINERO_API_KEY, password: DINERO_API_KEY }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Dinero-login fejlede ${res.status}: ${text.slice(0, 300)}`);
  const data = JSON.parse(text);
  if (!data.access_token) throw new Error("Intet access_token fra Dinero");
  return data.access_token;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const log = (ok: boolean, besked?: string) => admin.rpc("log_job", { p_job: JOB, p_ok: ok, p_besked: besked ?? null });

  try {
    const token = await getDineroToken();
    const felter = "Guid,Date,Status,TotalExclVat";
    const perAar: Record<string, { beloeb: number; antal: number }> = {};

    let page = 0;
    let sider = 0;
    let hentetIAlt = 0;
    // 60 sider a 1000 er 60.000 fakturaer - rigeligt loft, virksomheden har i dag ca.
    // 13.500. Loekken stopper i praksis langt foer, naar en side kommer tom tilbage.
    while (sider < 60) {
      const url = `https://api.dinero.dk/v1/${DINERO_ORG_ID}/invoices?pageSize=1000&page=${page}&fields=${felter}`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) {
        const tekst = await res.text();
        throw new Error(`Dinero afviste fakturaopslag (side ${page}, status ${res.status}): ${tekst.slice(0, 300)}`);
      }
      const data = await res.json();
      const coll = data?.Collection ?? [];
      if (coll.length === 0) break;

      coll.forEach((f: any) => {
        if (String(f.Status) !== "Paid") return;
        const aarMaaned = String(f.Date ?? "").slice(0, 7); // "YYYY-MM"
        if (!/^\d{4}-\d{2}$/.test(aarMaaned)) return;
        if (!perAar[aarMaaned]) perAar[aarMaaned] = { beloeb: 0, antal: 0 };
        perAar[aarMaaned].beloeb += Number(f.TotalExclVat) || 0;
        perAar[aarMaaned].antal += 1;
      });

      hentetIAlt += coll.length;
      sider++;
      page++;
      if (coll.length < 1000) break; // sidste side
    }

    const rows = Object.entries(perAar).map(([aarMaaned, v]) => {
      const [aar, maaned] = aarMaaned.split("-").map(Number);
      return { aar, maaned, beloeb: Math.round(v.beloeb * 100) / 100, antal_fakturaer: v.antal, opdateret_tidspunkt: new Date().toISOString() };
    });

    if (rows.length === 0) {
      await log(false, "ingen betalte fakturaer fundet - noget er sandsynligvis galt");
      return jsonResponse({ error: "ingen_data" }, 500);
    }

    const { error: upsertErr } = await admin.from("dinero_omsaetning").upsert(rows, { onConflict: "aar,maaned" });
    if (upsertErr) {
      await log(false, "kunne ikke gemme: " + upsertErr.message);
      return jsonResponse({ error: upsertErr.message }, 500);
    }

    await log(true, `${hentetIAlt} fakturaer gennemgaaet over ${sider} sider, ${rows.length} maaneder opdateret`);
    return jsonResponse({ ok: true, hentetIAlt, sider, maanederOpdateret: rows.length });
  } catch (e) {
    const m = String((e as Error)?.message ?? e);
    await log(false, m);
    return jsonResponse({ error: m }, 500);
  }
});
