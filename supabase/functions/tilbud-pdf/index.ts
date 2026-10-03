import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";

// Danner tilbuddet som PDF og gemmer det i Storage.
//
// Det sker paa serveren og IKKE i browseren. Det underskrevne dokument skal vaere det
// autoritative: dannes det i browseren, kan to personer faa hver sin udgave af det
// samme tilbud, og saa siger fingeraftrykket ingenting.
//
// Efter dannelsen gemmes en SHA-256 af filen paa tilbuddet. Naar kunden skriver under,
// gemmes det samme fingeraftryk paa signaturen. Kan de to matches, er det bevist at
// dokumentet ikke er aendret efter underskriften.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const BUCKET = "tilbud";

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

const kr = (n: number) =>
  new Intl.NumberFormat("da-DK", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) + " kr";

const KONTRAKT: Record<string, string> = {
  privat: "Privat", erhverv: "Erhverv", aeldrelov: "Ældreloven", nexus: "Kommunal (Nexus)",
};
const INTERVAL: Record<string, string> = {
  uge: "Hver uge", "14_dage": "Hver 14. dag", maaned: "Hver måned",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // Kun planlaeggere og den medarbejder der staar paa moedeopgaven maa danne
    // tilbuddet. Identiteten tages fra tokenet, aldrig fra det der sendes med.
    const jwt = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    const { data: { user } } = await admin.auth.getUser(jwt);
    if (!user) return svar({ error: "ikke_logget_ind" }, 401);
    const { data: medarb } = await admin
      .from("employees").select("id, is_admin").eq("auth_user_id", user.id).maybeSingle();
    if (!medarb) return svar({ error: "ikke_medarbejder" }, 403);

    const { tilbudId } = await req.json();
    if (!tilbudId) return svar({ error: "tilbud_mangler" }, 400);

    const { data: t, error: hentFejl } = await admin
      .from("tilbud").select("*").eq("id", tilbudId).maybeSingle();
    if (hentFejl) return svar({ error: hentFejl.message }, 500);
    if (!t) return svar({ error: "ukendt_tilbud" }, 404);

    if (!medarb.is_admin) {
      // Ikke administrator: saa skal hun staa paa moedeopgaven.
      const { data: opg } = t.instance_id
        ? await admin.from("instances").select("assignees").eq("id", t.instance_id).maybeSingle()
        : { data: null };
      const paa = Array.isArray(opg?.assignees) && opg.assignees.includes(medarb.id);
      if (!paa) return svar({ error: "ingen_adgang" }, 403);
    }

    // Ydelserne med deres punkter — det er dem der goer tilbuddet konkret for kunden.
    const ider: string[] = Array.isArray(t.checklist_template_ids) ? t.checklist_template_ids : [];
    const { data: lister } = ider.length
      ? await admin.from("checklist_templates").select("id, name").in("id", ider)
      : { data: [] as { id: string; name: string }[] };
    const { data: punkter } = ider.length
      ? await admin.from("checklist_template_items")
          .select("checklist_template_id, text").in("checklist_template_id", ider)
      : { data: [] as { checklist_template_id: string; text: string }[] };

    const pdf = await PDFDocument.create();
    pdf.setTitle(`Tilbud — ${t.kunde_navn}`);
    pdf.setProducer("Jammerbugt Rengøring");

    // Helvetica bruger WinAnsi og daekker æ, ø og å. Uden det ville danske navne
    // faa pdf-lib til at kaste midt i en kundes tilbud.
    const almindelig = await pdf.embedFont(StandardFonts.Helvetica);
    const fed = await pdf.embedFont(StandardFonts.HelveticaBold);

    const pink = rgb(0.839, 0.141, 0.478);
    const sort = rgb(0.067, 0.067, 0.067);
    const graa = rgb(0.42, 0.45, 0.50);

    let side = pdf.addPage([595, 842]);   // A4
    let y = 790;
    const V = 56;
    const BREDDE = 595 - V * 2;

    function nySide() { side = pdf.addPage([595, 842]); y = 790; }
    function plads(h: number) { if (y - h <= 60) nySide(); }

    function skriv(tekst: string, storrelse: number, skrift = almindelig, farve = sort, indryk = 0) {
      plads(storrelse + 6);
      side.drawText(tekst, { x: V + indryk, y, size: storrelse, font: skrift, color: farve });
      y -= storrelse + 6;
    }

    // Ombryder paa ord. Uden det loeber en lang referattekst ud over papirkanten.
    function skrivBloed(tekst: string, storrelse: number, indryk = 0) {
      const maks = BREDDE - indryk;
      for (const afsnit of String(tekst).split(/\n/)) {
        if (!afsnit.trim()) { y -= storrelse; continue; }
        let linje = "";
        for (const ord of afsnit.split(/\s+/)) {
          const proev = linje ? linje + " " + ord : ord;
          if (almindelig.widthOfTextAtSize(proev, storrelse) > maks) {
            skriv(linje, storrelse, almindelig, sort, indryk);
            linje = ord;
          } else {
            linje = proev;
          }
        }
        if (linje) skriv(linje, storrelse, almindelig, sort, indryk);
      }
    }

    function streg() {
      plads(14);
      side.drawLine({ start: { x: V, y: y + 4 }, end: { x: V + BREDDE, y: y + 4 },
                      thickness: 0.7, color: rgb(0.89, 0.91, 0.94) });
      y -= 12;
    }

    skriv("Jammerbugt Rengøring", 18, fed, pink);
    skriv("Tilbud", 26, fed);
    y -= 4;
    skriv(`Tilbudsnummer ${t.id}`, 9.5, almindelig, graa);
    skriv(`Dato ${new Date().toLocaleDateString("da-DK")}`, 9.5, almindelig, graa);
    if (t.gyldig_til) {
      skriv(`Gyldigt til og med ${new Date(t.gyldig_til).toLocaleDateString("da-DK")}`, 9.5, almindelig, graa);
    }
    y -= 8; streg();

    skriv("Kunde", 12, fed, pink);
    skriv(t.kunde_navn, 12, fed);
    if (t.kontaktperson) skriv(`Att. ${t.kontaktperson}`, 10.5, almindelig, graa);
    if (t.adresse) skriv(t.adresse, 10.5, almindelig, graa);
    y -= 6; streg();

    skriv(t.titel || "Rengøringsaftale", 15, fed);
    y -= 2;
    skriv(`Kontrakttype: ${KONTRAKT[t.contract_type] ?? t.contract_type}`, 10.5);
    if (t.plan_interval) skriv(`Hyppighed: ${INTERVAL[t.plan_interval] ?? t.plan_interval}`, 10.5);

    if (t.pricing_type === "fixed") {
      skriv(`Fast pris pr. besøg: ${kr(Number(t.fast_pris) || 0)}`, 12, fed);
      skriv("Prisen er fast uanset hvor lang tid besøget tager.", 9.5, almindelig, graa);
    } else {
      skriv(`Timepris: ${kr(Number(t.timepris) || 0)}`, 12, fed);
      if (t.anslaaet_timer) {
        const t_ = Number(t.anslaaet_timer);
        skriv(`Anslået tid pr. besøg: ${t_.toString().replace(".", ",")} timer`
              + ` — ca. ${kr(t_ * (Number(t.timepris) || 0))}`, 10.5);
      }
      skriv("Der faktureres kun for den tid der faktisk er registreret på opgaven.",
            9.5, almindelig, graa);
    }
    skriv("Alle priser er ekskl. moms.", 9.5, almindelig, graa);
    y -= 6; streg();

    skriv("Det er indeholdt", 12, fed, pink);
    if (!lister?.length) {
      skriv("Ingen ydelser valgt.", 10.5, almindelig, graa);
    } else {
      for (const l of lister) {
        y -= 2;
        skriv(l.name, 11.5, fed);
        const mine = (punkter || []).filter((p) => p.checklist_template_id === l.id);
        if (!mine.length) skriv("• (ingen punkter)", 10, almindelig, graa, 10);
        for (const p of mine) skrivBloed(`• ${p.text}`, 10, 10);
      }
    }
    y -= 6; streg();

    if (t.referat && String(t.referat).trim()) {
      skriv("Referat fra mødet", 12, fed, pink);
      skrivBloed(t.referat, 10);
      y -= 6; streg();
    }
    if (t.bemaerkning && String(t.bemaerkning).trim()) {
      skriv("Bemærkninger", 12, fed, pink);
      skrivBloed(t.bemaerkning, 10);
      y -= 6; streg();
    }

    // ── Billeder fra besigtigelsen ──────────────────────────────────────
    // Kommer kun med hvis planlaeggeren aktivt har valgt det. Billeder af snavs i
    // kundens egne lokaler kan laeses som en kritik, saa det er ikke standard.
    const stier: string[] = Array.isArray(t.fotos) ? t.fotos.slice(0, 10) : [];
    if (t.fotos_i_pdf && stier.length > 0) {
      nySide();
      skriv("Billeder fra besigtigelsen", 12, fed, pink);
      y -= 4;
      const kolBredde = (BREDDE - 12) / 2;
      let kol = 0;
      let raekkeHoejde = 0;
      for (const sti of stier) {
        const { data: fil, error: filFejl } = await admin.storage.from(BUCKET).download(sti);
        if (filFejl || !fil) continue;
        let billede;
        try {
          billede = await pdf.embedJpg(new Uint8Array(await fil.arrayBuffer()));
        } catch {
          // Ikke en JPEG vi kan laese. Spring den over frem for at vaelte hele tilbuddet.
          continue;
        }
        const skala = kolBredde / billede.width;
        const h = billede.height * skala;
        if (kol === 0) { plads(h + 10); raekkeHoejde = h; }
        side.drawImage(billede, {
          x: V + kol * (kolBredde + 12), y: y - h, width: kolBredde, height: h,
        });
        raekkeHoejde = Math.max(raekkeHoejde, h);
        kol += 1;
        if (kol === 2) { y -= raekkeHoejde + 12; kol = 0; raekkeHoejde = 0; }
      }
      if (kol === 1) y -= raekkeHoejde + 12;
      y -= 4; streg();
    }

    skriv("Accept", 12, fed, pink);
    skrivBloed("Tilbuddet accepteres digitalt via det link du har fået tilsendt. "
      + "Ved accept registreres dit navn, tidspunktet og et fingeraftryk af netop dette "
      + "dokument, så det kan dokumenteres at indholdet ikke er ændret bagefter.", 10);
    y -= 4;
    skrivBloed("Når du har accepteret, kontakter vi dig for at aftale startdato og faste "
      + "ugedage. Aftalen begynder først når det er på plads.", 10);

    const bytes = await pdf.save();

    // Fingeraftrykket tages af de bytes der faktisk gemmes.
    const hashBuf = await crypto.subtle.digest("SHA-256", bytes);
    const hash = Array.from(new Uint8Array(hashBuf))
      .map((b) => b.toString(16).padStart(2, "0")).join("");

    const sti = `${t.id}/tilbud.pdf`;
    const { error: gemFejl } = await admin.storage.from(BUCKET)
      .upload(sti, bytes, { contentType: "application/pdf", upsert: true });
    if (gemFejl) return svar({ error: gemFejl.message }, 500);

    const { error: opdFejl } = await admin.from("tilbud")
      .update({ pdf_sti: sti, pdf_hash: hash }).eq("id", t.id);
    if (opdFejl) return svar({ error: opdFejl.message }, 500);

    return svar({ ok: true, sti, hash, sider: pdf.getPageCount(), billeder: t.fotos_i_pdf ? stier.length : 0 });
  } catch (e) {
    return svar({ error: String((e && (e as Error).message) || e) }, 500);
  }
});
