// Tests af pengeberegningerne. Køres ved hvert build, ligesom tjek-tdz.mjs.
//
// Ingen testbibliotek. Der er ingen grund til at hente noget ind for at sammenligne
// tal — og et bibliotek mere er en afhængighed mere, der skal holdes ved lige.
//
// Hver test siger, HVAD den beskytter mod. En test der bare hedder "test 4" bliver
// slettet af den næste, der har travlt.

import {
  talDk, gaeldendePct, samletForMedarbejder, danloenLinjer, danloenCsv,
  afvigelserPrKunde,
} from "./src/loenberegning.js";

let fejl = 0, kørt = 0;

function er(hvad, faktisk, forventet) {
  kørt++;
  const a = JSON.stringify(faktisk), b = JSON.stringify(forventet);
  if (a !== b) {
    fejl++;
    console.error(`  ✗ ${hvad}\n      fik      ${a}\n      forventet ${b}`);
  }
}

// ── Dansk talformat ─────────────────────────────────────────────────────────
// Beskytter mod: at Danløn læser 45.50 timer som 4550.
er("timer med komma", talDk(45.5, 2), "45,50");
er("beløb med komma", talDk(6502.5, 2), "6502,50");
er("km med én decimal", talDk(128.44, 1), "128,4");

// ── Egen procent vinder over den fælles ─────────────────────────────────────
// Beskytter mod: at et tomt felt bliver læst som nul procent i stedet for "brug
// den fælles sats" — så tillægget stille forsvandt fra hendes løn.
er("egen procent vinder", gaeldendePct(60, "50"), 60);
er("tom bruger den fælles", gaeldendePct(null, "50"), 50);
er("tom streng bruger den fælles", gaeldendePct("", "50"), 50);
er("nul er et rigtigt valg", gaeldendePct(0, "50"), 0);
er("komma i den fælles sats", gaeldendePct(null, "4,5"), 4.5);
er("ingen af delene giver nul", gaeldendePct(null, null), 0);

// ── Weekendtimer holdes for sig ─────────────────────────────────────────────
// Beskytter mod: at weekendtillægget bliver regnet af hele månedens løn i stedet
// for kun af weekendtimerne. Med 38 timer og 6 i weekenden er forskellen 5.500 kr.
const linjer = [
  { registreretMinutter: 1935, registreretLoen: 5482.50, erWeekend: false },
  { registreretMinutter: 360,  registreretLoen: 1020.00, erWeekend: true  },
];
const samlet = samletForMedarbejder({ linjer, kmRaekker: [{ km: 96.2 }, { km: 32.2 }] });
er("samlede minutter", samlet.minutter, 2295);
er("samlet løn", samlet.loen, 6502.5);
er("kun weekendtimerne", samlet.weekendMinutter, 360);
er("kun weekendlønnen", samlet.weekendLoen, 1020);
er("kilometer lagt sammen", Math.round(samlet.km * 10) / 10, 128.4);

// ── Hele Danløn-filen for én medarbejder ────────────────────────────────────
const loenart = {
  loenart_timer: "1000", loenart_km: "1200",
  loenart_weekend: "1100", loenart_sh: "1300",
  weekend_pct: "50", sh_pct: "4",
};
const nadine = {
  danloenNr: "1043", name: "Nadine Bremholm",
  weekendTillaeg: true, shBetaling: true,
  weekendPctEgen: null, shPctEgen: null,
};

const fire = danloenLinjer({ medarbejder: nadine, samlet, loenart });
er("fire linjer", fire.length, 4);
er("timer og løn",   fire[0], ["1043", "Nadine Bremholm", "1000", "38,25", "6502,50"]);
// 1020 × 50 % = 510
er("weekendtillæg",  fire[1], ["1043", "Nadine Bremholm", "1100", "6,00", "510,00"]);
// Km har intet beløb — satsen sættes i Danløn
er("kilometer",      fire[2], ["1043", "Nadine Bremholm", "1200", "128,4", ""]);
// (6502,50 + 510) × 4 % = 280,50 — tillægget ER med i grundlaget
er("SH af løn plus tillæg", fire[3], ["1043", "Nadine Bremholm", "1300", "", "280,50"]);

// ── Kilometerpenge må ALDRIG tælle med i SH-grundlaget ──────────────────────
// Beskytter mod: at skattefri godtgørelse bliver behandlet som løn. 128 km ville
// give godt 500 kr for meget i SH-grundlag.
const udenKm = danloenLinjer({
  medarbejder: nadine,
  samlet: { ...samlet, km: 0 },
  loenart,
});
er("SH er den samme uden km", udenKm[udenKm.length - 1][4], "280,50");

// ── Uden Danløn-nummer kommer man ikke med ──────────────────────────────────
// Beskytter mod: at den enes timer bliver udbetalt til den anden, fordi systemet
// gættede på navnet.
er("intet nummer, ingen linjer",
   danloenLinjer({ medarbejder: { ...nadine, danloenNr: null }, samlet, loenart }).length, 0);

// ── Fravalgte tillæg sendes ikke ────────────────────────────────────────────
const kunTimer = danloenLinjer({
  medarbejder: { ...nadine, weekendTillaeg: false, shBetaling: false },
  samlet, loenart,
});
er("kun timer og km", kunTimer.length, 2);

// ── Manglende sats springer linjen over ─────────────────────────────────────
// Beskytter mod: at et glemt felt bliver til en udbetaling på nul kroner, der
// ligner en fejl hos jer.
const udenSats = danloenLinjer({
  medarbejder: nadine, samlet,
  loenart: { ...loenart, weekend_pct: "", sh_pct: "" },
});
er("ingen nul-linjer", udenSats.length, 2);

// ── Nul timer giver ingen timelinje ─────────────────────────────────────────
const tom = danloenLinjer({
  medarbejder: nadine,
  samlet: { minutter: 0, loen: 0, weekendMinutter: 0, weekendLoen: 0, km: 0 },
  loenart,
});
er("ingenting at sende", tom.length, 0);

// ── CSV-formatet ────────────────────────────────────────────────────────────
// Beskytter mod: at nogen skifter til komma som skilletegn. Tallene indeholder
// selv komma, og så ville filen falde fra hinanden.
const csv = danloenCsv(fire).split("\n");
er("hoved med semikolon", csv[0], '"medarbejdernr";"navn";"loenart";"antal";"beloeb"');
er("fem felter pr. linje", csv[1].split(";").length, 5);

// ── Over- og underforbrug lægges ikke sammen ────────────────────────────────
// Beskytter mod fejlen fra 25.8: en kunde med +4t og −4t endte på nul og lå midt i
// listen, som om alt passede — selvom der var to store afvigelser at forklare.
const kunder = afvigelserPrKunde([
  { kunde: "Gisela",  afvigelse:  240, begrundelse: "" },
  { kunde: "Gisela",  afvigelse: -240, begrundelse: "Aflyst" },
  { kunde: "Davidsen", afvigelse:  30, begrundelse: "Ekstra" },
]);
er("Gisela ligger øverst", kunder[0].navn, "Gisela");
er("over tælles for sig", kunder[0].over, 240);
er("under tælles for sig", kunder[0].under, 240);
er("nettoen er stadig nul", kunder[0].netto, 0);
er("uden begrundelse tælles", kunder[0].udenBegrundelse, 1);
er("besøg der passer springes over", kunder.length, 2);

// ── Resultat ────────────────────────────────────────────────────────────────
if (fejl > 0) {
  console.error(`\n  ${fejl} af ${kørt} kontroller fejlede i lønberegningen.\n`);
  process.exit(1);
}
console.log(`Lønberegning: ${kørt} kontroller i orden.`);
