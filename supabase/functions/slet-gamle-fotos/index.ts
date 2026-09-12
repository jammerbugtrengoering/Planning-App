import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Sletter billeder i bucket'en opgavefotos.
//
// To tilstande:
//   uden body      — det natlige job: alt der er aeldre end opbevaringsfristen
//   {"stier":[..]} — navngivne filer, fx en testopgave der ryddes op, eller en
//                    kunde der beder om at faa billeder af sit hjem slettet
//
// Filerne slettes gennem storage-API'et og ikke med SQL. En DELETE i storage.objects
// fjerner kun raekken; selve filen ville blive liggende i lageret og dermed stadig
// vaere gemte persondata.
//
// 12.9.2026: ét forsoeg var ikke nok.
//
// Natten til den 12. svarede databasen "Gateway Timeout" paa opslaget over gamle
// billeder. Jobbet meldte fejl, morgentjekket sendte mail — og der var ikke noget
// galt overhovedet: bucket'en var tom, forespoergslen tager et tiendedels millisekund,
// og samme kald virkede fint nogle timer senere. Det var en hikke i platformen.
//
// En alarm om noget, der ikke fejler, er det dyreste et vagtsystem kan producere:
// den laerer folk at ignorere alarmerne. Derfor proeves der nu én gang til, foer der
// meldes fejl. Helsetjek goer praecis det samme med sit eget opslag, og af samme grund.
//
// Begge kald taaler at blive gentaget: opslaget laeser kun, og at fjerne en fil der
// allerede er fjernet er i orden.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const BUCKET = "opgavefotos";
const MAANEDER = 12;
const JOB = "slet-gamle-fotos";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Proev igen én gang efter en kort pause. Returnerer det sidste svar, uanset om det
// gik godt — den der kalder, afgoer hvad en fejl skal foere til.
//
// To sekunder og ikke tyve: jobbet har et samlet tidsbudget hos gatewayen, og en lang
// pause ville bytte én slags timeout ud med en anden.
async function medEtForsoegTil<T extends { error: unknown }>(
  hvad: string, kald: () => Promise<T>,
): Promise<T> {
  const foerste = await kald();
  if (!foerste.error) return foerste;
  console.error(`${hvad} fejlede, proever igen:`, String((foerste.error as Error)?.message ?? foerste.error));
  await new Promise((r) => setTimeout(r, 2000));
  return await kald();
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  // Livstegn til morgentjekket, saa et job der holder op med at virke bliver opdaget.
  const log = (ok: boolean, besked?: string) =>
    supabase.rpc("log_job", { p_job: JOB, p_ok: ok, p_besked: besked ?? null });

  try {
    const body = await req.json().catch(() => ({}));
    // Med toerloeb kan man se hvad der ville blive slettet, uden at slette noget.
    const toerloeb = body.dryRun === true;
    const maaneder = Number(body.maaneder) > 0 ? Number(body.maaneder) : MAANEDER;
    const navngivne: string[] = Array.isArray(body.stier) ? body.stier.filter(Boolean) : [];

    let stier: string[];
    if (navngivne.length > 0) {
      // Bevidst ingen aldersgraense her: kaldet naevner praecist hvilke filer der
      // skal vaek, og det er hele pointen med den tilstand.
      stier = navngivne;
    } else {
      // storage.objects er den eneste kilde der kender filernes alder. Noten kan vaere
      // rettet senere, saa dens created_at duer ikke som maalestok for billedet.
      const { data: gamle, error: listErr } = await medEtForsoegTil(
        "opslag over gamle billeder",
        () => supabase.rpc("gamle_opgavefotos", { p_maaneder: maaneder }),
      );
      if (listErr) { await log(false, listErr.message); return jsonResponse({ error: listErr.message }, 500); }
      stier = (gamle || []).map((o: { sti: string }) => o.sti).filter(Boolean);
    }

    if (stier.length === 0) {
      if (!toerloeb && navngivne.length === 0) await log(true, "intet at slette");
      return jsonResponse({ ok: true, maaneder, slettet: 0, toerloeb });
    }
    if (toerloeb) {
      return jsonResponse({ ok: true, maaneder, villeSlette: stier.length, stier, toerloeb });
    }

    const { error: delErr } = await medEtForsoegTil(
      "sletning af billeder",
      () => supabase.storage.from(BUCKET).remove(stier),
    );
    if (delErr) { await log(false, delErr.message); return jsonResponse({ error: delErr.message }, 500); }

    // Noterne beholder deres tekst. Kun billedlisten toemmes, og der saettes et
    // tidsstempel saa man i planlaegningsappen kan se at der HAR vaeret billeder.
    const opgaveIder = [...new Set(stier.map((s: string) => s.split("/")[0]))];
    const { error: updErr } = await medEtForsoegTil(
      "toemning af billedlisten paa noterne",
      () => supabase
        .from("task_notes")
        .update({ photos: [], photos_deleted_at: new Date().toISOString() })
        .in("instance_id", opgaveIder)
        .is("photos_deleted_at", null),
    );
    if (updErr) { await log(false, updErr.message); return jsonResponse({ error: updErr.message, slettet: stier.length }, 500); }

    if (navngivne.length === 0) await log(true, `${stier.length} billeder slettet`);
    return jsonResponse({ ok: true, slettet: stier.length, opgaver: opgaveIder.length, navngivne: navngivne.length > 0 });
  } catch (e) {
    const m = String((e && (e as Error).message) || e);
    await log(false, m);
    return jsonResponse({ error: m }, 500);
  }
});
