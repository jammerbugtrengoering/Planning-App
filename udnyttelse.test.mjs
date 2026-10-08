// Tests af udnyttelsesgraden. Køres ved hvert build.
//
// Hvad de beskytter mod: en udnyttelse, der ser lav ud, fordi ferie og sygdom ikke er trukket fra kapaciteten, eller fordi en halv måneds arbejde måles mod en hel måneds kapacitet.

import { udnyttelsePrMedarbejder, status, mistetOmsaetning, mistetIAlt } from "./src/udnyttelse.js";

let fejl = 0;
function er(hvad, faktisk, forventet) {
  if (JSON.stringify(faktisk) !== JSON.stringify(forventet)) {
    fejl++;
    console.error(`  ✗ ${hvad}\n      fik       ${JSON.stringify(faktisk)}\n      forventet ${JSON.stringify(forventet)}`);
  }
}
// Uge 2026-10-05 (mandag) til 2026-10-11 (søndag). A: 7 t mandag-fredag. B: 5 t tirsdag og torsdag.
const med = [
  { id: "a", name: "A", capacity: { Mon: 420, Tue: 420, Wed: 420, Thu: 420, Fri: 420, Sat: 0, Sun: 0 } },
  { id: "b", name: "B", capacity: { Tue: 300, Thu: 300 } },
  { id: "c", name: "C", capacity: { Mon: 420 }, fratraadtDato: "2026-10-04" },
];
const t = (id, dato, emp, min, log = [], extra = {}) => ({ id, dato, assignees: emp, duration: min, timeLog: log, ...extra });
const opg = [
  t(1, "2026-10-05", ["a"], 420, [{ empId: "a", minutes: 400 }]),
  t(2, "2026-10-06", ["a"], 420, [{ empId: "a", minutes: 420 }]),
  t(3, "2026-10-08", ["a"], 420),                                         // i fremtiden
  t(4, "2026-10-07", ["a"], 420, [], { type: "ferie" }),                  // ferie fjerner dagens kapacitet
  t(5, "2026-10-06", ["b"], 150, [{ empId: "b", minutes: 150 }]),
  t(6, "2026-10-08", ["b"], 999, [], { type: "aflyst" }),                 // aflyst tæller ikke
];
const k = (idag) => udnyttelsePrMedarbejder({
  medarbejdere: med, opgaver: opg, fra: "2026-10-05", til: "2026-10-11", idag, datoAf: (x) => x.dato,
  planlagtFor: (x, e) => x.duration, erBlok: (x) => x.type === "ferie", erUdelukket: (x) => x.type === "aflyst",
});
const r = k("2026-10-07");
const a = r.raekker.find((x) => x.id === "a"), b = r.raekker.find((x) => x.id === "b");
er("ferie trækkes fra kapaciteten", [a.kapacitet, a.fravaer], [1680, 420]);
er("planlagt = alle opgaver i perioden", a.planlagt, 1260);
er("planlagt procent", Math.round(a.planlagtPct), 75);
er("udført måles mod kapacitet til og med i dag", [a.kapTilDato, a.udfoert, Math.round(a.udfoertPct)], [840, 820, 98]);
er("aflyst tæller ikke", b.planlagt, 150);
er("fratrådt uden kapacitet og opgaver er ikke med", r.raekker.some((x) => x.id === "c"), false);
er("i alt", [r.ialt.kapacitet, r.ialt.planlagt], [1680 + 600, 1260 + 150]);
er("før perioden er der intet udført", k("2026-10-01").ialt.udfoertPct, null);
er("status", [status(40), status(80), status(99), status(null)], ["plads", "sund", "fuld", "ingen"]);
// Mistet omsætning: ledig tid gange laveste timepris, aldrig negativ.
er("ledig tid gange laveste timepris", mistetOmsaetning({ kapacitet: 600, planlagt: 300 }, 300), { ledigMin: 300, kr: 1500 });
er("overbooket giver 0, ikke minus", mistetOmsaetning({ kapacitet: 300, planlagt: 450 }, 300), { ledigMin: 0, kr: 0 });
er("manglende timepris giver 0", mistetOmsaetning({ kapacitet: 600, planlagt: 0 }, null).kr, 0);
er("i alt lægger kun ledig tid sammen", mistetIAlt([{ kapacitet: 600, planlagt: 300 }, { kapacitet: 300, planlagt: 450 }], 300), { ledigMin: 300, kr: 1500 });
if (fejl) { console.error(`udnyttelse.test.mjs: ${fejl} fejl`); process.exit(1); }
console.log("udnyttelse.test.mjs: ok");
