// Tests af omsætning pr. medarbejder. Køres ved hvert build.
//
// Hvad de beskytter mod: en fordeling, der ikke går op (rapporten viser mere eller mindre end Budget-fanen), og elever, der får kredit for tid, kunden ikke betaler for.

import { omsaetningPrMedarbejder, KONTORET } from "./src/medarbejderomsaetning.js";

let fejl = 0;
function er(hvad, faktisk, forventet) {
  if (JSON.stringify(faktisk) !== JSON.stringify(forventet)) {
    fejl++;
    console.error(`  ✗ ${hvad}\n      fik       ${JSON.stringify(faktisk)}\n      forventet ${JSON.stringify(forventet)}`);
  }
}
const loen = (e, d) => (e === "a" ? 200 : e === "b" ? 150 : null);
const beregn = (t) => ({ realiseretKr: t.kr });
const k = (opg, ekstra = {}) => omsaetningPrMedarbejder(opg, { beregn, loenFor: loen, datoAf: (t) => t.dato, aar: 2026, ...ekstra });
const raekke = (r, id) => r.raekker.find((x) => x.id === id);
const sumKr = (r) => Math.round(r.raekker.reduce((s, x) => s + x.omsaetning, 0));

// To på en timeopgave (1.000 kr): a fakturerer 60 min, b 180 min. Omsætningen følger minutterne.
const t1 = { dato: "2026-03-02", kr: 1000, timeLog: [{ empId: "a", minutes: 60 }, { empId: "b", minutes: 180 }] };
let r = k([t1]);
er("fordeles efter fakturerbare minutter", [raekke(r, "a").omsaetning, raekke(r, "b").omsaetning], [250, 750]);
er("fordelingen går op", sumKr(r), 1000);
er("løn efter egen sats", [raekke(r, "a").loen, raekke(r, "b").loen], [200, 450]);

// En elev: får 0 kr i omsætning, men tiden koster løn.
const t2 = { dato: "2026-03-03", kr: 600, oplaeringMedarbejdere: ["b"], timeLog: [{ empId: "a", minutes: 120 }, { empId: "b", minutes: 120 }] };
r = k([t2]);
er("elev får ingen omsætning", [raekke(r, "a").omsaetning, raekke(r, "b").omsaetning], [600, 0]);
er("elevens tid koster løn", raekke(r, "b").loen, 300);
er("pr. time bruger al registreret tid", raekke(r, "a").krPrTime, 300);

// Kontoret (forgæves besøg) hører ikke til en medarbejder.
const t3 = { dato: "2026-03-04", kr: 400, timeLog: [{ empId: KONTORET, minutes: 60 }] };
r = k([t3]);
er("kontorets omsætning står for sig", [raekke(r, KONTORET).omsaetning, r.raekker.length], [400, 1]);

// Fastpris: deles efter planlagt tid, elever undtaget.
const t4 = { dato: "2026-03-05", kr: 900, pricingType: "fixed", assignees: ["a", "b"], duration: 60, tidFordeling: { a: 120, b: 60 }, timeLog: [{ empId: "a", minutes: 100 }, { empId: "b", minutes: 50 }] };
r = k([t4]);
er("fastpris efter planlagt tid", [raekke(r, "a").omsaetning, raekke(r, "b").omsaetning], [600, 300]);
er("fastpris uden timelog: ufordelt deles lige", sumKr(k([{ ...t4, tidFordeling: {}, timeLog: [] }])), 900);

// Manglende sats gættes ikke.
r = k([{ dato: "2026-03-06", kr: 100, timeLog: [{ empId: "x", minutes: 60 }] }]);
er("uden sats", [raekke(r, "x").loen, raekke(r, "x").udenSatsMin], [0, 60]);
// Periode og aftaletype.
er("andet år tæller ikke", k([{ ...t1, dato: "2025-03-02" }]).ialt, 0);
er("måned", k([t1, { ...t1, dato: "2026-04-01" }], { maaned: 3 }).ialt, 1000);
er("aftaletype", k([{ ...t1, contractType: "erhverv" }], { segment: "privat" }).ialt, 0);
// Opgave uden omsætning koster stadig løn.
er("løn uden omsætning", raekke(k([{ dato: "2026-03-07", kr: 0, timeLog: [{ empId: "a", minutes: 60 }] }]), "a").loen, 200);
if (fejl) { console.error(`medarbejderomsaetning.test.mjs: ${fejl} fejl`); process.exit(1); }
console.log("medarbejderomsaetning.test.mjs: ok");
