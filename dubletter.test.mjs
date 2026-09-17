// Tests af dubletmarkeringen. Køres ved hvert build.
//
// Hvad de beskytter mod: en markering, der lyver, er værre end ingen markering.
// Siger den «dublet» på en aftale, der ikke er det, sletter nogen en rigtig aftale
// — og så mangler kunden sin rengøring. Siger den intet på en aftale, der ER en
// dublet, står kunden med to besøg og to regninger.
//
// Det farlige sted er adressesammenligningen. For løs, og alt i Fjerritslev bliver
// dubletter af hinanden. For stram, og «C.O.Jensensvej 1» rammer ikke
// «C O Jensensvej 1».

import { adressenoegle, findDubletter } from "./src/dubletter.js";

let fejl = 0, koert = 0;
function er(hvad, faktisk, forventet) {
  koert++;
  if (JSON.stringify(faktisk) !== JSON.stringify(forventet)) {
    fejl++;
    console.error(`  ✗ ${hvad}\n      fik       ${JSON.stringify(faktisk)}\n      forventet ${JSON.stringify(forventet)}`);
  }
}

// ── Adressenøglen ───────────────────────────────────────────────────────────
er("samme adresse skrevet af to personer",
   adressenoegle("C.O.Jensensvej 1, Brovst"), adressenoegle("C O Jensensvej 1, 9460 Brovst"));
er("postnummer med eller uden",
   adressenoegle("Klausholmvej 56, Øland"), adressenoegle("Klausholmvej 56, 9460 Øland"));
er("store og små bogstaver",
   adressenoegle("KLAUSHOLMVEJ 56"), adressenoegle("klausholmvej 56"));
er("husnummer med bogstav bevares",
   adressenoegle("Rugmarken 22b, Fjerritslev"), "rugmarken 22b");

// Firmanavnet foran adressen må ikke skjule adressen. Det var sådan de indlæste
// ruteplaner skrev dem, og BHJ og Davidsen ligger der i forvejen som aktive.
er("firmanavn foran adressen",
   adressenoegle("BHJ, Egevej 49, Løkken"), adressenoegle("Egevej 49, 9480 Løkken"));
er("firmanavn uden mellemrum",
   adressenoegle("Davidsen Hune,Vesterhavsparken 2,Hune"), adressenoegle("Vesterhavsparken 2, 9492 Blokhus"));
er("etage og lejlighed efter adressen",
   adressenoegle("Postvænget 2, 2. sal. lejl. 3, Aabybro"), adressenoegle("Postvænget 2, 2. 3, 9440 Aabybro"));
er("postnummer og by alene er ikke en adresse",
   adressenoegle("Fælleshuset, 9460 Brovst"), "");

// Og det, der IKKE må smelte sammen:
er("nabonumre er ikke det samme",
   adressenoegle("Skovbrynet 77") === adressenoegle("Skovbrynet 83"), false);
er("22b og 24b er ikke det samme",
   adressenoegle("Rugmarken 22b") === adressenoegle("Rugmarken 24b"), false);
er("to veje i samme by er ikke det samme",
   adressenoegle("Parkvej 24, Fjerritslev") === adressenoegle("Parkvænget 24, Fjerritslev"), false);

// Uden husnummer er der ikke nok til at sige noget. Ellers ville enhver aftale i
// Fjerritslev uden nummer blive dublet af alle de andre.
er("kun en by giver ingen nøgle", adressenoegle("Fjerritslev"), "");
er("tom adresse giver ingen nøgle", adressenoegle(""), "");
er("intet giver ingen nøgle", adressenoegle(null), "");
er("kun et nummer giver ingen nøgle", adressenoegle("42"), "");

// ── Selve fundet ────────────────────────────────────────────────────────────
const t = (id, address, status = "kladde", days = ["Mon"], duration = 60) =>
  ({ id, address, status, title: id, days, duration });

{
  const d = findDubletter([
    t("a", "Klausholmvej 56, Øland"),
    t("b", "Klausholmvej 56, 9460 Øland"),
    t("c", "Udklitvej 155, Fjerritslev"),
  ]);
  er("de to på samme adresse peger på hinanden", [d.get("a").map(x=>x.id), d.get("b").map(x=>x.id)], [["b"], ["a"]]);
  er("den alene får ingen markering", d.has("c"), false);
}

// ── Mærket hører kun til i kladdeoversigten ─────────────────────────────────
// De aktive aftaler er gennemgået og i drift. Et «ser ud som dublet» på en af dem
// sår tvivl om noget, kontoret allerede har afgjort. Bunken, der skal gennemgås,
// er kladderne fra de indlæste ruteplaner — så det er dem, mærket sidder på.
{
  const d = findDubletter([
    t("aktiv1", "Bejstrupvej 72", "aktiv"),
    t("aktiv2", "Bejstrupvej 72", "aktiv"),
  ]);
  er("to aktive aftaler får ingen markering", d.size, 0);
}
// Men en aktiv aftale er stadig en gyldig modpart: det er netop dét, der gør
// kladden til en dublet.
{
  const d = findDubletter([
    t("gammel", "Bejstrupvej 72", "aktiv"),
    t("indlaest", "Bejstrupvej 72", "kladde"),
  ]);
  er("kun kladden markeres", [...d.keys()], ["indlaest"]);
  er("men den peger på den aktive", d.get("indlaest").map((x) => x.id), ["gammel"]);
}

// En udgået aftale gør ikke en ny til dublet — den er jo netop afløst.
{
  const d = findDubletter([
    t("gammel", "Klausholmvej 56, Øland", "udgaaet"),
    t("ny", "Klausholmvej 56, Øland", "kladde"),
  ]);
  er("en udgået aftale gør ikke den nye til dublet", d.size, 0);
}

// Det samme for en, der allerede er markeret til sletning: så ER dubletten på vej
// væk, og den tilbageværende skal ikke stå og se forkert ud.
{
  const d = findDubletter([
    t("beholdes", "Klausholmvej 56, Øland"),
    t("paavej", "Klausholmvej 56, Øland", "slettes"),
  ]);
  er("en aftale markeret til sletning tæller ikke med", d.size, 0);
}

// Tre på samme adresse: hver af dem skal kende de to andre.
{
  const d = findDubletter([
    t("x", "Spurvevej 8, Fjerritslev"),
    t("y", "Spurvevej 8, Fjerritslev"),
    t("z", "Spurvevej 8, Fjerritslev"),
  ]);
  er("tre på samme adresse", [d.get("x").length, d.get("y").length, d.get("z").length], [2, 2, 2]);
}

// En aftale uden adresse kan ikke sammenlignes og må ikke markeres.
{
  const d = findDubletter([t("u1", ""), t("u2", null), t("u3", "Fjerritslev")]);
  er("aftaler uden brugbar adresse markeres ikke", d.size, 0);
}

// ── Samme adresse er ikke nok ───────────────────────────────────────────────
// Første udgave markerede alene på adressen. Det gav 81 markeringer på aftaler,
// der var helt i orden: BHJ har tre forskellige rengøringer på Egevej 49, og på
// Postvænget 2 bor der både en borger med kommunal ordning og en privatkunde.
{
  const d = findDubletter([
    t("bhj1", "Egevej 49, Brovst", "kladde", ["Fri"], 150),
    t("bhj2", "Egevej 49, Brovst", "kladde", ["Fri"], 60),
    t("bhj3", "Egevej 49, Brovst", "kladde", ["Tue"], 150),
  ]);
  er("tre forskellige rengøringer på samme adresse er ikke dubletter", d.size, 0);
}
{
  const d = findDubletter([
    t("borger", "Postvænget 2, Brovst", "kladde", ["Tue"], 20),
    t("privat", "Postvænget 2, Brovst", "kladde", ["Tue"], 90),
  ]);
  er("samme dag men forskellig varighed er ikke dublet", d.size, 0);
}
{
  const d = findDubletter([
    t("a", "Fælledvej 2b", "kladde", ["Fri"], 30),
    t("b", "Fælledvej 2b", "kladde", ["Fri"], 45),
  ]);
  er("30 og 45 minutter er to forskellige opgaver", d.size, 0);
}

// Det den SKAL fange: samme adresse, samme dag, samme varighed.
{
  const d = findDubletter([
    t("gammel", "Bejstrupvej 72, Fjerritslev", "aktiv", ["Mon"], 120),
    t("indlaest", "Bejstrupvej 72, Fjerritslev", "kladde", ["Mon"], 120),
  ]);
  er("samme adresse, dag og varighed er en dublet", [...d.keys()], ["indlaest"]);
}
// Rytmen tælles bevidst ikke med: de indlæste kladder har en gættet rytme, og
// kræver man også den, smutter netop de dubletter, markeringen er lavet til.
{
  const d = findDubletter([
    { id: "a", address: "Bejstrupvej 72", status: "aktiv", days: ["Mon"], duration: 120, planInterval: "4_uger" },
    { id: "b", address: "Bejstrupvej 72", status: "kladde", days: ["Mon"], duration: 120, planInterval: "14_dage" },
  ]);
  er("forskellig rytme forhindrer ikke fundet", [...d.keys()], ["b"]);
}
// Overlap er nok — hun kommer begge dage i den ene aftale.
{
  const d = findDubletter([
    t("flere", "Spurvevej 8", "kladde", ["Tue", "Thu"], 10),
    t("en", "Spurvevej 8", "aktiv", ["Thu"], 10),
  ]);
  er("én fælles ugedag er nok", [...d.keys()], ["flere"]);
}
// En varighed på nul siger ingenting og må ikke gøre to aftaler ens.
{
  const d = findDubletter([
    t("x", "Ukendtvej 1", "kladde", ["Mon"], 0),
    t("y", "Ukendtvej 1", "kladde", ["Mon"], 0),
  ]);
  er("to gange nul minutter er ikke et fund", d.size, 0);
}

er("tom liste vælter ikke noget", findDubletter([]).size, 0);
er("intet vælter ikke noget", findDubletter().size, 0);

// ── Resultat ────────────────────────────────────────────────────────────────
if (fejl > 0) {
  console.error(`\n  ${fejl} af ${koert} kontroller fejlede i dubletmarkeringen.\n`);
  process.exit(1);
}
console.log(`Dubletmarkering: ${koert} kontroller i orden.`);
