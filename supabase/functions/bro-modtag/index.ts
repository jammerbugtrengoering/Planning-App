import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// JAMMERBUGT RENGOERINGS DATABASE.
//
// Broen fra kundedatabasen (fase 5, 29.9.2026). Et kundefirma trykker «Bestil ekstra
// hjaelp» i sin planlaegning; kundedatabasens funktion bestil-hjaelp kalder hertil med
// broens noegle i x-bro-noegle og firmaets id.
//
// Firmaet slaas op i kundeloesning. Er det ikke aktivt hos os, afvises kaldet — saa
// et lukket firma kan ikke bestille, og et ukendt id kan ikke gaette sig til en kunde.
//
// Bestillingen lander i portal_bestillinger med kilde 'kundeloesning', altsaa samme
// sted som portalens: i klokken, i banneret i Ugeplan og i morgenmailen.
//
// Handlinger:
//   { handling: "ydelser", firma_id }
//   { handling: "bestil", firma_id, ydelse_id?, fritekst?, oensket_dato?, adresse?, bemaerkning?, navn, email }
//   { handling: "liste", firma_id }

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const PLANLAEGNING = "https://jammerbugtrengoering-planning.netlify.app";
const MAKS_AABNE = 20;

const svar = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const pnt = (s: unknown) => String(s ?? "").replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]!));
const tekst = (s: unknown, maks: number) => { const t = String(s ?? "").trim(); return t ? t.slice(0, maks) : null; };

function ens(a: string, b: string) {
  if (!a || !b || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

function datoDk(d: string | null) {
  if (!d) return "ingen ønsket dato";
  const [aa, mm, dd] = d.split("-");
  return `${Number(dd)}.${Number(mm)}.${aa}`;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return svar({ error: "kun_post" }, 405);
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  try {
    const { data: noegle } = await admin.rpc("bro_noegle");
    if (!ens(String(noegle ?? ""), req.headers.get("x-bro-noegle") ?? "")) {
      console.error("bro-modtag: forkert noegle");
      return svar({ error: "ingen_adgang" }, 401);
    }

    const b = await req.json().catch(() => ({}));
    const { data: kl } = await admin.from("kundeloesning")
      .select("dinero_contact_guid, visningsnavn, status").eq("firma_id", String(b.firma_id ?? "")).maybeSingle();
    if (!kl || kl.status !== "aktiv") return svar({ error: "ikke_aktiv" }, 403);
    const guid = kl.dinero_contact_guid as string;

    if (b.handling === "ydelser") {
      const { data } = await admin.from("produkter").select("id, navn, beskrivelse")
        .eq("aktiv", true).eq("i_portalen", true).order("raekkefoelge").order("navn");
      return svar({ ok: true, ydelser: (data ?? []).map((p) => ({ id: p.id, titel: p.navn, beskrivelse: p.beskrivelse })) });
    }

    if (b.handling === "liste") {
      const { data } = await admin.from("portal_bestillinger")
        .select("id, ydelse_titel, fritekst, oensket_dato, adresse, bemaerkning, status, planlaegger_note, bestilt_af_navn, oprettet, behandlet")
        .eq("dinero_contact_guid", guid).eq("kilde", "kundeloesning")
        .order("oprettet", { ascending: false }).limit(50);
      return svar({ ok: true, bestillinger: data ?? [] });
    }

    if (b.handling === "bestil") {
      const fritekst = tekst(b.fritekst, 2000);
      let ydelse: { id: string; navn: string } | null = null;
      if (b.ydelse_id) {
        const { data } = await admin.from("produkter").select("id, navn")
          .eq("id", String(b.ydelse_id)).eq("aktiv", true).eq("i_portalen", true).maybeSingle();
        if (!data) return svar({ error: "ydelse_ukendt" }, 400);
        ydelse = data as { id: string; navn: string };
      }
      if (!ydelse && !fritekst) return svar({ error: "tom_bestilling" }, 400);

      let dato: string | null = null;
      if (b.oensket_dato) {
        dato = String(b.oensket_dato).slice(0, 10);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(dato)) return svar({ error: "dato" }, 400);
        if (dato < new Date().toISOString().slice(0, 10)) return svar({ error: "dato_fortid" }, 400);
      }

      const { count } = await admin.from("portal_bestillinger").select("id", { count: "exact", head: true })
        .eq("dinero_contact_guid", guid).eq("status", "ny");
      if ((count ?? 0) >= MAKS_AABNE) return svar({ error: "for_mange_aabne" }, 429);

      const raekke = {
        id: "pb" + crypto.randomUUID().replace(/-/g, "").slice(0, 16),
        dinero_contact_guid: guid,
        ydelse_id: ydelse?.id ?? null,
        ydelse_titel: ydelse?.navn ?? null,
        fritekst,
        oensket_dato: dato,
        adresse: tekst(b.adresse, 300),
        bemaerkning: tekst(b.bemaerkning, 1000),
        status: "ny",
        bestilt_af_email: tekst(b.email, 200),
        bestilt_af_navn: tekst(b.navn, 120),
        kilde: "kundeloesning",
      };
      const { error } = await admin.from("portal_bestillinger").insert(raekke);
      if (error) return svar({ error: "gem_fejl", besked: error.message }, 500);

      // Planlaeggerne faar mail, som ved en bestilling fra portalen. En fejl her maa
      // ikke vaelte bestillingen: den staar i klokken under alle omstaendigheder.
      try {
        const { data: planlaeggere } = await admin.from("employees").select("name, app_email")
          .eq("is_admin", true).is("fratraadt_dato", null).not("app_email", "is", null);
        const kunde = kl.visningsnavn ?? "En kunde";
        const html = `<p><strong>${pnt(kunde)}</strong> har bestilt ekstra hjælp fra deres egen planlægning.</p>`
          + `<p><strong>${pnt(raekke.ydelse_titel ?? "Egen beskrivelse")}</strong><br>Ønsket dato: ${pnt(datoDk(dato))}</p>`
          + (fritekst ? `<p>${pnt(fritekst)}</p>` : "")
          + (raekke.adresse ? `<p>Adresse: ${pnt(raekke.adresse)}</p>` : "")
          + (raekke.bemaerkning ? `<p>Bemærkning: ${pnt(raekke.bemaerkning)}</p>` : "")
          + `<p>Bestilt af ${pnt(raekke.bestilt_af_navn || raekke.bestilt_af_email || "ukendt")}.</p>`
          + `<p>Den ligger til godkendelse i Ugeplan: <a href="${PLANLAEGNING}">${PLANLAEGNING}</a></p>`;
        for (const p of planlaeggere ?? []) {
          await admin.functions.invoke("send-email", {
            headers: { Authorization: `Bearer ${SERVICE_KEY}` },
            body: { email: p.app_email, name: p.name ?? "", subject: `Bestilling fra ${kunde}`, html },
          });
        }
      } catch (e) {
        console.error("bro-modtag mail:", String((e as Error)?.message ?? e));
      }
      return svar({ ok: true, id: raekke.id });
    }

    return svar({ error: "ukendt_handling" }, 400);
  } catch (e) {
    console.error("bro-modtag:", String((e as Error)?.message ?? e));
    return svar({ error: "ukendt" }, 500);
  }
});
