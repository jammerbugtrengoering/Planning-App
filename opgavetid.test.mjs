// Tests af tiden på en opgave. Køres ved hvert build, ligesom lønberegningen.
//
// Hver test siger, HVAD den beskytter mod. Det her er fakturagrundlaget — en fejl
// her sender en forkert regning til en kunde, og den slags opdages først, når kunden
// selv regner efter.

import {
  registreredeMinutter, fakturerbareMinutter, oplaeringsMinutter,
  minutterFor, oplaeringsFolk, erUnderOplaering, afvigelse, planlagtFakturerbart,
} from "./src/opgavetid.js";

let fejl = 0, kørt = 0;

function er(hvad, faktisk, forventet) {
  kørt++;
  const a = JSON.stringify(faktisk), b = JSON.stringify(forventet);
  if (a !== b) {
    fejl++;
    console.error(`  ✗ ${hvad}\n      fik      ${a}\n      forventet ${b}`);
  }
}

// ── Den opgave hele øvelsen handler om ──────────────────────────────────────
// To timer aftalt. Nadine udfører, to nye er med for at lære.
const oplaering = {
  duration: 120,
  oplaeringMedarbejdere: ["e5", "e7"],
  timeLog: [
    { empId: "eb32ablk", minutes: 120 },
    { empId: "e5", minutes: 120 },
    { empId: "e7", minutes: 120 },
  ],
};

// Beskytter mod: at kunden får en regning på seks timer for to timers rengøring.
er("kunden betaler kun for den der udfører", fakturerbareMinutter(oplaering), 120);
// Beskytter mod: at eleverne mister deres løn, fordi vi filtrerede for hårdt.
er("lønnen tæller alle tre", registreredeMinutter(oplaering), 360);
er("eleven får sine egne timer", minutterFor(oplaering, "e5"), 120);
er("læreren får sine egne timer", minutterFor(oplaering, "eb32ablk"), 120);
// Beskytter mod fejlen i Kundetimer: uden det her stod hver oplæringsdag som et
// overforbrug på fire timer, og listen blev ubrugelig i den uge.
er("ingen falsk afvigelse", afvigelse(oplaering), 0);
er("oplæringstiden kan gøres op", oplaeringsMinutter(oplaering), 240);

// ── Den almindelige opgave må ikke ændre sig ────────────────────────────────
// Beskytter mod: at den nye regel ændrer noget for de 2.700 opgaver uden oplæring.
const normal = { duration: 120, timeLog: [{ empId: "eb32ablk", minutes: 135 }] };
er("uden oplæring er de to tal ens", fakturerbareMinutter(normal), registreredeMinutter(normal));
er("afvigelse regnes stadig", afvigelse(normal), 15);
er("ingen oplæringstid", oplaeringsMinutter(normal), 0);

// ── To der deler en opgave, ingen oplæring ──────────────────────────────────
// Beskytter mod: at vi kom til at halvere tiden på delte besøg. To der gør rent
// sammen i en time, har leveret to timers arbejde, og det skal kunden betale.
const delt = { duration: 120, timeLog: [{ empId: "e2", minutes: 60 }, { empId: "e5", minutes: 60 }] };
er("delt besøg lægges sammen", fakturerbareMinutter(delt), 120);

// ── Kontorets egne registreringer tæller med ────────────────────────────────
// Forgæves besøg: kontoret registrerer tiden og beslutter at kunden skal betale.
// Beskytter mod: at den beslutning ryger ud sammen med oplæringen.
const forgaeves = {
  duration: 60,
  oplaeringMedarbejdere: ["e5"],
  timeLog: [{ empId: "planner", minutes: 60, note: "Forgæves besøg" }, { empId: "e5", minutes: 60 }],
};
er("kontorets tid faktureres stadig", fakturerbareMinutter(forgaeves), 60);

// ── Snavsede data må ikke vælte noget ───────────────────────────────────────
er("ingen log", registreredeMinutter({ duration: 60 }), 0);
er("ingen log, ingen faktura", fakturerbareMinutter({ duration: 60 }), 0);
er("null i listen", oplaeringsFolk({ oplaeringMedarbejdere: null }), []);
er("snake_case fra databasen", oplaeringsFolk({ oplaering_medarbejdere: ["e5"] }), ["e5"]);
er("time_log fra databasen", registreredeMinutter({ time_log: [{ empId: "e2", minutes: 30 }] }), 30);
er("minutter som tekst", registreredeMinutter({ timeLog: [{ empId: "e2", minutes: "45" }] }), 45);
er("minutter der mangler", registreredeMinutter({ timeLog: [{ empId: "e2" }] }), 0);
er("tom streng i oplæringslisten", oplaeringsFolk({ oplaeringMedarbejdere: ["", "e5"] }), ["e5"]);
er("ukendt medarbejder er ikke elev", erUnderOplaering(oplaering, "e99"), false);
er("uden medarbejder er ingen elev", erUnderOplaering(oplaering, null), false);
er("eleven genkendes", erUnderOplaering(oplaering, "e5"), true);

// ── Alle er elever ──────────────────────────────────────────────────────────
// Kan ske ved en fejlindtastning. Så er der intet at fakturere — og det skal være
// nul, ikke hele summen.
const kunElever = {
  duration: 120,
  oplaeringMedarbejdere: ["e5", "e7"],
  timeLog: [{ empId: "e5", minutes: 120 }, { empId: "e7", minutes: 120 }],
};
er("kun elever giver intet fakturagrundlag", fakturerbareMinutter(kunElever), 0);
er("men de får stadig løn", registreredeMinutter(kunElever), 240);

// ── To på opgaven, begge leverer ────────────────────────────────────────────
// Den fejl der lå i Kundetimer indtil 9.9: to medarbejdere à to timer, der begge
// gjorde præcis som planlagt, stod som TO TIMERS MERFORBRUG, fordi der blev målt mod
// én persons portion. Gisela Bender lå øverst på listen over kunder at ringe til, for
// et besøg der gik nøjagtigt som aftalt.
//
// Den gamle test fangede den ikke: eksemplet med oplæring havde præcis én der
// leverede, og der giver begge formler tilfældigvis samme svar.
const toMand = {
  duration: 120,
  assignees: ["e2", "e5"],
  timeLog: [{ empId: "e2", minutes: 120 }, { empId: "e5", minutes: 120 }],
};
er("to der leverer som planlagt har ingen afvigelse", afvigelse(toMand), 0);
er("planlagt regnes for hele holdet", planlagtFakturerbart(toMand), 240);
er("og de fire timer faktureres", fakturerbareMinutter(toMand), 240);

// Samme hold, men den ene brugte en halv time ekstra. Det ER en afvigelse.
const toMandOver = {
  duration: 120,
  assignees: ["e2", "e5"],
  timeLog: [{ empId: "e2", minutes: 150 }, { empId: "e5", minutes: 120 }],
};
er("ægte merforbrug ses stadig", afvigelse(toMandOver), 30);

// Tre på opgaven, to er elever: kun én leverer, så kun én portion er planlagt.
const treMedElever = {
  duration: 120,
  assignees: ["eb32ablk", "e5", "e7"],
  oplaeringMedarbejdere: ["e5", "e7"],
  timeLog: [
    { empId: "eb32ablk", minutes: 120 },
    { empId: "e5", minutes: 120 },
    { empId: "e7", minutes: 120 },
  ],
};
er("elever tæller ikke med i det planlagte", planlagtFakturerbart(treMedElever), 120);
er("og så er der ingen afvigelse", afvigelse(treMedElever), 0);

// Ingen tildelt endnu. Så er den planlagte portion det, der er meningen.
er("uden nogen på opgaven", planlagtFakturerbart({ duration: 90 }), 90);

// ── Resultat ────────────────────────────────────────────────────────────────
if (fejl > 0) {
  console.error(`\n  ${fejl} af ${kørt} kontroller fejlede i opgavetiden.\n`);
  process.exit(1);
}
console.log(`Opgavetid: ${kørt} kontroller i orden.`);
