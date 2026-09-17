// Ligger der allerede en aftale på den adresse?
//
// Kom til 17.9.2026, da to medarbejderes håndholdte ruteplaner blev læst ind som
// 45 kladder. 38 af dem var aftaler, systemet havde i forvejen. Kontoret skulle
// kunne se det på listen — ikke først når de åbnede hver enkelt kladde.
//
// Reglen regnes LIVE og ikke skrevet ind i en kolonne ved indlæsningen. To grunde:
// markeringen forsvinder af sig selv, når dubletten er ryddet, og den fanger også
// dubletter, ingen indlæsning har lavet — to der taster den samme kunde ind samme
// dag er den næste, der sker.
//
// Ændrer du noget her, så ret dubletter.test.mjs i samme ombæring.

// Adressen skåret ned til vejnavn og husnummer.
//
// «C.O.Jensensvej 1, Brovst» og «C O Jensensvej 1, 9460 Brovst» er den samme
// adresse skrevet af to personer. Punktummer, dobbelte mellemrum, postnummer og
// store bogstaver må ikke kunne skjule en dublet.
export function adressenoegle(adresse) {
  const raa = String(adresse || "").split(",")[0];
  const rent = raa
    .toLowerCase()
    .replace(/[^a-zæøå0-9]+/g, " ")
    .trim();
  if (!rent) return "";
  const vej = (rent.match(/[a-zæøå]{4,}/g) || []).join("");
  const nr = (rent.match(/\d+[a-z]?/) || [""])[0];
  // Uden både et vejnavn og et husnummer er der ikke nok til at sige noget.
  // «Fjerritslev» alene må aldrig gøre tyve aftaler til dubletter af hinanden.
  return vej && nr ? vej + " " + nr : "";
}

// En aftale tæller ikke med som mulig dublet, hvis den selv er på vej ud.
const UDE = ["udgaaet", "slettes"];

// Samme adresse er IKKE nok.
//
// Første udgave markerede alene på adressen, og det gav 81 markeringer på aftaler,
// der var helt i orden: BHJ har tre forskellige rengøringer på Egevej 49, Davidsen
// har tre på Vesterhavsparken, og på Postvænget 2 bor der både en borger med en
// kommunal ordning og en privatkunde. En markering, der lyser på 81 rigtige
// aftaler, holder folk op med at læse — og så virker den heller ikke den dag, den
// har ret.
//
// To aftaler er mistænkelige, når de er samme adresse, samme ugedag OG samme
// varighed. Rytmen tælles bevidst IKKE med: de indlæste kladder har en rytme, der
// er gættet ud fra hvilke faner adressen stod i, og kræver man også den, smutter
// netop de dubletter, markeringen er lavet til at fange.
function overlapperDag(a, b) {
  const da = a.days || [];
  const db = b.days || [];
  return da.some((d) => db.includes(d));
}

function sammeVarighed(a, b) {
  return Number(a.duration) > 0 && Number(a.duration) === Number(b.duration);
}

// Kun kladder får mærket.
//
// 17.9.2026: markeringen stod i første omgang på alle aftaler, og det var forkert
// sted at have den. De aktive aftaler er gennemgået og i drift — står der «ser ud
// som dublet» på en af dem, sår det tvivl om noget, kontoret allerede har taget
// stilling til. Bunken, der SKAL gennemgås, er kladderne fra de indlæste ruteplaner.
//
// De aktive aftaler tæller stadig med som modpart: en kladde er netop en dublet,
// fordi der allerede ligger en rigtig aftale på adressen. Det er kun selve mærket,
// der er flyttet over på kladden — den, nogen skal træffe en beslutning om.
const MARKERES = "kladde";

// Returnerer en Map: kladde-id → de øvrige aftaler, den ligner (kladder såvel som
// aktive). En aftale, der selv er udgået eller markeret til sletning, tæller
// hverken med eller får en markering — dubletten er jo netop på vej væk.
export function findDubletter(templates = []) {
  const efterNoegle = new Map();
  (templates || []).forEach((t) => {
    if (!t || UDE.includes(t.status)) return;
    const n = adressenoegle(t.address || t.address_text);
    if (!n) return;
    if (!efterNoegle.has(n)) efterNoegle.set(n, []);
    efterNoegle.get(n).push(t);
  });

  const ud = new Map();
  efterNoegle.forEach((gruppe) => {
    if (gruppe.length < 2) return;
    gruppe.forEach((t) => {
      if (t.status !== MARKERES) return;
      const ligner = gruppe.filter(
        (a) => a.id !== t.id && overlapperDag(t, a) && sammeVarighed(t, a));
      if (ligner.length) ud.set(t.id, ligner);
    });
  });
  return ud;
}
