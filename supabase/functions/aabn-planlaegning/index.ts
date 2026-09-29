import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// JAMMERBUGT RENGOERINGS DATABASE.
//
// Ét login (Jonn 29.9.2026). En Premium-kundes administrator logger ind i
// kundeportalen som altid og trykker «Planlægning». Herfra hentes et engangslink til
// hendes egen bruger i kundedatabasen, saa planlaegningen aabner logget ind — uden en
// adgangskode mere.
//
// Hvem maa: en AKTIV portalbruger med rollen admin, hvis kunde er paa Premium og har
// en aaben planlaegning. Personen i planlaegningen findes paa mailen og skal vaere
// planlaegger i netop det firma (det tjekker kundedatabasen i jr-bro).
//
// Linket virker én gang og kun kort tid. Det sendes aldrig paa mail — kun tilbage
// til den browser, der lige har bevist, hvem den er.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const KUNDE_BRO = Deno.env.get("KUNDE_BRO_URL") ?? "https://zwbsbckoyxzzobudjxij.supabase.co/functions/v1/jr-bro";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const svar = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  try {
    const jwt = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    const { data: { user } } = await admin.auth.getUser(jwt);
    if (!user) return svar({ error: "ikke_logget_ind" }, 401);

    const { data: pb } = await admin.from("portal_brugere").select("dinero_contact_guid, email, rolle")
      .eq("auth_user_id", user.id).eq("aktiv", true).maybeSingle();
    if (!pb || pb.rolle !== "admin") return svar({ error: "kun_administrator" }, 403);

    const { data: pa } = await admin.from("portal_abonnement").select("option, status")
      .eq("dinero_contact_guid", pb.dinero_contact_guid).maybeSingle();
    if (pa?.status !== "aktiv" || pa.option !== "premium") return svar({ error: "ikke_premium" }, 403);

    const { data: kl } = await admin.from("kundeloesning").select("firma_id, status")
      .eq("dinero_contact_guid", pb.dinero_contact_guid).maybeSingle();
    if (!kl || kl.status !== "aktiv") return svar({ error: "ikke_aaben" }, 403);

    const { data: noegle } = await admin.rpc("bro_noegle");
    const r = await fetch(KUNDE_BRO, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-bro-noegle": String(noegle ?? "") },
      body: JSON.stringify({ handling: "login_link", firma_id: kl.firma_id, email: (pb.email || user.email || "").toLowerCase() }),
    }).catch(() => null);
    if (!r) return svar({ error: "kundedb_utilgaengelig" }, 502);
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !d.url) return svar({ error: d.error || "ukendt" }, r.ok ? 500 : r.status);
    return svar({ ok: true, url: d.url });
  } catch (e) {
    console.error("aabn-planlaegning:", String((e as Error)?.message ?? e));
    return svar({ error: "ukendt" }, 500);
  }
});
