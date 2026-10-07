// Tests af nøgletallene pr. postnummer. Køres ved hvert build.
//
// Hvad de beskytter mod: postnummeret står kun i adresseteksten, og en rapport siger aldrig selv fra, hvis den stille taber opgaver. Derfor prøves både læsningen af
// postnummeret, at opgaver uden postnummer tælles for sig (og ikke forsvinder), og at et forkert geokodet punkt ikke flytter et postnummer på kortet.

import { postnrFraAdresse, samlPrPostnr, centroider, varmeAndel, varmeFarve, formatVaerdi } from "./src/postnummer.js";

let fejl = 0, koert = 0;
function er(hvad, faktisk, forventet) {
  koert++;
  if (JSON.stringify(faktisk) !== JSON.stringify(forventet)) {
    fejl++;
    console.error(`  ✗ ${hvad}\n      fik       ${JSON.stringify(faktisk)}\n      forventet ${JSON.stringify(forventet)}`);
  }
}

// ── Postnummer ud af adressen ───────────────────────────────────────────────
er("almindelig adresse", postnrFraAdresse("Rantzausvej 12, 9460 Brovst"), { postnr: "9460", by: "Brovst" });
er("med bydel før postnummeret", postnrFraAdresse("Strandfogdensvej 70, Rødhus, 9490 Pandrup"), { postnr: "9490", by: "Pandrup" });
er("husnummer er ikke et postnummer", postnrFraAdresse("Valmuemarken 15, 9690 Fjerritslev"), { postnr: "9690", by: "Fjerritslev" });
er("bynavn med bindestreg", postnrFraAdresse("Vej 1, 9440 Aabybro-Nord"), { postnr: "9440", by: "Aabybro-Nord" });
er("uden bynavn", postnrFraAdresse("Vej 1, 9440"), { postnr: "9440", by: "" });
er("uden postnummer", postnrFraAdresse("Skolelodden 6, Kaas"), null);
er("tom adresse", postnrFraAdresse(""), null);
er("ingen adresse", postnrFraAdresse(undefined), null);
er("tre cifre er ikke et postnummer", postnrFraAdresse("Vej 123, Pandrup"), null);
er("husnummer på fire cifre alene tæller som sidste udvej", postnrFraAdresse("Landevejen 2500"), { postnr: "2500", by: "" });

// ── Optælling pr. postnummer ────────────────────────────────────────────────
const beregn = (t) => ({ minutter: t.min || 60, planlagtKr: (t.min || 60) / 60 * 300, realiseretKr: t.udfoert ? (t.min || 60) / 60 * 300 : 0 });
const datoAf = (t) => t.dato;
const opg = [
  { address: "A 1, 9460 Brovst", contractType: "privat", dato: "2026-03-02", min: 120, udfoert: true },
  { address: "B 2, 9460 Brovst", contractType: "nexus", dato: "2026-03-03" },
  { address: "C 3, 9490 Pandrup", contractType: "privat", dato: "2026-04-01" },
  { address: "D 4, Kaas", contractType: "privat", dato: "2026-04-02" },
  { address: "E 5, 9460 Brovst", contractType: "privat", dato: "2025-12-30", udfoert: true },
];
let r = samlPrPostnr(opg, { beregn, datoAf });
er("fem opgaver i alt", r.ialt.antal, 5);
er("to postnumre", r.raekker.length, 2);
er("Brovst har tre", r.raekker.find((x) => x.postnr === "9460").antal, 3);
er("én uden postnummer tælles for sig", r.uden.antal, 1);
er("summen af delene er helheden", r.raekker.reduce((s, x) => s + x.antal, 0) + r.uden.antal, r.ialt.antal);
er("timer regnes ud af minutter", r.raekker.find((x) => x.postnr === "9460").timer, (120 + 60 + 60) / 60);

r = samlPrPostnr(opg, { beregn, datoAf, aar: 2026 });
er("kun 2026", r.ialt.antal, 4);
r = samlPrPostnr(opg, { beregn, datoAf, segment: "nexus" });
er("kun nexus", [r.ialt.antal, r.raekker.length], [1, 1]);
r = samlPrPostnr(opg, { beregn, datoAf, segment: "privat", aar: 2026 });
er("privat 2026", r.ialt.antal, 3);
er("realiseret kun for udførte", r.raekker.find((x) => x.postnr === "9460").realiseretKr, 600);

// ── Midtpunkt: medianen tåler et gættet punkt ───────────────────────────────
const c = centroider([
  { addr_a: "A 1, 9490 Pandrup", lat_a: 57.22, lng_a: 9.78, addr_b: "B 2, 9460 Brovst", lat_b: 57.09, lng_b: 9.52 },
  { addr_a: "C 3, 9490 Pandrup", lat_a: 57.23, lng_a: 9.79, addr_b: "D 4, 9460 Brovst", lat_b: 57.10, lng_b: 9.53 },
  { addr_a: "E 5, 9490 Pandrup", lat_a: 56.45, lng_a: 9.40, addr_b: "F 6, 9460 Brovst", lat_b: 57.10, lng_b: 9.54 },  // Pandrup-punktet er gættet i Viborg
]);
er("Pandrup ligger stadig i Pandrup trods et gættet punkt", c["9490"].lat > 57, true);
er("Brovst har tre punkter", c["9460"].n, 3);
er("rute uden koordinater giver intet midtpunkt", Object.keys(centroider([{ addr_a: "X, 9000 Aalborg", lat_a: null, lng_a: null }])).length, 0);

// ── Varme ───────────────────────────────────────────────────────────────────
er("ingenting er koldt", varmeAndel(0, 100), 0);
er("toppen er varmest", varmeAndel(100, 100), 1);
er("en fjerdedel er halv varme (kvadratrod)", varmeAndel(25, 100), 0.5);
er("ingen top giver nul", varmeAndel(5, 0), 0);
er("koldeste farve er den blege pink", varmeFarve(0), "#fce4ef");
er("varmeste farve er mørk", varmeFarve(1), "#7a1148");
er("midten er appens pink", varmeFarve(0.6), "#d6247a");
er("tal vises på dansk", formatVaerdi(1234.4, "planlagtKr").replace(/\s/g, " ").includes("1.234"), true);

if (fejl > 0) {
  console.error(`\n  ${fejl} af ${koert} kontroller fejlede i nøgletal pr. postnummer.\n`);
  process.exit(1);
}
console.log(`Nøgletal pr. postnummer: ${koert} kontroller i orden.`);
