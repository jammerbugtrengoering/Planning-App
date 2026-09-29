import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// KUNDEDATABASEN (projekt zwbsbckoyxzzobudjxij). Samme opgave som Jammerbugts send-email,
// men afsendernavnet er det firma, mailen sendes for — ikke Jammerbugt Rengoering.
//
// Tre kaldere:
//   1. vores egne funktioner (service-noeglen). De sender afsender_navn med i body'en.
//   2. en indlogget bruger. Afsendernavnet slaas op paa hendes eget firma.
//   3. alle andre afvises.
//
// Kraever hemmelighederne BREVO_API_KEY og AFSENDER_EMAIL i projektet.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const AFSENDER_EMAIL = Deno.env.get("AFSENDER_EMAIL") ?? "";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const svar = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

function rolleIToken(token: string): string | null {
  try {
    const b64 = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(b64.padEnd(b64.length + (4 - b64.length % 4) % 4, "=")))?.role ?? null;
  } catch { return null; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "").trim();
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const body = await req.json().catch(() => ({}));
    const { email, name, subject, html } = body;
    if (!email || !subject) return svar({ error: "mangler_felter" }, 400);

    let afsenderNavn = "";
    let svarTil = "";
    if (token && (token === SERVICE_KEY || rolleIToken(token) === "service_role")) {
      afsenderNavn = String(body.afsender_navn ?? "");
      svarTil = String(body.svar_til ?? "");
    } else {
      const { data: u } = await admin.auth.getUser(token);
      if (!u?.user) return svar({ error: "ingen_adgang" }, 401);
      const { data: m } = await admin.from("employees").select("firma_id").eq("auth_user_id", u.user.id).maybeSingle();
      if (!m?.firma_id) return svar({ error: "ingen_adgang" }, 401);
      const { data: f } = await admin.from("firma").select("navn, afsender_navn, svar_til").eq("id", m.firma_id).maybeSingle();
      afsenderNavn = f?.afsender_navn || f?.navn || "";
      svarTil = f?.svar_til || "";
    }

    const brevoKey = Deno.env.get("BREVO_API_KEY");
    if (!brevoKey || !AFSENDER_EMAIL) return svar({ error: "mail_ikke_sat_op" }, 500);

    const r = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": brevoKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        sender: { name: afsenderNavn || "Planlægning", email: AFSENDER_EMAIL },
        ...(svarTil ? { replyTo: { email: svarTil } } : {}),
        to: [{ email, ...(name ? { name } : {}) }],
        subject, htmlContent: html,
      }),
    });
    if (r.ok || r.status === 201) return svar({ success: true });
    const fejl = await r.json().catch(() => ({}));
    console.error("Brevo afviste:", r.status, JSON.stringify(fejl).slice(0, 300));
    return svar({ error: fejl }, r.status);
  } catch (e) {
    return svar({ error: String((e as Error)?.message ?? e) }, 400);
  }
});
