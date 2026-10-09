import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Posteringer fra Dinero pr. konto og måned (9.10.2026, Jonn), til sammenligning med de omkostninger, appen selv regner (Overskud-rapporten).
//
// Kun læsning fra Dinero. Gemmer summen pr. konto og måned i dinero_posteringer_maaned, aldrig bilagstekster eller navne. Svaret til den, der kalder, er kun antal:
// kaldes med cron'ens offentlige nøgle ligesom dinero-omsaetning-sync, så intet fra Dinero må returneres.
//
// Første version: Dineros /entries-endpoint er ikke afprøvet med jeres nøgle. Funktionen prøver tre udgaver af forespørgslen, og siger i job-loggen (log_job) hvilken der virkede,
// eller hvad Dinero svarede, så den kan rettes uden at gætte. Alle konti gemmes; hvilke der er omkostninger afgøres, når vi har set kontoplanen.
const DINERO_CLIENT_ID = Deno.env.get("DINERO_CLIENT_ID") ?? "";
const DINERO_CLIENT_SECRET = Deno.env.get("DINERO_CLIENT_SECRET") ?? "";
const DINERO_API_KEY = Deno.env.get("DINERO_API_KEY") ?? "";
const DINERO_ORG_ID = Deno.env.get("DINERO_ORG_ID") ?? "324545";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const JOB = "dinero-posteringer-sync";

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
    const aar = new Date().getFullYear();
    const fra = `${aar}-01-01`, til = `${aar}-12-31`;
    const base = `https://api.dinero.dk/v1/${DINERO_ORG_ID}/entries`;
    const udgaver = [
      `${base}?startDate=${fra}&endDate=${til}&pageSize=1000&page=0`,
      `${base}?fromDate=${fra}&toDate=${til}&pageSize=1000&page=0`,
      `${base}?pageSize=1000&page=0`,
    ];
    const forsoeg: string[] = [];
    let virkede: string | null = null;
    let foerste: any = null;
    for (const url of udgaver) {
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      const tekst = await res.text();
      if (res.ok) { virkede = url; try { foerste = JSON.parse(tekst); } catch { foerste = null; } break; }
      forsoeg.push(`${res.status} ${url.split("?")[1]?.split("&")[0]}: ${tekst.slice(0, 160).replace(/\s+/g, " ")}`);
    }
    if (!virkede || !foerste) {
      await log(false, "Dinero afviste alle udgaver af /entries | " + forsoeg.join(" | "));
      return jsonResponse({ error: "afvist" }, 500);
    }

    // Hent alle sider. Stopper, når en side er tom eller starter med de samme poster som forrige (så et endpoint uden sidetal ikke giver en uendelig løkke).
    const poster: any[] = [];
    let side = 0, forrigeNoegle = "";
    let data = foerste;
    while (side < 60) {
      const coll: any[] = data?.Collection ?? data?.collection ?? (Array.isArray(data) ? data : []);
      if (coll.length === 0) break;
      const noegle = JSON.stringify(coll[0]);
      if (noegle === forrigeNoegle) break;
      forrigeNoegle = noegle;
      poster.push(...coll);
      if (coll.length < 1000) break;
      side++;
      const url = virkede.replace(/page=\d+/, `page=${side}`);
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error(`Dinero afviste side ${side} af /entries (${res.status})`);
      data = await res.json();
    }

    const felt = (p: any, ...navne: string[]) => { for (const n of navne) if (p?.[n] !== undefined && p[n] !== null) return p[n]; return null; };
    const sum = new Map<string, { aar: number; maaned: number; konto: number; kontonavn: string; beloeb: number; antal: number }>();
    let udenKonto = 0;
    for (const p of poster) {
      const dato = String(felt(p, "Date", "date", "VoucherDate") ?? "").slice(0, 10);
      const konto = Number(felt(p, "AccountNumber", "accountNumber", "Account"));
      const beloeb = Number(felt(p, "Amount", "amount"));
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dato) || !Number.isFinite(konto) || !Number.isFinite(beloeb)) { udenKonto++; continue; }
      const [a, m] = dato.split("-").map(Number);
      const k = `${a}|${m}|${konto}`;
      const r = sum.get(k) ?? { aar: a, maaned: m, konto, kontonavn: String(felt(p, "AccountName", "accountName") ?? ""), beloeb: 0, antal: 0 };
      r.beloeb += beloeb; r.antal += 1;
      sum.set(k, r);
    }
    const rows = [...sum.values()].map((r) => ({ ...r, beloeb: Math.round(r.beloeb * 100) / 100, opdateret: new Date().toISOString() }));
    if (rows.length === 0) {
      // Svar kom, men ingen poster kunne læses: gem de felter, første post har, så navnene kan rettes.
      const felter = poster[0] ? Object.keys(poster[0]).join(",") : "ingen poster";
      await log(false, `/entries virkede (${virkede.split("?")[1]?.split("&")[0]}), men ingen poster kunne bruges (${poster.length} poster, ${udenKonto} uden dato/konto/beløb). Felter: ${felter}`);
      return jsonResponse({ error: "ingen_data" }, 500);
    }
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await admin.from("dinero_posteringer_maaned").upsert(rows.slice(i, i + 500), { onConflict: "aar,maaned,konto" });
      if (error) { await log(false, "kunne ikke gemme: " + error.message); return jsonResponse({ error: error.message }, 500); }
    }
    await log(true, `${poster.length} posteringer, ${rows.length} måneder×konti gemt (${virkede.split("?")[1]?.split("&")[0]})`);
    return jsonResponse({ ok: true, poster: poster.length, rader: rows.length });
  } catch (e) {
    const m = String((e as Error)?.message ?? e);
    await log(false, m);
    return jsonResponse({ error: m }, 500);
  }
});
