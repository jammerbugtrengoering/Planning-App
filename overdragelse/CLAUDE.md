# Faste instruktioner for arbejdet i denne mappe

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
