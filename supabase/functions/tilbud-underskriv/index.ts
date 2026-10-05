import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";

// Lægger kundens underskrift ind i tilbuds-PDF'en og mailer den til kunden (5.10.2026).
//
// Rækkefølgen er vigtig, og den er styret af klienten:
//   1. tilbud-pdf danner PDF'en og gemmer et fingeraftryk (pdf_hash)
//   2. underskriftsbilledet lægges i bucket «tilbud»
//   3. godkend_tilbud_med_underskrift gemmer underskriften på tilbuddet og låser det
//   4. DENNE funktion tager den PDF, kunden skrev under på, og sætter underskriften på en ekstra side
//
// Den oprindelige PDF røres ikke. Den underskrevne er en SEPARAT fil (tilbud-underskrevet.pdf), og
// fingeraftrykket af den oprindelige tjekkes mod det, der blev gemt ved underskriften. Er de forskellige,
// er dokumentet ændret efter underskriften, og der laves ingen underskrevet udgave.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const BUCKET = "tilbud";
const AFSENDER_EMAIL = Deno.env.get("AFSENDER_EMAIL") ?? "jammerbugtrengoering@outlook.dk";
const AFSENDER_NAVN = Deno.env.get("AFSENDER_NAVN") ?? "Jammerbugt Rengøring";
const SVAR_TIL = Deno.env.get("SVAR_TIL") ?? "";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function svar(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

// Helvetica (WinAnsi) kaster ved tegn, den ikke kender, fx emoji i et navn. Et navn må aldrig vælte en underskrift.
const sikker = (s: string) => String(s ?? "").replace(/[^ -~ -ÿ]/g, "?");

const sha256 = async (bytes: Uint8Array) =>
  Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)))
    .map((b) => b.toString(16).padStart(2, "0")).join("");

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // Samme adgang som tilbud-pdf: planlægger, eller den medarbejder der står på mødeopgaven.
    const jwt = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    const { data: { user } } = await admin.auth.getUser(jwt);
    if (!user) return svar({ error: "ikke_logget_ind" }, 401);
    const { data: medarb } = await admin
      .from("employees").select("id, name, is_admin").eq("auth_user_id", user.id).maybeSingle();
    if (!medarb) return svar({ error: "ikke_medarbejder" }, 403);

    const { tilbudId } = await req.json();
    if (!tilbudId) return svar({ error: "tilbud_mangler" }, 400);
    const { data: t } = await admin.from("tilbud").select("*").eq("id", tilbudId).maybeSingle();
    if (!t) return svar({ error: "ukendt_tilbud" }, 404);

    if (!medarb.is_admin) {
      const { data: opg } = t.instance_id
        ? await admin.from("instances").select("assignees").eq("id", t.instance_id).maybeSingle()
        : { data: null };
      if (!(Array.isArray(opg?.assignees) && opg.assignees.includes(medarb.id))) return svar({ error: "ingen_adgang" }, 403);
    }
    if (t.status !== "accepteret") return svar({ error: "tilbuddet_er_ikke_godkendt" }, 409);

    const { data: sig } = await admin.from("tilbud_signatur").select("*")
      .eq("tilbud_id", t.id).not("signatur_sti", "is", null)
      .order("underskrevet", { ascending: false }).limit(1).maybeSingle();
    if (!sig) return svar({ error: "ingen_underskrift" }, 409);
    if (!t.pdf_sti) return svar({ error: "ingen_pdf" }, 409);

    const { data: orig, error: origFejl } = await admin.storage.from(BUCKET).download(t.pdf_sti);
    if (origFejl || !orig) return svar({ error: "pdf_kunne_ikke_hentes" }, 500);
    const origBytes = new Uint8Array(await orig.arrayBuffer());
    if ((await sha256(origBytes)) !== sig.pdf_hash) {
      return svar({ error: "dokumentet_er_aendret_efter_underskriften" }, 409);
    }

    const { data: png, error: pngFejl } = await admin.storage.from(BUCKET).download(sig.signatur_sti);
    if (pngFejl || !png) return svar({ error: "underskriften_kunne_ikke_hentes" }, 500);

    const pdf = await PDFDocument.load(origBytes);
    const almindelig = await pdf.embedFont(StandardFonts.Helvetica);
    const fed = await pdf.embedFont(StandardFonts.HelveticaBold);
    const billede = await pdf.embedPng(new Uint8Array(await png.arrayBuffer()));

    const pink = rgb(0.839, 0.141, 0.478);
    const sort = rgb(0.067, 0.067, 0.067);
    const graa = rgb(0.42, 0.45, 0.50);
    const V = 56;
    const side = pdf.addPage([595, 842]);
    let y = 790;
    const skriv = (tekst: string, str: number, skrift = almindelig, farve = sort) => {
      side.drawText(sikker(tekst), { x: V, y, size: str, font: skrift, color: farve });
      y -= str + 7;
    };

    skriv("Jammerbugt Rengøring", 18, fed, pink);
    skriv("Underskrift", 26, fed);
    y -= 4;
    skriv(`Tilbudsnummer ${t.id}`, 9.5, almindelig, graa);
    skriv(sikker(t.kunde_navn), 12, fed);
    y -= 10;
    skriv("Kunden har godkendt tilbuddet ved at skrive under på medarbejderens telefon.", 10.5);
    y -= 14;

    // Underskriften skaleres ind i et felt på 300 x 120 uden at blive skæv.
    const maxB = 300, maxH = 120;
    const skala = Math.min(maxB / billede.width, maxH / billede.height, 1);
    const b = billede.width * skala, h = billede.height * skala;
    side.drawImage(billede, { x: V, y: y - h, width: b, height: h });
    y -= h + 4;
    side.drawLine({ start: { x: V, y }, end: { x: V + 300, y }, thickness: 0.8, color: graa });
    y -= 16;

    const nu = new Date().toLocaleString("da-DK", { timeZone: "Europe/Copenhagen", dateStyle: "long", timeStyle: "short" });
    skriv(`Navn: ${sig.navn}`, 11, fed);
    skriv(`Tidspunkt: ${nu}`, 10.5);
    skriv(`Registreret af: ${medarb.name ?? "medarbejder"}`, 10.5);
    y -= 14;
    skriv("Fingeraftryk (SHA-256) af det tilbud, kunden skrev under på:", 9, almindelig, graa);
    skriv(sig.pdf_hash.slice(0, 32), 8.5, almindelig, graa);
    skriv(sig.pdf_hash.slice(32), 8.5, almindelig, graa);
    y -= 6;
    skriv("Er fingeraftrykket af tilbuddets første sider det samme, er indholdet ikke ændret efter underskriften.", 8.5, almindelig, graa);

    const bytes = await pdf.save();
    const hash2 = await sha256(bytes);
    const sti = `${t.id}/tilbud-underskrevet.pdf`;
    const { error: gemFejl } = await admin.storage.from(BUCKET).upload(sti, bytes, { contentType: "application/pdf", upsert: true });
    if (gemFejl) return svar({ error: gemFejl.message }, 500);
    await admin.from("tilbud").update({ pdf_underskrevet_sti: sti }).eq("id", t.id);
    await admin.from("tilbud_signatur").update({ pdf_hash_underskrevet: hash2 }).eq("id", sig.id);

    // Mail til kunden med PDF'en vedhæftet. Mislykkes den, er underskriften stadig gemt og PDF'en dannet.
    let mail: "sendt" | "ingen_mail" | "fejlede" = "ingen_mail";
    const modtager = (t.kunde_email ?? "").trim();
    const brevoKey = Deno.env.get("BREVO_API_KEY");
    if (modtager && brevoKey) {
      let afsenderNavn = AFSENDER_NAVN, svarTil = SVAR_TIL;
      try {
        const { data: f } = await admin.from("firma").select("afsender_navn, svar_til").eq("id", "default").maybeSingle();
        if (f?.afsender_navn?.trim()) afsenderNavn = f.afsender_navn.trim();
        if (f?.svar_til?.trim()) svarTil = f.svar_til.trim();
      } catch { /* de gamle værdier bruges */ }
      const navn = (t.kontaktperson ?? "").trim();
      const r = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: { "api-key": brevoKey, "Content-Type": "application/json" },
        body: JSON.stringify({
          sender: { name: afsenderNavn, email: AFSENDER_EMAIL },
          ...(svarTil ? { replyTo: { email: svarTil } } : {}),
          to: [{ email: modtager, ...(navn ? { name: navn } : {}) }],
          subject: `Dit underskrevne tilbud fra ${afsenderNavn}`,
          htmlContent: `<p>Hej ${navn}</p><p>Tak for din underskrift. Her er det underskrevne tilbud${t.titel ? " på " + t.titel : ""} som PDF.</p>`
            + `<p>Vi kontakter dig for at aftale startdato og faste ugedage.</p><p>Med venlig hilsen<br/>${afsenderNavn}</p>`,
          attachment: [{ name: "Tilbud-underskrevet.pdf", content: encode(bytes) }],
        }),
      });
      mail = r.ok ? "sendt" : "fejlede";
      if (!r.ok) console.error("tilbud-underskriv: Brevo afviste", r.status);
    }

    return svar({ ok: true, sti, hash: hash2, mail });
  } catch (e) {
    return svar({ error: String((e && (e as Error).message) || e) }, 500);
  }
});
