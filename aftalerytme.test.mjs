// Tests af aftalens rytme. Køres ved hvert build.
//
// Hvad de beskytter mod: reglen bruges nu to steder — til at DANNE opgaver og til at
// RYDDE dem, der ikke passer længere, når en aftale redigeres. Bliver de to uenige,
// rydder appen enten opgaver væk, der skulle være der, eller lader opgaver stå, der
// ikke skulle. Begge dele rammer en rigtig medarbejders dag.

import { aftaleKoererPaaDag, mandagIUgen, isoDato, nyStartdatoHvisPasseret, rensKonkreteDatoer, konkretDato,
  ugerFra, maanederFra, intervalNoegle, intervalValg, ugerMellemBesoeg, besoegIPeriode, beskrivRytme, KONKRETE, VED_BESOEG } from "./src/aftalerytme.js";

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

// ── Hver 6. uge ─────────────────────────────────────────────────────────────
const seksUger = { days: ["Thu"], planInterval: "6_uger", startDate: "2026-09-17", status: "aktiv" };
er("første besøg",         aftaleKoererPaaDag(seksUger, man(2026, 9, 17), "Thu"), true);
er("en uge efter: nej",    aftaleKoererPaaDag(seksUger, man(2026, 9, 24), "Thu"), false);
er("fire uger efter: nej", aftaleKoererPaaDag(seksUger, man(2026, 10, 15), "Thu"), false);
er("fem uger efter: nej",  aftaleKoererPaaDag(seksUger, man(2026, 10, 22), "Thu"), false);
er("seks uger efter: ja",  aftaleKoererPaaDag(seksUger, man(2026, 10, 29), "Thu"), true);
// Endnu en kadence hen over sommertidsskiftet (25. oktober 2026), længere ude end det
// første match — samme beskyttelse mod Math.round-fejl som ved «hver 4. uge».
er("tolv uger efter: ja",
   aftaleKoererPaaDag(seksUger, man(2026, 12, 7), "Thu"), true);
er("elleve uger efter: nej",
   aftaleKoererPaaDag(seksUger, man(2026, 11, 30), "Thu"), false);

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
// «slettes» er markeret til at ryge efter en gennemgang. Indtil nogen trykker slet,
// skal den opføre sig som om den allerede var væk — ellers bliver en aftale, kontoret
// har afgjort skal ud, ved med at lægge opgaver på en medarbejders plan imens.
er("markeret til sletning", aftaleKoererPaaDag({ ...ugentlig, status: "slettes" }, man(2026, 9, 10), "Thu"), false);
er("og heller ikke en anden uge", aftaleKoererPaaDag({ ...ugentlig, status: "slettes" }, man(2026, 9, 17), "Thu"), false);
// De to statusser, der STADIG danner opgaver, skal blive ved med at gøre det.
er("aktiv danner stadig", aftaleKoererPaaDag({ ...ugentlig, status: "aktiv" }, man(2026, 9, 10), "Thu"), true);
er("uden dage", aftaleKoererPaaDag({ ...ugentlig, days: [] }, man(2026, 9, 10), "Thu"), false);
er("ingen aftale", aftaleKoererPaaDag(null, man(2026, 9, 10), "Thu"), false);

// ── Datoen skal være lokal, ikke UTC ────────────────────────────────────────
// Beskytter mod toISOString(): i dansk sommertid bliver midnat den 8. til kl. 22 den
// 7., og hele dagsfiltreringen ville rykke sig en dag — kun i sommerhalvåret.
er("isoDato er lokal i sommertid", isoDato(new Date(2026, 6, 8)), "2026-07-08");
er("isoDato er lokal i vintertid", isoDato(new Date(2026, 0, 8)), "2026-01-08");


// ── Ny startdato, når den gamle er løbet fra kladden ────────────────────────
//
// Det farlige er ikke datoen. Det er RYTMEN: startdatoen er ankeret, og for «hver 14.
// dag» tæller ugenPasser uger fra startdatoens mandag. Flytter man datoen én uge,
// skifter aftalen fra lige til ulige uger — og arket sagde «staar kun i lige uger» for
// halvdelen af kladderne.
{
  const idag = new Date(2026, 8, 21);          // mandag i uge 39, 2026
  const iMorgen = "2026-09-22";

  er("en gyldig startdato flyttes ikke",
    nyStartdatoHvisPasseret({ startDate: "2026-12-01", planInterval: "uge" }, idag), null);
  er("dags dato er stadig gyldig",
    nyStartdatoHvisPasseret({ startDate: "2026-09-21", planInterval: "uge" }, idag), null);
  er("uden startdato er der intet at flytte",
    nyStartdatoHvisPasseret({ planInterval: "uge" }, idag), null);

  er("hver uge flyttes til i morgen",
    nyStartdatoHvisPasseret({ startDate: "2026-09-07", planInterval: "uge" }, idag), iMorgen);

  // Uge 37 er ulige. En 14-dages aftale med anker i uge 37 kører i ulige uger, så den
  // næste gyldige uge fra i morgen (uge 39, ulige) er uge 39 selv.
  er("hver 14. dag beholder de ulige uger",
    nyStartdatoHvisPasseret({ startDate: "2026-09-07", planInterval: "14_dage" }, idag), "2026-09-22");
  // Uge 38 er lige. Så skal den frem til uge 40 — ikke uge 39.
  er("hver 14. dag beholder de lige uger",
    nyStartdatoHvisPasseret({ startDate: "2026-09-14", planInterval: "14_dage" }, idag), "2026-09-28");

  // Med det oprindelige anker MÅ den nye dato aldrig ændre, hvilke uger der køres.
  for (const [interval, gammel] of [["14_dage","2026-08-31"],["4_uger","2026-08-24"],["6_uger","2026-08-10"]]) {
    const ny = nyStartdatoHvisPasseret({ startDate: gammel, planInterval: interval }, idag);
    const ugerImellem = Math.round((mandagIUgen(new Date(ny)) - mandagIUgen(new Date(gammel))) / (7*24*3600*1000));
    const n = { "14_dage": 2, "4_uger": 4, "6_uger": 6 }[interval];
    er(`${interval}: rytmen er den samme (${gammel} → ${ny})`, ugerImellem % n, 0);
    er(`${interval}: den nye dato er i morgen eller senere`, ny >= iMorgen, true);
  }

  // Hver 3. måned følger dagen i måneden. 5. marts → næste gyldige er 5. december.
  er("hver 3. måned beholder dagen i måneden",
    nyStartdatoHvisPasseret({ startDate: "2026-03-05", planInterval: "3_maaned" }, idag), "2026-12-05");

  // En rytme, filen ikke kender, må ikke få den til at give op — så er i morgen svaret.
  er("ukendt rytme falder tilbage på i morgen",
    nyStartdatoHvisPasseret({ startDate: "2026-01-01", planInterval: "noget_nyt" }, idag), iMorgen);
}

// ── Resultat ────────────────────────────────────────────────────────────────

// ── Konkrete datoer ─────────────────────────────────────────────────────────
{
  const k = { planInterval: "konkrete_datoer", status: "aktiv", days: ["Mon"],
    startDate: "2026-10-14", expiryDate: "2027-01-02",
    konkreteDatoer: [{ dato: "2026-10-14", tid: "09:00", min: 120 }, { dato: "2026-10-17", tid: "", min: null },
                     { dato: "2027-01-02", tid: "10:30", min: 90 }, { dato: "", tid: "08:00" }] };
  er("konkret: onsdag 14.10 står på listen", aftaleKoererPaaDag(k, man(2026, 10, 14), "Wed"), true);
  er("konkret: ugedagen på aftalen ignoreres (mandag)", aftaleKoererPaaDag(k, man(2026, 10, 14), "Mon"), false);
  er("konkret: lørdag 17.10 (weekend) står på listen", aftaleKoererPaaDag(k, man(2026, 10, 17), "Sat"), true);
  er("konkret: onsdag ugen efter står ikke på listen", aftaleKoererPaaDag(k, man(2026, 10, 21), "Wed"), false);
  er("konkret: over årsskiftet (lør 2.1.2027)", aftaleKoererPaaDag(k, man(2027, 1, 2), "Sat"), true);
  er("konkret: kladde danner intet", aftaleKoererPaaDag({ ...k, status: "kladde" }, man(2026, 10, 14), "Wed"), false);
  er("konkret: fravalgt dag", aftaleKoererPaaDag({ ...k, excludedDays: ["2026-10-14"] }, man(2026, 10, 14), "Wed"), false);
  er("konkret: udgået før datoen", aftaleKoererPaaDag({ ...k, status: "udgaaet", cancelledEffectiveDate: "2026-10-15" }, man(2026, 10, 17), "Sat"), false);
  er("konkret: uden ugedage", aftaleKoererPaaDag({ ...k, days: [] }, man(2026, 10, 14), "Wed"), true);
  er("konkret: klokkeslæt og minutter pr. dato", konkretDato(k, "2026-10-14"), { dato: "2026-10-14", tid: "09:00", min: 120 });
  er("konkret: tom tid/min", konkretDato(k, "2026-10-17"), { dato: "2026-10-17", tid: "", min: null });
  er("rens: tomme ud, dubletter ud, sorteret",
    rensKonkreteDatoer([{ dato: "2026-11-02", tid: "8:00" }, { dato: "" }, { dato: "2026-10-01", min: "60" }, { dato: "2026-11-02", tid: "09:00" }]).map((d) => d.dato + "|" + d.tid + "|" + d.min),
    ["2026-10-01||60", "2026-11-02|09:00|null"]);
  er("konkret: startdato flyttes ikke", nyStartdatoHvisPasseret({ ...k, startDate: "2026-09-01" }, new Date(2026, 9, 1)), null);
  er("konkret: andre rytmer kender ikke listen", konkretDato({ ...k, planInterval: "uge" }, "2026-10-14"), null);
}

// ── Frit valgt antal uger og måneder (5.10.2026) ────────────────────────────
// Beskytter mod den fælde, CLAUDE.md beskriver: en værdi, reglen ikke kender, bliver
// til «hver uge» uden fejl. Hver værdi, formularen kan skrive, skal derfor kunne læses
// tilbage som præcis det antal, den blev skrevet med.
{
  for (let n = 1; n <= 52; n++) {
    const nk = intervalNoegle("uger", n);
    er(`uger ${n} læses tilbage`, ugerFra(nk), n);
    er(`uger ${n} er ikke en måned`, maanederFra(nk), null);
    er(`uger ${n}: valget gendannes`, intervalValg(nk), { art: "uger", n });
  }
  for (let n = 1; n <= 12; n++) {
    const nk = intervalNoegle("maaneder", n);
    er(`måneder ${n} læses tilbage`, maanederFra(nk), n);
    er(`måneder ${n} er ikke uger`, ugerFra(nk), null);
    er(`måneder ${n}: valget gendannes`, intervalValg(nk), { art: "maaneder", n });
  }
  // De gamle navne bevares for 1 og 2 uger og for de kendte værdier, så en gammel fane forstår dem.
  er("1 uge gemmes som «uge»", intervalNoegle("uger", 1), "uge");
  er("2 uger gemmes som «14_dage»", intervalNoegle("uger", 2), "14_dage");
  er("4 uger gemmes som «4_uger»", intervalNoegle("uger", 4), "4_uger");
  er("3 måneder gemmes som «3_maaned»", intervalNoegle("maaneder", 3), "3_maaned");
  er("ud over grænserne klemmes tallet", [intervalNoegle("uger", 99), intervalNoegle("maaneder", 99), intervalNoegle("uger", 0)], ["52_uger", "12_maaned", "uge"]);
  er("ukendt tekst er ikke en rytme", [ugerFra("3_dage"), maanederFra("13_maaned"), ugerFra("0_uger"), ugerFra(undefined)], [null, null, null, null]);
  er("konkrete datoer har sit eget valg", intervalValg(KONKRETE).art, "datoer");
  er("kvartal er 13 uger mellem besøg", ugerMellemBesoeg("3_maaned"), 13);
  er("14_dage er 2 uger mellem besøg", ugerMellemBesoeg("14_dage"), 2);

  // Hver 3. uge: kadencen tælles fra startdatoens mandag.
  const treUger = { days: ["Tue"], planInterval: intervalNoegle("uger", 3), startDate: "2026-10-06", status: "aktiv" };
  er("hver 3. uge: første", aftaleKoererPaaDag(treUger, man(2026, 10, 5), "Tue"), true);
  er("hver 3. uge: efter 1", aftaleKoererPaaDag(treUger, man(2026, 10, 12), "Tue"), false);
  er("hver 3. uge: efter 2", aftaleKoererPaaDag(treUger, man(2026, 10, 19), "Tue"), false);
  er("hver 3. uge: efter 3", aftaleKoererPaaDag(treUger, man(2026, 10, 26), "Tue"), true);
  // Hver 12. måned: ét besøg om året, samme uge hvert år.
  const aarlig = { days: ["Wed"], planInterval: intervalNoegle("maaneder", 12), startDate: "2026-03-04", status: "aktiv" };
  er("hver 12. måned: første", aftaleKoererPaaDag(aarlig, man(2026, 3, 2), "Wed"), true);
  er("hver 12. måned: et halvt år efter", aftaleKoererPaaDag(aarlig, man(2026, 9, 7), "Wed"), false);
  er("hver 12. måned: året efter", aftaleKoererPaaDag(aarlig, man(2027, 3, 1), "Wed"), true);
  // Ny startdato holder rytmen for et vilkårligt antal uger.
  const flyt = nyStartdatoHvisPasseret({ startDate: "2026-09-08", planInterval: "3_uger" }, new Date(2026, 9, 1));
  er("hver 3. uge: flyttet startdato ligger i de samme uger", ((Math.round((mandagIUgen(new Date(flyt)) - mandagIUgen(new Date("2026-09-08"))) / 6048e5)) % 3), 0);

  // Overblikket skal tælle det samme, som reglen danner.
  const ov = besoegIPeriode({ days: ["Tue"], planInterval: "4_uger", startDate: "2026-10-06", expiryDate: "2028-10-05" });
  er("overblik: 27 besøg på to år hver 4. uge (første og sidste tæller med)", ov.antal, 27);
  er("overblik: de første datoer", ov.foerste, ["2026-10-06", "2026-11-03", "2026-12-01", "2026-12-29"]);
  er("overblik: onsdag og fredag hver uge, én måned",
     besoegIPeriode({ days: ["Wed", "Fri"], planInterval: "uge", startDate: "2026-10-05", expiryDate: "2026-10-18" }).foerste,
     ["2026-10-07", "2026-10-09", "2026-10-14", "2026-10-16"]);
  er("overblik: uden slutdato intet", besoegIPeriode({ days: ["Tue"], planInterval: "uge", startDate: "2026-10-06" }).antal, 0);
  er("overblik: konkrete datoer tælles på listen",
     besoegIPeriode({ planInterval: KONKRETE, konkreteDatoer: [{ dato: "2026-11-03" }, { dato: "2026-12-15" }] }).antal, 2);
  er("tekst: hver 4. uge på tirsdag", beskrivRytme("4_uger", ["Tue"], "2026-10-06"), "Gentages hver 4. uge på tirsdag.");
  er("tekst: onsdag og fredag", beskrivRytme("uge", ["Wed", "Fri"], "2026-10-07"), "Gentages hver uge på onsdag og fredag.");
  er("tekst: hver 12. måned", beskrivRytme("12_maaned", ["Wed"], "2026-03-04"), "Gentages hver 12. måned, i den uge hvor den 4. falder, på onsdag.");
}

// ── «Aftales ved besøget» (6.10.2026) ───────────────────────────────────────
// Reglen kender kun første besøg; resten oprettes i hånden. Falder den tilbage på «hver uge», danner planen en opgave om ugen
// hos en kunde, der selv bestemmer datoen. Databasens kontrol skal kende værdien (ved_besoeg).
{
  er("formularen skriver ved_besoeg", intervalNoegle("besoeg", 1), "ved_besoeg");
  er("ved_besoeg læses tilbage som eget valg", intervalValg(VED_BESOEG), { art: "besoeg", n: 1 });
  er("ved_besoeg er hverken uger eller måneder", [ugerFra(VED_BESOEG), maanederFra(VED_BESOEG)], [null, null]);
  const vb = { days: ["Wed"], planInterval: VED_BESOEG, startDate: "2026-10-14", status: "aktiv" };
  er("første besøg dannes på startdatoen", aftaleKoererPaaDag(vb, man(2026, 10, 12), "Wed"), true);
  er("ikke dagen før", aftaleKoererPaaDag(vb, man(2026, 10, 12), "Tue"), false);
  er("ikke ugen efter", aftaleKoererPaaDag(vb, man(2026, 10, 19), "Wed"), false);
  er("ikke ugen før", aftaleKoererPaaDag(vb, man(2026, 10, 5), "Wed"), false);
  er("uden startdato dannes intet", aftaleKoererPaaDag({ ...vb, startDate: null }, man(2026, 10, 12), "Wed"), false);
  er("en kladde danner intet", aftaleKoererPaaDag({ ...vb, status: "kladde" }, man(2026, 10, 12), "Wed"), false);
  er("overblik: ét besøg", besoegIPeriode({ ...vb, expiryDate: "2027-10-13" }).antal, 1);
  er("passeret startdato flyttes ikke", nyStartdatoHvisPasseret(vb, new Date(2026, 11, 1)), null);
  er("tekst", beskrivRytme(VED_BESOEG, [], "2026-10-14"), "Første besøg er startdatoen. Næste besøg aftales ved hvert besøg.");
}

if (fejl > 0) {
  console.error(`\n  ${fejl} af ${koert} kontroller fejlede i aftalerytmen.\n`);
  process.exit(1);
}
console.log(`Aftalerytme: ${koert} kontroller i orden.`);
