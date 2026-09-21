// Prøver vinduet og værnet mod dubletter.
//
// Det farlige er ikke, at vinduet henter for lidt — så mangler der bare noget på
// skærmen, og anden runde henter det. Det farlige er, at horisonten danner opgaver i
// en uge, der ikke er hentet endnu: den kan ikke se forskel på «pladsen er tom» og
// «pladsen er ikke hentet», så den opfinder dubletter i en plan, nogen arbejder i.
//
// Derfor handler over halvdelen af prøverne her om ét spørgsmål: siger værnet nej,
// når ugen ikke er hentet?

import {
  ugeInfo, ugeNoegle, ugerIVinduet, vinduetsGraenser, vinduetsStykker,
  ugenErHentet, hentedeUgerFra, UGER_BAGUD, UGER_FREM,
} from "./src/vindue.js";

let fejl = 0, ok = 0;
function er(navn, faktisk, forventet) {
  const a = JSON.stringify(faktisk), b = JSON.stringify(forventet);
  if (a === b) { ok++; return; }
  fejl++; console.error(`FEJL: ${navn}\n      fik      ${a}\n      forventet ${b}`);
}
function sandt(navn, v) { er(navn, !!v, true); }
function falsk(navn, v) { er(navn, !!v, false); }

// ── ugeInfo: ugen hører til det år, dens torsdag ligger i ────────────────────
er("2026-09-21 er uge 39 i 2026", ugeInfo(new Date(2026, 8, 21)), { uge: 39, aar: 2026 });
er("nytårsdag 2027 hører til uge 53 i 2026", ugeInfo(new Date(2027, 0, 1)), { uge: 53, aar: 2026 });
er("4. januar 2027 er uge 1 i 2027", ugeInfo(new Date(2027, 0, 4)), { uge: 1, aar: 2027 });
er("1. januar 2026 er uge 1 i 2026", ugeInfo(new Date(2026, 0, 1)), { uge: 1, aar: 2026 });
// Samme uge, uanset hvilken dag i den man spørger med.
er("mandag og søndag i uge 39 giver det samme",
  ugeInfo(new Date(2026, 8, 21)), ugeInfo(new Date(2026, 8, 27)));

// ── vinduet ──────────────────────────────────────────────────────────────────
const uger = ugerIVinduet(new Date(2026, 8, 21));
er("vinduet er otte bagud + otte frem + i dag", uger.length, UGER_BAGUD + UGER_FREM + 1);
er("det starter otte uger før", uger[0], { uge: 31, aar: 2026 });
er("det slutter otte uger efter", uger[uger.length - 1], { uge: 47, aar: 2026 });
sandt("denne uge er med", uger.some((u) => u.uge === 39 && u.aar === 2026));

// Årsskiftet er det eneste sted, «uge ± 8» går galt. Fra uge 1 i 2027 skal vinduet
// række tilbage i 2026 — og 2026 har 53 uger, ikke 52.
const nytaar = ugerIVinduet(new Date(2027, 0, 6));
// Uge 46 og ikke 45: 2026 har 53 uger, ikke 52. Otte uger tilbage fra uge 1 i 2027
// lander derfor i uge 46 — og det er hele grunden til, at der regnes i kalenderdage
// her og ikke i «uge minus otte». Den her linje stod først som 45, og prøven fangede
// det. Sådan ser fejlen ud, hvis nogen laver regnestykket om.
er("vinduet rækker tilbage over årsskiftet", nytaar[0], { uge: 46, aar: 2026 });
er("og frem i det nye år", nytaar[nytaar.length - 1], { uge: 9, aar: 2027 });
sandt("uge 53 i 2026 er med — den findes", nytaar.some((u) => u.uge === 53 && u.aar === 2026));
falsk("der opfindes ikke en uge 53 i 2027", nytaar.some((u) => u.uge === 53 && u.aar === 2027));
er("vinduet har stadig sytten uger ved årsskiftet", nytaar.length, UGER_BAGUD + UGER_FREM + 1);

// Ingen uge må komme to gange: så ville den samme side blive hentet dobbelt.
const noegler = nytaar.map((u) => ugeNoegle(u.aar, u.uge));
er("ingen uge går igen", noegler.length, new Set(noegler).size);

// ── grænserne ────────────────────────────────────────────────────────────────
const g = vinduetsGraenser(new Date(2026, 8, 21));
er("første uge i grænserne", g.foerste, { uge: 31, aar: 2026 });
er("sidste uge i grænserne", g.sidste, { uge: 47, aar: 2026 });
er("grænserne rummer alle ugerne", g.uger.length, uger.length);

// ── stykkerne, der bliver til forespørgsler ──────────────────────────────────
er("midt i året er det ét stykke", vinduetsStykker(new Date(2026, 8, 21)),
  [{ aar: 2026, fraUge: 31, tilUge: 47 }]);
er("over årsskiftet er det to", vinduetsStykker(new Date(2027, 0, 6)),
  [{ aar: 2026, fraUge: 46, tilUge: 53 }, { aar: 2027, fraUge: 1, tilUge: 9 }]);
er("aldrig mere end to stykker — vinduet er fire måneder",
  Math.max(...[0, 60, 120, 180, 240, 300, 360].map((d) => {
    const dato = new Date(2026, 0, 1); dato.setDate(dato.getDate() + d);
    return vinduetsStykker(dato).length;
  })), 2);

// Stykkerne skal dække nøjagtig de uger, vinduet består af — hverken mere eller
// mindre. Henter de for lidt, tror horisonten at pladser er tomme.
for (const dag of [new Date(2026, 8, 21), new Date(2027, 0, 6), new Date(2026, 11, 28)]) {
  const ugerne = ugerIVinduet(dag);
  const stykker = vinduetsStykker(dag);
  const daekket = [];
  stykker.forEach((s) => { for (let u = s.fraUge; u <= s.tilUge; u++) daekket.push(ugeNoegle(s.aar, u)); });
  const forventet = ugerne.map((u) => ugeNoegle(u.aar, u.uge));
  er(`stykkerne dækker vinduet præcist (${dag.toISOString().slice(0, 10)})`,
    daekket.sort(), forventet.sort());
}

// ── VÆRNET: det, der holder dubletterne ude ──────────────────────────────────
const hentet = hentedeUgerFra(uger);

sandt("en uge i vinduet må horisonten røre", ugenErHentet(hentet, 2026, 39));
sandt("randen af vinduet må den også røre", ugenErHentet(hentet, 2026, 47));
falsk("ugen lige uden for vinduet må den IKKE røre", ugenErHentet(hentet, 2026, 48));
falsk("en uge langt ude i fremtiden må den IKKE røre", ugenErHentet(hentet, 2028, 12));
falsk("en uge før vinduet må den IKKE røre", ugenErHentet(hentet, 2026, 30));

// Det rigtige år skal med i nøglen. Uden det ville uge 39 i 2027 se hentet ud,
// fordi uge 39 i 2026 er det — og så dannes der dubletter et år frem.
falsk("samme ugenummer i et andet år tæller ikke", ugenErHentet(hentet, 2027, 39));

// Når anden runde er inde, er alt hentet, og appen skal opføre sig som før.
sandt("null betyder alt er hentet — også fjerne uger", ugenErHentet(null, 2028, 12));
sandt("undefined tæller også som alt hentet", ugenErHentet(undefined, 2028, 12));

// Et tomt Set er IKKE det samme som null. Det betyder «ingenting er hentet», og så
// skal værnet sige nej til alt — ellers ville en fejlet første hentning give frit
// slag til horisonten.
falsk("tomt Set betyder ingenting er hentet", ugenErHentet(new Set(), 2026, 39));

// ── nøglen ───────────────────────────────────────────────────────────────────
er("nøglen har altid to cifre i ugen", ugeNoegle(2026, 7), "2026-07");
er("og rører ikke tocifrede", ugeNoegle(2026, 39), "2026-39");
falsk("uge 7 og uge 70 kan ikke forveksles", ugeNoegle(2026, 7) === ugeNoegle(2026, 70));

console.log(fejl
  ? `\nVindue: ${fejl} fejlede, ${ok} i orden.`
  : `Vindue og værn: ${ok} kontroller i orden.`);
process.exit(fejl ? 1 : 0);
