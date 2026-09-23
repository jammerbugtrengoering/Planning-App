# Planlægningsappen — læs det her, før du retter noget

Det her er den eneste fil, en Claude læser af sig selv. Derfor står det vigtigste her og
ikke i en undermappe. Den længere baggrund ligger i `overdragelse/` — men intet i den
mappe bliver åbnet, medmindre nogen beder om det, så alt, der skal virke uden at nogen
husker det, skal stå her.

Appen er i drift. Netlify lægger ud, så snart der er pushet, og kontoret arbejder i den
inden for et par minutter. Der er ingen testopsætning imellem.

---

## Slå op efter det, du skal lave

De her lister er samlet af fejl, der faktisk er sket. De er ikke almindeligheder, og de
kan ikke gættes ud fra koden — hvert punkt er der, fordi noget gik galt uden det.

### Du ændrer noget om, HVORNÅR en aftale kører

Rytme, interval, startdato, udløb, udeladte dage. **Fire ting, og de hænger sammen:**

1. **`src/aftalerytme.js`** er reglen. Ikke App.jsx. Funktionen `aftaleKoererPaaDag`
   afgør både hvilke opgaver der bliver **oprettet**, og hvilke der bliver **ryddet væk**
   igen. Retter du kun App.jsx, bliver opgaverne dannet ét sted og fjernet et andet.
2. **Tabellen `UGEINTERVAL` i samme fil.** Står din nye værdi ikke i den, falder reglen
   tilbage på `|| 1` — altså **hver uge**, uden fejl og uden advarsel. Sker det på en
   aftale, der skulle køre to gange om året, bliver det til 26 besøg.
3. **`aftalerytme.test.mjs`.** Filens egen første sætning beder om det. Kør
   `node aftalerytme.test.mjs`.
4. **Hjælpeteksten** i `MODULE_HELP` — og skriv, hvad rytmen gør ved årets besøg, ikke
   bare hvad den hedder.

> 20.9.2026 blev «Konkrete datoer» lagt ind som ny rytme uden punkt 1–3. Resultatet var,
> at den enten dannede en opgave hver uge i et år, eller slet ingen — aldrig datoerne på
> listen.

### Du tilføjer en kolonne til en tabel

**Fire steder, og de to midterste bliver glemt hver gang:**

1. Kolonnen i Supabase (via `apply_migration` — se nedenfor)
2. **INSERT-listen** i `saveTask` i `src/App.jsx`. Er feltet ikke med, bliver det aldrig
   gemt.
3. **Indlæsningen** i `loadAll` i samme fil, hvor rækken laves om til et JS-objekt. Er
   feltet ikke med, er det væk, næste gang siden hentes.
4. Beregninger, der bruger værdien — kontraktsum, portefølje, rapporter

Hører kolonnen til **`instances`**, skal den også med i visningen **`instances_let`**.
Planlægningsappen henter derfra ved opstart. Er kolonnen ikke i visningen, findes den
ikke for planlæggeren, og første gang appen gemmer opgaven, bliver feltet nulstillet.
`select * from instances_let_mangler();` siger, hvad der mangler.

Morgentjekket melder den nye kolonne som uklassificeret persondata. Den besked holder
først op, når nogen har taget stilling — også hvis svaret er «ikke personoplysninger».

> 20.9.2026 fik `konkrete_datoer` sin kolonne og sin brugerflade, men hverken punkt 2
> eller 3. Datoerne forsvandt, når vinduet blev lukket, og aftalens værdi blev 0 kr.

**Punkt 3 er den, der gør mindst væsen af sig.** Databasen skriver `po_number`, appen
læser `t.poNumber`. Mangler oversættelsen, er feltet bare tomt — ingen fejl, ingen
advarsel. Og er det et felt, selvhelbredelsen også sætter, går det i ring: den fylder
feltet ud fra aftalen, sammenligningen ser en forskel, opgaven skrives — og næste
opstart taber oversættelsen igen.

> 21.9.2026 manglede `po_number`, `video_url` og `dinero_contact_guid`. Resultatet var
> **cirka 200 skrivninger ved hver eneste opstart**, med nøjagtig de værdier der stod
> der i forvejen, målt tre gange: 202, 411, 201. Det alvorlige var ikke tiden.
> `poNumber` bærer borgerens navn på kommunens opgaver og ender som kommentar på
> fakturalinjen i Dinero — og selvhelbredelsen springer opgaver med registreret tid
> over, altså netop dem der skal faktureres.

`node indlaesning.test.mjs` håndhæver reglen: hvert felt, selvhelbredelsen rører, skal
findes i oversættelsen. Den kører med i `npm run build`.

### Du rører noget, der danner eller viser opgaver

**Opgaverne hentes i to runder.** Først ugerne omkring i dag (cirka 1.300 af 10.700),
så ugeplanen kan tegnes med det samme. Resten kommer bagefter i baggrunden.

Det gør én ting farlig: **`ensureWeekInstances` kan ikke se forskel på «pladsen er
tom» og «ugen er ikke hentet endnu».** Kører den på halve data, opfinder den dubletter
i en plan, nogen arbejder i — og sender dem ud på medarbejdernes telefoner.

Værnet er `hentedeUger` i `src/App.jsx` og reglen i **`src/vindue.js`**: er ugen ikke
hentet helt, dannes der ingenting i den. Rører du noget i den kæde, så lad værnet være,
og kør `node vindue.test.mjs`.

To ting følger med:

- Regner din nye side på **alle** opgaver, skal den stå i `SIDER_DER_KRAEVER_ALT`.
  Ellers viser den et tal bygget på en femtedel af data, uden at sige det.
- Hæver du `HORIZON_WEEKS`, skal `UGER_FREM` i `src/vindue.js` følge med.
  `indlaesning.test.mjs` fejler, hvis du glemmer det.

> 21.9.2026: opstarten tog knap 12 sekunder, fordi alle 10.893 opgaver blev hentet —
> 6,4 MB i elleve sider — mens planlæggeren sad og kiggede på én uge. 82 % af dem var
> 2027 og 2028, fordi en aftale danner hele sin løbetid, når den oprettes.

### Du retter i databasen

`execute_sql` i Supabase-værktøjet er **skrivebeskyttet**. Ethvert `insert`, `update`,
`delete` eller `create` skal gennem `apply_migration`. Det er ikke en forhindring, det er
en fordel: migrationen bliver stående med sin forklaring, og om et halvt år kan man se
hvorfor.

Skriv **hvorfor** i migrationen, ikke hvad. SQL'en siger selv hvad.

**En upsert på `instances` skal sende hele rækken.** Sender den kun nogle af kolonnerne,
fejler den *altid* — også når rækken findes i forvejen. Postgres tjekker NOT NULL på den
række, der ville blive indsat, før den opdager at id'et er taget, og `title`, `type`,
`week` og `duration` har ingen standardværdi. Skal kun nogle felter skrives, så brug
`.update(...).in("id", ...)` eller `rpc("opdater_arvede_felter", ...)`.
`node indlaesning.test.mjs` fejler, hvis nogen skriver en delvis upsert igen.

> 23.9.2026: `gemArvedeFelter` havde brugt en delvis upsert i tre uger og slugt fejlen.
> Selvhelbredelsen gemte aldrig noget, og 4.145 opgaver stod uden telefon, e-mail og
> kontaktperson fra deres aftale — eller med forkert kontrakttype. Natjobbet
> `arvede-felter-sync` havde samme fejl. Og en fejl, der ikke siges højt, er ikke en fejl,
> der ikke sker — den er bare en, ingen retter.

**Kun én ad gangen rører databasen.** Koden kan rulles tilbage; en tabel, der er lavet om,
mens den andens app kørte på den gamle form, kan ikke.

### Du tilføjer en menugruppe eller en side

Nøglerne i **`MENU_GRUPPER`** skal være unikke. To grupper med samme nøgle får **begge**
til at lyse op som den valgte, uanset hvor man står — linjen, der tegner fanerne,
sammenligner netop på `key`. Sidenøglerne inde i grupperne skal også være unikke, men de
er et andet navnerum end gruppenøglerne.

> 19.9.2026 fik Drift-gruppen nøglen `drift`, som Ugeplanen allerede brugte.

### Du retter en edge-funktion

**Mappen `supabase/functions/` er en KOPI, ikke kilden.** Funktionerne kører i Supabase og
bliver rullet ud derinde. Retter du en fil her og pusher, sker der **ingenting** i driften.

Rækkefølgen er omvendt af det, man er vant til: ret og rul ud i Supabase → kopiér den
færdige tekst herind → commit. Se `supabase/functions/README.md`.

### Du rører ved kilometer og adresser

Geokoderen har en reserve: kan Dataforsyningen ikke finde adressen, spørger den
OpenRouteService — som **gætter i stedet for at sige fra**. En adresse med en stavefejl
kan derfor få koordinater i Viborg, og turen bliver 112 km i stedet for 30.

Kolonnen `source` i `travel_overrides` siger, hvem der svarede. Alt andet end `dawa`
betyder, at registret ikke kunne svare på mindst én af de to adresser.

> 20.9.2026 blev alle 182 adresser slået op på ny. 168 ramte nul meter fra registret. De
> 14 øvrige var stavefejl og forkerte postnumre — ikke fejl i registret. Fejlen hører
> hjemme i adressefeltet, ikke i geokoderen.

Kørselsgodtgørelsen er ikke sat i drift endnu. Den dag den er, bliver et gættet tal til
penge på en lønseddel.

---

## Når I er flere om det samme repository

**Sæt de her to én gang på hver maskine.** Den første, fordi git ellers går i stå:

    git config --global pull.rebase false
    git config --global user.name "Fornavn Efternavn"
    git config --global user.email "din@adresse.dk"

Uden den første siger git *«You have divergent branches»* og **gør ingenting**, når I
begge har committet siden sidst. Uden de to andre står der «Dit Navn» i historikken, og om
et halvt år kan ingen se, hvem der lavede ændringen, eller hvem man skal spørge.

**Hent ned, før du begynder** — ikke før du pusher. Sidder I begge i `App.jsx`, er det
ikke til at flette bagefter.

**Push, så snart noget virker.** Små ændringer, ofte.

Bliver et push afvist med `! [rejected] main -> main (fetch first)`, har den anden pushet
imens. Det er ikke en fejl, du har lavet:

    git pull --no-rebase --no-edit origin main
    git push origin main

Kommer der **CONFLICT**, så stop. Lad være med at gætte, og brug aldrig `--force` — det
sletter den andens arbejde. `git merge --abort` sætter dig tilbage, hvor du var.

---

## Faste ting

- **Hjælpen skal opdateres, når funktionalitet ændres.** Det gælder alle tre apps. En
  hjælpetekst, der beskriver noget, der ikke længere passer, er værre end ingen.
- **Kommentarer forklarer hvorfor, ikke hvad** — og gerne hvilken fejl der ligger bag, så
  ingen fjerner en linje, der ser overflødig ud.
- Solsikken (`medSolsikke`) er pynt og må aldrig nå data — ikke i lønfiler, CSV, mails
  eller noget, der går til Dinero.
- En kopitabel lavet med `create table as` arver Supabases tildelinger: `anon` og
  `authenticated` får fuld adgang. `revoke` dem ved navn og slå RLS til — `revoke ... from
  public` gør det ikke.
- Ændrer du en regel, der afgør **hvad der bliver oprettet**, så husk, at en browserfane
  kører den kode, den hentede, og ikke den, der ligger ude nu. Se `src/nyversion.js`.
- Drift-siden viser byggetidspunktet nederst. Er stemplet ældre, end du forventer, er
  sidste push ikke gået igennem hos Netlify.

## Før du melder noget færdigt

    npx oxlint          # 0 errors
    npm run build
    node aftalerytme.test.mjs   # og de øvrige *.test.mjs, der rører dit område

Claude kan ikke nå GitHub — adgangskoden ligger i brugerens nøglering. Arbejdsdelingen er:
**Claude retter og committer, brugeren pusher.** Slut svaret af med den færdige kommando:

    cd ~/planapp/Planning-App && git push origin main

Tjek `git log origin/main..HEAD` først. Mærket flytter sig også, når brugeren pusher fra
sin egen terminal, så du kan altid se, om der faktisk mangler noget.

---

## Hvor resten står

`overdragelse/` indeholder den lange udgave: `OVERDRAGELSE.md` (hvad systemet består af),
`START-PROMPT.md`, `WINDOWS-OPSAETNING.md`, sikkerhedsgennemgangen og
persondatafortegnelserne. `overdragelse/CLAUDE.md` har baggrunden for reglerne ovenfor og
detaljerne om privatlivsteksten og `persondata_register`.
