// Tests af timepriser med gyldighedsdato. Koeres ved hvert build.
//
// Reglen: en opgave prissaettes med den sats, der gjaldt paa opgavens dato. Gaar den
// her galt, faar en faktureret opgave et andet beloeb i appen end det, der staar i
// Dinero — og det er netop det, timepris_satser blev bygget for at forhindre.
import { lavPrisliste, timeprisPaaDato, satserPaaDato, kommendeSatser } from "./src/timepriser.js";

let fejl = 0, koert = 0;
function er(hvad, faktisk, forventet) {
  koert++;
  if (JSON.stringify(faktisk) !== JSON.stringify(forventet)) {
    fejl++;
    console.error(`  ✗ ${hvad}\n      fik       ${JSON.stringify(faktisk)}\n      forventet ${JSON.stringify(forventet)}`);
  }
}

// Raekkerne i tilfaeldig orden, som de kan komme fra databasen.
const p = lavPrisliste([
  { contract_type: "privat", hourly_rate: 340, gyldig_fra: "2026-11-01" },
  { contract_type: "privat", hourly_rate: "315", gyldig_fra: "2000-01-01" },
  { contract_type: "privat", hourly_rate: 330, gyldig_fra: "2026-09-01" },
  { contract_type: "erhverv", hourly_rate: 330, gyldig_fra: "2000-01-01" },
]);

er("nyeste foerst", p.privat.map((r) => r.gyldig_fra), ["2026-11-01", "2026-09-01", "2000-01-01"]);
er("tal fra tekst", p.privat[2].sats, 315);
er("foer foerste skift: startsats", timeprisPaaDato(p, "privat", "2026-08-19"), 315);
er("paa skiftedagen gaelder den nye", timeprisPaaDato(p, "privat", "2026-09-01"), 330);
er("dagen foer skiftet gaelder den gamle", timeprisPaaDato(p, "privat", "2026-08-31"), 315);
er("mellem to skift", timeprisPaaDato(p, "privat", "2026-10-15"), 330);
er("efter sidste skift", timeprisPaaDato(p, "privat", "2027-03-01"), 340);
er("anden type har sin egen", timeprisPaaDato(p, "erhverv", "2026-10-15"), 330);
er("ukendt type -> privat", timeprisPaaDato(p, "nexus", "2026-10-15"), 330);
er("dato med klokkeslaet", timeprisPaaDato(p, "privat", "2026-09-01T23:30:00"), 330);
er("uden dato: nyeste", timeprisPaaDato(p, "privat", null), 340);
er("foer startsatsen: aeldste, ikke 0", timeprisPaaDato(p, "privat", "1999-12-31"), 315);
er("tom prisliste: 0", timeprisPaaDato({}, "privat", "2026-10-01"), 0);
er("dagens satser", satserPaaDato(p, "2026-10-03"), { privat: 330, erhverv: 330 });
er("kommende satser", kommendeSatser(p, "privat", "2026-10-03").map((r) => r.sats), [340]);
er("ugyldige raekker springes over", Object.keys(lavPrisliste([{ hourly_rate: 1 }, null, { contract_type: "x" }])), []);

if (fejl) { console.error(`Timepriser: ${fejl} af ${koert} kontroller fejlede.`); process.exit(1); }
console.log(`Timepriser: ${koert} kontroller i orden.`);
