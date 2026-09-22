import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Sender mail gennem Brevo i Jammerbugt Rengoerings navn.
//
// Funktionen laa foer helt aaben: kendte man URL'en, kunne man sende mail som
// jammerbugtrengoering@outlook.dk.
//
// verify_jwt er STADIG slaaet fra - med vilje. Havde vi slaaet den til, ville Supabase
// ogsaa godtage den offentlige noegle, og den ligger i browser-bundtet paa begge sider.
// Doeren ville altsaa stadig staa aaben. I stedet afgoeres det herinde, hvor vi kan
// skelne mellem den offentlige noegle og et rigtigt login.
//
// Tre slags kaldere slipper igennem:
//   1. en indlogget medarbejder eller planlaegger
//   2. service-noeglen, altsaa et andet stykke af vores egen bagside
//   3. et token hvis rolle er service_role
//
// Punkt 3 er ikke overfloedigt. Foerste udgave sammenlignede kun med env-variablen, og
// det fik de daglige paamindelser til at fejle med 401 i stilhed - ingen opdagede det
// foer dagen efter. Rollen i selve tokenet er den paalidelige kilde.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

// AFSENDEREN ER EN INDSTILLING, ikke en konstant.
//
// Den stod foer haardt i koden som jammerbugtrengoering@outlook.dk. Det er en
// Microsoft-adresse, og vi kan ikke laegge SPF- og DKIM-poster paa outlook.dk -
// de tilhoerer Microsoft. Mailen kom altsaa fra Brevos servere og PAASTOD at vaere
// fra Microsoft, uden at modtageren kunne bekraefte det. Gmail og yahoo lod den
// slippe igennem; Microsoft 365 satte en advarselsbjaelke oeverst i hver eneste mail.
//
// Naar et domaene vi selv ejer er godkendt i Brevo, saettes AFSENDER_EMAIL i
// Supabase - saa skifter alle mails afsender uden at noget skal bygges om.
// Falder den tilbage, er det til den gamle adresse, saa mailen ikke stopper med
// at blive sendt fordi en indstilling mangler.
const AFSENDER_EMAIL = Deno.env.get("AFSENDER_EMAIL") ?? "jammerbugtrengoering@outlook.dk";
const AFSENDER_NAVN = Deno.env.get("AFSENDER_NAVN") ?? "Jammerbugt Rengøring";
// Svarer kunden paa en mail fra ingen-svar@, skal svaret helst lande et sted nogen
// laeser. Er den ikke sat, foelger Brevo bare afsenderen.
const SVAR_TIL = Deno.env.get("SVAR_TIL") ?? "";

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

// Laeser rollen ud af et JWT uden at verificere det. Det er forsvarligt HER, fordi
// tokenet allerede er kommet fra Supabases egen gateway - og fordi vi kun bruger det
// til at genkende vores egen bagside, ikke til at give en bruger rettigheder.
function rolleIToken(token: string): string | null {
  try {
    const dele = token.split(".");
    if (dele.length !== 3) return null;
    const b64 = dele[1].replace(/-/g, "+").replace(/_/g, "/");
    const json = atob(b64.padEnd(b64.length + (4 - b64.length % 4) % 4, "="));
    return JSON.parse(json)?.role ?? null;
  } catch {
    return null;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "").trim();
    if (!token) {
      console.error("send-email afvist: intet token");
      return svar({ error: "ingen_adgang" }, 401);
    }

    let maaSende = false;
    let hvorfor = "";

    if (SERVICE_KEY && token === SERVICE_KEY) {
      maaSende = true; hvorfor = "service-noegle";
    } else if (rolleIToken(token) === "service_role") {
      maaSende = true; hvorfor = "service_role i token";
    } else {
      // Den offentlige noegle har rollen anon og giver ingen bruger tilbage.
      const admin = createClient(SUPABASE_URL, SERVICE_KEY);
      const { data } = await admin.auth.getUser(token);
      if (data?.user) { maaSende = true; hvorfor = "indlogget bruger"; }
    }

    if (!maaSende) {
      // Rollen logges, ikke tokenet. Saa kan vi se HVEM der blev afvist naeste gang
      // noget gaar galt, uden at der ligger en noegle i loggen.
      console.error("send-email afvist. rolle i token:", rolleIToken(token) ?? "ukendt",
                    "| service-noegle sat:", SERVICE_KEY ? "ja" : "NEJ");
      return svar({ error: "ingen_adgang" }, 401);
    }

    const { email, name, subject, html } = await req.json();
    if (!email || !subject) return svar({ error: "mangler_felter" }, 400);

    const brevoKey = Deno.env.get("BREVO_API_KEY");
    if (!brevoKey) return svar({ error: "BREVO_API_KEY not configured" }, 500);

    // Brevo afviser hele kaldet, hvis "name" er en TOM streng - den skal enten være et
    // rigtigt navn eller slet ikke være med. Medarbejder-invitationer sender i dag ikke
    // noget navn, kun mailadressen, og landede derfor som "" i stedet for udeladt.
    const brevo = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": brevoKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        sender: { name: AFSENDER_NAVN, email: AFSENDER_EMAIL },
        ...(SVAR_TIL ? { replyTo: { email: SVAR_TIL } } : {}),
        to: [{ email, ...(name ? { name } : {}) }],
        subject,
        htmlContent: html,
      }),
    });

    if (brevo.ok || brevo.status === 201) {
      // Afsenderen logges med. Skifter vi domaene, kan vi bagefter se PRAECIS hvornaar
      // den foerste mail gik ud ad den nye vej - og om noget stadig gaar ad den gamle.
      console.log("send-email ok via", hvorfor, "fra", AFSENDER_EMAIL, "til", email);
      return svar({ success: true });
    }

    const fejl = await brevo.json().catch(() => ({}));
    console.error("Brevo afviste:", brevo.status, "afsender:", AFSENDER_EMAIL,
                  JSON.stringify(fejl).slice(0, 300));
    return svar({ error: fejl }, brevo.status);
  } catch (e) {
    return svar({ error: String((e && (e as Error).message) || e) }, 400);
  }
});
