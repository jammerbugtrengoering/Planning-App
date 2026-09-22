// Hvilke uger hentes med det samme, og hvilke uger må horisonten røre?
//
// Indtil 21.9.2026 hentede appen SAMTLIGE opgaver ved opstart. Det var 10.893 rækker
// og 6,4 MB, hentet i elleve sider, og det tog knap ni sekunder — mens planlæggeren
// sad og kiggede på én uge. 82 % af det var 2027 og 2028, fordi en aftale danner hele
// sin løbetid med det samme, den oprettes.
//
// Nu hentes et VINDUE omkring i dag først. Resten kommer bagefter, mens kontoret
// allerede er i gang.
//
// ─────────────────────────────────────────────────────────────────────────────
// DET FARLIGE, OG HVORFOR DEN HER FIL FINDES
//
// ensureWeekInstances danner en opgave for hver plads i ugen, den ikke kan finde i
// listen. Den kan ikke se forskel på «pladsen er tom» og «pladsen er ikke hentet
// endnu». Kører den på halve data, opfinder den dubletter — i en plan, nogen
// arbejder i lige nu, og på opgaver, medarbejderne får ud på telefonen.
//
// Derfor: horisonten må KUN røre en uge, der er hentet HELT. Listen over dem er det,
// hele filen handler om, og den er lagt her, hvor den kan prøves af uden at åbne
// appen.
//
// Reglen er én sætning: er ugen ikke på listen, så lad være.
//
// Ændrer du noget her, så ret vindue.test.mjs i samme ombæring.

// Otte uger tilbage og otte frem. Bagud, fordi fakturering og tidsregistrering
// kigger på den måned, der lige er gået. Fremad, fordi horisonten danner fire uger
// frem, og planlæggeren skal kunne blade et par uger videre uden at vente.
export const UGER_BAGUD = 8;
export const UGER_FREM = 8;

// Mandagen i den uge, en dato ligger i. Samme regel som i aftalerytme.js.
function mandagIUgen(dato) {
  const d = new Date(dato.getFullYear(), dato.getMonth(), dato.getDate());
  const n = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - n);
  return d;
}

// ISO-ugenummer og det år, ugen HØRER TIL — ikke kalenderåret.
//
// De to er ikke det samme. 1. januar 2027 ligger i uge 53 af 2026. Regner man med
// kalenderåret, får man «uge 53 i 2027», som ikke findes, og vinduet ville tabe
// nytårsugen hvert eneste år.
export function ugeInfo(dato) {
  const d = mandagIUgen(dato);
  const torsdag = new Date(d);
  torsdag.setDate(torsdag.getDate() + 3);
  const aar = torsdag.getFullYear();
  const jan4 = new Date(aar, 0, 4);
  const uge1Mandag = mandagIUgen(jan4);
  const uge = Math.round((d - uge1Mandag) / (7 * 24 * 60 * 60 * 1000)) + 1;
  return { uge, aar };
}

// Én nøgle pr. uge. "2026-39" og ikke to tal, så den kan ligge i et Set.
export function ugeNoegle(aar, uge) {
  return `${aar}-${String(uge).padStart(2, "0")}`;
}

// Ugerne i vinduet omkring en dato, i rækkefølge.
//
// Der regnes i rigtige kalenderdage og ikke i «uge ± 8», netop fordi et år har 52
// eller 53 uger. Syv døgn ad gangen ruller om ved årsskiftet af sig selv.
export function ugerIVinduet(idag = new Date(), bagud = UGER_BAGUD, frem = UGER_FREM) {
  const start = mandagIUgen(idag);
  start.setDate(start.getDate() - bagud * 7);
  const ud = [];
  for (let i = 0; i <= bagud + frem; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i * 7);
    ud.push(ugeInfo(d));
  }
  return ud;
}

// Filteret til den første hentning: kun uger i vinduet.
//
// Vinduet deles op i ét stykke PR. ÅR — «2026 uge 46 til 53» og «2027 uge 1 til 9».
//
// Hvorfor ikke ét kald med en or()-betingelse? Fordi PostgREST tager den slags som en
// tekststreng. Skriver man `or(and(year.eq.2026,week.gte.46),...)` med en tastefejl,
// kommer der ikke en fejl — der kommer et FORKERT ANTAL RÆKKER. Og et forkert antal
// rækker her betyder, at horisonten tror, pladser er tomme, og danner dubletter.
//
// To simple kald, hver med tre almindelige betingelser, kan ikke gå galt på den måde.
// Og der er højst to, fordi vinduet er på fire måneder.
export function vinduetsStykker(idag = new Date(), bagud = UGER_BAGUD, frem = UGER_FREM) {
  const uger = ugerIVinduet(idag, bagud, frem);
  const pr = new Map();
  uger.forEach(({ aar, uge }) => {
    const s = pr.get(aar) || { aar, fraUge: uge, tilUge: uge };
    s.fraUge = Math.min(s.fraUge, uge);
    s.tilUge = Math.max(s.tilUge, uge);
    pr.set(aar, s);
  });
  return [...pr.values()].sort((a, b) => a.aar - b.aar);
}

export function vinduetsGraenser(idag = new Date(), bagud = UGER_BAGUD, frem = UGER_FREM) {
  const uger = ugerIVinduet(idag, bagud, frem);
  return { foerste: uger[0], sidste: uger[uger.length - 1], uger };
}

// ─────────────────────────────────────────────────────────────────────────────
// VÆRNET

// Er ugen hentet helt, så horisonten må danne i den?
//
// `hentedeUger` er et Set af ugeNoegle(). Er ALT hentet, sendes null — så er svaret
// ja til alt, og appen opfører sig som før ombygningen.
export function ugenErHentet(hentedeUger, aar, uge) {
  if (hentedeUger === null || hentedeUger === undefined) return true;
  return hentedeUger.has(ugeNoegle(aar, uge));
}

// Bygger listen ud fra de uger, vinduet dækkede.
export function hentedeUgerFra(uger) {
  return new Set(uger.map((u) => ugeNoegle(u.aar, u.uge)));
}
