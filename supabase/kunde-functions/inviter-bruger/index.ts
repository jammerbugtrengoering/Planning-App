import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// KUNDEDATABASEN (projekt zwbsbckoyxzzobudjxij). Samme opgave som Jammerbugts
// inviter-bruger, men med ét krav mere, som ikke findes hos Jammerbugt: den, der
// inviterer, maa KUN roere sit eget firma. Funktionen koerer med service-noeglen og
// ser derfor alt — saa firmaet tjekkes her, i hvert eneste skridt.
//
// Body:
//   { type: "medarbejder", email, empId, redirectTo? }
//   { type: "portal", email, guid?, navn?, rolle? }

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const PORTAL = Deno.env.get("PORTAL_URL") ?? "https://kunde-portal.netlify.app";
const WORKLIST = Deno.env.get("WORKLIST_URL") ?? "https://kunde-worklist.netlify.app";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const svar = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const jwt = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    const { data: { user: kalder } } = await admin.auth.getUser(jwt);
    if (!kalder) return svar({ error: "ikke_logget_ind" }, 401);

    const { data: mig } = await admin.from("employees")
      .select("id, is_admin, firma_id").eq("auth_user_id", kalder.id).is("fratraadt_dato", null).maybeSingle();
    const { data: portalbruger } = await admin.from("portal_brugere")
      .select("dinero_contact_guid, rolle, firma_id").eq("auth_user_id", kalder.id).eq("aktiv", true).maybeSingle();

    const erPlanlaegger = !!mig?.is_admin;
    const erPortalAdmin = portalbruger?.rolle === "admin";
    const firmaId = erPlanlaegger ? mig!.firma_id : portalbruger?.firma_id;
    if (!firmaId) return svar({ error: "ingen_adgang" }, 403);

    const body = await req.json().catch(() => ({}));
    const type = body.type === "portal" ? "portal" : "medarbejder";
    const email = String(body.email ?? "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return svar({ error: "mail_mangler" }, 400);
    if (type === "medarbejder" && !erPlanlaegger) return svar({ error: "kun_planlaegger" }, 403);
    if (type === "portal" && !erPlanlaegger && !erPortalAdmin) return svar({ error: "ingen_adgang" }, 403);

    const { data: firma } = await admin.from("firma").select("navn, afsender_navn, svar_til, slug").eq("id", firmaId).maybeSingle();
    const firmanavn = firma?.navn ?? "";

    // Findes login'et? Et login maa kun hoere til ét firma: hoerer det allerede til et
    // andet, afvises invitationen i stedet for at flytte personen.
    const { data: fundet } = await admin.rpc("hent_auth_bruger_id", { p_email: email });
    let brugerId: string | null = fundet ?? null;
    if (brugerId) {
      const { data: andetE } = await admin.from("employees").select("firma_id").eq("auth_user_id", brugerId).neq("firma_id", firmaId).limit(1);
      const { data: andetP } = await admin.from("portal_brugere").select("firma_id").eq("auth_user_id", brugerId).neq("firma_id", firmaId).limit(1);
      if ((andetE?.length ?? 0) > 0 || (andetP?.length ?? 0) > 0) return svar({ error: "mail_hos_andet_firma" }, 409);
    } else {
      const { data: ny, error } = await admin.auth.admin.createUser({
        email, email_confirm: true, password: crypto.randomUUID() + "Aa1!",
      });
      if (error) return svar({ error: error.message }, 500);
      brugerId = ny.user?.id ?? null;
    }
    if (!brugerId) return svar({ error: "kunne_ikke_oprette_login" }, 500);

    let html = "";
    let emne = "";
    if (type === "medarbejder") {
      const empId = String(body.empId ?? "");
      const { data: emp } = await admin.from("employees").select("id, firma_id").eq("id", empId).maybeSingle();
      if (!emp || emp.firma_id !== firmaId) return svar({ error: "medarbejder_mangler" }, 404);
      const { error } = await admin.from("employees").update({ auth_user_id: brugerId, app_email: email }).eq("id", empId);
      if (error) return svar({ error: error.message }, 500);
      const maal = `${WORKLIST}/${firma?.slug ?? ""}`;
      const { data: link, error: linkFejl } = await admin.auth.admin.generateLink({ type: "recovery", email, options: { redirectTo: maal } });
      if (linkFejl) return svar({ error: linkFejl.message, koblet: true }, 500);
      emne = `Adgang til Worklist hos ${firmanavn}`;
      html = `<p>Hej</p><p>${esc(firmanavn)} har givet dig adgang til Worklist, hvor du ser dine opgaver.</p>`
        + `<p><a href="${link?.properties?.action_link}">Tryk her for at vælge din adgangskode</a></p>`
        + `<p>Bagefter logger du ind på <a href="${maal}">${maal}</a> med din mail og den kode, du selv har valgt.</p>`;
    } else {
      const guid = erPortalAdmin && !erPlanlaegger ? portalbruger!.dinero_contact_guid : String(body.guid ?? "");
      const { data: abon } = await admin.from("portal_abonnement").select("portal_slug, firma_id")
        .eq("dinero_contact_guid", guid).eq("firma_id", firmaId).maybeSingle();
      if (!abon) return svar({ error: "kunde_mangler" }, 404);
      const { error } = await admin.from("portal_brugere").upsert({
        dinero_contact_guid: guid, auth_user_id: brugerId, email, navn: body.navn ?? null,
        rolle: body.rolle === "admin" ? "admin" : "bruger", oprettet_af: mig?.id ?? kalder.email ?? null, firma_id: firmaId,
      }, { onConflict: "auth_user_id" });
      if (error) return svar({ error: error.message }, 500);
      const adresse = `${PORTAL}/${abon.portal_slug}`;
      emne = "Din adgang til kundeportalen";
      html = `<p>Hej ${esc(body.navn ?? "")}</p><p>Du har fået adgang til kundeportalen hos ${esc(firmanavn)}.</p>`
        + `<p><a href="${adresse}">${adresse}</a></p>`
        + `<p>Skriv din mailadresse på siden, så sender vi dig en kode at logge ind med.</p>`;
    }

    const { error: mailFejl } = await admin.functions.invoke("send-email", {
      headers: { Authorization: `Bearer ${SERVICE_KEY}` },
      body: { email, name: body.navn ?? "", subject: emne, html,
              afsender_navn: firma?.afsender_navn || firmanavn, svar_til: firma?.svar_til || "" },
    });
    return svar({ ok: true, koblet: true, mailSendt: !mailFejl, mailFejl: mailFejl ? String(mailFejl.message ?? mailFejl) : null });
  } catch (e) {
    return svar({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
