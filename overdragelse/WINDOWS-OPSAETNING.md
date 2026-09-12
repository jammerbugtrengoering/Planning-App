# Opsætning på en Windows-maskine

Fra en tom maskine til at kunne rette i alle tre apps og lægge ændringerne ud.
Regn med halvanden time første gang. Du skal bruge en administratoradgang til
maskinen for at installere programmerne.

Undervejs står der, hvad du skal have fat i hos Jonn. Hav det klar, inden du går i
gang — det er nemmere end at stoppe midtvejs.

---

## 1. Det du skal have udleveret

Ingen af de her ting må stå i et dokument eller sendes på mail. Få dem person til
person, og læg dem i en adgangskodemanager.

| Hvad | Hvor det bruges | Hvordan du får det |
|---|---|---|
| GitHub-konto med adgang til `jammerbugtrengoering` | Koden | Jonn inviterer jeres konto som medlem af organisationen |
| Netlify-konto | Udgivelse af de tre apps | Jonn inviterer jer til teamet |
| Supabase-konto | Database og edge-funktioner | Jonn inviterer jer til projektet |
| Adgang til Dinero | Bogføring og fakturaer | Findes i forvejen hos jer |
| Adgang til Brevo | Alle mails systemet sender | Jonn overdrager kontoen |
| Adgang til OpenRouteService | Kørselsafstande | Jonn overdrager kontoen |

**Hvad du IKKE skal have i hånden:** servicenøglen til Supabase og API-nøglerne til
Brevo, Dinero og OpenRouteService. De ligger allerede inde i Supabase under *Edge
Functions → Secrets* og bliver hvor de er. Du skal kun røre dem, hvis en af dem skal
skiftes — og det er en af de ting, du ringer til Jonn om.

---

## 2. Installér programmerne

Åbn **PowerShell** (tryk på Start, skriv `powershell`, tryk Enter) og kør linjerne
herunder én ad gangen. `winget` følger med Windows 10 og 11.

```powershell
winget install --id Git.Git -e
winget install --id OpenJS.NodeJS.LTS -e
winget install --id Microsoft.VisualStudioCode -e
```

**Luk PowerShell og åbn det igen.** Ellers kender maskinen ikke de nye programmer
endnu — det er den klassiske «det virkede ikke» på Windows.

Kontrollér at det virkede:

```powershell
git --version
node --version
npm --version
```

Der skal komme tre versionsnumre. `node` skal være **version 20 eller nyere**;
systemet er bygget og afprøvet på 22.

---

## 3. Fortæl Git hvem du er

Navnet og mailen her havner i historikken på hver eneste ændring. Brug en rigtig
arbejdsmail.

```powershell
git config --global user.name "Dit Navn"
git config --global user.email "dinmail@jammerbugtrengoering.dk"
```

Windows og Mac er uenige om, hvordan en linje slutter. Uden den næste linje ser hver
eneste fil ud som om den er ændret fra top til bund, første gang I rører den:

```powershell
git config --global core.autocrlf true
```

---

## 4. Hent koden ned

Lav en mappe og hent de tre repositories:

```powershell
mkdir C:\planapp
cd C:\planapp
git clone https://github.com/jammerbugtrengoering/Planning-App.git
git clone https://github.com/jammerbugtrengoering/jammerbugtrengoering-Medarbejder-App.git
git clone https://github.com/jammerbugtrengoering/jammerbugtrengoering-kundeportal.git
```

Første gang åbner der et vindue, hvor du skal logge ind på GitHub. Gør det med den
konto, Jonn har inviteret. Windows husker den bagefter.

Dokumenterne følger med af sig selv: de ligger i
`C:\planapp\Planning-App\overdragelse\` og kommer ned sammen med koden. Der skal altså
ikke kopieres noget rundt.

`C:\planapp` er den mappe, I peger Claude på — altså den med de tre app-mapper i.

---

## 5. Installér pakkerne og prøv at bygge

Én gang pr. app. Det tager et par minutter hver.

```powershell
cd C:\planapp\Planning-App
npm install
npm run build
```

```powershell
cd C:\planapp\jammerbugtrengoering-Medarbejder-App
npm install
npm run build
```

```powershell
cd C:\planapp\jammerbugtrengoering-kundeportal
npm install
npm run build
```

**Sådan ser det ud, når det er rigtigt.** Byggeriet kører kontrollerne undervejs, og
de skal melde sig:

```
Ingen variabler brugt før erklæring.
Lønberegning: 32 kontroller i orden.
Opgavetid: 49 kontroller i orden.
✓ built in 14.51s
```

Advarsler er i orden — der er en del af dem, og de er kendte. **Fejl er ikke.** Står
der «Found N errors» eller «kontroller fejlede», så byg ikke videre og push ikke.
Spørg Claude, hvad der er galt.

---

## 6. Nøglerne til databasen

De to hovedapps skal vide, hvor databasen er. Det står i en fil, der hedder `.env`, og
den følger med i repoet i forvejen — så normalt skal du ikke gøre noget her.

Mangler den, laver du den i app-mappen med dette indhold:

```
VITE_SUPABASE_URL=https://gteowfoahsfpunzgdxum.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<den offentlige nøgle fra Supabase>
```

Den nøgle er beregnet på at stå i en browser og giver i sig selv ingen adgang — alt,
hvad en bruger kan nå, er afgrænset inde i databasen. Du finder den i Supabase under
*Project Settings → API → Publishable key*.

**Der stod `VITE_SUPABASE_ANON_KEY` i filerne indtil 12. september 2026.** Det var den
gamle nøgletype, som Supabase udfaser ved udgangen af 2026, og appen ville være holdt op
med at virke den dag, den blev lukket. Begge apps er skiftet nu. Koden læser stadig den
gamle som reserve, men der står ikke længere nogen — skiftet er altså rigtigt
gennemført og ikke bare forberedt.

**Ét sted skal det stadig kontrolleres:** står der en `VITE_SUPABASE_ANON_KEY` i Netlify
under *Site configuration → Environment variables*, skal navnet skiftes til
`VITE_SUPABASE_PUBLISHABLE_KEY`. En variabel sat dér kan overtrumfe den, der følger med
koden, og så ville skiftet være uden virkning på det udgivne site.

Kundeportalen har adressen og nøglen stående direkte i `src/db.js` og skal ingen
`.env`-fil have.

---

## 7. Prøv appen lokalt, før du udgiver noget

```powershell
cd C:\planapp\Planning-App
npm run dev
```

Der kommer en adresse frem, typisk `http://localhost:5173`. Åbn den i browseren. Du
arbejder nu mod den **rigtige** database — det, du gemmer, er gemt for alvor. Det er
kun skærmbilledet, der er dit eget.

Stop den igen med Ctrl+C.

---

## 8. Sådan udgiver du en ændring

```powershell
cd C:\planapp\Planning-App
npm run build
git add .
git commit -m "Kort beskrivelse af hvad du har ændret"
git push origin main
```

Netlify opdager selv, at der er kommet noget nyt, bygger det og lægger det ud. Det
tager typisk et par minutter. Du kan følge med på netlify.com under det pågældende
site.

**Fejler Netlify-byggeriet**, er det næsten altid noget, der også ville have fejlet
hos dig. Kør `npm run build` lokalt og læs fejlen dér — den er nemmere at forstå end
i Netlifys log.

---

## 9. Worklist på telefonen

Medarbejderne har Worklist liggende på hjemmeskærmen som en app. Den henter selv en ny
version, men **overtager den ikke af sig selv** — det er et bevidst valg, så en
opdatering aldrig kan afbryde en tidsregistrering midt i det hele.

Prisen er, at telefonen skal lukkes helt ned, før en rettelse slår igennem. På iPhone
betyder det at skubbe appen væk i app-skifteren; at skifte til en anden app er ikke
nok. Husk det, før en rettelse meldes som virkningsløs.

Skal noget afprøves i marken, så gør det på **både en iPhone og en Android**. De to er
forskellige på måder, der har bidt os før — tastaturhøjde, emoji-bredde, sikker zone,
og om push-beskeder overhovedet virker.

---

## 10. Databasen

Databasen ændrer du ikke fra maskinen her. Det sker gennem Claude eller direkte i
Supabase på supabase.com. Der er **ingen prøvedatabase** — alt, hvad du gør, er live
med det samme og rammer rigtige medarbejdere og kunder.

Derfor: bed altid Claude om at tage en kopi først og vise dig, hvad der vil ske, før
noget slettes eller ændres i større omfang.

---

## Når noget ikke virker

| Det siger | Det betyder | Gør |
|---|---|---|
| `git` eller `node` findes ikke | PowerShell blev åbnet før installationen | Luk vinduet, åbn et nyt |
| `Permission denied` ved push | Kontoen mangler adgang | Bed Jonn tilføje jer til organisationen |
| `Found N errors` ved build | Der er en fejl i koden | Push ikke. Vis fejlen til Claude |
| Netlify bygger ikke | Push kom ikke af sted | Kør `git push origin main` igen og se efter fejl |
| Rettelsen ses ikke på telefonen | Appen kører stadig den gamle version | Luk appen helt ned, ikke bare skift væk |
| Rettelsen ses ikke i browseren | Browseren har en gammel kopi | Ctrl+F5 |
