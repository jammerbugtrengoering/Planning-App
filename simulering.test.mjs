// Prøver af «Simulér uge»-motoren (src/simulering.js). Køres af «npm run build».
//
// Reglerne her er dem, Jonn har besluttet (se overdragelse/PLAN-simulering.md). Brydes
// én af dem, skal bygget stoppe — det er meningen med filen.
import { simulerDag, simulerUge, noegletal, nuvaerendePlan, dagensTal } from "./src/simulering.js";

let ok = 0, fejl = 0;
const sandt = (navn, v) => { if (v) ok++; else { fejl++; console.log("FEJL:", navn); } };
const er = (navn, a, b) => { if (a === b) ok++; else { fejl++; console.log(`FEJL: ${navn}\n      fik       ${JSON.stringify(a)}\n      forventet ${JSON.stringify(b)}`); } };

// Tre byer på en linje: A — 10 km — B — 10 km — C. 1 km = 1 min.
const POS = { A: 0, B: 10, C: 20, A2: 0.5 };
const afstand = (a, b) => { const km = Math.abs(POS[a] - POS[b]); return { km, min: Math.round(km) }; };
const kl = (h, m = 0) => h * 60 + m;
const M = (id, sats, moede = kl(7), kapMin = 420) => ({ id, sats, moede, kap: { Mon: kapMin, Tue: kapMin } });
const O = (id, adresse, start, min, pladser, extra = {}) => ({
  id, dag: "Mon", adresse, start, pladser, kandidater: ["x", "y", "z"], udenfor: [], fast: null, laast: false, ...extra });

// ── Kørsel: kun mellem opgaverne ─────────────────────────────────────────────
{
  const t = dagensTal([{ adresse: "A", start: kl(8), min: 60 }, { adresse: "C", start: kl(10), min: 60 }], afstand);
  er("km mellem to opgaver", t.km, 20);
  const én = dagensTal([{ adresse: "C", start: kl(8), min: 60 }], afstand);
  er("én opgave = ingen km (hjemmefra tæller ikke)", én.km, 0);
  const sent = dagensTal([{ adresse: "A", start: kl(8), min: 60 }, { adresse: "C", start: kl(9), min: 30 }], afstand);
  er("for sent når køretiden ikke kan nås", sent.sent, 20);
}

// ── Grundlæggende fordeling: samme sted, samme person ─────────────────────────
{
  const med = [M("x", 3), M("y", 3)];
  const opg = [
    O("1", "A", kl(8), 60, [{ emp: "x", min: 60 }]),
    O("2", "C", kl(8), 60, [{ emp: "y", min: 60 }]),
    O("3", "A2", kl(9, 30), 60, [{ emp: "y", min: 60 }]),   // nu: y kører C -> A2 (19,5 km)
    O("4", "C", kl(9, 30), 60, [{ emp: "x", min: 60 }]),    // nu: x kører A -> C (20 km)
  ];
  const nu = noegletal(opg, med, afstand, nuvaerendePlan(opg));
  const sim = simulerDag(opg, med, afstand, { tilstand: "fri" });
  const s = noegletal(opg, med, afstand, sim.pladser);
  sandt("simuleringen kører mindre end nu", s.km < nu.km);
  er("A og A2 hos samme person", sim.pladser["1"][0].emp, sim.pladser["3"][0].emp);
  er("ingen opgave uden medarbejder", sim.ikkePlaceret.length, 0);
  er("klokkeslæt uændret uden tolerance", sim.pladser["3"][0].start, kl(9, 30));
}

// ── Kompetencer: kun kandidater ──────────────────────────────────────────────
{
  const med = [M("x", 2), M("y", 4)];
  const opg = [O("1", "A", kl(8), 60, [{ emp: null, min: 60 }], { kandidater: ["y"] })];
  const sim = simulerDag(opg, med, afstand, {});
  er("kun den med kompetencen", sim.pladser["1"][0].emp, "y");
  const ingen = simulerDag([O("1", "A", kl(8), 60, [{ emp: null, min: 60 }], { kandidater: [] })], med, afstand, {});
  er("ingen kandidat -> ikke placeret", ingen.ikkePlaceret.length, 1);
}

// ── Mødetid og dagstimer brydes aldrig ───────────────────────────────────────
{
  const med = [M("sen", 1, kl(9)), M("tidlig", 5, kl(7))];
  const sim = simulerDag([O("1", "A", kl(8), 60, [{ emp: "sen", min: 60 }], { kandidater: ["sen", "tidlig"] })], med, afstand, {});
  er("ikke før mødetid, selvom hun er billigst", sim.pladser["1"][0].emp, "tidlig");

  const lille = [M("kort", 1, kl(7), 60), M("lang", 5, kl(7), 420)];
  const k = { kandidater: ["kort", "lang"] };
  const opg = [O("1", "A", kl(8), 60, [{ emp: null, min: 60 }], k), O("2", "A", kl(10), 60, [{ emp: null, min: 60 }], k)];
  const s2 = simulerDag(opg, lille, afstand, {});
  const t = noegletal(opg, lille, afstand, s2.pladser);
  er("ingen over dagstimerne", t.overKap, 0);
  const fri = [{ id: "fri", sats: 1, moede: kl(7), kap: { Mon: 0 } }, M("arb", 5)];
  const s3 = simulerDag([O("1", "A", kl(8), 60, [{ emp: null, min: 60 }], { kandidater: ["fri", "arb"] })], fri, afstand, {});
  er("0 timer = fri den dag", s3.pladser["1"][0].emp, "arb");
}

// ── Faste medarbejdere og låste opgaver ──────────────────────────────────────
{
  const med = [M("x", 3), M("y", 3)];
  const opg = [
    O("1", "A", kl(8), 60, [{ emp: "x", min: 60 }]),
    O("2", "C", kl(9, 30), 60, [{ emp: "x", min: 60 }], { fast: "x" }),
    O("3", "C", kl(8), 60, [{ emp: "y", min: 60 }], { laast: true }),
  ];
  const fast = simulerDag(opg, med, afstand, { tilstand: "fast" });
  er("fast: den faste bliver på", fast.pladser["2"][0].emp, "x");
  const fri = simulerDag(opg, med, afstand, { tilstand: "fri" });
  er("låst opgave røres aldrig", fri.pladser["3"][0].emp, "y");
}

// ── To på én opgave: to forskellige ─────────────────────────────────────────
{
  const med = [M("x", 3), M("y", 3), M("z", 3)];
  const opg = [O("1", "A", kl(8), 60, [{ emp: "x", min: 60 }, { emp: "y", min: 30 }])];
  const sim = simulerDag(opg, med, afstand, {});
  const folk = sim.pladser["1"].map((r) => r.emp);
  er("to pladser", folk.length, 2);
  sandt("to forskellige medarbejdere", folk[0] !== folk[1]);
  er("fordelt tid bevares pr. plads", sim.pladser["1"].map((r) => r.min).sort().join(","), "30,60");
}

// ── Klokkeslæt flyttes kun med tilladelse, og markeres ───────────────────────
{
  const med = [M("x", 3)];
  const opg = [O("1", "A", kl(8), 60, [{ emp: "x", min: 60 }]), O("2", "C", kl(9), 60, [{ emp: null, min: 60 }])];
  const uden = simulerDag(opg, med, afstand, { tolerance: 0 });
  er("uden tolerance kan 2 ikke nås", uden.ikkePlaceret.length, 1);
  const med30 = simulerDag(opg, med, afstand, { tolerance: 30 });
  er("med ±30 flyttes den", med30.pladser["2"][0].start, kl(9, 30));
  er("og den er markeret", med30.pladser["2"][0].flyttet, true);
}

// ── Samme input giver samme svar ─────────────────────────────────────────────
{
  const med = [M("x", 2.28), M("y", 3.94), M("z", 3.1)];
  const opg = [];
  const byer = ["A", "B", "C", "A2"];
  for (let i = 0; i < 12; i++) opg.push(O(String(i), byer[i % 4], kl(7 + Math.floor(i / 3), (i % 3) * 20), 45, [{ emp: ["x", "y", "z"][i % 3], min: 45 }]));
  const a = JSON.stringify(simulerUge(opg, med, afstand, { tilstand: "fri", balance: 40 }));
  const b = JSON.stringify(simulerUge(opg, med, afstand, { tilstand: "fri", balance: 40 }));
  er("deterministisk", a, b);
  const nu = noegletal(opg, med, afstand, nuvaerendePlan(opg));
  const sim = noegletal(opg, med, afstand, simulerUge(opg, med, afstand, { tilstand: "fri" }).pladser);
  sandt("aldrig dyrere end nu, når nu er lovlig", sim.kr <= nu.kr || nu.sent > 0 || nu.foerMoede > 0);
}

// ── Kontinuitet: høj vægt holder kunden hos den samme ───────────────────────
{
  const med = [M("x", 3), M("y", 3)];
  // y kører lidt for at tage 2 — med høj kontinuitet skal det blive sådan.
  const opg = [O("1", "A", kl(8), 60, [{ emp: "x", min: 60 }]), O("2", "B", kl(10), 60, [{ emp: "y", min: 60 }]),
               O("3", "A2", kl(12), 60, [{ emp: "y", min: 60 }])];
  const lav = simulerDag(opg, med, afstand, { kontinuitet: 0, balance: 0 });
  const hoej = simulerDag(opg, med, afstand, { kontinuitet: 100, balance: 0 });
  const nyeLav = Object.values(lav.pladser).flat().filter((r) => r.foer && r.foer !== r.emp).length;
  const nyeHoej = Object.values(hoej.pladser).flat().filter((r) => r.foer && r.foer !== r.emp).length;
  sandt("høj kontinuitet giver færre nye medarbejdere", nyeHoej <= nyeLav);
  er("høj kontinuitet: ingen skifter for småbeløb", nyeHoej, 0);
}

// ── Uden kilometersats: standardsatsen bruges, så hun ikke får al kørslen ────
{
  const med = [{ id: "uden", sats: 0, moede: kl(7), kap: { Mon: 420 } }, M("med", 3.94)];
  const opg = [O("1", "A", kl(8), 60, [{ emp: "med", min: 60 }], { kandidater: ["uden", "med"] }),
               O("2", "C", kl(9, 30), 60, [{ emp: "med", min: 60 }], { kandidater: ["uden", "med"] })];
  const t = noegletal(opg, med, afstand, { "1": [{ emp: "uden", min: 60, start: kl(8) }], "2": [{ emp: "uden", min: 60, start: kl(9, 30) }] });
  er("hendes kørsel koster standardsatsen", t.kr, Math.round(20 * 3.94));
  er("og hun er markeret uden sats", t.pr.uden.udenSats, true);
}

console.log(fejl ? `\nSimulering: ${fejl} fejlede, ${ok} i orden.` : `Simulering: ${ok} kontroller i orden.`);
process.exit(fejl ? 1 : 0);
