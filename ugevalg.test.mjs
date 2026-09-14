// Tests af ugevalget i «Ikke tildelt». Køres ved hvert build.
//
// Hvad de beskytter mod: at året glemmes, når to uger sammenlignes. Uge 2 i 2027
// ligger EFTER uge 37 i 2026, men på ugenummeret alene ligger den før. Fejlen ville
// kun vise sig omkring nytår — og dér ville ingen lede efter den. Resultatet var, at
// januars uplanlagte opgaver lå gemt under «før denne uge» hele efteråret.

import { filtrerUgevalg } from "./src/ugevalg.js";

let fejl = 0, koert = 0;
function er(hvad, faktisk, forventet) {
  koert++;
  if (JSON.stringify(faktisk) !== JSON.stringify(forventet)) {
    fejl++;
    console.error(`  ✗ ${hvad}\n      fik       ${JSON.stringify(faktisk)}\n      forventet ${JSON.stringify(forventet)}`);
  }
}

const opgaver = [
  { navn: "uge 35/2026", year: 2026, week: 35 },
  { navn: "uge 36/2026", year: 2026, week: 36 },
  { navn: "uge 37/2026", year: 2026, week: 37 },
  { navn: "uge 38/2026", year: 2026, week: 38 },
  { navn: "uge 53/2026", year: 2026, week: 53 },
  { navn: "uge 1/2027",  year: 2027, week: 1  },
  { navn: "uge 2/2027",  year: 2027, week: 2  },
];
const navne = (valg, aar, uge) => filtrerUgevalg(opgaver, valg, aar, uge).map((x) => x.navn);

// ── Midt i året ─────────────────────────────────────────────────────────────
er("denne uge",       navne("current", 2026, 37), ["uge 37/2026"]);
er("efter denne uge", navne("efter",   2026, 37), ["uge 38/2026", "uge 53/2026", "uge 1/2027", "uge 2/2027"]);
er("før denne uge",   navne("foer",    2026, 37), ["uge 35/2026", "uge 36/2026"]);
er("alle uger",       navne("all",     2026, 37).length, 7);

// De tre udsnit må tilsammen give præcis listen — hverken en opgave, der optræder
// to steder, eller en, der falder ud mellem dem. Det er dét, en planlægger stoler
// på, når hun rydder op.
er("de tre udsnit dækker alt uden overlap",
   navne("foer", 2026, 37).length + navne("current", 2026, 37).length + navne("efter", 2026, 37).length,
   7);

// ── Hen over årsskiftet ─────────────────────────────────────────────────────
er("uge 1 og 2 i 2027 ligger efter uge 53 i 2026",
   navne("efter", 2026, 53), ["uge 1/2027", "uge 2/2027"]);
er("og intet fra 2027 ligger før uge 53 i 2026",
   navne("foer", 2026, 53), ["uge 35/2026", "uge 36/2026", "uge 37/2026", "uge 38/2026"]);
er("set fra uge 1 i 2027 ligger hele 2026 før",
   navne("foer", 2027, 1).length, 5);
er("og kun uge 2 ligger efter",
   navne("efter", 2027, 1), ["uge 2/2027"]);

// ── Randtilfælde ────────────────────────────────────────────────────────────
er("en uge uden noget i giver en tom liste", navne("current", 2026, 40), []);
er("ingen opgaver giver ingen fejl", filtrerUgevalg(null, "foer", 2026, 37), []);
er("ukendt valg opfører sig som «denne uge»", navne("pjat", 2026, 37), ["uge 37/2026"]);

// ── Resultat ────────────────────────────────────────────────────────────────
if (fejl > 0) {
  console.error(`\n  ${fejl} af ${koert} kontroller fejlede i ugevalget.\n`);
  process.exit(1);
}
console.log(`Ugevalg: ${koert} kontroller i orden.`);
