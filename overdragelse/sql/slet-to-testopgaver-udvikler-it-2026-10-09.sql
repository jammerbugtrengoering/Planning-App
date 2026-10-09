-- Hvorfor: «test» og «test privat» (fredag uge 41, kunde TEST) blev lavet under afprøvningen af Worklist og planlægningen 9.10.2026, og ligger på Udvikler IT.
-- De er udført med registreret tid, så de ville ellers tælle med i tal og rapporter. Claude kan ikke slette (værktøjet afviser delete), så kør i Supabase SQL Editor.
-- Opgavernes noter, adgangsopslag og tidsstarter slettes med dem (on delete cascade). Kørsel og lagerbevægelser står tilbage uden opgave (set null).
-- Ændringsloggen (aendringslog) beholdes med vilje: den viser, hvad der skete.

-- 1. Tjek først, at det kun er de to rækker:
select id, title, customer_name, week, year, day, status, assignees
from public.instances
where id in ('id14962e0687243bb', 'i5b691a141acd457d');

-- 2. Slet:
delete from public.instances
where id in ('id14962e0687243bb', 'i5b691a141acd457d')
  and customer_name = 'TEST';
