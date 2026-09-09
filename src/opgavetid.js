// Hvor lang tid gik der på en opgave — og hvor meget af den må kunden betale for.
//
// Det er to forskellige tal, og de var ét indtil nu. Systemet lagde hele time_log
// sammen og brugte summen til både løn, fakturering og afvigelser. Det holdt, så
// længe der var én medarbejder på en opgave.
//
// Det holder ikke længere: sætter man to på til oplæring på en opgave til to timer,
// bliver registreret tid seks timer. Så ville kunden få en faktura på seks timer for
// noget, hun har bestilt to timers rengøring til — og Kundetimer ville vise et
// overforbrug på fire timer, hver eneste gang nogen blev lært op.
//
// Reglen ligger her og ikke ude i skærmbillederne, fordi der er tolv steder i
// planlægningsappen, der spørger om det samme tal. Skrives filteret tolv steder,
// bliver det glemt ét sted — og så viser ét skærmbillede seks timer, mens de andre
// viser to. Uenighed mellem to tal, der burde være det samme, er præcis det, der
// startede hele timediskussionen.
//
// Ændrer du noget her, så ret opgavetid.test.mjs i samme ombæring.

// Tidslinjen på en opgave, uanset hvor den kommer fra i databasen.
function loggen(opgave) {
  const tl = opgave?.timeLog ?? opgave?.time_log ?? [];
  return Array.isArray(tl) ? tl : [];
}

// Hvem er med for at lære på netop denne opgave.
//
// Tom liste er det normale. Kolonnen står som '[]' i databasen, men en gammel række
// kan være null, og et manglende felt må ikke få opgaven til at fejle.
export function oplaeringsFolk(opgave) {
  const liste = opgave?.oplaeringMedarbejdere ?? opgave?.oplaering_medarbejdere ?? [];
  if (!Array.isArray(liste)) return [];
  return liste.filter((x) => typeof x === "string" && x.trim());
}

export function erUnderOplaering(opgave, empId) {
  if (!empId) return false;
  return oplaeringsFolk(opgave).includes(empId);
}

// Al registreret tid. Det her er LØNNENS tal — alle der har været der, har
// arbejdet, også dem der var med for at lære.
export function registreredeMinutter(opgave) {
  return loggen(opgave).reduce((sum, l) => sum + (Number(l?.minutes) || 0), 0);
}

// Én medarbejders egen registrerede tid på opgaven.
export function minutterFor(opgave, empId) {
  return loggen(opgave)
    .filter((l) => l?.empId === empId)
    .reduce((sum, l) => sum + (Number(l?.minutes) || 0), 0);
}

// Det kunden må betale for.
//
// Alt undtagen dem, der var med for at lære. Kontorets egne registreringer
// (empId "planner") tæller MED: de bruges til forgæves besøg, hvor kontoret har
// besluttet, at kunden skal betale alligevel, og det er stadig en beslutning om
// fakturering.
export function fakturerbareMinutter(opgave) {
  const elever = oplaeringsFolk(opgave);
  if (elever.length === 0) return registreredeMinutter(opgave);
  return loggen(opgave)
    .filter((l) => !elever.includes(l?.empId))
    .reduce((sum, l) => sum + (Number(l?.minutes) || 0), 0);
}

// Den tid der gik med oplæring. Forskellen mellem de to tal ovenfor.
//
// Findes for at kunne svare på "hvor mange timer brugte vi på oplæring i august" —
// et spørgsmål systemet ikke kunne besvare før, fordi tallet var gemt inde i
// fakturagrundlaget.
export function oplaeringsMinutter(opgave) {
  return registreredeMinutter(opgave) - fakturerbareMinutter(opgave);
}

// Hvem er sat på opgaven.
function folkPaa(opgave) {
  const a = opgave?.assignees;
  return Array.isArray(a) ? a.filter((x) => typeof x === "string" && x) : [];
}

// Fordelingen af tid mellem dem der er på opgaven: {medarbejder: minutter}.
//
// Tom er det normale og betyder "alle bruger duration". Sådan har det virket for
// alle opgaver indtil nu, og sådan bliver det ved med at virke, hvis ingen fordeler.
export function fordelingen(opgave) {
  const f = opgave?.tidFordeling ?? opgave?.tid_fordeling ?? {};
  if (!f || typeof f !== "object" || Array.isArray(f)) return {};
  const ud = {};
  for (const [id, min] of Object.entries(f)) {
    const n = Number(min);
    if (id && Number.isFinite(n) && n > 0) ud[id] = Math.round(n);
  }
  return ud;
}

export function harFordeling(opgave) {
  return Object.keys(fordelingen(opgave)).length > 0;
}

// Hvor lang tid ÉN medarbejder er planlagt til på opgaven.
//
// Er der fordelt, gælder hendes egen andel. Er der ikke, gælder opgavens varighed —
// den er pr. person, så det er stadig det rigtige svar.
export function planlagtFor(opgave, empId) {
  const f = fordelingen(opgave);
  if (empId && f[empId] != null) return f[empId];
  return Number(opgave?.duration) || 0;
}

// Den planlagte tid der SKAL faktureres.
//
// duration er tiden PR. PERSON, ikke for hele opgaven. To der gør rent i to timer
// hver, har leveret fire timers arbejde, og det er de fire kunden betaler.
//
// Elever tælles ikke med: de er der for at lære, og deres tid når aldrig fakturaen.
// Er alle på opgaven elever, er der intet planlagt fakturerbart arbejde.
export function planlagtFakturerbart(opgave) {
  const folk = folkPaa(opgave);
  const elever = oplaeringsFolk(opgave);
  const leverer = folk.filter((id) => !elever.includes(id));
  // Ingen tildelt endnu: så er det den ene planlagte portion, der er meningen.
  if (folk.length === 0) return Number(opgave?.duration) || 0;
  return leverer.reduce((sum, id) => sum + planlagtFor(opgave, id), 0);
}

// Alt planlagt arbejde på opgaven, også elevernes. Det er dét, der optager tid i
// kalenderen og i medarbejdernes kapacitet — en elev fylder en dag som alle andre.
export function planlagtIAlt(opgave) {
  const folk = folkPaa(opgave);
  if (folk.length === 0) return Number(opgave?.duration) || 0;
  return folk.reduce((sum, id) => sum + planlagtFor(opgave, id), 0);
}

// Afvigelsen mod det aftalte.
//
// To ting skal være rigtige her, og begge er blevet rettet efter at have været gale:
//
//   1. Der måles mod FAKTURERBAR tid og ikke mod al registreret tid. Ellers ville en
//      oplæringsdag altid se ud som et voldsomt overforbrug.
//
//   2. Der måles mod planlagt tid for HELE holdet og ikke mod én persons portion.
//      Det var en rigtig fejl i Kundetimer: to medarbejdere à to timer, der begge
//      gjorde præcis som planlagt, stod som to timers merforbrug — og kunden lå
//      øverst på listen over dem, kontoret skulle ringe til. Der var intet at ringe om.
export function afvigelse(opgave) {
  return fakturerbareMinutter(opgave) - planlagtFakturerbart(opgave);
}
