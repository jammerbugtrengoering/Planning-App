# Baggrundsjob i kundedatabasen

**Status 29.9.2026: bygget og udrullet, men IKKE sat i gang.** Jonn: jobbene startes,
når den første løsning er solgt.

Hvert job kører ét firma ad gangen (`_felles/firmaer.ts`). Et firma, der er lukket fra
kundekortet hos Jammerbugt, springes over.

| Funktion | Hvad | Hvornår (som hos Jammerbugt) |
|---|---|---|
| `plan-beskeder` `{job:"aendringer"}` | Samlede planændringer + «Er du færdig?» ved start/stop | hvert kvarter |
| `plan-beskeder` `{job:"start"}` | Glemt Start: push efter 5 min, systemstart efter 10 min | hvert 5. minut |
| `plan-beskeder` `{job:"i_morgen"}` | Hvad der står i morgen | 17 UTC, søn–tors |
| `kontor-beskeder` `{job:"push"}` | Det hastende til planlæggerne | hvert kvarter |
| `kontor-beskeder` `{job:"morgen"}` | Morgenmail kl. 7 dansk tid | 5 og 6 UTC |
| `daglige-paamindelser` | Manglende registrering kl. 18 | 16 og 17 UTC |
| `maaneds-paamindelse` | Sidste udkald før månedsskiftet | 16 og 17 UTC |
| `slet-gamle-fotos` | Opgavefotos ældre end 12 måneder | 2 UTC |
| `koer_for_alle_firmaer('ryd_gamle_adgangskoder')` (SQL) | Rydder adgangskoder på gamle opgaver | 3 UTC |

Ikke med: kilometerberegning (kræver egen kortnøgle og `travel-distance`), Dinero,
Nexus og helsetjek.

Alle job kan prøves på ét firma uden at røre de andre: `{"firma": "<firma-id>"}`.
`daglige-paamindelser` og `slet-gamle-fotos` kan også køre med `{"dryRun": true}`.

## Før de sættes i gang

1. **Push-nøgler.** Lav et nyt nøglepar, kun til kundeløsningen:
   `npx web-push generate-vapid-keys`
   - Supabase → Kundeloesning → Edge Functions → Secrets: `VAPID_OFFENTLIG_NOEGLE` og
     `VAPID_PRIVAT_NOEGLE`
   - Netlify → kunde-worklist → Environment variables: `VITE_VAPID_OFFENTLIG` (den
     offentlige), og byg igen
2. **Udvidelser.** Supabase → Kundeloesning → Database → Extensions: slå `pg_cron` og
   `pg_net` til.
3. **Planen.** Kør SQL'en nedenfor i SQL Editor. `<PUBLISHABLE>` er projektets
   publishable key (Project Settings → API Keys).

```sql
do $$
declare
  u text := 'https://zwbsbckoyxzzobudjxij.supabase.co/functions/v1/';
  h jsonb := jsonb_build_object('Content-Type','application/json','Authorization','Bearer <PUBLISHABLE>');
  kald text;
begin
  kald := 'select net.http_post(url := %L, headers := %L::jsonb, body := %L::jsonb, timeout_milliseconds := 60000)';
  perform cron.schedule('plan-aendringer-kvartal', '*/15 * * * *', format(kald, u||'plan-beskeder', h, '{"job":"aendringer"}'));
  perform cron.schedule('glemt-start-5min',        '*/5 * * * *',  format(kald, u||'plan-beskeder', h, '{"job":"start"}'));
  perform cron.schedule('plan-i-morgen-aften',     '0 17 * * 0-4',  format(kald, u||'plan-beskeder', h, '{"job":"i_morgen"}'));
  perform cron.schedule('kontor-push-kvartal',     '*/15 * * * *', format(kald, u||'kontor-beskeder', h, '{"job":"push"}'));
  perform cron.schedule('kontor-morgenmail',       '0 5,6 * * *',  format(kald, u||'kontor-beskeder', h, '{"job":"morgen"}'));
  perform cron.schedule('daglig-registreringspaamindelse', '0 16,17 * * *', format(kald, u||'daglige-paamindelser', h, '{}'));
  perform cron.schedule('maaneds-paamindelse',     '0 16,17 * * *', format(kald, u||'maaneds-paamindelse', h, '{}'));
  perform cron.schedule('slet-gamle-opgavefotos',  '0 2 * * *',    format(kald, u||'slet-gamle-fotos', h, '{}'));
  perform cron.schedule('ryd-adgangskoder-nat',    '0 3 * * *',    $c$select koer_for_alle_firmaer('ryd_gamle_adgangskoder')$c$);
end $$;
```

Stoppes igen med `select cron.unschedule('<navn>');`.
