import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// KUNDEDATABASEN (projekt zwbsbckoyxzzobudjxij).
//
// Broen fra Jammerbugt Rengoering (fase 5, 29.9.2026). Kundeloesningen aktiveres KUN
// fra kundekortet hos Jammerbugt — der findes ingen aaben tilmelding. Jammerbugts
// edge-funktion "kundeloesning" kalder hertil med broens noegle i x-bro-noegle.
//
// Noeglen ligger i begge databaser (bro.noegle), kun laeselig for service_role.
//
// Handlinger:
//   { handling: "opret", guid, navn, slug, admin_navn, admin_email, branche?, moduler }
//   { handling: "moduler", firma_id, moduler }
//   { handling: "status", firma_id, status: "aktiv" | "lukket" }
//   { handling: "inviter_igen", firma_id, admin_email }
//   { handling: "login_link", firma_id, email }   - ét login via kundeportalen (29.9.2026):
//       engangslink til en planlaegger i firmaet. Sendes aldrig paa mail — kun tilbage
//       til Jammerbugts aabn-planlaegning, som har tjekket portal-loginnet.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const PLANLAEGNING = Deno.env.get("PLANLAEGNING_URL") ?? "https://kunde-planlaegning.netlify.app";
const JR_PORTAL = Deno.env.get("JR_PORTAL_URL") ?? "https://jammerbugtrengoering-kundeportal.netlify.app";
const RESERVEREDE = new Set(["opret", "tilbud", "api", "admin", "www", "login", "app", "support", "hjaelp"]);
const BRANCHER = new Set(["hotel", "haandvaerk", "institution", "andet"]);

const svar = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function ens(a: string, b: string) {
  if (!a || !b || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

function moduler(m: Record<string, unknown> | undefined) {
  const x = m ?? {};
  return {
    modul_start_stop: x.start_stop === true,
    modul_lager: x.lager === true,
    modul_tilbud: x.tilbud === true,
    modul_kundeportal: x.kundeportal === true,
  };
}

async function sendVelkomst(admin: ReturnType<typeof createClient>, email: string, navn: string,
                            firmanavn: string, slug: string, igen: boolean, portalSlug = "") {
  const maal = `${PLANLAEGNING}/${slug}`;
  const { data: link, error } = await admin.auth.admin.generateLink({ type: "recovery", email, options: { redirectTo: maal } });
  if (error) return { mailSendt: false, fejl: error.message };
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111;max-width:600px">`
    + `<p>Hej ${esc(navn.split(" ")[0])}</p>`
    + (igen ? `<p>Her er et nyt link til jeres planlægning.</p>`
            : `<p>Jammerbugt Rengøring har oprettet planlægning og Worklist til ${esc(firmanavn)}. Du er administrator.</p>`)
    + `<p><a href="${link?.properties?.action_link}" style="display:inline-block;background:#2563EB;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;font-weight:700">Vælg din adgangskode</a></p>`
    + `<p>Er du også administrator i kundeportalen hos Jammerbugt Rengøring, behøver du ikke en adgangskode: `
    + `log ind i portalen som altid og tryk «Planlægning»${portalSlug ? ` (<a href="${JR_PORTAL}/${portalSlug}">${JR_PORTAL}/${portalSlug}</a>)` : ""}. `
    + `Ellers logger du ind på <a href="${maal}">${maal}</a> med din mail og den kode, du vælger via knappen.</p>`
    + `<p>En guide viser dig de første trin: firmaoplysninger, medarbejdere og den første opgave.</p>`
    + `<p style="color:#777;font-size:12px">Linket virker én gang. Beder du om et nyt, holder det gamle op med at virke.</p></div>`;
  const { error: mailFejl } = await admin.functions.invoke("send-email", {
    headers: { Authorization: `Bearer ${SERVICE_KEY}` },
    body: { email, name: navn, subject: igen ? "Nyt link til jeres planlægning" : `Jeres planlægning er klar — ${firmanavn}`,
            html, afsender_navn: "Jammerbugt Rengøring" },
  });
  return { mailSendt: !mailFejl, fejl: mailFejl ? String(mailFejl.message ?? mailFejl) : null };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return svar({ error: "kun_post" }, 405);
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  try {
    const { data: noegle } = await admin.rpc("bro_noegle");
    if (!ens(String(noegle ?? ""), req.headers.get("x-bro-noegle") ?? "")) {
      console.error("jr-bro: forkert noegle");
      return svar({ error: "ingen_adgang" }, 401);
    }

    const b = await req.json().catch(() => ({}));
    const handling = String(b.handling ?? "");

    if (handling === "opret") {
      const guid = String(b.guid ?? "").trim();
      const navn = String(b.navn ?? "").trim();
      const slug = String(b.slug ?? "").trim().toLowerCase();
      const adminNavn = String(b.admin_navn ?? "").trim();
      const email = String(b.admin_email ?? "").trim().toLowerCase();
      const branche = BRANCHER.has(b.branche) ? b.branche : "andet";
      if (!guid) return svar({ error: "guid_mangler" }, 400);
      if (navn.length < 2) return svar({ error: "navn_mangler" }, 400);
      if (!/^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/.test(slug) || RESERVEREDE.has(slug)) return svar({ error: "slug" }, 400);
      if (adminNavn.length < 2) return svar({ error: "admin_navn_mangler" }, 400);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return svar({ error: "email" }, 400);

      const { data: findes } = await admin.from("firma").select("id").eq("jr_kunde_guid", guid).maybeSingle();
      if (findes) return svar({ error: "findes_allerede", firma_id: findes.id }, 409);
      const { data: optaget } = await admin.from("firma").select("id").eq("slug", slug).maybeSingle();
      if (optaget) return svar({ error: "slug_optaget" }, 409);

      // Et login maa kun hoere til ét firma.
      const { data: fundet } = await admin.rpc("hent_auth_bruger_id", { p_email: email });
      let brugerId: string | null = fundet ?? null;
      let nytLogin = false;
      if (brugerId) {
        const { data: e } = await admin.from("employees").select("id").eq("auth_user_id", brugerId).limit(1);
        const { data: p } = await admin.from("portal_brugere").select("auth_user_id").eq("auth_user_id", brugerId).limit(1);
        if ((e?.length ?? 0) > 0 || (p?.length ?? 0) > 0) return svar({ error: "mail_hos_andet_firma" }, 409);
      } else {
        const { data: ny, error } = await admin.auth.admin.createUser({
          email, email_confirm: true, password: crypto.randomUUID() + "Aa1!",
        });
        if (error || !ny?.user) return svar({ error: "login_fejl", besked: error?.message }, 500);
        brugerId = ny.user.id;
        nytLogin = true;
      }

      const { data: firmaId, error: fejl } = await admin.rpc("opret_firma", {
        p_navn: navn, p_slug: slug, p_admin_navn: adminNavn, p_admin_email: email,
        p_auth_user_id: brugerId, p_branche: branche,
        p_moduler: {
          start_stop: b.moduler?.start_stop === true, lager: b.moduler?.lager === true,
          tilbud: b.moduler?.tilbud === true, kundeportal: b.moduler?.kundeportal === true,
        },
        p_jr_kunde_guid: guid,
      });
      if (fejl) {
        if (nytLogin && brugerId) await admin.auth.admin.deleteUser(brugerId);
        return svar({ error: /slug_optaget/.test(fejl.message) ? "slug_optaget" : "opret_fejl", besked: fejl.message }, 500);
      }
      const mail = await sendVelkomst(admin, email, adminNavn, navn, slug, false, String(b.portal_slug ?? ""));
      return svar({ ok: true, firma_id: firmaId, ...mail });
    }

    const firmaId = String(b.firma_id ?? "");
    const { data: firma } = await admin.from("firma").select("id, navn, slug").eq("id", firmaId).maybeSingle();
    if (!firma) return svar({ error: "firma_mangler" }, 404);

    if (handling === "moduler") {
      const { error } = await admin.from("firma").update(moduler(b.moduler)).eq("id", firmaId);
      if (error) return svar({ error: error.message }, 500);
      return svar({ ok: true });
    }

    if (handling === "status") {
      const status = b.status === "lukket" ? "lukket" : "aktiv";
      const { error } = await admin.from("firma").update({ status }).eq("id", firmaId);
      if (error) return svar({ error: error.message }, 500);
      return svar({ ok: true, status });
    }

    if (handling === "inviter_igen") {
      const email = String(b.admin_email ?? "").trim().toLowerCase();
      const { data: emp } = await admin.from("employees").select("name")
        .eq("firma_id", firmaId).eq("app_email", email).eq("is_admin", true).maybeSingle();
      if (!emp) return svar({ error: "admin_mangler" }, 404);
      return svar({ ok: true, ...(await sendVelkomst(admin, email, emp.name ?? "", firma.navn, firma.slug, true)) });
    }

    if (handling === "login_link") {
      const email = String(b.email ?? "").trim().toLowerCase();
      const { data: firmaStatus } = await admin.from("firma").select("status").eq("id", firmaId).maybeSingle();
      if (firmaStatus?.status !== "aktiv") return svar({ error: "ikke_aaben" }, 403);
      const { data: emp } = await admin.from("employees").select("id, auth_user_id")
        .eq("firma_id", firmaId).eq("app_email", email).eq("is_admin", true).is("fratraadt_dato", null).maybeSingle();
      if (!emp?.auth_user_id) return svar({ error: "ikke_planlaegger" }, 404);
      const { data: link, error } = await admin.auth.admin.generateLink({
        type: "magiclink", email, options: { redirectTo: `${PLANLAEGNING}/${firma.slug}` },
      });
      if (error || !link?.properties?.action_link) return svar({ error: "link_fejl", besked: error?.message }, 500);
      return svar({ ok: true, url: link.properties.action_link });
    }

    return svar({ error: "ukendt_handling" }, 400);
  } catch (e) {
    console.error("jr-bro:", String((e as Error)?.message ?? e));
    return svar({ error: "ukendt" }, 500);
  }
});
