// Forventet løn og kørsel (se src/forventetLoen.js). Kør: node forventetloen.test.mjs
import { forventetLoen, forventetKoersel, typiskTur } from "./src/forventetLoen.js";
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

// Kørsel: medianen af de kendte ture er den typiske.
assert.equal(typiskTur([4, 10, 6]), 6);
assert.equal(typiskTur([4, 10]), 7);
assert.equal(typiskTur([]), 0);

const par = { "A||B": 10, "B||C": 6 };
const km = (a, b) => par[[a, b].sort().join("||")] ?? null;
const h2 = {
  km, datoAf: (t) => t.dato, erAflyst, sorter: (l) => [...l].sort((x, y) => (x.tid || "99").localeCompare(y.tid || "99")), adresse: (t) => t.adr,
  egenTur: (t) => t.fra ? { fra: t.fra, tilbage: !!t.retur } : null,
  kmKr: (emp, dato, k) => (emp === "udensats" ? null : k * 2),   // 2 kr pr. km
};
const maaned = { maanedFra: "2026-10-01", maanedTil: "2026-10-31", typisk: 8, h: h2 };

// b har ingen beregnede linjer: kæden A -> B -> C regnes ud fra planen (10 + 6 km = 32 kr). Samme adresse to gange giver ingen tur.
const plan = [
  { id: "1", assignees: ["b"], dato: "2026-10-12", tid: "08:00", adr: "A" },
  { id: "2", assignees: ["b"], dato: "2026-10-12", tid: "09:00", adr: "A" },
  { id: "3", assignees: ["b"], dato: "2026-10-12", tid: "10:00", adr: "B" },
  { id: "4", assignees: ["b"], dato: "2026-10-12", tid: "11:00", adr: "C" },
  { id: "5", assignees: ["b"], dato: "2026-10-12", tid: "12:00", adr: "C", status: "aflyst" },
];
let k = forventetKoersel({ linjer: [], opgaver: plan, ...maaned });
assert.equal(k.planlagt, 32);
assert.equal(k.skoennede, 0);

// Rækkefølgen følger klokkeslættet, ikke listen.
const omvendt = [...plan].reverse();
assert.equal(forventetKoersel({ linjer: [], opgaver: omvendt, ...maaned }).planlagt, 32);

// En dag med beregnede linjer tæller med dem og regnes ikke ud fra planen igen. En anden dag regnes ud fra planen.
const medLinjer = forventetKoersel({ linjer: [{ employee_id: "b", work_date: "2026-10-12", km: 3 }], opgaver: plan, ...maaned });
assert.equal(medLinjer.beregnet, 6);
assert.equal(medLinjer.planlagt, 0);

// Ukendt adressepar får den typiske tur (8 km = 16 kr) og tælles som skønnet.
const ukendt = [
  { id: "6", assignees: ["b"], dato: "2026-10-13", tid: "08:00", adr: "X" },
  { id: "7", assignees: ["b"], dato: "2026-10-13", tid: "09:00", adr: "Y" },
];
k = forventetKoersel({ linjer: [], opgaver: ukendt, ...maaned });
assert.equal(k.planlagt, 16);
assert.equal(k.skoennede, 1);

// Én opgave på dagen giver ingen tur. Andre måneder tæller ikke. Ingen sats giver ingen kroner.
assert.equal(forventetKoersel({ linjer: [], opgaver: [plan[0]], ...maaned }).forventet, 0);
assert.equal(forventetKoersel({ linjer: [], opgaver: plan.map((t) => ({ ...t, dato: "2026-11-02" })), ...maaned }).forventet, 0);
assert.equal(forventetKoersel({ linjer: [], opgaver: plan.map((t) => ({ ...t, assignees: ["udensats"] })), ...maaned }).forventet, 0);

// Egen tur: fra, til og retur. Kun med kendt par; ellers udeladt.
const tur = [{ id: "8", assignees: ["b"], dato: "2026-10-14", adr: "B", fra: "A", retur: true }];
assert.equal(forventetKoersel({ linjer: [], opgaver: tur, ...maaned }).planlagt, 40);   // 10 km hver vej × 2 kr
const turUkendt = [{ id: "9", assignees: ["b"], dato: "2026-10-14", adr: "Q", fra: "R", retur: true }];
assert.equal(forventetKoersel({ linjer: [], opgaver: turUkendt, ...maaned }).forventet, 0);
console.log("forventetloen.test.mjs: ok");
