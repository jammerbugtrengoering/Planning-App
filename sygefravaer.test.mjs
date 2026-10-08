// Tests af sygefravær og vikardækning. Køres ved hvert build.
//
// Hvad de beskytter mod: et sygefravær, der regnes mod kapacitet EFTER fraværet er trukket fra (og derfor aldrig kan blive realistisk), og en vikardækning, der tæller opgaver, som ikke har noget med sygdommen at gøre.

import { sygefravaerOgVikar } from "./src/sygefravaer.js";

let fejl = 0;
function er(hvad, faktisk, forventet) {
  if (JSON.stringify(faktisk) !== JSON.stringify(forventet)) {
    fejl++;
    console.error(`  ✗ ${hvad}\n      fik       ${JSON.stringify(faktisk)}\n      forventet ${JSON.stringify(forventet)}`);
  }
}
// Uge 2026-10-05 (man) – 11 (søn). A: 7 t man–fre. B: 5 t tirs og tors.
const med = [
  { id: "a", name: "A", capacity: { Mon: 420, Tue: 420, Wed: 420, Thu: 420, Fri: 420 } },
  { id: "b", name: "B", capacity: { Tue: 300, Thu: 300 } },
];
const o = (id, dato, emp, extra = {}) => ({ id, dato, assignees: emp, duration: 420, ...extra });
const opg = [
  o("s1", "2026-10-06", ["a"], { type: "sygdom", blockGroupId: "g1" }),
  o("s2", "2026-10-07", ["a"], { type: "sygdom", blockGroupId: "g1" }),
  o("s3", "2026-10-08", ["a"], { type: "ferie", blockGroupId: "g2" }),             // ferie er ikke sygdom
  o("s4", "2026-10-11", ["a"], { type: "sygdom", blockGroupId: "g3" }),            // søndag, ingen kapacitet
  o("t1", "2026-10-06", ["b"], { fast: "a" }),                                     // dækket af B
  o("t2", "2026-10-07", [], { fast: "a" }),                                        // ikke dækket
  o("t3", "2026-10-07", [], { fast: "a", aflyst: true }),                          // aflyst
  o("t4", "2026-10-06", ["a"], { fast: "a" }),                                     // den faste står der stadig
  o("t5", "2026-10-08", [], { fast: "a" }),                                        // A var på ferie, ikke syg
  o("t6", "2026-10-06", [], {}),                                                   // ingen fast medarbejder
  o("t7", "2026-10-06", ["b"], { fast: "b" }),                                     // B var ikke syg
];
const r = sygefravaerOgVikar({
  medarbejdere: med, opgaver: opg, fra: "2026-10-05", til: "2026-10-11", datoAf: (t) => t.dato,
  erSygdom: (t) => t.type === "sygdom", erAflyst: (t) => !!t.aflyst, fastFor: (t) => t.fast || null,
});
const a = r.raekker.find((x) => x.id === "a");
er("sygedage tæller kun hverdage med kapacitet", [a.sygeDage, a.sygMin], [2, 840]);
er("procent mod kapacitet før fravær", [a.brutto, Math.round(a.procent * 10) / 10], [2100, 40]);
er("en sygemelding over to dage er én periode", a.perioder, 2);   // g1 og weekendblokeringen g3
er("B uden sygdom har 0 %", r.raekker.find((x) => x.id === "b").procent, 0);
er("vikar: kun opgaver, hvor den faste var syg", r.vikar.berorte, 4);
er("vikar: udfald", [r.vikar.daekket, r.vikar.ikkeDaekket, r.vikar.aflyst], [1, 2, 1]);
er("vikar: dækningsprocent", r.vikar.procent, 25);
er("vikar: hvem dækkede", r.beroerte.find((x) => x.t.id === "t1").vikarer, ["b"]);
er("tom periode giver ingen procent", sygefravaerOgVikar({ medarbejdere: [], opgaver: [], fra: "2026-10-05", til: "2026-10-11", datoAf: (t) => t.dato, erSygdom: () => false, erAflyst: () => false, fastFor: () => null }).vikar.procent, null);
if (fejl) { console.error(`sygefravaer.test.mjs: ${fejl} fejl`); process.exit(1); }
console.log("sygefravaer.test.mjs: ok");
