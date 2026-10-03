import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Modtager «Ring mig op» fra den offentlige side /bestil i kundeportalen (3.10.2026).
// QR-koden i pjecen peger dertil. Den, der skriver, er typisk en pensionist uden login.
//
// Uden login (verify_jwt = false). Derfor er det HER, der skal vaernes:
//   * Siden kan kun SENDE. Tabellen henvendelser kan hverken laeses eller skrives af anon;
//     raekken skrives her med service-noeglen, og svaret siger intet om hvad der staar i den.
//   * Honningkrukke-felt («hjemmeside») og mindste udfyldningstid: en robot udfylder alt
//     paa et splitsekund. Den faar «ok» tilbage, saa den ikke laerer noget.
//   * Samme telefonnummer inden for en time giver ikke en ny raekke (dobbelttryk, eller
//     en der proever igen fordi hun ikke er sikker paa, om det virkede).
//   * Loft: hoejst 40 henvendelser i timen i alt. Saa kan et angreb ikke fylde tabellen
//     eller kontorets indbakke. Rammes loftet, faar borgeren besked om at ringe.
//   * Ingen IP-adresse eller andet om enheden gemmes.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const PLANNING = "https://jammerbugtrengoering-planning.netlify.app";
const LOFT_PR_TIME = 40;
const OENSKER = ["fast", "hovedrengoering", "vinduer", "ovn_koeleskab", "toejvask", "hoejtid", "andet"];
const OENSKE_NAVN: Record<string, string> = {
  fast: "Fast rengøring", hovedrengoering: "Hovedrengøring", vinduer: "Vinduespudsning",
  ovn_koeleskab: "Ovn og køleskab", toejvask: "Tøjvask og strygning", hoejtid: "Klar til højtid eller gæster",
  andet: "Andet",
};
const RING_NAVN: Record<string, string> = { formiddag: "formiddag", eftermiddag: "eftermiddag", lige_meget: "når som helst" };
const HJAELP_NAVN: Record<string, string> = { ja: "Ja", nej: "Nej", ved_ikke: "Ved ikke" };

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const svar = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const tekst = (v: unknown, max: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const pnt = (s: unknown) => String(s ?? "").replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]!));

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return svar({ error: "kun_post" }, 405);
  try {
    const b = await req.json().catch(() => ({}));

    // Robotter: lad som om alt gik godt.
    if (tekst(b.hjemmeside, 200)) return svar({ ok: true });
    const brugtMs = Number(b.brugt_ms);
    if (Number.isFinite(brugtMs) && brugtMs < 2500) return svar({ ok: true });

    const navn = tekst(b.navn, 120);
    const telefon = tekst(b.telefon, 30);
    const cifre = telefon.replace(/\D/g, "");
    if (!navn) return svar({ error: "navn_mangler" }, 400);
    if (cifre.length < 8 || cifre.length > 12) return svar({ error: "telefon_ugyldig" }, 400);

    const adresse = tekst(b.adresse, 200) || null;
    const kommune = ["ja", "nej", "ved_ikke"].includes(b.kommune_hjaelp) ? b.kommune_hjaelp : "ved_ikke";
    const ringTid = ["formiddag", "eftermiddag", "lige_meget"].includes(b.ring_tid) ? b.ring_tid : "lige_meget";
    const oensker = Array.isArray(b.oensker) ? [...new Set(b.oensker.filter((o: unknown) => OENSKER.includes(String(o))))] as string[] : [];
    const besked = String(b.besked ?? "").trim().slice(0, 1500) || null;
    const kilde = tekst(b.kilde, 40).replace(/[^a-z0-9_-]/gi, "") || "portal";

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const enTimeSiden = new Date(Date.now() - 3600_000).toISOString();

    const { count } = await admin.from("henvendelser").select("id", { count: "exact", head: true })
      .gte("oprettet", enTimeSiden);
    if ((count ?? 0) >= LOFT_PR_TIME) return svar({ error: "travlt" }, 429);

    // Samme nummer inden for en time: det er den samme borger. Ingen ny raekke, ingen ny mail.
    const { data: nylige } = await admin.from("henvendelser").select("telefon").gte("oprettet", enTimeSiden);
    if ((nylige ?? []).some((r) => String(r.telefon).replace(/\D/g, "").slice(-8) === cifre.slice(-8))) {
      return svar({ ok: true, igen: true });
    }

    const { data: ny, error } = await admin.from("henvendelser").insert({
      navn, telefon, adresse, kommune_hjaelp: kommune, oensker, ring_tid: ringTid, besked, kilde,
    }).select("id").single();
    if (error) throw error;

    // Kontoret faar en mail. Mailen maa ikke kunne vaelte henvendelsen: raekken er gemt,
    // og den staar under Salg -> Henvendelser uanset hvad.
    try {
      const { data: planlaeggere } = await admin.from("employees").select("name, app_email")
        .eq("is_admin", true).is("fratraadt_dato", null).not("app_email", "is", null);
      const html = `<p><strong>${pnt(navn)}</strong> vil gerne ringes op.</p>`
        + `<p>Telefon: <strong>${pnt(telefon)}</strong><br>`
        + `Helst: ${pnt(RING_NAVN[ringTid])}<br>`
        + (adresse ? `Adresse: ${pnt(adresse)}<br>` : "")
        + `Hjælp fra kommunen: ${pnt(HJAELP_NAVN[kommune])}</p>`
        + (oensker.length ? `<p>Interesseret i: ${oensker.map((o) => pnt(OENSKE_NAVN[o])).join(", ")}</p>` : "")
        + (besked ? `<p>${pnt(besked)}</p>` : "")
        // ?side=henvendelser lander direkte paa siden (efter login), ikke paa Ugeplan.
        + `<p><a href="${PLANNING}/?side=henvendelser">Åbn Henvendelser i planlægningsappen</a></p>`;
      for (const p of planlaeggere ?? []) {
        await admin.functions.invoke("send-email", {
          headers: { Authorization: `Bearer ${SERVICE_KEY}` },
          body: { email: p.app_email, name: p.name ?? "", subject: `Ring op: ${navn}`, html },
        });
      }
    } catch (e) {
      console.error("henvendelse-modtag mail:", String((e as Error)?.message ?? e));
    }

    return svar({ ok: true, id: ny?.id ? true : undefined });
  } catch (e) {
    console.error("henvendelse-modtag:", String((e as Error)?.message ?? e));
    return svar({ error: "fejl" }, 500);
  }
});
