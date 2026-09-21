// Fanger den fejl, der kostede 200 skrivninger ved hver eneste opstart.
//
// 21.9.2026: opgaverne blev hentet og oversat fra databasens snake_case til appens
// egne navne — men `po_number` og `video_url` manglede på listen. Resten af appen
// læser `t.poNumber`, så en nyhentet opgave havde ingen reference. Selvhelbredelsen
// satte den på ud fra aftalen, sammenligningen så en forskel, og opgaven blev skrevet.
// Næste opstart tabte feltet igen. Det kunne aldrig konvergere.
//
// Tiden var det mindste. `poNumber` bærer borgerens navn på kommunens opgaver og
// ender som kommentar på fakturalinjen i Dinero — og selvhelbredelsen springer netop
// opgaver med registreret tid over, altså dem der skal faktureres.
//
// Reglen, prøven håndhæver: HVERT felt, som selvhelbredelsen sammenligner eller
// skriver, SKAL findes i oversættelsen ved indlæsning. Ellers sammenligner appen
// noget, den aldrig har hentet, mod noget den lige har regnet ud — og så er svaret
// «forskelligt» hver gang.
//
// Prøven læser kildeteksten. Det er grovere end at kalde koden, men oversættelsen
// ligger midt i en React-komponent i en fil på 14.000 linjer, og alternativet var
// ingen prøve overhovedet.

import { readFileSync } from "node:fs";

const kilde = readFileSync(new URL("./src/App.jsx", import.meta.url), "utf8");
let fejl = 0;
let ok = 0;
function tjek(navn, betingelse, forklaring = "") {
  if (betingelse) { ok++; return; }
  fejl++;
  console.error(`FEJL: ${navn}${forklaring ? "\n      " + forklaring : ""}`);
}

// ---- 1. Find de felter, selvhelbredelsen arver ned på opgaven ----------------
const arvedeBlok = kilde.match(/const ARVEDE_FELTER = \[([\s\S]*?)\];/);
tjek("ARVEDE_FELTER findes", !!arvedeBlok);
const arvede = arvedeBlok
  ? [...arvedeBlok[1].matchAll(/"([a-zA-Z]+)"/g)].map((m) => m[1])
  : [];
tjek("ARVEDE_FELTER er ikke tom", arvede.length > 0);

// ---- 2. Find de felter, syncHealedAssignments sammenligner -------------------
const sammenlignBlok = kilde.match(
  /const fieldsChanged = \[([^\]]*)\]/);
tjek("sammenligningslisten i syncHealedAssignments findes", !!sammenlignBlok);
const sammenlignede = sammenlignBlok
  ? [...sammenlignBlok[1].matchAll(/"([a-zA-Z]+)"/g)].map((m) => m[1])
  : [];
tjek("sammenligningslisten er ikke tom", sammenlignede.length > 0);

// ---- 3. Find oversættelsen ved indlæsning -----------------------------------
// Blokken starter ved `const existingInst = (instData || []).map((i) => {` og
// slutter ved den afsluttende `});` på samme indrykning.
const start = kilde.indexOf("const existingInst = (instData || []).map(");
tjek("oversættelsen af opgaver ved opstart findes", start !== -1,
  "Er `existingInst` omdøbt, skal den her prøve følge med.");
const blok = start === -1 ? "" : kilde.slice(start, start + 4000);
const definerede = new Set([...blok.matchAll(/^\s{10,}([a-zA-Z]+):/gm)].map((m) => m[1]));

// ---- 4. Selve reglen ---------------------------------------------------------
// «address» hedder ikke det samme som kolonnen (address_text), og customerName kan
// falde tilbage på kundens navn — derfor tjekkes der på NAVNET i appen, ikke på
// kolonnen i databasen.
const skalVaereMed = [...new Set([...arvede, ...sammenlignede])];
for (const felt of skalVaereMed) {
  tjek(
    `«${felt}» er med i oversættelsen ved opstart`,
    definerede.has(felt),
    `Selvhelbredelsen sætter ${felt} ud fra aftalen og sammenligner med den hentede\n` +
    `      opgave. Er feltet ikke oversat, er det altid tomt på den hentede opgave,\n` +
    `      og HVER opstart skriver opgaven ned igen — i det uendelige.\n` +
    `      Tilføj: ${felt}: i.<kolonne> ?? "",  i existingInst-oversættelsen.`,
  );
}

// ---- 5. Værnet mod at skrivningerne igen bliver ét kald pr. opgave -----------
const helbredFn = kilde.match(/function syncHealedAssignments\([\s\S]*?\n  \}/);
tjek("syncHealedAssignments findes", !!helbredFn);
if (helbredFn) {
  tjek(
    "store oprydninger skrives i portioner",
    /gemArvedeFelter\(/.test(helbredFn[0]),
    "syncHealedAssignments skal kunne portionere. Ét kald pr. opgave blev til 200\n" +
    "      kald ved hver opstart, indtil nogen målte det.",
  );
  tjek(
    "medarbejdere og adgangstekst skrives stadig som hel række",
    /kraeverHelRaekke[\s\S]*syncInstance/.test(helbredFn[0]),
    "gemArvedeFelter skriver ikke assignees eller adgangstekst. De ændringer SKAL\n" +
    "      gennem syncInstance, ellers bliver en medarbejder tildelt uden at blive gemt.",
  );
}

console.log(fejl
  ? `\nIndlæsning: ${fejl} fejlede, ${ok} i orden.`
  : `Indlæsning af opgaver: ${ok} kontroller i orden.`);
process.exit(fejl ? 1 : 0);
