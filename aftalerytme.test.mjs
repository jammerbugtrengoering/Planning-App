// Tests af aftalens rytme. Køres ved hvert build.
//
// Hvad de beskytter mod: reglen bruges nu to steder — til at DANNE opgaver og til at
// RYDDE dem, der ikke passer længere, når en aftale redigeres. Bliver de to uenige,
// rydder appen enten opgaver væk, der skulle være der, eller lader opgaver stå, der
// ikke skulle. Begge dele rammer en rigtig medarbejders dag.

import { aftaleKoererPaaDag, mandagIUgen, isoDato } from "./src/aftalerytme.js";

let fejl = 0, koert = 0;
function er(hvad, faktisk, forventet) {
  koert++;
  if (JSON.stringify(faktisk) !== JSON.stringify(forventet)) {
    fejl++;
    console.error(`  ✗ ${hvad}\n      fik       ${JSON.stringify(faktisk)}\n      forventet ${JSON.stringify(forventet)}`);
  }
}
const man = (a, m, d) => mandagIUgen(new Date(a, m - 1, d));

// ── Hver uge ────────────────────────────────────────────────────────────────
const ugentlig = { days: ["Thu"], planInterval: "uge", startDate: "2026-09-03", status: "aktiv" };
er("torsdag i startugen", aftaleKoererPaaDag(ugentlig, man(2026, 9, 3), "Thu"), true);
er("torsdag ugen efter",  aftaleKoererPaaDag(ugentlig, man(2026, 9, 10), "Thu"), true);
er("men ikke tirsdag",    aftaleKoererPaaDag(ugentlig, man(2026, 9, 10), "Tue"), false);
er("og ikke før start",   aftaleKoererPaaDag(ugentlig, man(2026, 8, 27), "Thu"), false);

// ── Hver 14. dag ────────────────────────────────────────────────────────────
const fjortende = { days: ["Fri"], planInterval: "14_dage", startDate: "2026-09-18", status: "aktiv" };
er("første fredag",   aftaleKoererPaaDag(fjortende, man(2026, 9, 18), "Fri"), true);
er("ugen imellem",    aftaleKoererPaaDag(fjortende, man(2026, 9, 25), "Fri"), false);
er("fjorten dage",    aftaleKoererPaaDag(fjortende, man(2026, 10, 2), "Fri"), true);

// ── Hver 4. uge ─────────────────────────────────────────────────────────────
// Den kadence, «Måned» blev lavet om til 13.9.2026. Tretten besøg om året, og dagen
// vandrer gennem kalenderen.
const fireUger = { days: ["Thu"], planInterval: "4_uger", startDate: "2026-09-17", status: "aktiv" };
er("første besøg",       aftaleKoererPaaDag(fireUger, man(2026, 9, 17), "Thu"), true);
er("en uge efter: nej",  aftaleKoererPaaDag(fireUger, man(2026, 9, 24), "Thu"), false);
er("to uger efter: nej", aftaleKoererPaaDag(fireUger, man(2026, 10, 1), "Thu"), false);
er("tre uger efter: nej",aftaleKoererPaaDag(fireUger, man(2026, 10, 8), "Thu"), false);
er("fire uger efter: ja",aftaleKoererPaaDag(fireUger, man(2026, 10, 15), "Thu"), true);
// Beskytter mod: at 'maaned' fra en gammel række pludselig regnes som kalendermåned.
const gammelMaaned = { ...fireUger, planInterval: "maaned" };
er("gammel 'maaned' er fire uger", aftaleKoererPaaDag(gammelMaaned, man(2026, 10, 15), "Thu"), true);

// Hen over sommertidsskiftet. Uden Math.round i ugetællingen ville kadencen skride
// her — og kun i den ene halvdel af året.
er("fire uger hen over 25. oktober",
   aftaleKoererPaaDag(fireUger, man(2026, 11, 12), "Thu"), true);
er("og ugen før passer ikke",
   aftaleKoererPaaDag(fireUger, man(2026, 11, 5), "Thu"), false);

// ── Hver 3. måned ───────────────────────────────────────────────────────────
// Følger KALENDEREN og ikke uger: et kvartalsbesøg hører til en bestemt tid på året.
//
// Besøget lander i den uge, der INDEHOLDER samme dato som startdatoen — ikke
// nødvendigvis på selve datoen. Startdatoen er mandag den 5. januar, men den 5. april
// og den 5. juli er begge søndage, og de uger begynder mandag den 30. marts og
// mandag den 29. juni. Det er ikke en fejl: aftalen kører mandage, og mandagen i den
// uge, kvartalsdatoen falder i, er dén mandag.
const kvartal = { days: ["Mon"], planInterval: "3_maaned", startDate: "2026-01-05", status: "aktiv" };
er("januar",  aftaleKoererPaaDag(kvartal, man(2026, 1, 5), "Mon"), true);
er("februar", aftaleKoererPaaDag(kvartal, man(2026, 2, 2), "Mon"), false);
er("april: ugen der indeholder den 5.", aftaleKoererPaaDag(kvartal, man(2026, 3, 30), "Mon"), true);
er("og ikke ugen efter",                aftaleKoererPaaDag(kvartal, man(2026, 4, 6), "Mon"), false);
er("juli: ugen der indeholder den 5.",  aftaleKoererPaaDag(kvartal, man(2026, 6, 29), "Mon"), true);

// Den 31. i en kort måned må ikke springes over: datoen klippes til månedens sidste
// dag, så april rammer den 30. Torsdag den 30. april ligger i ugen fra mandag den 27.
const ultimo = { days: ["Thu"], planInterval: "3_maaned", startDate: "2026-01-31", status: "aktiv" };
er("ultimo april rammer den 30.", aftaleKoererPaaDag(ultimo, man(2026, 4, 27), "Thu"), true);
// Januar giver ingenting, og det er rigtigt: den 31. januar er en lørdag, og aftalens
// eneste dag er torsdag — torsdag den 29. ligger før startdatoen.
er("januar giver ingenting",      aftaleKoererPaaDag(ultimo, man(2026, 1, 26), "Thu"), false);

// ── Udløb, ophør og udeladte dage ───────────────────────────────────────────
const udloeber = { ...ugentlig, expiryDate: "2026-09-17" };
er("dagen før udløb",  aftaleKoererPaaDag(udloeber, man(2026, 9, 10), "Thu"), true);
er("efter udløb",      aftaleKoererPaaDag(udloeber, man(2026, 9, 24), "Thu"), false);

// Ophørsdagen er MED. Den sidste aftalte rengøring skal stadig køres og faktureres —
// det er derfor der står «>» og ikke «>=» i reglen.
const opsagt = { ...ugentlig, status: "udgaaet", cancelledEffectiveDate: "2026-09-10" };
er("selve ophørsdagen", aftaleKoererPaaDag(opsagt, man(2026, 9, 10), "Thu"), true);
er("dagen efter",       aftaleKoererPaaDag(opsagt, man(2026, 9, 17), "Thu"), false);

const udeladt = { ...ugentlig, excludedDays: ["2026-09-10"] };
er("udeladt dag", aftaleKoererPaaDag(udeladt, man(2026, 9, 10), "Thu"), false);
er("næste uge er upåvirket", aftaleKoererPaaDag(udeladt, man(2026, 9, 17), "Thu"), true);

// ── En kladde danner aldrig noget ───────────────────────────────────────────
er("kladde", aftaleKoererPaaDag({ ...ugentlig, status: "kladde" }, man(2026, 9, 10), "Thu"), false);
er("uden dage", aftaleKoererPaaDag({ ...ugentlig, days: [] }, man(2026, 9, 10), "Thu"), false);
er("ingen aftale", aftaleKoererPaaDag(null, man(2026, 9, 10), "Thu"), false);

// ── Datoen skal være lokal, ikke UTC ────────────────────────────────────────
// Beskytter mod toISOString(): i dansk sommertid bliver midnat den 8. til kl. 22 den
// 7., og hele dagsfiltreringen ville rykke sig en dag — kun i sommerhalvåret.
er("isoDato er lokal i sommertid", isoDato(new Date(2026, 6, 8)), "2026-07-08");
er("isoDato er lokal i vintertid", isoDato(new Date(2026, 0, 8)), "2026-01-08");

// ── Resultat ────────────────────────────────────────────────────────────────
if (fejl > 0) {
  console.error(`\n  ${fejl} af ${koert} kontroller fejlede i aftalerytmen.\n`);
  process.exit(1);
}
console.log(`Aftalerytme: ${koert} kontroller i orden.`);
