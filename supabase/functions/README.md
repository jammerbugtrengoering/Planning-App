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

## MANGLER: mappen er kun halvt fyldt

Der ligger **seks** funktioner her ud af tyve. Det er med vilje, og det skal gøres
færdigt — men det skal gøres med et værktøj og ikke i hånden.

Der lå i forvejen en `send-email/index.ts`, men den var forældet: 68 linjer mod cirka
130 i drift, og uden den adgangskontrol, funktionen har i dag. Den er fjernet, for en
forældet kopi er farligere end ingen — den ser rigtig ud, og nogen kunne finde på at
rulle den ud. Git husker den stadig, hvis nogen skulle få brug for at se, hvad der stod.

De seks er dem, vi kan stå inde for tegn for tegn, fordi de blev skrevet her.
De øvrige fjorten skulle kopieres af fra Supabase, og fire tusind linjer kopieret i
hånden har en reel risiko for en tavs tegnfejl. **En kopi, man ikke kan stole på, er
værre end ingen kopi** — den ser rigtig ud lige indtil den dag, man skal bruge den.

Sådan hentes resten ned, nøjagtigt som de kører:

**Installér ikke CLI'en med `npm install -g supabase`.** Supabase afviser den med
vilje som globalt modul, og fejlen, man får, handler om filrettigheder og leder én på
et vildspor. Brug én af disse i stedet:

```powershell
# Windows: kør den uden at installere noget
npx supabase@latest login
```

```bash
# macOS: samme, eller installér med Homebrew
npx supabase@latest login
brew install supabase/tap/supabase
```

Derefter, fra `Planning-App`-mappen (drop `npx supabase@latest` og skriv bare
`supabase`, hvis du installerede med Homebrew):

```
npx supabase@latest functions download dinero               --project-ref gteowfoahsfpunzgdxum
npx supabase@latest functions download dinero-omsaetning    --project-ref gteowfoahsfpunzgdxum
npx supabase@latest functions download dinero-omsaetning-sync --project-ref gteowfoahsfpunzgdxum
npx supabase@latest functions download dinero-omsaetning-probe --project-ref gteowfoahsfpunzgdxum
npx supabase@latest functions download dinero-probe         --project-ref gteowfoahsfpunzgdxum
npx supabase@latest functions download compute-daily-km     --project-ref gteowfoahsfpunzgdxum
npx supabase@latest functions download travel-distance      --project-ref gteowfoahsfpunzgdxum
npx supabase@latest functions download send-email           --project-ref gteowfoahsfpunzgdxum
npx supabase@latest functions download send-push            --project-ref gteowfoahsfpunzgdxum
npx supabase@latest functions download plan-beskeder        --project-ref gteowfoahsfpunzgdxum
npx supabase@latest functions download daglige-paamindelser --project-ref gteowfoahsfpunzgdxum
npx supabase@latest functions download maaneds-paamindelse  --project-ref gteowfoahsfpunzgdxum
npx supabase@latest functions download helsetjek            --project-ref gteowfoahsfpunzgdxum
npx supabase@latest functions download slet-gamle-fotos     --project-ref gteowfoahsfpunzgdxum
npx supabase@latest functions download inviter-bruger       --project-ref gteowfoahsfpunzgdxum
npx supabase@latest functions download fratraed-medarbejder --project-ref gteowfoahsfpunzgdxum
npx supabase@latest functions download portal-login         --project-ref gteowfoahsfpunzgdxum
npx supabase@latest functions download bestilling-besked    --project-ref gteowfoahsfpunzgdxum
npx supabase@latest functions download tilbud-offentlig     --project-ref gteowfoahsfpunzgdxum
npx supabase@latest functions download tilbud-pdf           --project-ref gteowfoahsfpunzgdxum
```

Alle tyve er med — også de seks, der allerede ligger her. Så bliver de overskrevet med
den udrullede udgave, og så ved I med sikkerhed, at der ikke står noget andet i mappen
end det, der faktisk kører.

CLI'en kræver Node 20 eller nyere. Det har I i forvejen.

Bagefter: `git add supabase/functions`, commit og push.

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
| `plan-beskeder` | Besked til medarbejdere om ændringer i planen | Job hvert kvarter |
| `send-email` | Sender al mail gennem Brevo | De øvrige funktioner |
| `send-push` | Push-beskeder til telefonerne | De øvrige funktioner |
| `travel-distance` | Afstand og køretid mellem to adresser | Planlægningsappen |
| `dinero` | Kunder, fakturaer og bogføring | Planlægningsappen |
| `dinero-omsaetning` | Faktureret omsætning måned for måned, et år ad gangen | I hånden |
| `dinero-omsaetning-sync` | Skriver betalt omsætning pr. måned ind i `dinero_omsaetning` | Natligt job kl. 4.15 |
| `dinero-omsaetning-probe` | Afprøvning brugt under bygningen af synkroniseringen | I hånden |
| `dinero-probe` | Afprøver forbindelsen til Dinero | I hånden |
| `inviter-bruger` | Opretter login til en ny medarbejder | Planlægningsappen |
| `fratraed-medarbejder` | Lukker adgangen for en der stopper | Planlægningsappen |
| `portal-login` | Sender kunden en engangskode til portalen | Kundeportalen |
| `bestilling-besked` | Besked til kontoret når en kunde bestiller | Kundeportalen |
| `tilbud-offentlig` | Det åbne tilbudslink uden login | Tilbudssiden |
| `tilbud-pdf` | Laver tilbuddet som PDF | Planlægningsappen |
