// Tests af aftaleporteføljen. Køres ved hvert build.
//
// Hvad de beskytter mod: tallene her er dem, kontoret bruger til at vurdere, hvad
// forretningen er værd. Går de galt, går de galt stille — en rapport siger aldrig
// selv fra. Det farligste sted er nytår: ISO-uge 53 i 2026 løber ind i januar 2027,
// og et besøg den 2. januar skal tælle i 2027, ikke i 2026.

import { portefoeljeTal, besoegsAar, besoegsVaerdi, aarMedBesoeg } from "./src/portefoelje.js";

let fejl = 0, koert = 0;
function er(hvad, faktisk, forventet) {
  koert++;
  if (JSON.stringify(faktisk) !== JSON.stringify(forventet)) {
    fejl++;
    console.error(`  ✗ ${hvad}\n      fik       ${JSON.stringify(faktisk)}\n      forventet ${JSON.stringify(forventet)}`);
  }
}

const pris = { privat: 315, erhverv: 330, nexus: 634.73, aeldrelov: 634.73 };

// ── Året et besøg falder i ──────────────────────────────────────────────────
// Mandag i ISO-uge 1 2027 er den 4. januar. Uge 53 i 2026 begynder mandag den
// 28. december 2026 og løber til søndag den 3. januar 2027.
er("mandag i uge 53/2026 er i 2026", besoegsAar({ year: 2026, week: 53, day: "Mon" }), 2026);
er("SØNDAG i uge 53/2026 er i 2027", besoegsAar({ year: 2026, week: 53, day: "Sun" }), 2027);
er("fredag i uge 53/2026 er i 2027",  besoegsAar({ year: 2026, week: 53, day: "Fri" }), 2027);
er("mandag i uge 1/2027 er i 2027",   besoegsAar({ year: 2027, week: 1,  day: "Mon" }), 2027);
er("uden uge giver ingenting",        besoegsAar({ year: 2027 }), null);

// ── Hvad ét besøg er værd ───────────────────────────────────────────────────
er("to timer privat", besoegsVaerdi({ duration: 120 }, pris.privat), 630);
er("35 minutter nexus", Math.round(besoegsVaerdi({ duration: 35 }, pris.nexus)), 370);
er("fast pris ser bort fra tiden",
   besoegsVaerdi({ duration: 500, pricingType: "fixed", fixedPrice: 900 }, pris.privat), 900);
er("ingen varighed er nul", besoegsVaerdi({ duration: 0 }, pris.privat), 0);

// ── Selve opgørelsen ────────────────────────────────────────────────────────
const aftaler = [
  { id: "a", status: "aktiv", contractType: "privat" },
  { id: "b", status: "aktiv", contractType: "erhverv" },
  { id: "c", status: "udgaaet", contractType: "privat" },   // skal IKKE tælle med
  { id: "d", status: "kladde", contractType: "privat" },    // heller ikke
];
const besoeg = [
  // a: to besøg i 2026 à 2 timer = 630 kr. stykket
  { templateId: "a", contractType: "privat", duration: 120, year: 2026, week: 10, day: "Mon" },
  { templateId: "a", contractType: "privat", duration: 120, year: 2026, week: 12, day: "Mon" },
  // a: ét besøg i 2027
  { templateId: "a", contractType: "privat", duration: 60,  year: 2027, week: 10, day: "Mon" },
  // b: ét besøg i 2026 à 3 timer erhverv = 990 kr.
  { templateId: "b", contractType: "erhverv", duration: 180, year: 2026, week: 20, day: "Tue" },
  // Sygdom og ferie er ikke arbejde, nogen betaler for
  { templateId: "a", contractType: "privat", duration: 480, type: "sygdom", year: 2026, week: 11, day: "Mon" },
  { templateId: "b", contractType: "erhverv", duration: 480, type: "ferie", year: 2026, week: 21, day: "Tue" },
  // En aktivitet er intern tid og hører ikke til kontraktværdien
  { templateId: "a", contractType: "privat", duration: 90, type: "aktivitet", year: 2026, week: 13, day: "Mon" },
  // Opgaver på en udgået og en kladde-aftale
  { templateId: "c", contractType: "privat", duration: 120, year: 2026, week: 14, day: "Mon" },
  { templateId: "d", contractType: "privat", duration: 120, year: 2026, week: 15, day: "Mon" },
  // Løs opgave uden aftale
  { templateId: null, contractType: "privat", duration: 120, year: 2026, week: 16, day: "Mon" },
];

const hele = portefoeljeTal({ templates: aftaler, instances: besoeg, pricing: pris, aar: null });
er("hele perioden: kun de to aktive aftaler", hele.aftaler, 2);
er("hele perioden: fire besøg",               hele.besoeg, 4);
er("hele perioden: værdi",                    hele.vaerdi, 630 + 630 + 315 + 990);
er("hele perioden: gennemsnit pr. aftale",    hele.gnsVaerdi, (630 + 630 + 315 + 990) / 2);

const y26 = portefoeljeTal({ templates: aftaler, instances: besoeg, pricing: pris, aar: 2026 });
er("2026: to aftaler", y26.aftaler, 2);
er("2026: tre besøg",  y26.besoeg, 3);
er("2026: værdi",      y26.vaerdi, 630 + 630 + 990);
er("2026: mindste og største aftale", [y26.mindsteVaerdi, y26.stoersteVaerdi], [990, 1260]);
er("2026: gns. minutter pr. besøg", Math.round(y26.gnsMinPrBesoeg), 140);
er("2026: median minutter pr. besøg", y26.medianMinPrBesoeg, 120);

const y27 = portefoeljeTal({ templates: aftaler, instances: besoeg, pricing: pris, aar: 2027 });
er("2027: kun aftale a er tilbage", y27.aftaler, 1);
er("2027: værdi", y27.vaerdi, 315);

// Årene tilsammen skal give hele perioden. Ellers er der værdi, der forsvinder
// mellem to år — og det er præcis den slags, ingen opdager.
er("2026 + 2027 = hele perioden", y26.vaerdi + y27.vaerdi, hele.vaerdi);
er("besøgene tilsammen passer også", y26.besoeg + y27.besoeg, hele.besoeg);

// ── Opdelt på kontrakttype ──────────────────────────────────────────────────
er("2026 opdelt: erhverv står først, fordi den er størst",
   y26.perType.map((p) => [p.type, Math.round(p.vaerdi)]),
   [["privat", 1260], ["erhverv", 990]]);

// ── Nytår i praksis ─────────────────────────────────────────────────────────
// Samme aftale, to besøg i samme ISO-uge, hver side af nytår.
const nytaar = portefoeljeTal({
  templates: [{ id: "n", status: "aktiv", contractType: "privat" }],
  instances: [
    { templateId: "n", contractType: "privat", duration: 60, year: 2026, week: 53, day: "Mon" }, // 28. dec 2026
    { templateId: "n", contractType: "privat", duration: 60, year: 2026, week: 53, day: "Fri" }, // 1. jan 2027
  ],
  pricing: pris, aar: 2027,
});
er("kun fredagen falder i 2027", nytaar.besoeg, 1);
er("og den er 315 kr. værd",     nytaar.vaerdi, 315);

// ── Hvilke år findes der ────────────────────────────────────────────────────
er("årene bygges af data", aarMedBesoeg(aftaler, besoeg), [2026, 2027]);
er("ingen aftaler, ingen år", aarMedBesoeg([], besoeg), []);

// ── Tomme lister må ikke vælte noget ────────────────────────────────────────
const tom = portefoeljeTal({ templates: [], instances: [], pricing: pris, aar: null });
er("tom portefølje: nul aftaler", tom.aftaler, 0);
er("tom portefølje: intet gennemsnit og ingen division med nul", tom.gnsVaerdi, 0);
er("tom portefølje: ingen typer", tom.perType, []);

// ── Resultat ────────────────────────────────────────────────────────────────
if (fejl > 0) {
  console.error(`\n  ${fejl} af ${koert} kontroller fejlede i aftaleporteføljen.\n`);
  process.exit(1);
}
console.log(`Aftaleportefølje: ${koert} kontroller i orden.`);
