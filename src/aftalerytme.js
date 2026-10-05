// Hvornår kører en aftale?
//
// Reglen lå inde i ensureWeekInstances og kunne kun bruges dér — altså kun til at
// DANNE opgaver. Da aktive aftaler blev redigerbare, opstod det modsatte behov:
// skifter man rytme fra hver uge til hver 4. uge, skal de opgaver, der ikke passer
// længere, ryddes væk. To steder, der skal svare det samme på «kører aftalen den
// dag?», og som ikke må kunne blive uenige — så ligger reglen her, ét sted.
//
// Ændrer du noget her, så ret aftalerytme.test.mjs i samme ombæring.

const DAG_TIL_INDEKS = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
export const DAG_FRA_INDEKS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// Intervallet står i databasen som en tekst, og NU kan antallet vælges frit (5.10.2026):
//   uge, 14_dage, N_uger   hver N. uge, 1-52. «uge» og «14_dage» er de gamle navne for 1
//                          og 2 og bliver ved at blive skrevet, så en browserfane med den
//                          gamle kode stadig forstår de to hyppigste rytmer.
//   N_maaned               hver N. måned, 1-12, efter kalenderen.
//   maaned                 gammel værdi, behandles som fire uger.
//
// Står en ukendt værdi her, falder reglen tilbage på «hver uge» uden fejl og uden
// advarsel — det er den fælde, CLAUDE.md beskriver. Derfor går ALT, hvad formularen kan
// skrive, gennem intervalNoegle() herunder, og testen kører hver mulig værdi igennem.
const GAMLE_UGER = { uge: 1, "14_dage": 2, maaned: 4 };

// Uger mellem besøgene, eller null hvis intervallet ikke tælles i uger.
export function ugerFra(planInterval) {
  if (Object.hasOwn(GAMLE_UGER, planInterval)) return GAMLE_UGER[planInterval];
  const m = /^(\d{1,2})_uger$/.exec(String(planInterval || ""));
  const n = m ? Number(m[1]) : 0;
  return n >= 1 && n <= 52 ? n : null;
}

// Måneder mellem besøgene, eller null hvis intervallet ikke tælles i måneder.
export function maanederFra(planInterval) {
  const m = /^(\d{1,2})_maaned$/.exec(String(planInterval || ""));
  const n = m ? Number(m[1]) : 0;
  return n >= 1 && n <= 12 ? n : null;
}

// Fra formularens valg til den tekst, der gemmes. art: "uger" | "maaneder".
export function intervalNoegle(art, n) {
  const antal = Math.round(Number(n)) || 1;
  if (art === "maaneder") return `${Math.min(12, Math.max(1, antal))}_maaned`;
  const uger = Math.min(52, Math.max(1, antal));
  return uger === 1 ? "uge" : uger === 2 ? "14_dage" : `${uger}_uger`;
}

// Den modsatte vej: fra den gemte tekst til formularens valg.
export function intervalValg(planInterval) {
  if (planInterval === KONKRETE) return { art: "datoer", n: 1 };
  const m = maanederFra(planInterval);
  if (m) return { art: "maaneder", n: m };
  return { art: "uger", n: ugerFra(planInterval) || 1 };
}

// Uger mellem to besøg som tal, til overslag. Et kvartal er 13 uger.
export function ugerMellemBesoeg(planInterval) {
  const m = maanederFra(planInterval);
  if (m) return (m * 52) / 12;
  return ugerFra(planInterval) || 1;
}

export function mandagIUgen(dato) {
  const d = new Date(dato.getFullYear(), dato.getMonth(), dato.getDate());
  const n = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - n);
  return d;
}

// Datoen som "YYYY-MM-DD" i LOKAL tid.
//
// toISOString() duer ikke: den regner om til UTC, og i dansk sommertid bliver
// midnat den 8. til klokken 22 den 7. Hele dagsfiltreringen ville rykke sig en dag
// i sommerhalvåret — og kun dér, hvilket er den værste slags fejl at lede efter.
export function isoDato(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Rammer aftalens kadence denne uge? Dage og datoer afgøres separat nedenfor.
function ugenPasser(tpl, ugensMandag) {
  const intervalMaaneder = maanederFra(tpl.planInterval);
  if (intervalMaaneder) {
    // «Hver 3. måned» planlægges efter KALENDERMÅNED — et kvartalsbesøg hører til en
    // bestemt tid på året, ikke til hver trettende uge. Uden startdato findes der
    // intet anker for kadencen.
    if (!tpl.startDate) return false;
    const start = new Date(tpl.startDate);
    const ugensSlut = new Date(ugensMandag);
    ugensSlut.setDate(ugensSlut.getDate() + 6);
    // En uge kan strække sig over to måneder, så begge prøves: ellers ville en
    // ultimo-dato som den 31. blive sprunget over, hver gang ugen lå hen over et
    // månedsskift. Datoen ligger i præcis én uge, så der dannes aldrig dubletter.
    for (const kand of [
      { y: ugensMandag.getFullYear(), m: ugensMandag.getMonth() },
      { y: ugensSlut.getFullYear(), m: ugensSlut.getMonth() },
    ]) {
      const maanederSidenStart =
        (kand.y - start.getFullYear()) * 12 + (kand.m - start.getMonth());
      if (maanederSidenStart < 0 || maanederSidenStart % intervalMaaneder !== 0) continue;
      const dageIMaaneden = new Date(kand.y, kand.m + 1, 0).getDate();
      const maal = new Date(kand.y, kand.m, Math.min(start.getDate(), dageIMaaneden));
      if (maal >= ugensMandag && maal <= ugensSlut) return true;
    }
    return false;
  }
  const uger = ugerFra(tpl.planInterval) || 1;
  if (uger === 1) return true;
  const anker = tpl.startDate ? mandagIUgen(new Date(tpl.startDate)) : ugensMandag;
  // Math.round og ikke heltalsdivision: mellem to mandage kan der ligge et
  // sommertidsskifte, og så er forskellen 7 døgn minus en time.
  const ugerSidenAnker = Math.round((ugensMandag - anker) / (7 * 24 * 60 * 60 * 1000));
  return ugerSidenAnker % uger === 0;
}

// ── Konkrete datoer (1.10.2026) ─────────────────────────────────────────────
// En aftale uden fast rytme: listen bestemmer selv, hvilke dage der er opgaver.
// Hver linje er { dato: "YYYY-MM-DD", tid: "HH:MM" | "", min: tal | null }.
// Ugedage, interval og udløbsdato betyder intet her — listen er hele reglen.
export const KONKRETE = "konkrete_datoer";

// Listen renset: uden tomme linjer, én linje pr. dato, sorteret. Bruges både, når
// aftalen gemmes, og når opgaverne dannes, så de to aldrig læser listen forskelligt.
export function rensKonkreteDatoer(liste) {
  const set = new Map();
  for (const d of Array.isArray(liste) ? liste : []) {
    if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(String(d.dato || ""))) continue;
    const min = Number(d.min);
    set.set(d.dato, { dato: d.dato, tid: d.tid || "", min: min > 0 ? Math.round(min) : null });
  }
  return [...set.values()].sort((a, b) => a.dato.localeCompare(b.dato));
}

// Linjen for en bestemt dato, eller null.
export function konkretDato(tpl, dagStr) {
  if (!tpl || tpl.planInterval !== KONKRETE) return null;
  return rensKonkreteDatoer(tpl.konkreteDatoer).find((d) => d.dato === dagStr) || null;
}

// Kører aftalen på netop denne dag?
//
// ugensMandag skal være mandagen i den uge, dagen ligger i. Den sendes med i stedet
// for at blive regnet ud her, fordi kalderen alligevel kender den — og fordi uge og
// år omkring årsskiftet ikke er til at regne tilbage fra en dato alene.
export function aftaleKoererPaaDag(tpl, ugensMandag, dagNoegle) {
  if (!tpl) return false;
  // En kladde er under udarbejdelse og må aldrig danne opgaver.
  //
  // Det samme gælder «slettes»: den er markeret til at blive fjernet efter en
  // gennemgang, og indtil nogen trykker slet, skal den opføre sig som om den
  // allerede var væk. Ellers ville en aftale, kontoret har afgjort skal ud,
  // blive ved med at lægge opgaver på en medarbejders plan imens — og det er
  // netop dubletter, statussen er lavet til at rydde.
  if (tpl.status === "kladde" || tpl.status === "slettes") return false;

  if (tpl.planInterval === KONKRETE) {
    const i = DAG_TIL_INDEKS[dagNoegle];
    if (i === undefined) return false;
    const dagDato = new Date(ugensMandag);
    dagDato.setDate(dagDato.getDate() + i);
    const dagStr = isoDato(dagDato);
    if (!konkretDato(tpl, dagStr)) return false;
    if (Array.isArray(tpl.excludedDays) && tpl.excludedDays.includes(dagStr)) return false;
    if (tpl.status === "udgaaet" && tpl.cancelledEffectiveDate
        && dagStr > String(tpl.cancelledEffectiveDate).slice(0, 10)) return false;
    return true;
  }

  if (!tpl.days || tpl.days.length === 0) return false;

  const dage = (tpl.days || [])
    .map((d) => (typeof d === "string" ? DAG_TIL_INDEKS[d] : d))
    .filter((d) => d !== undefined);
  const dagIndeks = DAG_TIL_INDEKS[dagNoegle];
  if (dagIndeks === undefined || !dage.includes(dagIndeks)) return false;

  if (tpl.expiryDate && ugensMandag > mandagIUgen(new Date(tpl.expiryDate))) return false;
  if (tpl.startDate && ugensMandag < mandagIUgen(new Date(tpl.startDate))) return false;
  if (!ugenPasser(tpl, ugensMandag)) return false;

  const dagDato = new Date(ugensMandag);
  dagDato.setDate(dagDato.getDate() + dagIndeks);
  const dagStr = isoDato(dagDato);

  // Enkeltdage, planlæggeren har taget ud af aftalen.
  if (Array.isArray(tpl.excludedDays) && tpl.excludedDays.includes(dagStr)) return false;
  if (tpl.startDate && dagStr < String(tpl.startDate).slice(0, 10)) return false;
  // En udgået aftale danner ingen opgaver efter ophørsdatoen. Opgaver til og med
  // datoen bliver stående og skal stadig køres og faktureres.
  if (tpl.status === "udgaaet" && tpl.cancelledEffectiveDate
      && dagStr > String(tpl.cancelledEffectiveDate).slice(0, 10)) return false;
  if (tpl.expiryDate && dagStr > String(tpl.expiryDate).slice(0, 10)) return false;

  return true;
}

// Flyt en startdato, der er løbet fra en kladde, frem til i morgen — uden at flytte
// rytmen med.
//
// 21.9.2026. En kladde, der har ligget i bunken et par uger, har en startdato, der er
// passeret, og så kan den ikke godkendes. Det rigtige er at foreslå en ny dato frem
// for at låse døren. Men «i morgen» er ikke altid det rigtige svar:
//
// Startdatoen er nemlig ANKERET for rytmen. For «hver 14. dag» tæller ugenPasser uger
// fra startdatoens mandag — så flytter man datoen én uge, skifter aftalen fra lige til
// ulige uger. Arket sagde «staar kun i lige uger» for halvdelen af kladderne, og et
// besøg, der pludselig ligger i de forkerte uger, er lige så forkert som intet besøg.
//
// Derfor: den nye dato er den FØRSTE dag fra i morgen, der holder rytmen.
//   hver uge          i morgen. Alle uger passer.
//   hver 14./4./6.    første dag fra i morgen, hvis uge har samme rest som den gamle.
//   hver 3. måned     samme dag i måneden, første gang den falder fra i morgen.
//   ukendt rytme      i morgen. Bedre end at lade være.
//
// Returnerer null, når datoen ikke behøver at flyttes.
export function nyStartdatoHvisPasseret(tpl, idag = new Date()) {
  if (!tpl || !tpl.startDate) return null;
  // Ved konkrete datoer er startdatoen bare den første dato på listen. Den flyttes
  // ikke: passerede datoer skal rettes eller fjernes på listen.
  if (tpl.planInterval === KONKRETE) return null;
  const nu = new Date(idag.getFullYear(), idag.getMonth(), idag.getDate());
  const start = new Date(tpl.startDate);
  if (isNaN(start.getTime())) return null;
  const startDag = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  if (startDag >= nu) return null;                 // datoen er stadig gyldig

  const imorgen = new Date(nu);
  imorgen.setDate(imorgen.getDate() + 1);

  const maaneder = maanederFra(tpl.planInterval);
  if (maaneder) {
    // Samme dag i måneden. Rammer datoen ikke i en kort måned (den 31.), tages
    // sidste dag i måneden — samme regel som ugenPasser bruger.
    const dag = startDag.getDate();
    const kandidat = new Date(imorgen.getFullYear(), imorgen.getMonth(), 1);
    for (let i = 0; i < 24; i++) {
      const dageIMaaneden = new Date(kandidat.getFullYear(), kandidat.getMonth() + 1, 0).getDate();
      const d = new Date(kandidat.getFullYear(), kandidat.getMonth(), Math.min(dag, dageIMaaneden));
      const siden = (d.getFullYear() - startDag.getFullYear()) * 12 + (d.getMonth() - startDag.getMonth());
      if (d >= imorgen && siden % maaneder === 0) return isoDato(d);
      kandidat.setMonth(kandidat.getMonth() + 1);
    }
    return isoDato(imorgen);
  }

  const uger = ugerFra(tpl.planInterval) || 1;
  if (uger === 1) return isoDato(imorgen);

  const anker = mandagIUgen(startDag);
  const d = new Date(imorgen);
  // Højst 7 × intervallet dage frem: så er hver mulig rest prøvet.
  for (let i = 0; i < uger * 7 + 7; i++) {
    const ugerSiden = Math.round((mandagIUgen(d) - anker) / (7 * 24 * 60 * 60 * 1000));
    if (ugerSiden % uger === 0) return isoDato(d);
    d.setDate(d.getDate() + 1);
  }
  return isoDato(imorgen);
}

// ── Overblik til formularen ─────────────────────────────────────────────────
// Besøgene regnes af SAMME regel, som danner opgaverne (aftaleKoererPaaDag), og ikke af en
// kopi i formularen. En kopi kunne vise 26 besøg, mens appen dannede 6.
// Returnerer { antal, foerste: ["YYYY-MM-DD", ...] }.
export function besoegIPeriode(tpl, maksFoerste = 4) {
  const t = { ...tpl, status: "aktiv", excludedDays: [] };
  if (t.planInterval === KONKRETE) {
    const liste = rensKonkreteDatoer(t.konkreteDatoer);
    return { antal: liste.length, foerste: liste.slice(0, maksFoerste).map((d) => d.dato) };
  }
  if (!t.startDate || !t.expiryDate) return { antal: 0, foerste: [] };
  const slut = new Date(t.expiryDate);
  let mandag = mandagIUgen(new Date(t.startDate));
  const foerste = [];
  let antal = 0;
  // Op til tre år, så en forkert slutdato ikke kan hænge formularen.
  for (let u = 0; u < 160 && mandag <= slut; u++) {
    for (const dag of DAG_FRA_INDEKS) {
      if (!aftaleKoererPaaDag(t, mandag, dag)) continue;
      antal++;
      if (foerste.length < maksFoerste) {
        const d = new Date(mandag);
        d.setDate(d.getDate() + DAG_TIL_INDEKS[dag]);
        foerste.push(isoDato(d));
      }
    }
    mandag = new Date(mandag);
    mandag.setDate(mandag.getDate() + 7);
  }
  return { antal, foerste };
}

const DAGENAVN = { Mon: "mandag", Tue: "tirsdag", Wed: "onsdag", Thu: "torsdag", Fri: "fredag", Sat: "lørdag", Sun: "søndag" };

// «Hver 4. uge på tirsdag» — sætningen under valgene. Samme tekst på formular og i test.
export function beskrivRytme(planInterval, dage, startDate) {
  const valg = intervalValg(planInterval);
  if (valg.art === "datoer") return "Kun de datoer, du har valgt. Ugedage og slutdato bruges ikke.";
  const navne = (dage || []).map((d) => DAGENAVN[d]).filter(Boolean);
  const dagetekst = navne.length < 2 ? navne.join("") : navne.slice(0, -1).join(", ") + " og " + navne[navne.length - 1];
  if (valg.art === "maaneder") {
    const dato = startDate ? new Date(startDate).getDate() : null;
    const hver = valg.n === 1 ? "hver måned" : `hver ${valg.n}. måned`;
    return `Gentages ${hver}${dato ? `, i den uge hvor den ${dato}. falder` : ""}${dagetekst ? `, på ${dagetekst}` : ""}.`;
  }
  const hver = valg.n === 1 ? "hver uge" : `hver ${valg.n}. uge`;
  return `Gentages ${hver}${dagetekst ? ` på ${dagetekst}` : ""}.`;
}
