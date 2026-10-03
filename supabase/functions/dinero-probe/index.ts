import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// MIDLERTIDIG. Kan man slaa en faktura op paa nummeret alene, uden at vide hvilken
// kunde den hoerer til? Proeven finder selv et rigtigt nummer og afproever tre maader
// at filtrere paa. Slettes naar svaret er kendt.
const ID = Deno.env.get("DINERO_CLIENT_ID") ?? "";
const SECRET = Deno.env.get("DINERO_CLIENT_SECRET") ?? "";
const APIKEY = Deno.env.get("DINERO_API_KEY") ?? "";
const ORG = Deno.env.get("DINERO_ORG_ID") ?? "324545";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const KLADDE = "9223372036854775807";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const jwt = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    const { data: { user } } = await admin.auth.getUser(jwt);
    if (!user) return new Response(JSON.stringify({ error: "ikke_logget_ind" }), { status: 401, headers: cors });
    const { data: m } = await admin.from("employees").select("is_admin").eq("auth_user_id", user.id).maybeSingle();
    if (!m?.is_admin) return new Response(JSON.stringify({ error: "kun_planlaegger" }), { status: 403, headers: cors });

    const enc = btoa(`${ID}:${SECRET}`);
    const tRes = await fetch("https://authz.dinero.dk/dineroapi/oauth/token", {
      method: "POST",
      headers: { Authorization: `Basic ${enc}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "password", scope: "read write", username: APIKEY, password: APIKEY }),
    });
    const token = (await tRes.json()).access_token;
    const h = { Authorization: `Bearer ${token}` };

    // Find et RIGTIGT fakturanummer at proeve med. Kladder har 9223372036854775807,
    // og dem kan man ikke slaa op paa.
    const listeRes = await fetch(
      `https://api.dinero.dk/v1/${ORG}/invoices?pageSize=100&fields=Guid,Number,ContactName,Date,Status`, { headers: h });
    const liste = await listeRes.json();
    const rigtig = (liste?.Collection ?? [])
      .find((f: any) => String(f.Number ?? "") && String(f.Number) !== KLADDE);

    if (!rigtig) {
      return new Response(JSON.stringify({
        besked: "Ingen bogfoerte fakturaer med rigtigt nummer at proeve med.",
        eksempler: (liste?.Collection ?? []).slice(0, 3),
      }, null, 1), { headers: { ...cors, "Content-Type": "application/json" } });
    }

    const nr = String(rigtig.Number);
    const varianter: Record<string, string> = {
      "1 uden apostrof": `https://api.dinero.dk/v1/${ORG}/invoices?pageSize=5&fields=Guid,Number,ContactName,ContactGuid,Date&queryFilter=${encodeURIComponent("Number eq " + nr)}`,
      "2 med apostrof": `https://api.dinero.dk/v1/${ORG}/invoices?pageSize=5&fields=Guid,Number,ContactName,ContactGuid,Date&queryFilter=${encodeURIComponent("Number eq '" + nr + "'")}`,
      "3 contains": `https://api.dinero.dk/v1/${ORG}/invoices?pageSize=5&fields=Guid,Number,ContactName,ContactGuid,Date&queryFilter=${encodeURIComponent("Number contains '" + nr + "'")}`,
    };

    const svar: Record<string, unknown> = { proevedeNummer: nr, kunde: rigtig.ContactName };
    for (const [navn, url] of Object.entries(varianter)) {
      const r = await fetch(url, { headers: h });
      svar[navn] = { status: r.status, krop: (await r.text()).slice(0, 300) };
    }

    return new Response(JSON.stringify(svar, null, 1), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as Error).message) }), { status: 500, headers: cors });
  }
});
