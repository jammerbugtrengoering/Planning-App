// Overblikket (8.10.2026): virksomhedens temperatur og de punkter, der kræver handling. Indgangen til alle rapporterne.
//
// Rent regnearbejde uden React, så det kan prøves i `overblik.test.mjs`. Overblikket regner ikke noget selv: hvert nøgletal kommer fra den samme funktion som rapporten bag det
// (daekningsbidrag.js, udnyttelse.js, sygefravaer.js, aflysningsprocent.js), kaldt med den samme periode. Et tal på overblikket kan derfor aldrig afvige fra rapporten, det peger på.
//
// Målene sættes af kontoret under Opsætning -> Nøgletal og mål (firma.noegletal_maal). `mal` her er standarden, når intet er sat; de er gæt, ikke afstemt med kontoret.

import { daekningPrSegment } from "./daekningsbidrag.js";
import { udnyttelsePrMedarbejder, LAV_GRAENSE } from "./udnyttelse.js";
import { sygefravaerOgVikar } from "./sygefravaer.js";
import { aflysningPrSegment } from "./aflysningsprocent.js";

// hoej: højere er bedre. rapport: fanen i Rapportering, som kortet fører til.
export const MAAL = {
  oms: { navn: "Omsætning mod budget", enhed: "%", hoej: true, mal: 100, rapport: "budget", del: "oekonomi" },
  db: { navn: "Dækningsbidrag", enhed: "%", hoej: true, mal: 55, rapport: "daekning", del: "oekonomi" },
  pr: { navn: "Omsætning pr. arbejdstime", enhed: "kr.", hoej: true, mal: 330, rapport: "medarbejderomsaetning", del: "oekonomi" },
  ud: { navn: "Udnyttelse", enhed: "%", hoej: true, mal: 75, rapport: "udnyttelse", del: "drift" },
  vikar: { navn: "Vikardækning", enhed: "%", hoej: true, mal: 90, rapport: "sygefravaer", del: "drift" },
  af: { navn: "Aflysningsprocent", enhed: "%", hoej: false, mal: 6, rapport: "aflysning", del: "kunder" },
  udloeb: { navn: "Aftaler der udløber inden 90 dage", enhed: "stk.", hoej: false, mal: 3, rapport: "portefoelje", del: "kunder" },
  sy: { navn: "Sygefravær", enhed: "%", hoej: false, mal: 4, rapport: "sygefravaer", del: "medarbejdere" },
};
// De gældende mål: standarden, overskrevet af det, kontoret har sat. Et mål, der ikke er et tal over nul, ignoreres (så en tom eller forkert værdi aldrig giver 0 % eller division med nul).
export function maalTal(overstyr) {
  const ud = {};
  for (const [k, m] of Object.entries(MAAL)) {
    const v = overstyr && Number(overstyr[k]);
    ud[k] = Number.isFinite(v) && v > 0 ? v : m.mal;
  }
  return ud;
}
const STANDARD_TAL = maalTal(null);
export const DELE = [["oekonomi", "Økonomi"], ["kunder", "Kunder"], ["medarbejdere", "Medarbejdere"], ["drift", "Drift"]];
export const ZONE = { kritisk: 40, advarsel: 70 };   // under 40: kritisk, under 70: følg op, ellers sund

// 100 = målet er nået. Lavere-er-bedre regnes om, så 6 % aflysninger mod et mål på 4 % giver 67.
export function opnaaelse(nogle, v, maal = STANDARD_TAL) {
  const m = { ...MAAL[nogle], mal: maal[nogle] };
  if (v == null || !Number.isFinite(v)) return null;
  if (m.hoej) return Math.max(0, Math.min(100, (v / m.mal) * 100));
  if (v <= m.mal) return 100;
  return Math.max(0, Math.min(100, (m.mal / v) * 100));
}
export function statusFor(nogle, v, maal = STANDARD_TAL) {
  if (v == null) return "ingen";
  const m = { ...MAAL[nogle], mal: maal[nogle] };
  if (m.hoej ? v >= m.mal : v <= m.mal) return "good";
  const o = opnaaelse(nogle, v, maal);
  return o < 80 ? "crit" : "warn";
}

const dagePlus = (iso, n) => { const d = new Date(iso + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

// ISO-ugen for en dato («YYYY-MM-DD»): { uge, aar }.
export function isoUge(iso) {
  const d = new Date(iso + "T00:00:00Z");
  const dag = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dag + 3);
  const aar = d.getUTCFullYear();
  const uge = Math.ceil(((d - Date.UTC(aar, 0, 1)) / 86400000 + 1) / 7);
  return { uge, aar };
}

// Opgaver uden medarbejder i næste uges plan. De bliver hverken udført eller faktureret, før de er planlagt. Samme afgrænsning som klokken (kontor_indbakke, 7a):
// egentlige opgaver (fixed/adhoc), ikke aflyste, ingen medarbejder. kr er planlagt omsætning, regnet som i rapporterne (beregn).
export function utildelteNaesteUge(i) {
  const { uge, aar } = isoUge(dagePlus(i.idag, 7));
  const liste = i.medAflyste.filter((t) => t.week === uge && t.year === aar && !i.erAflyst(t) && (t.assignees || []).length === 0);
  return { uge, aar, antal: liste.length, kr: liste.reduce((s, t) => s + (Number(i.beregn(t).planlagtKr) || 0), 0) };
}

// Nøgletallene for én periode. in: se felterne nedenfor (alle er funktioner eller lister fra appen).
export function beregnPeriode(i, fra, til) {
  const { opgaver, alleOpgaver, medarbejdere, templates, budgets, beregn, satsFor, datoAf, planlagtFor, erAflyst, erSygdom, erBlok, partFor, fastFor, segmenter, idag } = i;
  const seg = segmenter || [["privat"], ["erhverv"], ["nexus"], ["aeldrelov"]];
  const db = daekningPrSegment(opgaver, { beregn, satsFor, datoAf, fra, til, segmenter: seg });
  const oms = db.ialt.omsaetning;
  // Budgettet er pr. måned: alle måneder, perioden berører (en periode er altid hele måneder).
  let budget = 0;
  for (const b of budgets || []) {
    const m = `${b.year}-${String(b.month).padStart(2, "0")}`;
    if (m >= fra.slice(0, 7) && m <= til.slice(0, 7)) budget += Number(b.amount) || 0;
  }
  const ud = udnyttelsePrMedarbejder({ medarbejdere, opgaver: alleOpgaver, fra, til, idag, datoAf, planlagtFor, erBlok, erUdelukket: (t) => t.type === "aktivitet" || erAflyst(t) });
  const sy = sygefravaerOgVikar({ medarbejdere, opgaver: alleOpgaver, fra, til, datoAf, erSygdom, erAflyst, fastFor });
  // Aflysningsprocenten skal have de aflyste med i nævneren: medAflyste er alle egentlige opgaver, også de aflyste.
  const af = aflysningPrSegment(i.medAflyste, { fra, til, idag, datoAf, erAflyst, partFor, segmenter: seg });
  const udloeb = (templates || []).filter((t) => t.status === "aktiv" && t.expiryDate && t.expiryDate >= idag && t.expiryDate <= dagePlus(idag, 90)).length;
  const v = {
    oms: budget > 0 ? (oms / budget) * 100 : null,
    db: db.ialt.procent,
    pr: db.ialt.timer > 0 ? oms / db.ialt.timer : null,
    ud: ud.ialt.udfoertPct != null ? ud.ialt.udfoertPct : ud.ialt.planlagtPct,
    vikar: sy.vikar.procent,
    af: af.ialt.procent,
    udloeb,
    sy: sy.ialt.procent,
  };
  return { v, oms, budget, db, ud, sy, af };
}

// Temperaturen: gennemsnittet af de fire dele, hver del gennemsnittet af sine nøgletals opnåelse. Mangler en del al data, springes den over.
export function temperatur(v, maal = STANDARD_TAL) {
  const dele = {};
  for (const [nogle, m] of Object.entries(MAAL)) {
    const o = opnaaelse(nogle, v[nogle], maal);
    if (o == null) continue;
    (dele[m.del] = dele[m.del] || []).push(o);
  }
  const raekker = DELE.map(([k, navn]) => {
    const xs = dele[k] || [];
    return { key: k, navn, score: xs.length ? Math.round(xs.reduce((s, x) => s + x, 0) / xs.length) : null };
  });
  const med = raekker.filter((r) => r.score != null);
  const score = med.length ? Math.round(med.reduce((s, r) => s + r.score, 0) / med.length) : null;
  const niveau = score == null ? "ingen" : score < ZONE.kritisk ? "crit" : score < ZONE.advarsel ? "warn" : "good";
  return { score, niveau, dele: raekker };
}

// Fire kalendermåneder bagud som kurve: første dag, sidste dag.
export function sidsteMaaneder(idag, n) {
  const [y, m] = idag.split("-").map(Number);
  const ud = [];
  for (let k = n - 1; k >= 0; k--) {
    const d = new Date(Date.UTC(y, m - 1 - k, 1));
    const sidste = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
    ud.push({ fra: d.toISOString().slice(0, 10), til: sidste.toISOString().slice(0, 10), label: `${d.getUTCMonth() + 1}/${String(d.getUTCFullYear()).slice(2)}` });
  }
  return ud;
}

// Opmærksomhedspunkter, mest alvorlige først. Hvert punkt har en `rapport` (fane i Rapportering) eller en `side` (anden side i appen).
export function opmaerksomhed(i, p) {
  const maal = i.maal || STANDARD_TAL;
  const { alleOpgaver, templates, medarbejdere, datoAf, idag, forfaldne } = i;
  const ud = [];
  const utild = utildelteNaesteUge(i);
  if (utild.antal) ud.push({ alvor: "crit", titel: `${utild.antal} ${utild.antal === 1 ? "opgave" : "opgaver"} i næste uges plan (uge ${utild.uge}) er ikke tildelt`,
    tekst: `Planlagt omsætning ca. ${Math.round(utild.kr).toLocaleString("da-DK")} kr., der ikke bliver til noget, før opgaverne har en medarbejder.`, knap: "Åbn næste uges plan", side: "uge", arg: { naeste: true } });
  const om14 = dagePlus(idag, 14);
  const ikke = p.sy.beroerte.filter((b) => b.udfald === "ikkeDaekket" && b.dato >= idag && b.dato <= om14);
  if (ikke.length) ud.push({ alvor: "crit", titel: `${ikke.length} ${ikke.length === 1 ? "opgave" : "opgaver"} de næste 14 dage har ingen afløser`, tekst: "Den faste medarbejder er sygemeldt, og ingen står på opgaven.", knap: "Åbn sygefravær", rapport: "sygefravaer" });
  if (forfaldne && forfaldne.antal > 0) ud.push({ alvor: "crit", titel: `${forfaldne.antal} ${forfaldne.antal === 1 ? "faktura er" : "fakturaer er"} forfaldne, ${Math.round(forfaldne.beloeb).toLocaleString("da-DK")} kr.`, tekst: "Status fra Dinero.", knap: "Åbn Overskud", rapport: "overskud" });
  const udl = (templates || []).filter((t) => t.status === "aktiv" && t.expiryDate && t.expiryDate >= idag && t.expiryDate <= dagePlus(idag, 60));
  if (udl.length) ud.push({ alvor: "warn", titel: `${udl.length} ${udl.length === 1 ? "aftale udløber" : "aftaler udløber"} inden 60 dage`, tekst: udl.slice(0, 3).map((t) => `${t.customerName || t.title} (${t.expiryDate.split("-").reverse().join(".")})`).join(", ") + (udl.length > 3 ? ` og ${udl.length - 3} til` : ""), knap: "Åbn aftaleporteføljen", rapport: "portefoelje" });
  const lave = p.ud.raekker.filter((r) => r.planlagtPct != null && r.planlagtPct < LAV_GRAENSE);
  if (lave.length) ud.push({ alvor: "warn", titel: `Udnyttelsen er under ${LAV_GRAENSE} % hos ${lave.length} ${lave.length === 1 ? "medarbejder" : "medarbejdere"}`, tekst: `${Math.round(lave.reduce((s, r) => s + Math.max(0, r.kapacitet * (maal.ud / 100) - r.planlagt), 0) / 60)} ledige timer op til målet på ${maal.ud} % i perioden. Plads til nye opgaver.`, knap: "Åbn udnyttelse", rapport: "udnyttelse" });
  const priv = p.af.raekker.find((r) => r.noegle === "privat");
  if (priv && priv.procent != null && priv.procent > maal.af) ud.push({ alvor: "warn", titel: `Aflysningsprocent for Privat er ${(Math.round(priv.procent * 10) / 10).toLocaleString("da-DK")} %`, tekst: `Målet er ${maal.af} %. ${priv.kunde} af kunden, ${priv.os} af os.`, knap: "Åbn aflysninger", rapport: "aflysning" });
  const kladder = (templates || []).filter((t) => t.status === "kladde" && !String(t.customerName || "").trim()).length;
  const udenPostnr = (i.udenPostnr || 0);
  if (kladder || udenPostnr) ud.push({ alvor: "warn", titel: [kladder && `${kladder} ${kladder === 1 ? "kladde mangler" : "kladder mangler"} kundenavn`, udenPostnr && `${udenPostnr} ${udenPostnr === 1 ? "aftale mangler" : "aftaler mangler"} postnummer`].filter(Boolean).join(" · "), tekst: "Kan ikke godkendes eller placeres på kortet.", knap: "Åbn Drift", side: "drift" });
  return ud;
}
