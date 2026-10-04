# Kampagnebrief: ældre og deres børn — Aabybro og Jammerbugt

Skrevet 4.10.2026 ud fra Jonns oplæg: vil vi ramme ældrelov og Nexus (kommunal
hjemmehjælp), skal kampagnen også ramme de ældres børn, for det er ofte dem, der tager
beslutningen.

Tallene er fra Danmarks Statistik. Kampagnens retning er et forslag — intet er besluttet
endnu.

---

## 1. Hvem bor her

| Alder | Aabybro (6.773) | Jammerbugt Kommune (37.890) | Hele landet |
|---|---|---|---|
| 0–17 | **25,6 %** | 18,8 % | 18,8 % |
| 18–29 | 9,9 % | 10,5 % | 15,4 % |
| 30–44 | 19,6 % | 16,2 % | 19,1 % |
| 45–64 | 23,6 % | 27,6 % | 25,6 % |
| 65–74 | 7,7 % | 13,3 % | 10,5 % |
| **75–84** | **10,7 %** (728) | 10,7 % (4.059) | 8,1 % |
| **85+** | 2,9 % (195) | 3,0 % (1.151) | 2,6 % |
| **75+ i alt** | **923 personer** | **5.210 personer** | 10,7 % |
| 50–69 (typisk alder for børn af 75+) | 1.383 | 10.782 | — |

Kilder: BY1 (byområder, 1.1.2026) og FOLK1A (kommune og land, 3. kvt. 2026).
Aabybro-tallet er fra januar, de to andre fra juli — forskellen er uden betydning her.

**Det tallene siger**

- **Aabybro er to byer i én:** mange børnefamilier og en stor gruppe på 75+, mens
  65–74-årige er få. Det tyder på, at ældre flytter ind til Aabybro fra landdistrikterne,
  når de får brug for at være tæt på hjælp, butikker og plejecenter.
- **Kommunen er ældre end landet.** Hver fjerde er over 65, og de 65–74-årige er mange.
  Det er kunderne om 5–10 år.
- **Børnene til de 75+-årige er typisk 45–65 år.** Statistikken kan ikke vise, hvor de
  bor, men mønsteret for oplandsbyer er, at mange bor i Aalborg, Nørresundby og Vodskov,
  20–30 minutter væk.

---

## 2. To målgrupper, to budskaber

| | Den ældre (75+) | Barnet (45–65) |
|---|---|---|
| Hvad fylder | Tryghed, at det er de samme, der kommer, at kunne ringe | At mor eller far er godt hjulpet, uden at de selv skal køre derud hver uge |
| Hvad de gør | Ringer — eller lader barnet gøre det | Researcher, sammenligner, vælger leverandør |
| Budskab | «Den samme faste hjælper. Ring bare — vi tager telefonen.» | «Vi holder øje med mor. Du kan altid få fat i os direkte.» |
| Kanal | Pjece, magnet, lokalavis, plejecenter, aktivitetscenter, lægehus, apotek | Facebook og Instagram, Google-søgning |

**To veje ind:**

1. **Frit valg efter visitation (ældrelov/Nexus).** Kommunen afgør behovet; borgeren —
   i praksis ofte barnet — vælger leverandør. Her skal vi være kendt *før* visitationen.
   Jammerbugt Rengøring er godkendt leverandør til kommunen og underleverandør til
   Carelink — så vejen er åben nu.
2. **Privat tilkøb.** Det, kommunen ikke dækker. Ofte betalt af børnene som en gave:
   «hovedrengøring til mor», «vinduerne inden jul».

---

## 3. Målretning

- **Facebook/Instagram til børnene:** 45–65 år, inden for ca. 35 km af Aabybro (det
  dækker Jammerbugt og Aalborg-området). I EU kan man ikke længere målrette på «har ældre
  forældre» — det er alder og sted, der gør arbejdet. Budskabet skal derfor selv sige,
  at det handler om forældrene.
- **Google:** søgninger som «hjemmehjælp Jammerbugt», «frit valg hjemmehjælp»,
  «rengøring ældre Aabybro».
- **De ældre selv:** pjecen og magneten (allerede lavet, se mappen her), lokalavisen,
  opslag på plejecenter og aktivitetscenter. Husk: uadresseret reklame kun i postkasser
  med «Ja tak til reklamer».

---

## 4. Måling — kan bruges uden at bygge noget

Siden «Bliv ringet op» (`/bestil` i kundeportalen) gemmer, hvor henvendelsen kom fra,
ud fra `?k=` i adressen. **Alle værdier tages imod** (bogstaver, tal, `-` og `_`, højst
40 tegn), så hver kampagne kan få sin egen kode uden ændringer i koden:

| Kanal | Link |
|---|---|
| Pjece (findes) | `…/bestil?k=pjece` |
| Magnet (findes) | `…/bestil?k=magnet` |
| Facebook til børnene | `…/bestil?k=fb-boern` |
| Facebook til de ældre | `…/bestil?k=fb-aeldre` |
| Google | `…/bestil?k=google` |
| Lokalavis | `…/bestil?k=avis` |

Kilden står på hver henvendelse under Salg → Henvendelser.

**Mangler, hvis børnene skal bestille:** formularen er skrevet til den ældre selv.
Bestiller barnet på forældrenes vegne, skal der være plads til både barnets telefon og
forælderens adresse. Det er en lille ændring i `Bestil.jsx` og `henvendelser` — og så
er der et nyt felt med personoplysninger, der skal i `persondata_register`, privatlivsteksten
og `Fortegnelse-markedsfoering.docx`.

---

## 5. Åbne spørgsmål til Jonn og Charlotte

- ~~Godkendt leverandør?~~ **Ja** (Jonn 4.10.2026): godkendt leverandør til Jammerbugt
  Kommune og underleverandør til Carelink. «Vej 1» kan bruges i kampagnen nu.
- Budskabet skal tage hensyn til Carelink: kampagnen bør sige «vælg Jammerbugt
  Rengøring, når kommunen har visiteret dig» — ikke sætte sig op imod Carelink, som også
  sender opgaver til os. Afklar med Carelink, om de har noget imod, at vi markedsfører
  os direkte over for borgere i samme område.
- Budget og periode for Facebook.
- Skal der laves en udgave af formularen til pårørende (se punkt 4)?
- Skal kampagnen køre gennem kampagneappen (SoMePlanning)?
