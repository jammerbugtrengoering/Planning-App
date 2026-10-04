-- Køres i Supabase (JR) → SQL Editor. Kunne ikke køres af Claude 4.10.2026:
-- migrationer med «drop table» blev afvist af godkendelsen fire gange.
--
-- Hvorfor: kopi_travel_overrides_ors_20261002 kom aldrig med i oprydningen og ville
-- blive liggende med adresser for evigt. Nu slettes den 13.11.2026 sammen med de
-- andre oprydningskopier. Intet slettes før den dato — funktionen svarer
-- «venter til 2026-11-13» indtil da.
CREATE OR REPLACE FUNCTION public.ryd_oprydningskopier()
 RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'cron'
AS $function$
declare v_dato date := date '2026-11-13'; v_besked text;
begin
  if current_date < v_dato then
    return 'venter til ' || v_dato;
  end if;

  drop table if exists public.oprydning_opsagte_2026_09;
  drop table if exists public.oprydning_aftaler_2026_09;
  drop table if exists public.kopi_forkert_rytme_20260913;
  drop table if exists public.kopi_slettede_aftaler_20260930;
  drop table if exists public.kopi_slettede_aftaleskills_20260930;
  drop table if exists public.kopi_travel_overrides_ors_20261002;

  delete from persondata_register
   where tabel in ('oprydning_opsagte_2026_09','oprydning_aftaler_2026_09',
                   'kopi_forkert_rytme_20260913',
                   'kopi_slettede_aftaler_20260930','kopi_slettede_aftaleskills_20260930',
                   'kopi_travel_overrides_ors_20261002');

  perform cron.unschedule('ryd-oprydningskopier')
    where exists (select 1 from cron.job where jobname = 'ryd-oprydningskopier');

  v_besked := 'oprydningskopierne er slettet';
  perform log_job('ryd-oprydningskopier', true, v_besked);
  return v_besked;
end
$function$;
revoke execute on function public.ryd_oprydningskopier() from public, anon, authenticated;

-- Kontrol bagefter — skal svare «venter til 2026-11-13»:
select public.ryd_oprydningskopier();
