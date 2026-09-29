# Edge-funktioner i KUNDEDATABASEN

Projekt `zwbsbckoyxzzobudjxij` («Kundeloesning»). IKKE Jammerbugt Rengøring
(`gteowfoahsfpunzgdxum`) — funktionerne i `../functions` hører til den.

Som i `../functions` er det en KOPI: funktionerne køres og udrulles i Supabase.

| Funktion | Hvad | verify_jwt |
|---|---|---|
| `jr-bro` | Broen FRA Jammerbugt: opret, tilvalg, luk/åbn og nyt link til et firma. Kaldes kun af Jammerbugts `kundeloesning` med broens nøgle. | nej (broens nøgle) |
| `bestil-hjaelp` | «Ekstra hjælp» i kundens planlægning. Sender videre til Jammerbugts `bro-modtag` og henter status derfra. Kun planlæggere. | ja |
| `inviter-bruger` | Medarbejder- og portal-invitationer. Tjekker at den, der inviterer, kun rører sit eget firma. | ja |
| `send-email` | Mail via Brevo med firmaets eget afsendernavn. | nej (egne vagter) |
| `send-push` | Push til telefoner, kun i afsenderens eget firma. Kræver VAPID-nøgler (se JOB.md). | nej (egne vagter) |
| `plan-beskeder`, `kontor-beskeder`, `daglige-paamindelser`, `maaneds-paamindelse`, `slet-gamle-fotos` | Baggrundsjob, ét firma ad gangen. **Ikke sat i gang** — se JOB.md. | ja |

`_felles/firmaer.ts` bruges af baggrundsjobbene og `send-push`. Udrul den med som
`../_felles/firmaer.ts`.

## Broen til Jammerbugt (fase 5, 29.9.2026)

Kundeløsningen aktiveres KUN fra kundekortet i Jammerbugts planlægning (afsnittet
«Planlægning og Worklist»). Derfra:

    Jammerbugt: kundeloesning  ──(broens nøgle)──▶  kunde: jr-bro  → firma + admin + mail
    kunde: bestil-hjaelp       ──(broens nøgle)──▶  Jammerbugt: bro-modtag → portal_bestillinger

Den åbne tilmelding (`opret-firma`), `skema-import` og engangsfunktionen, der
overdrog broens nøgle, er slettet 29.9.2026.

Broens nøgle ligger i `bro.noegle` i begge databaser og kan kun læses af
service_role. Den blev dannet i Jammerbugts database og sendt over én gang;
sha256 blev sammenlignet i begge ender. Skal den skiftes, skal det ske i begge
databaser på samme tid.

Hemmeligheder i projektet (Edge Functions → Secrets): `BREVO_API_KEY` og
`AFSENDER_EMAIL` (sat). Senere: `VAPID_OFFENTLIG_NOEGLE`, `VAPID_PRIVAT_NOEGLE`.
