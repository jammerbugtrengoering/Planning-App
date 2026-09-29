import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Giver planlaeggerne besked naar en kunde har bestilt noget - og kunden besked
// naar der er svaret.
//
// Der kommer INTET kunde-id ind udefra. Bestillingen slaas op ud fra hvem der
// ringer: er det kunden, tages hendes egen nyeste bestilling; er det
// planlaeggeren, oplyses id'et og hun har adgang i forvejen. Ellers kunne enhver
// portalbruger sende mail om en fremmed kundes bestilling - eller bruge svaret
// til at finde ud af hvem der er kunde hos os.
//
// 29.9.2026: bestillinger fra kundeloesningen (kilde 'kundeloesning') faar et svar,
// der peger paa «Ekstra hjaelp» i kundens egen planlaegning i stedet for portalen.
// Beskeden om NYE bestillinger derfra sendes af bro-modtag.
//
// Body:
//   { handling: "ny" }                                  - kunden har bestilt
//   { handling: "svar", id, status, note? }              - planlaeggeren har svaret

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const PLANNING = "https://jammerbugtrengoering-planning.netlify.app";

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

// Kundens egne ord havner i en mail. Uden det her kunne en bestilling der
// indeholder < eller > brase sammen som html hos modtageren.
function pnt(s: unknown) {
  return String(s ?? "").replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]!));
}

function datoDk(d: string | null) {
  if (!d) return "ingen ønsket dato";
  const [aa, mm, dd] = d.split("-");
  return `${Number(dd)}.${Number(mm)}.${aa}`;
}

async function sendMail(admin: ReturnType<typeof createClient>, til: string,
                        navn: string, emne: string, html: string) {
  const { error } = await admin.functions.invoke("send-email", {
    headers: { Authorization: `Bearer ${SERVICE_KEY}` },
    body: { email: til, name: navn, subject: emne, html },
  });
  if (error) console.error("bestilling-besked mail:", til, String(error.message ?? error));
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const jwt = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    const { data: { user: kalder } } = await admin.auth.getUser(jwt);
    if (!kalder) return svar({ error: "ikke_logget_ind" }, 401);

    const body = await req.json().catch(() => ({}));
    const handling = body.handling === "svar" ? "svar" : "ny";

    const { data: medarbejder } = await admin
      .from("employees").select("id, is_admin").eq("auth_user_id", kalder.id).maybeSingle();
    const erPlanlaegger = !!medarbejder?.is_admin;

    // ── Kunden har bestilt. Planlaeggerne faar besked. ──────────────────────
    if (handling === "ny") {
      const { data: portalbruger } = await admin
        .from("portal_brugere").select("dinero_contact_guid")
        .eq("auth_user_id", kalder.id).eq("aktiv", true).maybeSingle();
      if (!portalbruger) return svar({ error: "ingen_adgang" }, 403);

      const { data: b } = await admin
        .from("portal_bestillinger")
        .select("id, ydelse_titel, fritekst, oensket_dato, adresse, bemaerkning, bestilt_af_navn, bestilt_af_email")
        .eq("dinero_contact_guid", portalbruger.dinero_contact_guid)
        .eq("status", "ny")
        .order("oprettet", { ascending: false })
        .limit(1).maybeSingle();
      if (!b) return svar({ ok: true });

      const { data: abon } = await admin.from("portal_abonnement")
        .select("visningsnavn").eq("dinero_contact_guid", portalbruger.dinero_contact_guid).maybeSingle();
      const kunde = abon?.visningsnavn ?? "En kunde";

      const { data: planlaeggere } = await admin
        .from("employees").select("name, app_email").eq("is_admin", true).not("app_email", "is", null);

      const html = `<p><strong>${pnt(kunde)}</strong> har bestilt ekstra arbejde i kundeportalen.</p>`
        + `<p><strong>${pnt(b.ydelse_titel ?? "Egen beskrivelse")}</strong><br>`
        + `Ønsket dato: ${pnt(datoDk(b.oensket_dato as string | null))}</p>`
        + (b.fritekst ? `<p>${pnt(b.fritekst)}</p>` : "")
        + (b.adresse ? `<p>Adresse: ${pnt(b.adresse)}</p>` : "")
        + (b.bemaerkning ? `<p>Bemærkning: ${pnt(b.bemaerkning)}</p>` : "")
        + `<p>Bestilt af ${pnt(b.bestilt_af_navn || b.bestilt_af_email || "ukendt")}.</p>`
        + `<p>Den ligger til godkendelse i Ugeplan: <a href="${PLANNING}">${PLANNING}</a></p>`;

      for (const p of planlaeggere ?? []) {
        await sendMail(admin, p.app_email as string, (p.name as string) ?? "",
                       `Bestilling fra ${kunde}`, html);
      }
      return svar({ ok: true, sendt: (planlaeggere ?? []).length });
    }

    // ── Planlaeggeren har svaret. Kunden faar besked. ───────────────────────
    if (!erPlanlaegger) return svar({ error: "kun_planlaegger" }, 403);

    const id = String(body.id ?? "");
    const status = body.status === "afvist" ? "afvist" : "godkendt";
    const note = String(body.note ?? "").trim();
    if (!id) return svar({ error: "id_mangler" }, 400);

    const { data: b } = await admin
      .from("portal_bestillinger")
      .select("ydelse_titel, fritekst, oensket_dato, bestilt_af_email, bestilt_af_navn, dinero_contact_guid, kilde")
      .eq("id", id).maybeSingle();
    if (!b) return svar({ error: "ikke_fundet" }, 404);
    const fraLoesning = b.kilde === "kundeloesning";

    // Bestilleren har maaske forladt firmaet siden. Er hendes adresse vaek, gaar
    // beskeden til kundens portaladministratorer i stedet, saa svaret ikke
    // forsvinder i ingenting.
    let modtagere: { email: string; navn: string }[] = [];
    if (b.bestilt_af_email) {
      modtagere = [{ email: b.bestilt_af_email as string, navn: (b.bestilt_af_navn as string) ?? "" }];
    } else if (fraLoesning) {
      const { data: kl } = await admin.from("kundeloesning")
        .select("admin_email, admin_navn").eq("dinero_contact_guid", b.dinero_contact_guid).maybeSingle();
      if (kl?.admin_email) modtagere = [{ email: kl.admin_email as string, navn: (kl.admin_navn as string) ?? "" }];
    } else {
      const { data: adm } = await admin.from("portal_brugere")
        .select("email, navn").eq("dinero_contact_guid", b.dinero_contact_guid)
        .eq("aktiv", true).eq("rolle", "admin");
      modtagere = (adm ?? []).map((a) => ({ email: a.email as string, navn: (a.navn as string) ?? "" }));
    }

    const hvad = pnt(b.ydelse_titel ?? "jeres bestilling");
    const hilsen = `<p>Hej ${pnt(b.bestilt_af_navn ?? "")}</p>`;
    const foelg = fraLoesning
      ? `Svaret står også under Ekstra hjælp i jeres planlægning. `
      : `Opgaven er lagt i planen, og I kan følge den under Opgaver i portalen. `;
    const html = status === "godkendt"
      ? hilsen
        + `<p>Vi har sagt ja til <strong>${hvad}</strong>.</p>`
        + `<p>${foelg}Arbejdet kommer på den almindelige faktura.</p>`
        + (note ? `<p>${pnt(note)}</p>` : "")
      : hilsen
        + `<p>Vi kan desværre ikke tage <strong>${hvad}</strong> som bestilt.</p>`
        + (note ? `<p>${pnt(note)}</p>` : "")
        + `<p>Ring endelig til kontoret, så finder vi ud af det sammen.</p>`;

    for (const m of modtagere) {
      await sendMail(admin, m.email, m.navn,
                     status === "godkendt" ? "Din bestilling er godkendt" : "Om din bestilling",
                     html);
    }
    return svar({ ok: true, sendt: modtagere.length });
  } catch (e) {
    console.error("bestilling-besked:", String((e as Error).message ?? e));
    return svar({ error: String((e as Error).message ?? e) }, 500);
  }
});
