import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Sender kunden en sekscifret kode til portalen.
//
// Hvorfor ikke bare supabase.auth.signInWithOtp() fra browseren? Fordi den sender
// gennem Supabases egen mailer, som har en haard graense paa faa mails i timen og
// ingen leveringsovervaagning. Kunden ville staa uden kode, og ingen ville vide det.
// Her gaar mailen samme vej som invitationen: gennem Brevo, via send-email.
//
// HVORFOR KODE OG IKKE LINK. Foer stod der et engangslink i mailen. Det virkede for
// gmail-brugere og fejlede for alle med firmamail. Auth-loggen viste hvorfor: linket
// blev indloest ET MINUT efter afsendelse - foer kunden overhovedet havde mailen - og
// naar hun saa trykkede, svarede Supabase "One-time token not found".
//
// Det var Microsoft Defender SafeLinks. Firmamail scanner links ved at HENTE dem, og
// vores link var ikke en side man kunne kigge paa: et GET paa /auth/v1/verify ER
// selve handlingen og bruger tokenet op. Scanneren loggede altsaa ind som kunden,
// smed sessionen vaek, og efterlod hende en doed adresse. Brevos klik-sporing henter
// efter alt at doemme ogsaa.
//
// Et link kan ikke sikres mod det - enhver scanner har lov at hente en URL. Derfor er
// linket fjernet helt. Der er ikke laengere noget at hente i mailen. Koden er det
// samme engangstoken, men den kan kun indloeses af nogen der skriver den af.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function svar(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...cors, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const body = await req.json().catch(() => ({}));
    const email = String(body.email ?? "").trim().toLowerCase();
    const slug = String(body.slug ?? "").trim().toLowerCase();

    // Svaret er ALTID det samme udadtil. Sagde vi "den mail kender vi ikke", kunne
    // enhver bruge siden til at finde ud af hvem der er kunde hos os.
    const altidOk = svar({ ok: true });
    if (!email || !email.includes("@")) return altidOk;

    // Haard begraensning pr. mailadresse. Uden den kunne nogen bede om tusind koder
    // til den samme kunde og fylde hendes indbakke - og bruge vores Brevo-kvote.
    const { count } = await admin
      .from("portal_login_forsoeg")
      .select("*", { count: "exact", head: true })
      .eq("email", email)
      .gte("tidspunkt", new Date(Date.now() - 15 * 60 * 1000).toISOString());
    if ((count ?? 0) >= 5) return altidOk;
    await admin.from("portal_login_forsoeg").insert({ email });

    // Er hun overhovedet portalbruger, og er abonnementet aktivt? Er svaret nej,
    // sendes der ingenting - men kalderen faar samme svar som hvis det var ja.
    const { data: bruger } = await admin
      .from("portal_brugere")
      .select("navn, dinero_contact_guid, portal_abonnement!inner(status, portal_slug)")
      .eq("email", email).eq("aktiv", true).maybeSingle();
    if (!bruger) return altidOk;

    const abon = bruger.portal_abonnement as { status: string; portal_slug: string };
    if (abon?.status !== "aktiv") return altidOk;
    // Skrev hun sin mail paa en ANDEN kundes portalside, sendes der heller ikke noget.
    // Ellers kunne man bruge en hvilken som helst slug til at afproeve mailadresser.
    if (slug && abon.portal_slug && slug !== abon.portal_slug) return altidOk;

    // generateLink bruges stadig - men det er email_otp vi tager med, ikke action_link.
    const { data: link, error: linkFejl } = await admin.auth.admin.generateLink({
      type: "magiclink", email,
    });
    if (linkFejl) { console.error("portal-login kode:", linkFejl.message); return altidOk; }

    const kode = link?.properties?.email_otp;
    if (!kode) { console.error("portal-login: ingen kode i svaret"); return altidOk; }

    const { error: mailFejl } = await admin.functions.invoke("send-email", {
      headers: { Authorization: `Bearer ${SERVICE_KEY}` },
      body: {
        email, name: bruger.navn ?? "",
        subject: `${kode} er din kode til kundeportalen`,
        html: `<p>Hej ${bruger.navn ?? ""}</p>`
          + `<p>Din kode til kundeportalen er:</p>`
          + `<p style="font-size:32px;font-weight:700;letter-spacing:6px;`
          + `font-family:monospace;margin:16px 0">${kode}</p>`
          + `<p>Skriv den i det felt der venter i browseren. Koden virker én gang `
          + `og udløber om en time.</p>`
          + `<p>Har du ikke selv bedt om den, kan du roligt se bort fra denne mail. `
          + `Giv den aldrig videre til nogen.</p>`,
      },
    });
    if (mailFejl) console.error("portal-login mail:", String(mailFejl.message ?? mailFejl));
    return altidOk;
  } catch (e) {
    console.error("portal-login:", String((e as Error).message ?? e));
    return svar({ ok: true });
  }
});
