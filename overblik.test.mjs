// Tests af overblikket. Køres ved hvert build.
//
// Hvad de beskytter mod: en temperatur, der ser bedre ud end virkeligheden, fordi «lavere er bedre» er regnet omvendt, og et overblik, der viser et andet tal end rapporten bag det.

import { isoUge, utildelteNaesteUge, MAAL, maalTal, opnaaelse, statusFor, temperatur, beregnPeriode, opmaerksomhed, sidsteMaaneder } from "./src/overblik.js";

let fejl = 0;
function er(hvad, faktisk, forventet) {
  if (JSON.stringify(faktisk) !== JSON.stringify(forventet)) {
    fejl++;
    console.error(`  ✗ ${hvad}\n      fik       ${JSON.stringify(faktisk)}\n      forventet ${JSON.stringify(forventet)}`);
  }
}
// Opnåelse og status, begge retninger.
er("højere er bedre, nået", opnaaelse("db", 60), 100);
er("højere er bedre, halvt", opnaaelse("db", 27.5), 50);
er("lavere er bedre, under målet", opnaaelse("sy", 3), 100);
er("lavere er bedre, over målet", Math.round(opnaaelse("sy", 8)), 50);
er("ingen data", opnaaelse("sy", null), null);
er("status i mål", [statusFor("db", 58), statusFor("sy", 3.9)], ["good", "good"]);
er("status lidt under", statusFor("ud", 70), "warn");
er("status langt fra", statusFor("af", 12), "crit");
// Mål sat af kontoret.
er("eget mål overstyrer standarden", maalTal({ sy: 6 }).sy, 6);
er("forkert mål ignoreres", [maalTal({ sy: 0 }).sy, maalTal({ sy: "abc" }).sy, maalTal({ sy: -2 }).sy, maalTal({ sy: "" }).sy], [4, 4, 4, 4]);
er("opnåelse følger det valgte mål", Math.round(opnaaelse("sy", 8, maalTal({ sy: 8 }))), 100);
er("status følger det valgte mål", [statusFor("sy", 5, maalTal({ sy: 6 })), statusFor("sy", 5, maalTal({ sy: 3 }))], ["good", "crit"]);
er("temperatur følger det valgte mål", temperatur({ sy: 8 }, maalTal({ sy: 8 })).score, 100);
// Temperatur.
const t = temperatur({ oms: 100, db: 55, pr: 330, ud: 75, vikar: 90, af: 6, udloeb: 3, sy: 4 });
er("alt på mål giver 100", [t.score, t.niveau], [100, "good"]);
const t2 = temperatur({ oms: 50, db: 27.5, pr: 165, ud: null, vikar: null, af: 12, udloeb: 6, sy: 8 });
er("delvist data: del uden data springes over", t2.dele.find((d) => d.key === "drift").score, null);
er("dårligt giver kritisk", [t2.score, t2.niveau], [50, "warn"]);
er("ingen data overhovedet", temperatur({}).niveau, "ingen");
// Måneder bagud.
const m = sidsteMaaneder("2026-10-08", 3);
er("tre måneder bagud", m.map((x) => [x.fra, x.til]), [["2026-08-01", "2026-08-31"], ["2026-09-01", "2026-09-30"], ["2026-10-01", "2026-10-31"]]);
// Samlet beregning: samme tal som delrapporterne.
const idag = "2026-10-08";
const cap = { Mon: 420, Tue: 420, Wed: 420, Thu: 420, Fri: 420 };
const alle = [
  { id: "t1", dato: "2026-10-05", type: "fixed", contractType: "privat", assignees: ["a"], duration: 420, kr: 1000, timeLog: [{ empId: "a", minutes: 400 }], status: "udført" },
  { id: "t2", dato: "2026-10-06", type: "fixed", contractType: "privat", assignees: ["a"], duration: 420, kr: 0, timeLog: [], status: "aflyst", aflyst: true, grund: "kunde" },
  { id: "s1", dato: "2026-10-07", type: "sygdom", assignees: ["b"], duration: 420, timeLog: [] },
  { id: "t3", dato: "2026-10-07", type: "fixed", contractType: "privat", assignees: [], duration: 60, kr: 0, timeLog: [], fast: "b" },
];
const medA = alle.filter((x) => x.type === "fixed" || x.type === "adhoc");
const inn = {
  opgaver: medA.filter((x) => !x.aflyst), alleOpgaver: alle, medAflyste: medA, medarbejdere: [{ id: "a", name: "A", capacity: cap }, { id: "b", name: "B", capacity: cap }],
  templates: [{ status: "aktiv", expiryDate: "2026-11-01", customerName: "K1" }, { status: "aktiv", expiryDate: "2027-05-01" }, { status: "kladde", customerName: "" }],
  budgets: [{ year: 2026, month: 10, amount: 2000 }, { year: 2026, month: 9, amount: 999 }],
  beregn: (x) => ({ realiseretKr: x.kr }), satsFor: (e) => (e === "a" ? 150 : 100), datoAf: (x) => x.dato,
  planlagtFor: (x) => x.duration, erAflyst: (x) => !!x.aflyst, erSygdom: (x) => x.type === "sygdom", erBlok: (x) => x.type === "sygdom" || x.type === "ferie",
  partFor: (x) => x.grund, fastFor: (x) => x.fast || null, idag, forfaldne: { antal: 2, beloeb: 5000 }, udenPostnr: 1,
};
const p = beregnPeriode(inn, "2026-10-01", "2026-10-31");
er("omsætning mod budget bruger kun månedens budget", p.v.oms, 50);
er("dækningsbidrag er det samme som rapportens", p.v.db, p.db.ialt.procent);
er("aflysninger tæller de aflyste med i nævneren", [p.af.ialt.antal, p.af.ialt.aflyst], [3, 1]);
er("aftaler der udløber inden 90 dage", p.v.udloeb, 1);
// Næste uges utildelte opgaver (idag = torsdag 8.10.2026, uge 41; næste uge er 42, 12.-18.10.).
er("ISO-uge", [isoUge("2026-10-08"), isoUge("2026-12-31"), isoUge("2027-01-03")], [{ uge: 41, aar: 2026 }, { uge: 53, aar: 2026 }, { uge: 53, aar: 2026 }]);
const naeste = [
  { id: "n1", week: 42, year: 2026, type: "fixed", assignees: [], duration: 60, kr: 0, planlagt: 400 },
  { id: "n2", week: 42, year: 2026, type: "fixed", assignees: ["a"], duration: 60, planlagt: 400 },
  { id: "n3", week: 42, year: 2026, type: "fixed", assignees: [], aflyst: true, planlagt: 400 },
  { id: "n4", week: 43, year: 2026, type: "fixed", assignees: [], planlagt: 400 },
  { id: "n5", week: 42, year: 2026, type: "adhoc", assignees: [], planlagt: 250 },
];
const u = utildelteNaesteUge({ ...inn, medAflyste: naeste, beregn: (x) => ({ planlagtKr: x.planlagt }) });
er("utildelte næste uge: ikke tildelt, ikke aflyst, kun den uge", [u.uge, u.antal, u.kr], [42, 2, 650]);
const ptk = opmaerksomhed({ ...inn, medAflyste: naeste, beregn: (x) => ({ planlagtKr: x.planlagt }) }, p);
er("utildelte står øverst som kritisk og fører til næste uges plan", [ptk[0].alvor, ptk[0].side, ptk[0].arg.naeste], ["crit", "uge", true]);
er("ingen utildelte, intet punkt", opmaerksomhed({ ...inn, medAflyste: [{ ...naeste[1] }] }, p).some((x) => x.side === "uge"), false);
const pkt = opmaerksomhed(inn, p);
er("kritiske punkter står først", pkt.map((x) => x.alvor)[0], "crit");
er("alle punkter peger et sted hen", pkt.every((x) => x.rapport || x.side), true);
er("forfaldne fakturaer er med", pkt.some((x) => x.rapport === "overskud"), true);
er("kladde og postnummer samles på Drift", pkt.find((x) => x.side === "drift").titel.includes("kladde"), true);
if (fejl) { console.error(`overblik.test.mjs: ${fejl} fejl`); process.exit(1); }
console.log("overblik.test.mjs: ok");
