// Tests af aflysningsprocenten. Køres ved hvert build.
//
// Hvad de beskytter mod: fremtidige opgaver i nævneren (kan ikke være aflyst endnu og trykker procenten ned), og aflysninger, der forsvinder, fordi aftaletypen mangler.

import { aflysningPrSegment } from "./src/aflysningsprocent.js";

let fejl = 0;
function er(hvad, faktisk, forventet) {
  if (JSON.stringify(faktisk) !== JSON.stringify(forventet)) {
    fejl++;
    console.error(`  ✗ ${hvad}\n      fik       ${JSON.stringify(faktisk)}\n      forventet ${JSON.stringify(forventet)}`);
  }
}
const segmenter = [["privat", "Privat"], ["erhverv", "Erhverv"], ["nexus", "Nexus"], ["aeldrelov", "Ældrelov"]];
const o = (dato, type, aflyst, part) => ({ dato, contractType: type, aflyst, part });
const ops = [
  o("2026-10-01", "privat", false), o("2026-10-02", "privat", true, "kunde"), o("2026-10-05", "privat", true, "jammerbugt"), o("2026-10-06", "privat", false),
  o("2026-10-20", "privat", false),                      // i fremtiden: tæller ikke
  o("2026-10-03", undefined, true, "kunde"),             // uden aftaletype = privat
  o("2026-10-04", "erhverv", false),
  o("2026-09-30", "privat", true, "kunde"),              // før perioden
];
const k = aflysningPrSegment(ops, { fra: "2026-10-01", til: "2026-10-31", idag: "2026-10-07", datoAf: (t) => t.dato, erAflyst: (t) => t.aflyst, partFor: (t) => t.part, segmenter });
const privat = k.raekker.find((r) => r.noegle === "privat");
er("nævner uden fremtid og uden andre perioder", privat.antal, 5);
er("aflyste", [privat.aflyst, privat.kunde, privat.os], [3, 2, 1]);
er("procent", Math.round(privat.procent), 60);
er("erhverv uden aflysninger", k.raekker.find((r) => r.noegle === "erhverv").procent, 0);
er("aftaletype uden opgaver giver ingen procent", k.raekker.find((r) => r.noegle === "nexus").procent, null);
er("alle fire aftaletyper står der", k.raekker.map((r) => r.noegle), ["privat", "erhverv", "nexus", "aeldrelov"]);
er("i alt", [k.ialt.antal, k.ialt.aflyst], [6, 3]);
er("perioden slutter før i dag", aflysningPrSegment(ops, { fra: "2026-10-01", til: "2026-10-02", idag: "2026-10-07", datoAf: (t) => t.dato, erAflyst: (t) => t.aflyst, partFor: (t) => t.part, segmenter }).ialt.antal, 2);
if (fejl) { console.error(`aflysningsprocent.test.mjs: ${fejl} fejl`); process.exit(1); }
console.log("aflysningsprocent.test.mjs: ok");
