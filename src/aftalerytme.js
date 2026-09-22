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

// 'maaned' står stadig i listen, fordi der kan ligge gamle rækker med den værdi.
// De behandles som fire uger — det samme som den knap, de nu svarer til.
const UGEINTERVAL = { uge: 1, "14_dage": 2, "4_uger": 4, "6_uger": 6, maaned: 4 };
const MAANEDSINTERVAL = { "3_maaned": 3 };

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
  const intervalMaaneder = MAANEDSINTERVAL[tpl.planInterval];
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
  const uger = UGEINTERVAL[tpl.planInterval] || 1;
  if (uger === 1) return true;
  const anker = tpl.startDate ? mandagIUgen(new Date(tpl.startDate)) : ugensMandag;
  // Math.round og ikke heltalsdivision: mellem to mandage kan der ligge et
  // sommertidsskifte, og så er forskellen 7 døgn minus en time.
  const ugerSidenAnker = Math.round((ugensMandag - anker) / (7 * 24 * 60 * 60 * 1000));
  return ugerSidenAnker % uger === 0;
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
  const nu = new Date(idag.getFullYear(), idag.getMonth(), idag.getDate());
  const start = new Date(tpl.startDate);
  if (isNaN(start.getTime())) return null;
  const startDag = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  if (startDag >= nu) return null;                 // datoen er stadig gyldig

  const imorgen = new Date(nu);
  imorgen.setDate(imorgen.getDate() + 1);

  const maaneder = MAANEDSINTERVAL[tpl.planInterval];
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

  const uger = UGEINTERVAL[tpl.planInterval] || 1;
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
