# Flyt afsenderen til jeres eget domæne

Alle mails fra systemet — login-koder, invitationer, daglige påmindelser, beskeder om
bestillinger — sendes i dag som `jammerbugtrengoering@outlook.dk`. Denne guide flytter
dem til en adresse på et domæne, I selv ejer.

Regn med **en halv time i alt**, plus ventetid på DNS.

---

## Hvorfor det skal gøres

`outlook.dk` tilhører Microsoft. Vi kan ikke lægge poster på det domæne, og derfor kan
vi ikke bevise over for modtageren, at Brevo har lov at sende i vores navn. Mailen kommer
fra Brevos servere og *påstår* at være fra Microsoft.

Gmail og Yahoo lader den slippe igennem. Microsoft 365 gør ikke — den sætter en gul
bjælke øverst i hver eneste mail:

> Du får ikke ofte mails fra jammerbugtrengoering@outlook.dk.

Den bjælke stod i din egen invitation til kundeportalen. **Enhver erhvervskunde vil se
den samme**, og en portalinvitation er kundens første møde med systemet. Nogle 365-opsætninger
går videre og lægger mailen i karantæne, hvor kunden aldrig ser den.

Siden februar 2024 har Gmail og Yahoo krævet, at afsenderdomænet er godkendt, og Microsoft
annoncerede i maj 2025 tilsvarende krav. Det her er ikke en finpudsning — det er ved at
være en forudsætning for at nå frem.

---

## Trin 1 — Sådan ser det ud i dag

Slået op 25. august 2026:

| | |
|---|---|
| Domæne | `jammerbugtrengoering.dk` |
| Navneservere | `ns1.simply.com` — DNS og webhotel ligger hos **Simply.com** |
| Hjemmeside | `212.237.249.12`, både med og uden `www` |
| **MX-poster** | **ingen** |
| **TXT-poster** | **ingen** — hverken SPF eller DMARC |

Domænet **modtager altså ingen mail i dag**, og der findes ingen mailopsætning på det.

Det er den bedst tænkelige udgangsposition. Der er ingen DMARC-post at overskrive, ingen
eksisterende mailstrøm at forstyrre, og ingen risiko for at slukke for noget, nogen bruger.
Advarslen om ikke at lade Brevo overskrive DMARC gælder derfor ikke jer — der er ikke noget
at overskrive.

Du skal kunne logge ind hos Simply.com og rette DNS. Kan du ikke det, er det den person,
der kan, som skal med fra trin 3.

---

## To ting, der ikke er det samme

De forveksles let, og de kan laves hver for sig:

**At sende fra systemet** — login-koder, invitationer, påmindelser. Går gennem Brevo og
kræver kun TXT-poster. **Ingen postkasse behøves.** `ingen-svar@jammerbugtrengoering.dk`
virker fint som afsender, selvom adressen ikke findes som postkasse.

**At modtage mail** — `info@jammerbugtrengoering.dk` som en rigtig postkasse, I kan læse i.
Kræver MX-poster og en mailudbyder, og er en flytning væk fra `jammerbugtrengoering@outlook.dk`
med alt hvad det indebærer: besked til kunder, brevpapir, Google-profil, fakturaer.

Trin 2–5 handler om det første. Afsnittet **Postkasser på domænet** til sidst handler om
det andet. Tag dem gerne i den rækkefølge — men læs afsnittet om SPF, *inden* du gør nogen
af delene.

---

## Kun én SPF-post — hele vejen igennem

Dette er den fejl, der vælter det for de fleste.

**Et domæne må kun have én SPF-post.** Har det to, fejler begge, og al mail bliver mistænkelig
— også den I sender fra postkasserne.

I har ingen SPF i dag. Den, der kommer først, sætter posten. Laver du postkasser hos Simply
først, opretter Simply typisk sin egen. Godkender du så Brevo bagefter, står du med to.

Der skal være **én linje med begge udbydere i**:

```
v=spf1 include:_spf.simply.com include:spf.brevo.com ~all
```

Bruger I kun Brevo og ingen postkasser endnu:

```
v=spf1 include:spf.brevo.com ~all
```

Tjek altid bagefter, at der kun er én post, der begynder med `v=spf1`.

---

## Trin 2 — Tilføj domænet i Brevo

1. Log ind i Brevo.
2. Klik på kontoen øverst til højre → **Settings** → **Senders, Domains, IPs** → **Domains**.
   Direkte link: <https://app.brevo.com/senders/domain/list>
3. Klik **Add a domain**.
4. Skriv domænet — kun det der står efter `@`. Altså `jammerbugtrengoering.dk`,
   ikke `ingen-svar@jammerbugtrengoering.dk`.
5. Klik **Add domain**.

---

## Trin 3 — Godkend domænet

Brevo tilbyder to veje. **Prøv den automatiske først.**

### Den nemme vej

Vælg **Authenticate the domain automatically**. Brevo genkender din udbyder, beder om dit
login der, og lægger selv alle posterne ind.

To ting at vide:

- Har domænet allerede en DMARC-post, spørger Brevo om den må erstattes. **Sig nej og
  skift til den manuelle vej**, hvis I i forvejen sender mail fra domænet — for eksempel
  gennem Microsoft 365. Overskriver du den post, kan jeres almindelige firmamail holde
  op med at komme frem.
- Understøtter Brevo ikke jeres udbyder, får du den manuelle vej alligevel.

### Den manuelle vej

Brevo viser tre slags poster, som du skal oprette hos din domæneudbyder. Værdierne er
**unikke for jeres konto** — de står på skærmen i Brevo, og der er en kopiknap ved hver.

| Post | Type | Hvad den gør |
|---|---|---|
| Brevo code | TXT | Beviser at I ejer domænet |
| DKIM | 1 TXT eller 2 CNAME | Underskriver hver mail, så den ikke kan ændres undervejs |
| DMARC | TXT | Fortæller modtageren hvad der skal ske med mail der ikke består prøven |

Fremgangsmåden er den samme hos alle udbydere: opret en post, vælg typen, indsæt navnet
fra Brevo i navnefeltet og værdien i værdifeltet. Lad TTL stå som den er.

To faldgruber:

- **Bruger I Cloudflare og får CNAME-poster til DKIM**, skal *CNAME flattening* slås fra.
  Ellers laver Cloudflare dem om til TXT, og DKIM fejler.
- **Får du samme fejl igen og igen**, er det næsten altid fordi udbyderen selv sætter
  domænet bag på navnet. Skriver du `mail._domainkey.jammerbugtrengoering.dk`, kan der
  ende med at stå `mail._domainkey.jammerbugtrengoering.dk.jammerbugtrengoering.dk`.
  Prøv med kun `mail._domainkey`.

Kan du ikke selv, har Brevo en knap: **Ask someone else to authenticate the domain**.
Den sender vejledningen til den der administrerer domænet — de behøver ikke en Brevo-konto.

Klik til sidst **Verify** i Brevo. DNS kan tage fra få minutter til et døgn. Er der grønt
flueben ud for alle poster, er du færdig med den svære del.

---

## Trin 4 — Skift afsenderen i systemet

Afsenderen er nu en **indstilling** og ikke noget der står i koden — jeg har lavet den om,
så I ikke skal have noget bygget om for at skifte.

1. Gå til Supabase → **Project Settings** → **Edge Functions** → **Secrets**.
2. Tilføj:

   | Navn | Værdi |
   |---|---|
   | `AFSENDER_EMAIL` | `ingen-svar@jammerbugtrengoering.dk` |
   | `AFSENDER_NAVN` | `Jammerbugt Rengøring` |
   | `SVAR_TIL` | jeres rigtige mailadresse |

`SVAR_TIL` er værd at sætte. Uden den lander et svar fra en kunde på `ingen-svar@`, hvor
ingen læser det. Med den går svaret til kontoret, selvom mailen er sendt fra en adresse
der ikke modtager.

Adressen i `AFSENDER_EMAIL` **skal ligge på det domæne, du lige har godkendt**. Ellers er
vi tilbage ved udgangspunktet.

Der er ingen deployment bagefter. Næste mail bruger den nye afsender.

---

## Trin 5 — Efterprøv at det virker

Send en rigtig mail gennem systemet — bed for eksempel om en login-kode til kundeportalen
på din `@pearlgroup.dk`-adresse. Den ligger på Microsoft 365 og er derfor den strengeste
dommer, I har.

Kig efter:

- **Ingen gul bjælke** øverst i mailen. Det er hele pointen.
- Åbn mailens detaljer i Outlook (`...` → **Vis meddelelsesdetaljer**) og find linjerne
  `spf=pass`, `dkim=pass` og `dmarc=pass`. Alle tre skal stå der.
- Afsenderen skal være den nye adresse.

Er noget galt, kan jeg slå det op i loggen — afsenderen skrives nu med i hver linje, så
det kan ses præcis hvornår den første mail gik ud ad den nye vej.

---

## Bagefter: stram DMARC gradvist

Brevo opretter typisk DMARC med `p=none`, som betyder «bare rapportér, gør ikke noget».
Det er det rigtige sted at starte.

Når det har kørt et par uger uden problemer, kan posten strammes til `p=quarantine` og
siden `p=reject`. Så kan andre ikke sende mail i jeres navn. **Gør det ikke med det samme** —
sender I mail fra andre steder, I har glemt (et bogholderisystem, en webshop, et
nyhedsbrev), holder de op med at komme frem.

---

## Postkasser på domænet

Dette er den anden halvdel: at `info@jammerbugtrengoering.dk` bliver en rigtig adresse,
I kan modtage og skrive fra — i stedet for `jammerbugtrengoering@outlook.dk`.

Det er ikke nødvendigt for at systemet kan sende. Det er nødvendigt, hvis I vil se
professionelle ud over for kunderne, og det bør I.

### Hvad I skal vælge imellem

**Simply.coms egen mail** er den enkle vej. DNS og webhotel ligger der i forvejen, så
MX-posten sættes automatisk, når du opretter den første postkasse i kontrolpanelet.
Mail er typisk med i webhotelpakken. Passer til jeres størrelse.

**Microsoft 365** giver Outlook, delte kalendere og Teams. Koster pr. bruger pr. måned.
Overvej det, hvis I allerede lever i Office, eller hvis flere skal dele kalender og filer.

**Google Workspace** svarer til 365, bare med Gmail. Samme overvejelse.

Uanset hvad: MX-posterne peger ét sted hen. **Vælg én udbyder** — mail kan ikke deles
mellem to.

### Hos Simply.com

1. Log ind på Simply.com og vælg webhotellet for `jammerbugtrengoering.dk`.
2. Gå til **Mail** og opret den første konto, for eksempel `info`.
3. Simply sætter selv MX-posten til `mx.simply.com`, fordi de også har jeres DNS.
4. Kontroller i DNS-oversigten at MX står der — og at der stadig kun er **én** SPF-post,
   med både Simply og Brevo i, hvis Brevo allerede er sat op.
5. Send en testmail **ind udefra** til adressen. Kommer den frem, virker MX.
6. Send en testmail **ud** til din `@pearlgroup.dk` og tjek, at den ikke lander i spam.

Indstillinger til mailprogram, hvis du skal bruge dem: indgående `mail.simply.com`
(IMAP 143), udgående `smtp.simply.com` (port 587).

### Rækkefølgen, der gør mindst ondt

1. Opret postkassen, men **behold outlook-adressen aktiv**.
2. Sæt viderestilling fra den gamle adresse til den nye, så intet går tabt.
3. Skriv den nye adresse på hjemmeside, fakturaer, Google-profil og bilerne.
4. Giv det nogle måneder, hvor begge virker.
5. Luk først den gamle, når der ikke længere kommer noget den vej.

Sæt `SVAR_TIL` i Supabase til den nye adresse, så snart postkassen virker. Så lander et
kundesvar på en systemmail hos jer og ikke i ingenting.

---

## Det her løser ikke alt

Login-koden til kundeportalen er stadig en kode og ikke et link, og det skal den blive
ved med at være. Det er et andet problem: firmamail *åbner* links automatisk for at scanne
dem, og et login-link bliver brugt op i samme øjeblik. Det er uafhængigt af, hvem mailen
kommer fra.

Medarbejdernes Worklist sender stadig et link, når en ny medarbejder skal vælge adgangskode.
Det holder, så længe de er på gmail og yahoo. Kommer én af dem på firmamail, rammer det
samme problem, og så skal den vej også lægges om.

---

## Kilder

- [Authenticate your domain with Brevo (Brevo code, DKIM record, DMARC record)](https://help.brevo.com/hc/en-us/articles/12163873383186-Authenticate-your-domain-with-Brevo-Brevo-code-DKIM-record-DMARC-record)
- [Comply with Gmail, Yahoo, and Microsoft's requirements for email senders](https://help.brevo.com/hc/en-us/articles/14925263522578-Comply-with-Gmail-Yahoo-and-Microsoft-s-requirements-for-email-senders)
- [Troubleshooting issues with domain authentication](https://help.brevo.com/hc/en-us/articles/16045394674066-Troubleshooting-issues-with-domain-authentication-Brevo-code-DKIM-DMARC)
- [What is a DMARC policy and how does it affect the sending of my emails?](https://help.brevo.com/hc/en-us/articles/10415456027666-FAQs-What-is-a-DMARC-policy-and-how-does-it-affect-the-sending-of-my-emails)
- [Simply.com — opsætning af e-mail](https://www.simply.com/en/support/faq/mail/115-setting-up-email/)
- [Simply.com — om DNS records](https://www.simply.com/dk/support/faq/3/339/)
