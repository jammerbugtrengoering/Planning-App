// Forventet omsætning (se src/forventet.js). Kør: node forventet.test.mjs
import { forventetMaaned, forventetAar, planenErFuld } from "./src/forventet.js";
import assert from "node:assert/strict";

const idag = { aar: 2026, maaned: 10 };

assert.equal(planenErFuld(2026, 9), false);
assert.equal(planenErFuld(2026, 10), true);
assert.equal(planenErFuld(2027, 1), true);

// Før oktober 2026 tæller kun det fakturerede, uanset hvad der er planlagt.
const august = forventetMaaned({ aar: 2026, maaned: 8, faktureret: 429089, planlagt: 28536, idag });
assert.equal(august.forventet, 429089);
assert.equal(august.sikkerhed, 1);
assert.equal(forventetMaaned({ aar: 2026, maaned: 4, faktureret: 0, planlagt: 0, idag }).sikkerhed, null);

// Indeværende måned: planlagt, så længe der er faktureret mindre; sikkerheden er det fakturerede ÷ planlagt.
const okt = forventetMaaned({ aar: 2026, maaned: 10, faktureret: 12194, planlagt: 399915, idag });
assert.equal(okt.forventet, 399915);
assert.ok(Math.abs(okt.sikkerhed - 12194 / 399915) < 1e-12);
assert.equal(okt.afsluttet, false);

// Faktureres der mere end planlagt, bliver forventet det fakturerede (100 %).
const over = forventetMaaned({ aar: 2026, maaned: 10, faktureret: 450000, planlagt: 399915, idag });
assert.equal(over.forventet, 450000);
assert.equal(over.sikkerhed, 1);

// Fremtidig måned: kun planlagt, 0 % sikkert.
const nov = forventetMaaned({ aar: 2026, maaned: 11, faktureret: 0, planlagt: 396074, idag });
assert.equal(nov.forventet, 396074);
assert.equal(nov.sikkerhed, 0);

// Når måneden er gået (november set fra december), står den på det fakturerede, også selv om planen var højere.
const novSomAfsluttet = forventetMaaned({ aar: 2026, maaned: 11, faktureret: 380000, planlagt: 396074, idag: { aar: 2026, maaned: 12 } });
assert.equal(novSomAfsluttet.forventet, 380000);
assert.equal(novSomAfsluttet.sikkerhed, 1);

// Ugyldige tal bliver til 0 og vælter ikke rækken.
assert.equal(forventetMaaned({ aar: 2027, maaned: 2, faktureret: undefined, planlagt: "x", idag }).forventet, 0);

// 2027 set fra oktober 2026: alle 12 måneder er planlagt og 0 % sikre. Efter januar 2027 er januar fakturaet.
const aar2027 = forventetAar(Array.from({ length: 12 }, (_, i) => forventetMaaned({ aar: 2027, maaned: i + 1, faktureret: 0, planlagt: 100, idag })));
assert.equal(aar2027.forventet, 1200);
assert.equal(aar2027.sikkerhed, 0);
const efterJan = forventetAar(Array.from({ length: 12 }, (_, i) => forventetMaaned({ aar: 2027, maaned: i + 1, faktureret: i === 0 ? 95 : 0, planlagt: 100, idag: { aar: 2027, maaned: 2 } })));
assert.equal(efterJan.forventet, 95 + 1100);
assert.ok(Math.abs(efterJan.sikkerhed - 95 / 1195) < 1e-12);
assert.equal(forventetAar([]).sikkerhed, null);
console.log("forventet.test.mjs: ok");
