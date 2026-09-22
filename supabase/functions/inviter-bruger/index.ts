import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Opretter ELLER kobler et login - til en medarbejder eller til en portalbruger.
//
// Hvorfor den findes: planlaegningsappen kaldte selv supabase.auth.signUp(). Findes
// mailen allerede, svarer Supabase med en ATTRAP-bruger med et opdigtet id, fordi den
// ikke vil roebe udefra om en mailadresse er kendt. Appen skrev det opdigtede id i
// employees, og fremmednoeglen til auth.users afviste det. Opslaget paa mail KAN kun
// ske med service-noeglen, og den maa aldrig ligge i en browser - derfor herinde.
//
// Body:
//   { type: "medarbejder", email, empId }
//   { type: "portal", email, guid?, navn?, rolle? }

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const PORTAL = "https://jammerbugtrengoering-kundeportal.netlify.app";

// Hvidliste over hvor et login-link maa pege hen. Uden den kunne et kald bede om at
// faa linket sendt med redirect til en fremmed side, og saa ville tokenet foelge med.
// Bruges kun til medarbejdere nu - portalen faar slet ikke noget token i mailen.
const TILLADTE_MAAL = [
  "https://jammerbugtrengoering-service.netlify.app",
  "https://jammerbugtrengoering-planning.netlify.app",
  "https://jammerbugtrengoering-kundeportal.netlify.app",
  "http://localhost:5173",
];

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function svar(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

function gyldigtMaal(url: string | undefined, fallback: string) {
  if (!url) return fallback;
  return TILLADTE_MAAL.some((t) => url.startsWith(t)) ? url : fallback;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // Hvem spoerger? Identiteten tages fra tokenet og ALDRIG fra body'en.
    const jwt = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    const { data: { user: kalder } } = await admin.auth.getUser(jwt);
    if (!kalder) return svar({ error: "ikke_logget_ind" }, 401);

    const { data: medarbejder } = await admin
      .from("employees").select("id, is_admin").eq("auth_user_id", kalder.id).maybeSingle();
    const { data: portalbruger } = await admin
      .from("portal_brugere").select("dinero_contact_guid, rolle")
      .eq("auth_user_id", kalder.id).eq("aktiv", true).maybeSingle();

    const erPlanlaegger = !!medarbejder?.is_admin;
    const erPortalAdmin = portalbruger?.rolle === "admin";

    const body = await req.json().catch(() => ({}));
    const type = body.type === "portal" ? "portal" : "medarbejder";
    const email = String(body.email ?? "").trim().toLowerCase();
    if (!email) return svar({ error: "mail_mangler" }, 400);

    if (type === "medarbejder" && !erPlanlaegger) return svar({ error: "kun_planlaegger" }, 403);
    if (type === "portal" && !erPlanlaegger && !erPortalAdmin) return svar({ error: "ingen_adgang" }, 403);

    // En portaladministrator kan KUN oprette hos sin egen kunde. Guid'et fra body'en
    // bruges derfor kun naar det er planlaeggeren der spoerger.
    const guid = erPortalAdmin && !erPlanlaegger
      ? portalbruger!.dinero_contact_guid
      : String(body.guid ?? "");

    // 1) Findes login'et i forvejen? Det er hele grunden til at funktionen findes.
    const { data: fundet, error: opslagFejl } = await admin
      .rpc("hent_auth_bruger_id", { p_email: email });
    if (opslagFejl) return svar({ error: opslagFejl.message }, 500);

    let brugerId: string | null = fundet ?? null;
    let nyoprettet = false;

    // 2) Ellers oprettes den. Adgangskoden er tilfaeldig og gemmes ikke noget sted -
    //    brugeren saetter selv sin egen gennem linket nedenfor.
    if (!brugerId) {
      const { data: ny, error: opretFejl } = await admin.auth.admin.createUser({
        email,
        email_confirm: true,
        password: crypto.randomUUID() + "Aa1!",
      });
      if (opretFejl) return svar({ error: opretFejl.message }, 500);
      brugerId = ny.user?.id ?? null;
      nyoprettet = true;
    }
    if (!brugerId) return svar({ error: "kunne_ikke_oprette_login" }, 500);

    // 3) Kobl login'et til raekken.
    let portalSlug = "";
    if (type === "medarbejder") {
      const empId = String(body.empId ?? "");
      if (!empId) return svar({ error: "medarbejder_mangler" }, 400);
      const { error } = await admin.from("employees")
        .update({ auth_user_id: brugerId, app_email: email }).eq("id", empId);
      if (error) return svar({ error: error.message }, 500);
    } else {
      if (!guid) return svar({ error: "kunde_mangler" }, 400);
      const { error } = await admin.from("portal_brugere").upsert({
        dinero_contact_guid: guid,
        auth_user_id: brugerId,
        email,
        navn: body.navn ?? null,
        rolle: body.rolle === "admin" ? "admin" : "bruger",
        oprettet_af: medarbejder?.id ?? kalder.email ?? null,
      }, { onConflict: "auth_user_id" });
      if (error) return svar({ error: error.message }, 500);

      const { data: abon } = await admin.from("portal_abonnement")
        .select("portal_slug").eq("dinero_contact_guid", guid).maybeSingle();
      portalSlug = abon?.portal_slug ?? "";
    }

    // 4) Send beskeden.
    //
    //    PORTALKUNDEN faar INTET token i mailen - kun adressen paa sin egen side.
    //    Foer stod der et engangslink. Auth-loggen viste at det blev indloest et
    //    minut efter afsendelse, foer kunden havde mailen: firmamail som Microsoft
    //    Defender scanner links ved at HENTE dem, og et GET paa /auth/v1/verify ER
    //    selve login'et. Scanneren brugte altsaa tokenet op, og kunden endte paa
    //    login-siden igen uden at forstaa hvorfor.
    //
    //    En adresse til forsiden kan scanneren roligt hente - der sker ikke noget ved
    //    at kigge paa den. Kunden beder selv om sin kode derinde.
    //
    //    MEDARBEJDEREN faar stadig et recovery-link, fordi Worklist logges ind med
    //    kode og linket er den eneste vej til at saette den foerste. Det holder saa
    //    laenge medarbejderne er paa gmail og yahoo. Flytter nogen paa firmamail,
    //    rammer det samme problem, og saa skal den vej ogsaa laegges om.
    const erPortal = type === "portal";
    const emne = erPortal ? "Din adgang til kundeportalen" : "Adgang til Worklist";
    let html: string;

    if (erPortal) {
      const adresse = `${PORTAL}/${portalSlug}`;
      html = `<p>Hej ${body.navn ?? ""}</p>`
        + `<p>Du har fået adgang til kundeportalen hos Jammerbugt Rengøring, `
        + `hvor du kan se jeres opgaver og fakturaer.</p>`
        + `<p><a href="${adresse}">${adresse}</a></p>`
        + `<p>Skriv din mailadresse på siden, så sender vi dig en kode at logge ind `
        + `med. Der er ingen adgangskode at huske.</p>`;
    } else {
      const maal = gyldigtMaal(body.redirectTo, "https://jammerbugtrengoering-service.netlify.app");
      const { data: link, error: linkFejl } = await admin.auth.admin.generateLink({
        type: "recovery", email, options: { redirectTo: maal },
      });
      if (linkFejl) return svar({ error: linkFejl.message, koblet: true }, 500);
      html = `<p>Hej</p><p>Du har fået adgang til Worklist.</p>`
        + `<p><a href="${link?.properties?.action_link}">Tryk her for at vælge din adgangskode</a></p>`
        + `<p>Bagefter logger du ind med din mail og den kode, du selv har valgt.</p>`;
    }

    // Authorization saettes EKSPLICIT. functions.invoke fra én edge-funktion til en
    // anden sender ingen header af sig selv, og send-email kraever et token - uden den
    // her blev invitationsmailen afvist med 401 uden at nogen kunne se hvorfor.
    //
    // send-email faar ikke lov at vaelte hele kaldet: login'et ER koblet paa dette
    // tidspunkt, og planlaeggeren skal have at vide at DET lykkedes.
    const { error: mailFejl } = await admin.functions.invoke("send-email", {
      headers: { Authorization: `Bearer ${SERVICE_KEY}` },
      body: { email, name: body.navn ?? "", subject: emne, html },
    });

    return svar({
      ok: true,
      nyoprettet,
      koblet: true,
      mailSendt: !mailFejl,
      mailFejl: mailFejl ? String(mailFejl.message ?? mailFejl) : null,
    });
  } catch (e) {
    return svar({ error: String((e && (e as Error).message) || e) }, 500);
  }
});
