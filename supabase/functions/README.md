# Edge-funktionerne

Her ligger kildeteksten til alle de funktioner, der kører inde i Supabase. De taler
med Dinero, sender mail gennem Brevo, beregner kørsel, kører de natlige jobs og
holder øje med at det hele virker.

## Læs det her først

**Det er en KOPI, ikke kilden.** Funktionerne kører i Supabase og bliver udrullet
derinde — ikke fra det her repository. Retter du en fil her og pusher, sker der
**ingenting** ude i driften.

Rækkefølgen er altså omvendt af det, man er vant til:

1. Ret funktionen, og rul den ud i Supabase
2. Kopiér den færdige tekst herind
3. Commit

Det er ikke elegant, men det er ærligt, og det løser det problem, der var: indtil
12. september 2026 fandtes seksten af sytten funktioner **udelukkende** inde i
Supabase. Ingen historik, ingen sammenligning, og ingen vej tilbage hvis nogen kom
til at overskrive en. Nu kan man i det mindste se, hvad der stod, og hvad der er
ændret hvornår.

## Status 3.10.2026: alle 29 funktioner ligger her

Mappen er komplet. De sidste ti (`compute-daily-km`, `daglige-paamindelser`,
`helsetjek`, `send-push`, `portal-login`, `fratraed-medarbejder`, `tilbud-pdf`,
`tilbud-offentlig`, `dinero-probe`, `dinero-omsaetning-probe`) blev hentet 3.10.2026
gennem Supabase-MCP'ens `get_edge_function` — den udrullede tekst, ikke en afskrift
fra skærmen — og kontrolleret for syntaks med esbuild.

Vil man have det helt sikkert, kan CLI'en hente det hele igen (se nedenfor). Viser
`git diff` bagefter ingenting, står der nøjagtig det, der kører.

Før 12.9.2026 fandtes seksten af sytten funktioner udelukkende inde i Supabase.
En forældet `send-email/index.ts` blev dengang fjernet, fordi en forkert kopi er
farligere end ingen. Det princip gælder stadig: **retter nogen i Supabase uden at
kopiere tilbage, er filen her forkert** — og så er det filen, der skal opdateres.

### Hent alle ned med CLI'en

**Installér ikke CLI'en med `npm install -g supabase`.** Supabase afviser den med
vilje som globalt modul. Brug `npx supabase@latest login` (Windows og macOS) eller
`brew install supabase/tap/supabase` (macOS). Derefter, fra `Planning-App`:

```
for f in aabn-planlaegning adresse-opslag arvede-felter-sync bestilling-besked bro-modtag \
  compute-daily-km daglige-paamindelser dinero dinero-kontakt-sync dinero-omsaetning \
  dinero-omsaetning-probe dinero-omsaetning-sync dinero-probe fratraed-medarbejder \
  helsetjek henvendelse-modtag inviter-bruger koeretabel kontor-beskeder kundeloesning \
  maaneds-paamindelse plan-beskeder portal-login send-email send-push slet-gamle-fotos \
  tilbud-offentlig tilbud-pdf travel-distance; do
  npx supabase@latest functions download $f --project-ref gteowfoahsfpunzgdxum
done
```

CLI'en kræver Node 20 eller nyere. Bagefter: `git diff supabase/functions`.

## Hvorfor de ikke bare rulles ud herfra

Det kræver Supabase CLI, et adgangstoken og en byggeproces oven i den, der allerede
kører på Netlify. Det er den rigtige løsning på sigt. Indtil den findes, er en kopi
med historik meget bedre end ingenting.

Samme CLI kan i øvrigt også rulle ud — `supabase functions deploy <navn>` — og den dag
I tager den i brug, holder hele det her forbehold op med at gælde.

## Der står ingen nøgler i filerne

Alle funktioner læser deres nøgler med `Deno.env.get(...)`. Selve værdierne ligger i
Supabase under **Edge Functions → Secrets** og kommer aldrig i nærheden af et
repository. Skriver du nogensinde en nøgle direkte ind i en af filerne her, ligger
den offentligt i samme øjeblik.

## Sådan ser du, om en fil er kommet ud af trit

Bed Claude om at hente den udrullede udgave af en funktion og sammenligne med filen
her. Er de forskellige, er det næsten altid fordi nogen har rettet i Supabase uden at
kopiere tilbage — og så er det filen her, der skal opdateres, ikke omvendt.

## Hvad de laver

| Funktion | Hvad den gør | Kaldes af |
|---|---|---|
| `compute-daily-km` | Beregner dagens kørsel ud fra registreret tid | Natligt job |
| `daglige-paamindelser` | Mail kl. 18 om manglende registrering | Natligt job |
| `maaneds-paamindelse` | Sidste chance to dage før månedsskiftet | Natligt job |
| `helsetjek` | Morgentjek: fejlede noget, og gemmer vi noget nyt? | Natligt job |
| `slet-gamle-fotos` | Rydder billeder ældre end 12 måneder | Natligt job |
| `kontor-beskeder` | Til planlæggerne: push hvert kvarter om det, der haster, og mail kl. 7 med alt, der venter (samme liste som klokken) | Job hvert kvarter og kl. 5+6 UTC |
| `plan-beskeder` | Besked til medarbejdere om ændringer i planen, og påmindelse når en startet opgave (start/stop) er et kvarter over tiden | Job hvert kvarter |
| `send-email` | Sender al mail gennem Brevo | De øvrige funktioner |
| `send-push` | Push-beskeder til telefonerne | De øvrige funktioner |
| `travel-distance` | Afstand og køretid mellem to adresser. Geokoder via Dataforsyningen (GSearch), ORS som reserve | Planlægningsappen, `compute-daily-km` |
| `adresse-opslag` | Adresseforslag i adressefelter (GSearch, ORS som reserve). Erstatter DAWA, der lukkede 2026 | Planlægningsappen |
| `koeretabel` | Køretabel for en dags adresser til «Simulér uge». Gemmer i `koeretabel`, aldrig i `travel_overrides`, så simuleringen ikke kan flytte kilometerpenge | Planlægningsappen |
| `henvendelse-modtag` | «Bliv ringet op» fra `/bestil` (pjece/magnet). `verify_jwt` fra; honningkrukke og loft pr. time | Kundeportalens offentlige side |
| `dinero` | Kunder, fakturaer og bogføring | Planlægningsappen |
| `dinero-omsaetning` | Faktureret omsætning måned for måned, et år ad gangen | I hånden |
| `dinero-omsaetning-sync` | Skriver betalt omsætning pr. måned ind i `dinero_omsaetning` | Natligt job kl. 4.15 |
| `dinero-omsaetning-probe` | Slukket — svarer 410 | — |
| `dinero-probe` | Slukket 3.10.2026 — svarer 410. Oprindelig kode i git-historikken | — |
| `inviter-bruger` | Opretter login til en ny medarbejder | Planlægningsappen |
| `fratraed-medarbejder` | Lukker adgangen for en der stopper | Planlægningsappen |
| `portal-login` | Sender kunden en engangskode til portalen | Kundeportalen |
| `bestilling-besked` | Besked til kontoret når en kunde bestiller | Kundeportalen |
| `tilbud-offentlig` | Det åbne tilbudslink uden login | Tilbudssiden |
| `tilbud-pdf` | Laver tilbuddet som PDF | Planlægningsappen |
| `dinero-kontakt-sync` | Henter kundenumre og kontaktoplysninger fra Dinero ind på aftalerne | Natligt job kl. 6.20 |
| `arvede-felter-sync` | Retter opgaver, der er kommet ud af trit med deres aftale — kontrakttype, adresse, telefon, e-mail m.m. Skriver gennem `opdater_arvede_felter()` | Natligt job kl. 6.25 |

## Tilføjet 29.9.2026 — broen til kundeløsningen (fase 5)

- `kundeloesning` — Premium på kundekortet (Option: Basis < Udvidet < Premium). Handlingen
  «niveau» skifter trin og opretter/lukker/åbner kundens planlægning i samme skridt;
  derudover tilvalg og nyt link. Kun planlæggere. Kalder kundedatabasens `jr-bro` med broens nøgle.
- `bro-modtag` — modtager «Ekstra hjælp» fra kundedatabasen og lægger den i
  `portal_bestillinger` med `kilde = 'kundeloesning'`. Kun med broens nøgle
  (`verify_jwt` fra).
- `bestilling-besked` — hentet ned og lagt her; svaret til kunden peger nu på «Ekstra
  hjælp», når bestillingen kom fra kundeløsningen.

Se `../kunde-functions/README.md` for den anden ende af broen.
- `aabn-planlaegning` — ét login: portalens administrator hos en Premium-kunde trykker
  «Planlægning» i portalen og får et engangslink (via jr-bro «login_link») til sin egen
  bruger i kundeplanlægningen. Linket sendes aldrig på mail.
