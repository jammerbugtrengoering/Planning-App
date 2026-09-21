# Baggrunden for reglerne

> **De regler, der gælder til daglig, står i `../CLAUDE.md`** — i roden af repositoryet,
> hvor de bliver læst af sig selv. Den her fil er den lange udgave: hvorfor reglerne er
> som de er, og hvad der gik galt, før de fandtes.
>
> Frem til 21.9.2026 var det her den eneste udgave. Den blev aldrig læst, fordi ingen
> åbner en undermappe af sig selv. Det er derfor, der nu er to filer. Retter du en regel,
> så ret den i `../CLAUDE.md` — og her, hvis begrundelsen også ændrer sig.

## Faste instruktioner for arbejdet i denne mappe

## Worklist skal altid virke på både Android og iOS

Medarbejderne er cirka ligeligt fordelt mellem de to. **Enhver ændring i
`jammerbugtrengoering-Medarbejder-App` skal vurderes mod begge**, før den meldes færdig
— og hvis noget kun kan afprøves det ene sted, skal det siges højt frem for at antages.

«Det virker på Nadines iPhone» er ikke et svar.

### Det der faktisk er forskelligt

Listen er samlet af fejl, vi har fundet undervejs — ikke af almindeligheder.

**Push-beskeder.** På iPhone virker de kun, når appen ligger på hjemmeskærmen; en fane i
Safari får ingenting, og det er Apples regel. På Android virker de i Chrome uden videre.
Al kode omkring beskeder skal derfor kunne håndtere, at iOS først skal installeres —
og må ikke vise en knap, der ikke kan holde, hvad den lover.

**Tastatur og skærmhøjde.** Både iOS og Android (siden Chrome 108) bruger
`resizes-visual`: layout-viewporten krymper **ikke**, når tastaturet åbner, så alt med
`position: fixed` og `inset: 0` bliver dækket. Brug `useSynligHoejde()`, som måler
`visualViewport`. Det var derfor «Afslut opgaven» blev klippet over.

**Emoji i knapper.** Android tegner emoji med Noto, iOS med Apple Color Emoji, og de er
ikke lige brede. En bjælke, der passer på iPhone, kan løbe over på Android. Brug
lucide-ikoner i felter med fast bredde i stedet — ikke emoji i knapper.

**Sikker zone.** `env(safe-area-inset-*)` er reelle tal på iPhone og som regel nul på
Android. Fuldskærmssider skal bruge dem i top og bund; ellers lægger de sig ind under
statuslinjen på iPhone. Appen kører med `viewport-fit=cover`, så det gælder altid.

**Systemskrifttyper.** Store skriftstørrelser er mere udbredt på Android. Faste højder på
knapper og blokke skal kunne rumme det.

**Ny version.** Service workeren kører `registerType: "prompt"` med `skipWaiting: false` —
med vilje, så en opdatering aldrig overtager midt i en tidsregistrering. Prisen er, at
telefonen skal lukkes helt ned. På iPhone betyder det at skubbe appen væk i app-skifteren;
at skifte til en anden app er ikke nok. Husk det, før en «fejl» meldes som ikke rettet.

### Sådan afprøves det

1. Byg og kontrollér at `node tjek-tdz.mjs` er ren.
2. Gennemgå ændringen mod listen ovenfor og skriv, hvad der er vurderet.
3. Kan noget kun afprøves på rigtig hardware, så sig hvad der skal kigges efter og hvorfor.
4. Pilotforsøg skal indeholde **både en iPhone og en Android**.

---

## Ændrer du hvad databasen gemmer, skal fire ting følge med

Privatlivsteksten findes fire steder, fordi den har fire forskellige læsere. Det er
**ikke** den samme tekst tre gange — det er tre målgrupper, der skal have hver sin
version af de samme fakta:

| Hvor | Hvem læser den |
|---|---|
| Worklist, hjælpen «Dine personoplysninger» (dansk **og** engelsk) | medarbejderen |
| Kundeportalen, hjælpen «Sådan behandler vi jeres oplysninger» | kunden |
| Planlægningsappen, hjælpens knap «Personoplysninger» | kontoret, når nogen ringer |
| `Fortegnelse-behandlingsaktiviteter.docx` | kommunens databeskyttelsesrådgiver |

Den fælles kilde er ikke en tekstfil, men tabellen **`persondata_register`** i
databasen: én række pr. kolonne, med om der er personoplysninger i den, og hvor det er
beskrevet.

**Du skal ikke huske det.** `helsetjek` sammenligner databasen med registret hver
morgen og mailer planlæggerne, hvis der er kommet et felt til eller er forsvundet et.
Beskeden holder op, når feltet er klassificeret — også hvis det klassificeres som
`persondata = false`. Pointen er ikke, at alt er personoplysninger; pointen er, at
nogen **har taget stilling**.

Kontrollen er efterprøvet ved at oprette en tabel med et borgernavn og en adresse i og
se, at den blev meldt — begge veje, både nyt og fjernet felt.

---

## Når I er flere om det samme repository

Fem ting. De fire første tager et halvt minut, den femte er den, der kan koste en dag.

**1. Hent ned, før du begynder.** Ikke før du pusher — *før du begynder*. Sidder I
begge og retter i `App.jsx`, er det ikke til at flette bagefter.

    git pull --rebase

**Sæt det her én gang på hver maskine**, ellers går det i stå for jer:

    git config --global pull.rebase false

Uden den siger git *«You have divergent branches and need to specify how to reconcile
them»* og **gør ingenting**, når I begge har committet siden sidst. Det skete 18.9.2026:
push blev afvist, `git pull` hentede filerne ned men flettede dem ikke, og `git merge
--abort` svarede *«There is no merge to abort»* — for der var aldrig startet en. Intet
var gået galt, men det lignede det. Med linjen ovenfor fletter `git pull` bare, og så
skal der kun pushes bagefter.

Kommer du til at stå i det alligevel, er vejen ud:

    git pull --no-rebase origin main
    git push origin main

**2. Sæt dit navn i git, første gang på en ny maskine.** Ellers står der «Dit Navn» i
historikken, og om et halvt år kan ingen se, hvem der lavede ændringen, eller hvem man
skal spørge.

    git config --global user.name "Fornavn Efternavn"
    git config --global user.email "din@adresse.dk"

**3. Push, så snart noget virker.** Små ændringer, ofte. Jo længere en ændring ligger
lokalt, jo mere når den anden at bygge oven på noget andet.

**4. Sig højt, hvad I arbejder på.** Git kan flette to filer, der er rørt hver sit
sted. Det kan ikke afgøre, hvem der havde ret, hvis I har rettet det samme.

**5. Databasen har ingen kopi og kan ikke flettes.** Det er dén, der gør ondt. Koden
kan rulles tilbage; en tabel, der er lavet om, mens den andens app kørte på den gamle
form, kan ikke. Så: **kun én ad gangen rører databasen, og den anden får det at vide,
før det sker.** Det gælder også, når Claude gør det på jeres vegne.

Og husk, at Netlify lægger ud, så snart der er pushet. Det, I pusher, er live for
kontoret og for medarbejdernes telefoner inden for et par minutter — også midt i en
arbejdsdag.

### Bliver et push afvist

    ! [rejected]  main -> main (fetch first)

Så har den anden pushet imens. Det er ikke en fejl, du har lavet:

    git pull --rebase
    git push origin main

Kommer der en konflikt, **så stop**. Lad være med at gætte, og lad være med at bruge
`--force` — det sletter den andens arbejde. Vis beskeden til den, der kan hjælpe.

---

## Slut altid af med push-kommandoen

Claude kan ikke nå GitHub — adgangskoden ligger i brugerens nøglering, ikke i Claudes
miljø. Arbejdsdelingen er derfor: **Claude retter filerne og laver commit, brugeren
pusher.**

Har du lavet en commit, så slut svaret af med den færdige kommando, klar til at
kopiere — og med den rigtige mappe, for de tre apps er tre selvstændige
repositories:

    cd ~/planapp/Planning-App && git push origin main
    cd ~/planapp/jammerbugtrengoering-Medarbejder-App && git push origin main
    cd ~/planapp/jammerbugtrengoering-kundeportal && git push origin main

Har du rørt ved flere apps, så giv kommandoen for hver enkelt.

Og tjek `git log origin/main..HEAD`, før du beder om det. Mærket `origin/main` flytter
sig også i din mappe, når brugeren pusher fra sin egen terminal — så du kan altid se,
om der faktisk mangler noget. Den 14. september 2026 blev der bedt om push fire gange
i træk på noget, der allerede var pushet.

---

## Øvrige faste ting

- Hjælpen i alle tre apps skal altid opdateres, når funktionalitet ændres.
- Solsikken (`medSolsikke`) er pynt og må aldrig nå data — ikke i lønfiler, CSV,
  mails eller noget, der går til Dinero.
- Kommentarer i koden skal forklare **hvorfor**, ikke hvad — og gerne hvilken fejl der
  ligger bag, så ingen fjerner en linje, der ser overflødig ud.
- Ændrer du en regel, der afgør **hvad der bliver oprettet** — rytme, interval,
  gyldighedsdatoer — så husk, at en browserfane kører den kode, den hentede, og ikke
  den, der ligger ude nu. Se fælden i `START-PROMPT.md` om den 13. september 2026 og
  spærringen i `src/nyversion.js`.
- En kopitabel lavet med `create table as` arver Supabases tildelinger: `anon` og
  `authenticated` får fuld adgang. `revoke` dem ved navn og slå RLS til — `revoke ...
  from public` gør det ikke.
- **Tilføjer du en kolonne til `instances`, skal den også med i visningen
  `instances_let`.** Planlægningsappen henter derfra ved opstart, fordi tjeklistens
  indhold fylder over halvdelen af de data, den ellers ville trække. Er kolonnen ikke
  med i visningen, findes den ikke for planlæggeren — og første gang appen gemmer
  opgaven, bliver feltet nulstillet. Morgentjekket fortæller dig om den nye kolonne
  (den står som uklassificeret persondata), men det er dig, der skal huske visningen.
  `select * from instances_let_mangler();` siger, hvad der mangler.
