// Regnestykkerne bag lønnen.
//
// Hvorfor de ligger her og ikke inde i skærmbilledet: det er de eneste beregninger i
// systemet, hvor en fejl bliver til penge på en lønseddel. Alt andet kan man se er
// galt. Et forkert beløb her opdages først, når nogen kigger på sin løn — og så er
// pengene udbetalt.
//
// Funktionerne tager tal ind og giver tal ud. De rører hverken database, React eller
// browser, og det er hele pointen: så kan de afprøves med loenberegning.test.mjs, der
// kører ved hvert build.
//
// Ændrer du noget her, så ret testen i samme ombæring. Testen er ikke pynt — den er
// det eneste, der står mellem en tastefejl og en forkert udbetaling.

// Danske decimaltal. Danløn læser dansk format, og et punktum ville blive læst som
// tusindtalsskilletegn: 45.50 timer ville blive til 4550.
export function talDk(n, decimaler) {
  return Number(n).toFixed(decimaler).replace(".", ",");
}

// Procenten for en medarbejder. Hendes egen vinder over den fælles.
//
// null betyder "brug den fælles" — ikke "nul procent". De to skal kunne skelnes,
// ellers ville et tomt felt stille fjerne tillægget i stedet for at arve det.
export function gaeldendePct(egen, faelles) {
  if (egen !== null && egen !== undefined && egen !== "") {
    const n = Number(egen);
    return Number.isFinite(n) ? n : 0;
  }
  const n = Number(String(faelles ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

// Samler én medarbejders måned.
//
// linjer er de GODKENDTE timelinjer. Filtreringen sker uden for den her funktion,
// fordi "hvad er godkendt" er en beslutning og ikke et regnestykke.
export function samletForMedarbejder({ linjer = [], kmRaekker = [] }) {
  let minutter = 0, loen = 0, weekendMinutter = 0, weekendLoen = 0, km = 0;

  for (const l of linjer) {
    minutter += l.registreretMinutter || 0;
    loen += l.registreretLoen || 0;
    // Weekendtimernes løn holdes for sig. Tillægget regnes KUN af dem — ikke af
    // hele måneden.
    if (l.erWeekend) {
      weekendMinutter += l.registreretMinutter || 0;
      weekendLoen += l.registreretLoen || 0;
    }
  }
  for (const k of kmRaekker) km += Number(k.km) || 0;

  return { minutter, loen, weekendMinutter, weekendLoen, km };
}

// Bygger de linjer, der skal i Danløn-filen for én medarbejder.
//
// Op til fire: timer med beløb, weekendtillæg, kilometer og søn- og helligdags-
// betaling. Kun de linjer, der er noget at sende på.
//
// Rækkefølgen er ikke tilfældig: SH regnes til sidst, fordi weekendtillægget skal
// være lagt til grundlaget først.
export function danloenLinjer({ medarbejder, samlet, loenart }) {
  const linjer = [];
  const nr = medarbejder.danloenNr;
  const navn = medarbejder.name;
  if (!nr) return linjer;   // Uden nummer ved vi ikke hvem linjen hører til.

  let tillaeg = 0;

  if (loenart.loenart_timer && samlet.minutter > 0) {
    linjer.push([nr, navn, loenart.loenart_timer,
                 talDk(samlet.minutter / 60, 2), talDk(samlet.loen, 2)]);
  }

  // Weekendtillæg: procent af lønnen for timerne lørdag og søndag.
  if (loenart.loenart_weekend && medarbejder.weekendTillaeg && samlet.weekendLoen > 0) {
    const pct = gaeldendePct(medarbejder.weekendPctEgen, loenart.weekend_pct);
    if (pct > 0) {
      tillaeg = samlet.weekendLoen * (pct / 100);
      linjer.push([nr, navn, loenart.loenart_weekend,
                   talDk(samlet.weekendMinutter / 60, 2), talDk(tillaeg, 2)]);
    }
  }

  // Kilometer uden beløb. Satsen sættes i Danløn, som også selv skifter til den lave
  // sats ved 20.000 km om året. To steder med hver sin sats bliver til to
  // forskellige udbetalinger.
  if (loenart.loenart_km && samlet.km > 0) {
    linjer.push([nr, navn, loenart.loenart_km, talDk(samlet.km, 1), ""]);
  }

  // Søn- og helligdagsbetaling: procent af MÅNEDENS løn. Grundlaget er timelønnen
  // plus weekendtillægget — altså det hun faktisk tjener. Kilometerpenge er IKKE
  // med: de er godtgørelse af en udgift, ikke løn for arbejde.
  if (loenart.loenart_sh && medarbejder.shBetaling) {
    const pct = gaeldendePct(medarbejder.shPctEgen, loenart.sh_pct);
    const grundlag = samlet.loen + tillaeg;
    if (pct > 0 && grundlag > 0) {
      linjer.push([nr, navn, loenart.loenart_sh, "", talDk(grundlag * (pct / 100), 2)]);
    }
  }

  return linjer;
}

// CSV til Danløn. Semikolon, fordi tallene selv indeholder komma.
export function danloenCsv(linjer) {
  const hoved = ["medarbejdernr", "navn", "loenart", "antal", "beloeb"];
  return [hoved, ...linjer]
    .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";"))
    .join("\n");
}

// ── Kundetimer ──────────────────────────────────────────────────────────────
//
// Over- og underforbrug tælles HVER FOR SIG. Blev fortegnene lagt sammen, endte en
// kunde med +4t på ét besøg og −4t på et andet på nul og så ud som om alt passede —
// selvom der lå to store afvigelser at forklare.
export function afvigelserPrKunde(besoeg = []) {
  const kunder = new Map();
  for (const b of besoeg) {
    if (!b.afvigelse) continue;
    if (!kunder.has(b.kunde)) {
      kunder.set(b.kunde, { navn: b.kunde, over: 0, under: 0, netto: 0,
                            udenBegrundelse: 0, besoeg: [] });
    }
    const k = kunder.get(b.kunde);
    if (b.afvigelse > 0) k.over += b.afvigelse; else k.under += -b.afvigelse;
    k.netto += b.afvigelse;
    if (b.afvigelse > 0 && !b.begrundelse) k.udenBegrundelse++;
    k.besoeg.push(b);
  }
  // Størst samlet afvigelse først — uanset hvilken vej den går.
  return [...kunder.values()].sort(
    (a, b) => (b.over + b.under) - (a.over + a.under) || a.navn.localeCompare(b.navn, "da"));
}
