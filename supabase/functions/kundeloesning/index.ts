import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// JAMMERBUGT RENGOERINGS DATABASE.
//
// Kundeloesningen (planlaegning og Worklist til jeres kunder) aktiveres her, fra
// kundekortet — aldrig ved en aaben tilmelding (Jonn 29.9.2026). Funktionen goer to
// ting i samme skridt:
//   1. beder kundedatabasen (jr-bro) om at oprette, aendre eller lukke firmaet
//   2. gemmer koblingen og tilvalgene i kundeloesning, som abonnementslinjerne i
//      Fakturering dannes ud fra
//
// Kun planlaeggere. Kaldet til kundedatabasen baerer broens noegle, som kun de to
// databaser kender (bro.noegle).
//
// Handlinger:
//   { handling: "niveau", guid, niveau: "basis"|"udvidet"|"premium", (+ opret-felter foerste gang Premium) }
//   { handling: "aktiver", guid, slug, admin_navn, admin_email, branche?, moduler }
//   { handling: "moduler", guid, moduler }
//   { handling: "luk", guid }
//   { handling: "genaabn", guid }
//   { handling: "inviter_igen", guid }

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

const FEJL: Record<string, string> = {
  slug: "Det korte navn må kun have små bogstaver, tal og bindestreg, og mindst tre tegn.",
  slug_optaget: "Det korte navn er allerede i brug. Vælg et andet.",
  email: "Skriv en gyldig mail til kundens administrator.",
  admin_navn_mangler: "Skriv navnet på kundens administrator.",
  mail_hos_andet_firma: "Den mail bruges allerede i et andet firma i kundeløsningen. Brug en anden.",
  findes_allerede: "Kunden har allerede kundeløsningen.",
  kundedb_utilgaengelig: "Kundedatabasen svarer ikke. Prøv igen om lidt.",
};

function moduler(m: Record<string, unknown> | undefined) {
  return {
    start_stop: m?.start_stop === true, lager: m?.lager === true,
    tilbud: m?.tilbud === true, kundeportal: m?.kundeportal === true,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  try {
    const jwt = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    const { data: { user } } = await admin.auth.getUser(jwt);
    if (!user) return svar({ error: "ikke_logget_ind" }, 401);
    const { data: mig } = await admin.from("employees").select("is_admin")
      .eq("auth_user_id", user.id).is("fratraadt_dato", null).maybeSingle();
    if (!mig?.is_admin) return svar({ error: "kun_planlaegger" }, 403);

    const { data: noegle } = await admin.rpc("bro_noegle");
    const bro = async (body: Record<string, unknown>) => {
      try {
        const r = await fetch(KUNDE_BRO, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-bro-noegle": String(noegle ?? "") },
          body: JSON.stringify(body),
        });
        const d = await r.json().catch(() => ({}));
        return { ok: r.ok && d.ok === true, d };
      } catch {
        return { ok: false, d: { error: "kundedb_utilgaengelig" } };
      }
    };
    const fejl = (d: { error?: string; besked?: string }) =>
      svar({ error: FEJL[d.error ?? ""] ?? d.besked ?? d.error ?? "Noget gik galt." }, 400);

    const b = await req.json().catch(() => ({}));
    const guid = String(b.guid ?? "").trim();
    if (!guid) return svar({ error: "Kunden mangler." }, 400);
    const { data: kl } = await admin.from("kundeloesning").select("*").eq("dinero_contact_guid", guid).maybeSingle();
    const nu = new Date().toISOString();

    // Opretter firmaet i kundedatabasen og gemmer koblingen. Bruges af "aktiver" og af
    // "niveau", naar kunden foerste gang saettes til Premium.
    async function opret(): Promise<Response | null> {
      const { data: kunde } = await admin.from("kundeoversigt").select("navn").eq("guid", guid).maybeSingle();
      if (!kunde?.navn) return svar({ error: "Kunden findes ikke." }, 404);
      const m = moduler(b.moduler);
      const slug = String(b.slug ?? "").trim().toLowerCase();
      const adminNavn = String(b.admin_navn ?? "").trim();
      const email = String(b.admin_email ?? "").trim().toLowerCase();
      const r = await bro({ handling: "opret", guid, navn: kunde.navn, slug, admin_navn: adminNavn,
                            admin_email: email, branche: b.branche, moduler: m });
      if (!r.ok) return fejl(r.d);
      const { error } = await admin.from("kundeloesning").insert({
        dinero_contact_guid: guid, visningsnavn: kunde.navn, firma_id: r.d.firma_id, slug,
        modul_start_stop: m.start_stop, modul_lager: m.lager, modul_tilbud: m.tilbud, modul_kundeportal: m.kundeportal,
        admin_navn: adminNavn, admin_email: email,
      });
      if (error) return svar({ error: "Firmaet er oprettet, men koblingen kunne ikke gemmes: " + error.message }, 500);
      mailSendt = r.d.mailSendt !== false;
      return null;
    }
    let mailSendt = true;

    async function saetStatus(status: "aktiv" | "lukket"): Promise<Response | null> {
      const r = await bro({ handling: "status", firma_id: kl.firma_id, status });
      if (!r.ok) return fejl(r.d);
      await admin.from("kundeloesning").update({
        status, opsagt_dato: status === "lukket" ? nu.slice(0, 10) : null, aendret: nu,
      }).eq("dinero_contact_guid", guid);
      return null;
    }

    // Trappen (Jonn 29.9.2026): Basis < Udvidet < Premium. Premium = Udvidet + kundens
    // egen planlaegning og Worklist. Skiftes der ned fra Premium, lukkes planlaegningen;
    // skiftes der op igen, aabnes den (data er bevaret).
    if (b.handling === "niveau") {
      const niveau = ["basis", "udvidet", "premium"].includes(b.niveau) ? b.niveau : null;
      if (!niveau) return svar({ error: "Ukendt niveau." }, 400);
      const { data: pa } = await admin.from("portal_abonnement").select("status")
        .eq("dinero_contact_guid", guid).maybeSingle();
      if (pa?.status !== "aktiv") return svar({ error: "Tænd kundeportalen først." }, 400);
      if (niveau === "premium") {
        const f = !kl ? await opret() : kl.status === "lukket" ? await saetStatus("aktiv") : null;
        if (f) return f;
      } else if (kl?.status === "aktiv") {
        const f = await saetStatus("lukket");
        if (f) return f;
      }
      const { error } = await admin.from("portal_abonnement").update({ option: niveau }).eq("dinero_contact_guid", guid);
      if (error) return svar({ error: error.message }, 500);
      return svar({ ok: true, niveau, mailSendt: !kl && niveau === "premium" ? mailSendt : undefined });
    }

    if (b.handling === "aktiver") {
      if (kl) return svar({ error: FEJL.findes_allerede }, 409);
      const f = await opret();
      if (f) return f;
      return svar({ ok: true, mailSendt });
    }

    if (!kl) return svar({ error: "Kunden har ikke kundeløsningen." }, 404);

    if (b.handling === "moduler") {
      const m = moduler(b.moduler);
      const r = await bro({ handling: "moduler", firma_id: kl.firma_id, moduler: m });
      if (!r.ok) return fejl(r.d);
      await admin.from("kundeloesning").update({
        modul_start_stop: m.start_stop, modul_lager: m.lager, modul_tilbud: m.tilbud, modul_kundeportal: m.kundeportal,
        aendret: nu,
      }).eq("dinero_contact_guid", guid);
      return svar({ ok: true });
    }

    if (b.handling === "luk" || b.handling === "genaabn") {
      const status = b.handling === "luk" ? "lukket" : "aktiv";
      const f = await saetStatus(status);
      if (f) return f;
      return svar({ ok: true, status });
    }

    if (b.handling === "inviter_igen") {
      const r = await bro({ handling: "inviter_igen", firma_id: kl.firma_id, admin_email: kl.admin_email });
      if (!r.ok) return fejl(r.d);
      return svar({ ok: true, mailSendt: r.d.mailSendt !== false });
    }

    return svar({ error: "Ukendt handling." }, 400);
  } catch (e) {
    console.error("kundeloesning:", String((e as Error)?.message ?? e));
    return svar({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
