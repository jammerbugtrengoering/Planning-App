import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";

// Fredagsbackup af ugeplanen (7.10.2026, Jonn).
//
// Hver fredag eftermiddag danner funktionen en PDF med de næste to ugers plan — uge for uge, dag for dag, medarbejder for medarbejder — og mailer den til
// kontorets administratorer. Det er en nødplan: er systemet nede mandag morgen, kan planen stadig læses og printes.
//
// Hvorfor på serveren: planen skal komme, selv om ingen har appen åben. Derfor kan den ikke bruge udskriften i planlægningsappen (den ligger i browseren) og viser
// kun de klokkeslæt, der er aftalt (scheduled_time) — den køretidsberegnede rækkefølge findes kun i appen.
//
// To kald om ugen (kl. 12 og 13 UTC): Danmark skifter mellem UTC+1 og UTC+2, og et fast UTC-tidspunkt rammer ellers enten kl. 13 eller 15. Tabellen
// backup_udsendelser gør, at kun det første kald sender.
//
// Adgangstekster (nøgleboks, alarm) står i PDF'en, fordi planen ellers ikke kan bruges som backup. Derfor står FORTROLIGT på hver side, og PDF'en sendes kun
// til administratorer. Koderne fra adgangslageret er IKKE med.
//
// Hvem må kalde: cron'en bruger den offentlige nøgle. Den kan kun udløse det, der alligevel skal ske (en backup, fredag, én gang pr. uge).
// force, dryRun og kunTil kræver service-nøglen; en indlogget administrator kan kun sende en prøve til sin egen adresse.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const JOB = "ugeplan-backup";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function svar(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

function rolleIToken(token: string): string | null {
  try {
    const dele = token.split(".");
    if (dele.length !== 3) return null;
    const b64 = dele[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(b64.padEnd(b64.length + (4 - b64.length % 4) % 4, "=")))?.role ?? null;
  } catch { return null; }
}

// ── Dato ────────────────────────────────────────────────────────────────────
const DK = "Europe/Copenhagen";
function danskNu() {
  const d = new Date();
  const dele = new Intl.DateTimeFormat("en-GB", { timeZone: DK, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", weekday: "short", hour12: false }).formatToParts(d);
  const g = (t: string) => dele.find((x) => x.type === t)?.value ?? "";
  return { dato: new Date(Date.UTC(+g("year"), +g("month") - 1, +g("day"))), time: +g("hour") % 24, ugedag: g("weekday") };
}
const plusDage = (d: Date, n: number) => new Date(d.getTime() + n * 864e5);
const iso = (d: Date) => d.toISOString().slice(0, 10);
function isoUge(d: Date): { aar: number; uge: number } {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dag = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - dag);
  const aar = t.getUTCFullYear();
  const uge = Math.ceil(((t.getTime() - Date.UTC(aar, 0, 1)) / 864e5 + 1) / 7);
  return { aar, uge };
}
const DAGE = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DAGNAVN = ["mandag", "tirsdag", "onsdag", "torsdag", "fredag", "lørdag", "søndag"];
const MAANED = ["januar", "februar", "marts", "april", "maj", "juni", "juli", "august", "september", "oktober", "november", "december"];
const langDato = (d: Date) => `${DAGNAVN[(d.getUTCDay() + 6) % 7]} ${d.getUTCDate()}. ${MAANED[d.getUTCMonth()]} ${d.getUTCFullYear()}`;

// ── Tekst til PDF ───────────────────────────────────────────────────────────
// Standardskrifttyperne kan kun WinAnsi: æøå og de almindelige tegn er med, resten bliver til «?», så ét enkelt fremmed tegn ikke vælter hele PDF'en.
const EKSTRA = new Set(["–", "—", "‘", "’", "“", "”", "•", "…", "€"]);
function rens(s: unknown): string {
  return String(s ?? "").replace(/[\r\n\t]+/g, " ").split("").map((c) => (c.charCodeAt(0) <= 255 || EKSTRA.has(c) ? c : "?")).join("").trim();
}

type Font = Awaited<ReturnType<PDFDocument["embedFont"]>>;
function ombryd(tekst: string, font: Font, str: number, bredde: number): string[] {
  const ord = rens(tekst).split(" ").filter(Boolean);
  const linjer: string[] = [];
  let nu = "";
  for (const o of ord) {
    const pr = nu ? nu + " " + o : o;
    if (font.widthOfTextAtSize(pr, str) <= bredde) { nu = pr; continue; }
    if (nu) linjer.push(nu);
    // et enkelt ord, der er længere end linjen, brydes
    let rest = o;
    while (font.widthOfTextAtSize(rest, str) > bredde && rest.length > 1) {
      let n = rest.length - 1;
      while (n > 1 && font.widthOfTextAtSize(rest.slice(0, n), str) > bredde) n--;
      linjer.push(rest.slice(0, n)); rest = rest.slice(n);
    }
    nu = rest;
  }
  if (nu) linjer.push(nu);
  return linjer.length ? linjer : [""];
}

const KONTRAKT: Record<string, string> = { privat: "Privat", erhverv: "Erhverv", nexus: "Nexus", aeldrelov: "Ældrelov" };

type Opg = {
  id: string; title: string; type: string; day: string; year: number; week: number; scheduled_time: string | null; duration: number | null;
  assignees: string[] | null; customer_name: string | null; address_text: string | null; access_instructions: string | null;
  contract_type: string | null; telefon: string | null; kontaktperson: string | null; opgave_nr: number | null; tid_fordeling: Record<string, number> | null;
  needs_key_pickup: boolean | null;
};

async function byg(opgaver: Opg[], emps: Map<string, string>, uger: { aar: number; uge: number; mandag: Date }[], genereret: string) {
  const pdf = await PDFDocument.create();
  const normal = await pdf.embedFont(StandardFonts.Helvetica);
  const fed = await pdf.embedFont(StandardFonts.HelveticaBold);
  const B = 595.28, H = 841.89, M = 36, BUND = 44, TOP = H - M;
  const sort = rgb(0.07, 0.07, 0.07), graa = rgb(0.38, 0.4, 0.45), roed = rgb(0.7, 0.1, 0.1), lys = rgb(0.93, 0.94, 0.96);
  let side = pdf.addPage([B, H]);     // første side; den første dag genbruger den i stedet for at tilføje en tom
  let y = TOP;
  const sider = [side];
  let foersteSide = true;
  let overskrift = "";

  const nySide = () => {
    if (foersteSide) { foersteSide = false; y = TOP; return; }
    side = pdf.addPage([B, H]); sider.push(side); y = TOP;
  };
  const tekst = (t: string, x: number, yy: number, str = 9, f: Font = normal, farve = sort) =>
    side.drawText(rens(t), { x, y: yy, size: str, font: f, color: farve });
  const dagHoved = (t: string) => {
    tekst(t, M, y - 14, 15, fed);
    side.drawLine({ start: { x: M, y: y - 20 }, end: { x: B - M, y: y - 20 }, thickness: 1.2, color: sort });
    y -= 32;
  };

  for (const u of uger) {
    for (let di = 0; di < 7; di++) {
      const dato = plusDage(u.mandag, di);
      const dag = DAGE[di];
      const dagens = opgaver.filter((o) => o.year === u.aar && o.week === u.uge && o.day === dag);
      if (dagens.length === 0 && di >= 5) continue;          // tom weekend springes over
      nySide();
      overskrift = `Uge ${u.uge} · ${langDato(dato)}`;
      dagHoved(overskrift);
      if (dagens.length === 0) { tekst("Ingen opgaver denne dag.", M, y - 10, 10, normal, graa); continue; }

      // grupper pr. medarbejder (en opgave med flere medarbejdere står hos dem alle)
      const grupper = new Map<string, Opg[]>();
      for (const o of dagens) {
        const ids = (o.assignees && o.assignees.length) ? o.assignees : ["_ingen"];
        for (const id of ids) { if (!grupper.has(id)) grupper.set(id, []); grupper.get(id)!.push(o); }
      }
      const rk = [...grupper.keys()].sort((a, b) => {
        if (a === "_ingen") return 1; if (b === "_ingen") return -1;
        return (emps.get(a) ?? a).localeCompare(emps.get(b) ?? b, "da");
      });

      for (const id of rk) {
        const navn = id === "_ingen" ? "Ikke tildelt" : (emps.get(id) ?? "Ukendt medarbejder");
        const liste = grupper.get(id)!.sort((a, b) => (a.scheduled_time ?? "99:99").localeCompare(b.scheduled_time ?? "99:99"));
        let forste = true;
        const hoved = () => {
          side.drawRectangle({ x: M, y: y - 17, width: B - 2 * M, height: 17, color: lys });
          tekst(forste ? navn : `${navn} (fortsat)`, M + 6, y - 12, 10.5, fed);
          y -= 22; forste = false;
        };
        if (y - 60 < BUND) { nySide(); dagHoved(overskrift + " (fortsat)"); }
        hoved();

        for (const o of liste) {
          const type = o.type === "ferie" ? "Ferie" : o.type === "sygdom" ? "Sygdom" : null;
          const min = id !== "_ingen" && o.tid_fordeling && Number(o.tid_fordeling[id]) > 0 ? Number(o.tid_fordeling[id]) : (o.duration ?? 0);
          const tid = o.scheduled_time ? o.scheduled_time.slice(0, 5) : "—";
          const bredde = B - 2 * M - 52;
          const kopLinjer = ombryd(type ?? o.title ?? "", fed, 9.5, bredde);
          const linjer: { t: string; f: Font; farve: ReturnType<typeof rgb> }[] = [];
          const sted = [o.customer_name, o.address_text].map((x) => rens(x)).filter(Boolean).join(" · ");
          if (!type) {
            if (sted) for (const l of ombryd(sted, normal, 9, bredde)) linjer.push({ t: l, f: normal, farve: sort });
            const meta = [o.opgave_nr ? `Nr. ${o.opgave_nr}` : "", o.contract_type ? (KONTRAKT[o.contract_type] ?? o.contract_type) : "",
              o.kontaktperson ? `Kontakt: ${o.kontaktperson}` : "", o.telefon ? `Tlf. ${o.telefon}` : ""].filter(Boolean).join(" · ");
            if (meta) for (const l of ombryd(meta, normal, 8.5, bredde)) linjer.push({ t: l, f: normal, farve: graa });
            if (o.needs_key_pickup) linjer.push({ t: "Nøgle/adgangskort hentes på kontoret først", f: fed, farve: sort });
            if (o.access_instructions?.trim()) for (const l of ombryd("Adgang: " + o.access_instructions, fed, 8.5, bredde)) linjer.push({ t: l, f: fed, farve: roed });
          }
          const hojde = kopLinjer.length * 12 + linjer.length * 11 + 8;
          if (y - hojde < BUND) { nySide(); dagHoved(overskrift + " (fortsat)"); hoved(); }
          tekst(tid, M + 4, y - 10, 9.5, fed);
          if (!type) tekst(`${min} min`, M + 4, y - 21, 8, normal, graa);
          let yy = y - 10;
          for (const l of kopLinjer) { tekst(l, M + 52, yy, 9.5, fed); yy -= 12; }
          for (const l of linjer) { tekst(l.t, M + 52, yy, l.f === fed ? 8.5 : 9, l.f, l.farve); yy -= 11; }
          y -= hojde;
          side.drawLine({ start: { x: M, y: y + 3 }, end: { x: B - M, y: y + 3 }, thickness: 0.3, color: rgb(0.8, 0.82, 0.86) });
        }
        y -= 6;
      }
    }
  }

  // sidefod: fortrolighed + sidetal, når vi kender antallet
  sider.forEach((s, i) => {
    s.drawLine({ start: { x: M, y: 34 }, end: { x: B - M, y: 34 }, thickness: 0.5, color: graa });
    s.drawText("FORTROLIGT: indeholder adgangsoplysninger til private hjem. Må ikke efterlades i bilen. Makuleres, når ugerne er gået.", { x: M, y: 23, size: 7.5, font: fed, color: roed });
    s.drawText(rens(`Backup af ugeplanen · dannet ${genereret}`), { x: M, y: 13, size: 7.5, font: normal, color: graa });
    s.drawText(`Side ${i + 1} af ${sider.length}`, { x: B - M - 50, y: 13, size: 7.5, font: normal, color: graa });
  });
  if (sider.length === 1 && opgaver.length === 0) {
    sider[0].drawText("Der er ingen opgaver i de to uger.", { x: M, y: TOP - 20, size: 11, font: normal, color: sort });
  }
  return pdf.save();
}

function tilBase64(b: Uint8Array): string {
  let s = "";
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  // En prøve eller test må ikke skrive livstegn: så ville Drift-siden stå grøn, selv om fredagens rigtige mail aldrig gik.
  let skalIkkeLogges = false;
  const log = async (ok: boolean, besked?: string) => { if (!skalIkkeLogges) await admin.rpc("log_job", { p_job: JOB, p_ok: ok, p_besked: besked ?? null }); };

  try {
    const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "").trim();
    const erService = !!token && ((SERVICE_KEY && token === SERVICE_KEY) || rolleIToken(token) === "service_role");
    const body = await req.json().catch(() => ({}));
    // En indlogget administrator må sende en PRØVE til sin egen adresse (knappen på Drift-siden) — så kan hele kæden afprøves uden at vente til fredag.
    let adminMail: string | null = null;
    if (!erService && token) {
      const { data: u } = await admin.auth.getUser(token);
      if (u?.user) {
        const { data: e } = await admin.from("employees").select("app_email, is_admin").eq("auth_user_id", u.user.id).maybeSingle();
        if (e?.is_admin && e.app_email) adminMail = e.app_email;
      }
    }
    const proeve = !!adminMail && body.proeve === true;
    const force = erService && body.force === true;
    const toerloeb = erService && body.dryRun === true;
    const kunTil: string | null = erService && typeof body.kunTil === "string" ? body.kunTil : proeve ? adminMail : null;

    skalIkkeLogges = !!kunTil || toerloeb;
    const nu = danskNu();
    // Kun fredag mellem 13 og 17 dansk tid. Andre tidspunkter er ikke en fejl: så er det bare ikke tid endnu.
    if (!force && !toerloeb && !kunTil && !(nu.ugedag === "Fri" && nu.time >= 13 && nu.time <= 17)) {
      return svar({ ok: true, sprunget: "ikke fredag eftermiddag" });
    }

    // De næste to uger = ugen efter den nuværende, og ugen efter den. Mandag i næste uge.
    const dagIUgen = (nu.dato.getUTCDay() + 6) % 7;                  // 0 = mandag
    const naesteMandag = plusDage(nu.dato, 7 - dagIUgen);
    const uger = [0, 1].map((i) => { const mandag = plusDage(naesteMandag, 7 * i); return { ...isoUge(mandag), mandag }; });
    const fra = iso(naesteMandag);

    if (!force && !toerloeb && !kunTil) {
      const { data: allerede } = await admin.from("backup_udsendelser").select("uge_fra").eq("uge_fra", fra).maybeSingle();
      if (allerede) return svar({ ok: true, sprunget: "allerede sendt for " + fra });
    }

    const filter = uger.map((u) => `and(year.eq.${u.aar},week.eq.${u.uge})`).join(",");
    const { data: rae, error } = await admin.from("instances")
      .select("id,title,type,day,year,week,scheduled_time,duration,assignees,customer_name,address_text,access_instructions,contract_type,telefon,kontaktperson,opgave_nr,tid_fordeling,needs_key_pickup,status,aflyst_grund")
      .or(filter).is("deleted_at", null).is("aflyst_grund", null).neq("status", "aflyst").limit(5000);
    if (error) { await log(false, "kunne ikke hente opgaver: " + error.message); return svar({ error: error.message }, 500); }
    const opgaver = ((rae ?? []) as unknown as Opg[]).filter((o) => ["fixed", "adhoc", "aktivitet", "sygdom", "ferie"].includes(o.type));

    const { data: ansatte } = await admin.from("employees").select("id,name");
    const emps = new Map<string, string>((ansatte ?? []).map((e: { id: string; name: string }) => [e.id, e.name]));

    const genereret = new Intl.DateTimeFormat("da-DK", { timeZone: DK, dateStyle: "long", timeStyle: "short" }).format(new Date());
    const bytes = await byg(opgaver, emps, uger, genereret);
    const filnavn = `ugeplan-backup-uge-${uger[0].uge}-${uger[1].uge}.pdf`;
    const antal = opgaver.filter((o) => o.type !== "sygdom" && o.type !== "ferie").length;

    if (toerloeb) return svar({ ok: true, toerloeb: true, uger: uger.map((u) => u.uge), opgaver: antal, bytes: bytes.length });

    // Modtagere: administratorer med en mailadresse (samme kreds som kontorets månedsmail).
    let modtagere: { name: string; app_email: string }[] = [];
    if (kunTil) modtagere = [{ name: proeve ? "Prøve" : "Test", app_email: kunTil }];
    else {
      const { data: adm } = await admin.from("employees").select("name, app_email")
        .eq("is_admin", true).is("fratraadt_dato", null).not("app_email", "is", null);
      modtagere = (adm ?? []) as { name: string; app_email: string }[];
    }
    if (modtagere.length === 0) { await log(false, "ingen administratorer med mailadresse"); return svar({ error: "ingen_modtagere" }, 500); }

    const emne = `${proeve || kunTil ? "PRØVE: " : ""}Backup af ugeplanen: uge ${uger[0].uge} og ${uger[1].uge}`;
    const html = `<p>Hej,</p><p>Her er backuppen af ugeplanen for <b>uge ${uger[0].uge}</b> og <b>uge ${uger[1].uge}</b> (${langDato(uger[0].mandag)} til ${langDato(plusDage(uger[1].mandag, 6))}). Der er ${antal} opgaver i den.</p>`
      + `<p>Brug den, hvis systemet ikke kan åbnes: print siderne for de dage og medarbejdere, der skal bruges. Klokkeslættene er de aftalte tider; opgaver uden tid står med «—».</p>`
      + `<p><b>FORTROLIGT:</b> PDF'en indeholder adgangsoplysninger til private hjem. Videresend den ikke, læg den ikke i bilen, og makulér udskrifterne, når ugerne er gået.</p>`
      + `<p>Den sendes automatisk hver fredag eftermiddag.</p>`;

    let sendt = 0; const fejlede: string[] = [];
    for (const m of modtagere) {
      const { error: mailFejl } = await admin.functions.invoke("send-email", {
        headers: { Authorization: `Bearer ${SERVICE_KEY}` },
        body: { email: m.app_email, name: m.name, subject: emne, html, attachments: [{ name: filnavn, content: tilBase64(bytes) }] },
      });
      if (mailFejl) fejlede.push(`${m.app_email}: ${mailFejl.message ?? mailFejl}`); else sendt++;
    }

    if (sendt > 0 && !kunTil) {
      await admin.from("backup_udsendelser").upsert({ uge_fra: fra, antal_opgaver: antal, modtagere: sendt, sendt_tid: new Date().toISOString() });
    }
    await log(sendt > 0, `uge ${uger[0].uge}+${uger[1].uge}: ${antal} opgaver, ${sendt} af ${modtagere.length} mails sendt` + (fejlede.length ? " | fejl: " + fejlede.join("; ") : ""));
    return svar({ ok: sendt > 0, sendt, opgaver: antal, fejlede }, sendt > 0 ? 200 : 500);
  } catch (e) {
    await log(false, String((e && (e as Error).message) || e));
    return svar({ error: String((e && (e as Error).message) || e) }, 500);
  }
});
