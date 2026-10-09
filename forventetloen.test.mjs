// Forventet løn og kørsel (se src/forventetLoen.js). Kør: node forventetloen.test.mjs
import { forventetLoen, koerselPrTime, forventetKoersel } from "./src/forventetLoen.js";
import assert from "node:assert/strict";

const erAflyst = (t) => t.status === "aflyst";
const sats = { a: 200, b: 150 };

// Løn: godkendt tæller som registreret, ikke godkendt som registreret eller planlagt, aflyst slet ikke.
const opg = [
  { id: "1", assignees: ["a"], reg: { a: 60 }, plan: 60 },                 // godkendt: 1 t × 200
  { id: "2", assignees: ["a", "b"], reg: {}, plan: 120 },                   // ikke udført: 2 t × (200 + 150)
  { id: "3", assignees: ["b"], reg: { b: 90 }, plan: 60 },                  // registreret men ikke godkendt: 1,5 t × 150
  { id: "4", assignees: ["a"], reg: {}, plan: 60, status: "aflyst" },       // tæller ikke
  { id: "5", assignees: ["ukendt"], reg: {}, plan: 60 },                    // ingen sats: tæller ikke
];
const h = {
  godkendt: (e, t) => t.id === "1",
  registreret: (t, e) => t.reg[e] || 0,
  planlagt: (t) => t.plan,
  sats: (e) => sats[e] ?? null,
  erAflyst,
};
const l = forventetLoen(opg, h);
assert.equal(l.faktisk, 200);
assert.equal(l.forventet, 200 + 2 * 350 + 1.5 * 150);

// Kørsel pr. time: a har nok at måle på (10 timer, 100 kr), b har for lidt og får gennemsnittet.
const linjer = [
  { employee_id: "a", work_date: "2026-09-10", km: 50 },
  { employee_id: "b", work_date: "2026-09-10", km: 10 },
];
const maal = [
  { id: "m1", assignees: ["a"], dato: "2026-09-10", plan: 600 },
  { id: "m2", assignees: ["b"], dato: "2026-09-10", plan: 120 },
];
const kmKr = (x) => x.km * 2;                       // 2 kr pr. km
const planlagt = (t) => t.plan;
const datoAf = (t) => t.dato;
const prTime = koerselPrTime({ linjer, opgaver: maal, fra: "2026-09-01", til: "2026-09-30", kmKr, planlagt, datoAf, erAflyst });
assert.equal(prTime.pr.get("a"), 100 / 10);          // 10 kr pr. time
assert.ok(Math.abs(prTime.alle - 120 / 12) < 1e-12); // 120 kr på 12 timer
assert.equal(prTime.pr.get("b"), prTime.alle);        // for lidt at måle på

// Forventet kørsel: beregnede linjer + skøn for fremtidige dage uden linjer; en dag, der har linjer, skønnes ikke igen.
const frem = [
  { id: "f1", assignees: ["a"], dato: "2026-10-12", plan: 300 },   // 5 t × 10 = 50
  { id: "f2", assignees: ["a"], dato: "2026-10-05", plan: 300 },   // har linjer den dag: skønnes ikke
  { id: "f3", assignees: ["a"], dato: "2026-10-12", plan: 300, status: "aflyst" },
  { id: "f4", assignees: ["a"], dato: "2026-09-20", plan: 300 },   // før i dag og uden linjer: ingen kørsel
];
const oktLinjer = [{ employee_id: "a", work_date: "2026-10-05", km: 20 }];
const k = forventetKoersel({ linjer: oktLinjer, opgaver: frem, maanedFra: "2026-10-01", maanedTil: "2026-10-31", idag: "2026-10-09", kmKr, planlagt, datoAf, erAflyst, prTime });
assert.equal(k.beregnet, 40);
assert.equal(k.skoen, 50);
assert.equal(k.forventet, 90);

// Uden grundlag at måle på bliver skønnet 0, ikke NaN.
const tom = koerselPrTime({ linjer: [], opgaver: [], fra: "a", til: "b", kmKr, planlagt, datoAf, erAflyst });
assert.equal(tom.alle, 0);
console.log("forventetloen.test.mjs: ok");
