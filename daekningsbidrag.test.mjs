// Tests af dækningsbidraget pr. aftaletype. Køres ved hvert build.
//
// Hvad de beskytter mod: en løn, der stille regnes som 0 når satsen mangler, giver et pænt og forkert højt bidrag. Derfor prøves, at manglende sats tælles for sig,
// at satsen slås op på opgavens egen dato, og at opgaver uden tid og omsætning ikke fylder i tallet.

import { daekningPrSegment } from "./src/daekningsbidrag.js";

let fejl = 0;
function er(hvad, faktisk, forventet) {
  if (JSON.stringify(faktisk) !== JSON.stringify(forventet)) {
    fejl++;
    console.error(`  ✗ ${hvad}\n      fik       ${JSON.stringify(faktisk)}\n      forventet ${JSON.stringify(forventet)}`);
  }
}
const segmenter = [["privat", "Privat"], ["erhverv", "Erhverv"]];
const satsFor = (emp, dato) => (emp === "a" ? (dato < "2026-06-01" ? 150 : 200) : emp === "b" ? 100 : null);
const beregn = (t) => ({ realiseretKr: t.kr });
const datoAf = (t) => t.dato;
const k = (opgaver, aar = "alle") => daekningPrSegment(opgaver, { beregn, satsFor, datoAf, aar, segmenter });

const ops = [
  { contractType: "privat", dato: "2026-03-02", kr: 1000, timeLog: [{ empId: "a", minutes: 120 }] },          // løn 2 t × 150 = 300
  { contractType: "privat", dato: "2026-07-06", kr: 1000, timeLog: [{ empId: "a", minutes: 120 }] },          // løn 2 t × 200 = 400
  { contractType: "erhverv", dato: "2026-07-06", kr: 500, timeLog: [{ empId: "b", minutes: 60 }, { empId: "x", minutes: 30 }] },
  { contractType: "privat", dato: "2026-08-03", kr: 0, timeLog: [] },                                          // ikke udført
  { contractType: "privat", dato: "2025-08-03", kr: 800, timeLog: [{ empId: "b", minutes: 60 }] },
];
const r = k(ops, "2026");
const privat = r.raekker.find((x) => x.noegle === "privat");
er("sats på opgavens egen dato", privat.loen, 700);
er("opgave uden tid og omsætning tælles ikke", privat.antal, 2);
er("bidrag", privat.bidrag, 1300);
er("procent", Math.round(privat.procent), 65);
const erhverv = r.raekker.find((x) => x.noegle === "erhverv");
er("manglende sats gættes ikke", [erhverv.loen, erhverv.udenSatsMin, erhverv.udenSatsOpgaver], [100, 30, 1]);
er("i alt", [r.ialt.omsaetning, r.ialt.loen], [2500, 800]);
er("år-filter udelukker andre år", k(ops, "2025").ialt.antal, 1);
er("alle år", k(ops).ialt.antal, 4);
er("tom liste", k([]).ialt.procent, null);
er("ukendt aftaletype får egen linje", daekningPrSegment([{ contractType: "nexus", dato: "2026-01-05", kr: 10, timeLog: [] }], { beregn, satsFor, datoAf, segmenter }).raekker.some((x) => x.noegle === "nexus"), true);
er("negativt bidrag bevares", k([{ contractType: "privat", dato: "2026-03-02", kr: 100, timeLog: [{ empId: "a", minutes: 120 }] }]).ialt.bidrag, -200);

if (fejl) { console.error(`daekningsbidrag.test.mjs: ${fejl} fejl`); process.exit(1); }
console.log("daekningsbidrag.test.mjs: ok");
