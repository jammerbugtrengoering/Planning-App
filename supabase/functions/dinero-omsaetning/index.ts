// Omsaetning maaned for maaned — hentet fra Dinero.
//
// Hvad der er FAKTURERET, ikke hvad der er arbejdet. Det er to forskellige tal:
// rapporten i planlaegningsappen regner omsaetning ud af den tid, medarbejderne
// har registreret, og en time, der aldrig blev til en faktura, taeller med dér
// og ikke her.
//
// Funktionen staar for sig selv og ikke inde i «dinero», fordi den blev lavet
// til ét spoergsmaal og skal kunne fjernes igen uden at roere ved det, der
// fakturerer.
//
// KUN planlaeggere. Det her er hele forretningens omsaetning i ét kald.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const DINERO_CLIENT_ID = Deno.env.get("DINERO_CLIENT_ID") ?? "";
const DINERO_CLIENT_SECRET = Deno.env.get("DINERO_CLIENT_SECRET") ?? "";
const DINERO_API_KEY = Deno.env.get("DINERO_API_KEY") ?? "";
const DINERO_ORG_ID = Deno.env.get("DINERO_ORG_ID") ?? "324545";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function svar(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function hentToken(): Promise<string> {
  const encoded = btoa(`${DINERO_CLIENT_ID}:${DINERO_CLIENT_SECRET}`);
  const res = await fetch("https://authz.dinero.dk/dineroapi/oauth/token", {
    method: "POST",
    headers: { "Authorization": `Basic ${encoded}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "password", scope: "read write",
      username: DINERO_API_KEY, password: DINERO_API_KEY,
    }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Auth failed ${res.status}: ${text}`);
  const data = JSON.parse(text);
  if (!data.access_token) throw new Error("No access_token");
  return data.access_token;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const jwt = (req.headers.get("Authorization") ?? "").replace("Bearer ", "").trim();
    const { data: { user } } = await admin.auth.getUser(jwt);
    if (!user) return svar({ error: "ikke_logget_ind" }, 401);

    const { data: medarb } = await admin
      .from("employees").select("id, is_admin").eq("auth_user_id", user.id).maybeSingle();
    if (!medarb?.is_admin) return svar({ error: "kun_planlaegger" }, 403);

    const krop = await req.json().catch(() => ({}));
    const aarTal = Number(krop?.aar) || new Date().getFullYear();

    const token = await hentToken();
    const felter = "Number,Date,PaymentDate,Status,TotalExclVat,TotalInclVat,ContactName";

    // startDate/endDate paa dette endpoint VIRKER. Det er queryFilter, der kun
    // tager én betingelse — derfor kan kundefakturaer i «dinero» ikke afgraense
    // paa dato, og derfor staar der ikke et filter dér.
    //
    // Der hentes side for side, indtil en side kommer hjem med faerre end der blev
    // bedt om. Der stoles ikke paa et sidetal fra svaret, og 20 sider er en
    // spaerre mod at koere i ring.
    const alle: any[] = [];
    for (let side = 0; side < 20; side++) {
      const url = `https://api.dinero.dk/v1/${DINERO_ORG_ID}/invoices`
        + `?startDate=${aarTal}-01-01&endDate=${aarTal}-12-31`
        + `&fields=${felter}&pageSize=1000&page=${side}`;
      let res: Response;
      try {
        res = await fetch(url, {
          headers: { Authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(25000),
        });
      } catch (e) {
        console.error("omsaetning timeout:", String((e as Error)?.message ?? e));
        return svar({ error: "dinero_svarede_ikke",
          message: "Dinero svarede ikke inden for 25 sekunder. Prøv igen om lidt." });
      }
      const tekst = await res.text();
      if (!res.ok) {
        console.error("omsaetning:", res.status, tekst.slice(0, 400));
        return svar({ error: "dinero_afviste", dineroStatus: res.status,
          message: tekst.slice(0, 400) || "Dinero svarede " + res.status + " uden forklaring." });
      }
      const stk = JSON.parse(tekst)?.Collection ?? [];
      alle.push(...stk);
      if (stk.length < 1000) break;
    }

    // Kladder er ikke omsaetning. De er ikke sendt til nogen, kan aendres eller
    // slettes — og de paavirkes IKKE af datoafgraensningen, saa en kladde fra et
    // helt andet aar ville ellers lande midt i tallene her.
    const bogfoerte = alle.filter((f: any) => String(f.Status ?? "") !== "Draft");

    const maaneder = Array.from({ length: 12 }, (_, i) => ({
      maaned: i + 1, antal: 0, eksklMoms: 0, inklMoms: 0, betalt: 0, udestaaende: 0,
    }));
    const kunder = new Map<string, number>();
    const status = new Map<string, number>();
    bogfoerte.forEach((f: any) => {
      const m = Number(String(f.Date ?? "").slice(5, 7));
      if (!(m >= 1 && m <= 12)) return;
      const r = maaneder[m - 1];
      const ex = Number(f.TotalExclVat) || 0;
      r.antal += 1;
      r.eksklMoms += ex;
      r.inklMoms += Number(f.TotalInclVat) || 0;
      const st = String(f.Status ?? "");
      if (st === "Paid" || st === "OverPaid") r.betalt += ex; else r.udestaaende += ex;
      status.set(st, (status.get(st) || 0) + ex);
      const navn = String(f.ContactName ?? "(uden navn)");
      kunder.set(navn, (kunder.get(navn) || 0) + ex);
    });

    return svar({
      ok: true,
      aar: aarTal,
      antalFakturaer: bogfoerte.length,
      kladderSprunget: alle.length - bogfoerte.length,
      maaneder,
      iAlt: {
        eksklMoms: maaneder.reduce((s, r) => s + r.eksklMoms, 0),
        inklMoms: maaneder.reduce((s, r) => s + r.inklMoms, 0),
        betalt: maaneder.reduce((s, r) => s + r.betalt, 0),
        udestaaende: maaneder.reduce((s, r) => s + r.udestaaende, 0),
      },
      efterStatus: [...status.entries()].map(([navn, beloeb]) => ({ navn, beloeb })),
      topKunder: [...kunder.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20)
        .map(([navn, beloeb]) => ({ navn, beloeb })),
    });
  } catch (err) {
    console.error("dinero-omsaetning:", (err as Error).message);
    return svar({ error: (err as Error).message }, 500);
  }
});
