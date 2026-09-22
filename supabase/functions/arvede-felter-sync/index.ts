import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Natlig selvhelbredelse for opgaver, klienten aldrig naar.
//
// App.jsx's egen selvhelbredelse (ARVEDE_FELTER + gemArvedeFelter) retter kun de
// opgaver, der bliver hentet ind i en aabnet uge - typisk et par maaneder frem
// (UGER_FREM i vindue.js). Opgaver dannet langt ude i horisonten (vi har set op til
// et aar frem, uge 8/2028) bliver ALDRIG hentet af en almindelig aabning af appen,
// og faar derfor aldrig et helbredelses-gennemloeb, foer den uge en dag rykker
// indenfor vinduet - og indtil da staar de med en forkert kontrakttype, adresse,
// PO-nummer eller kontaktoplysninger, uden at nogen kan se det andet end ved at
// spoerge databasen direkte.
//
// 22.9.2026: fundet ved at 20 Nexus-opgaver, dannet 16.-21.9, laa uge 2027-2028
// og stadig havde contract_type "privat" fra oprettelsen - selvom aftalen for
// laengst var rettet til "nexus". 106 opgaver i alt havde et lignende hop mellem
// aftale og opgave paa mindst ét af de tolv arvede felter.
//
// Skriver PRAECIS de samme tolv kolonner som gemArvedeFelter, med samme vaern:
// aldrig en opgave der er udfoert, faktureret til Dinero, eller har registreret
// tid. De felter er den enkelte opgaves egne fra dét tidspunkt, og maa ikke
// overskrives af en aftale, der er aendret sidenhen.
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const JOB = "arvede-felter-sync";

// De tolv kolonner, i samme raekkefoelge og med samme DB-navne som gemArvedeFelter
// i App.jsx. Ét sted i klienten, ét sted herinde - ellers kan de to komme til at
// helbrede forskelligt.
const ARVEDE_KOLONNER = [
  "customer_name", "address_text", "dinero_contact_guid", "po_number",
  "needs_key_pickup", "contract_type", "pricing_type", "fixed_price",
  "video_url", "telefon", "email", "kontaktperson",
] as const;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

type Raekke = Record<string, unknown>;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const log = (ok: boolean, besked?: string) => admin.rpc("log_job", { p_job: JOB, p_ok: ok, p_besked: besked ?? null });

  try {
    // Alle aftaler, kun de kolonner der kan arves. Antallet er nogle hundrede,
    // ingen grund til at sidepaginere.
    const { data: aftaler, error: aftalerFejl } = await admin
      .from("service_templates")
      .select(["id", ...ARVEDE_KOLONNER].join(", "));
    if (aftalerFejl) throw new Error("kunne ikke hente aftaler: " + aftalerFejl.message);
    const aftalePrId = new Map<string, Raekke>((aftaler ?? []).map((a: Raekke) => [a.id as string, a]));

    // Kun opgaver der maa roeres: hoerer til en aftale, er ikke udfoert, ikke
    // sendt til Dinero, og har ingen registreret tid. Samme tre vaern som
    // gemArvedeFelter/selvhelbredelsen i App.jsx bruger.
    const opgaver: Raekke[] = [];
    let page = 0;
    const pageSize = 1000;
    while (true) {
      const { data, error } = await admin
        .from("instances")
        .select(["id", "template_id", ...ARVEDE_KOLONNER].join(", "))
        .not("template_id", "is", null)
        .is("deleted_at", null)
        .neq("status", "udført")
        .eq("dinero_exported", false)
        .range(page * pageSize, page * pageSize + pageSize - 1);
      if (error) throw new Error("kunne ikke hente opgaver (side " + page + "): " + error.message);
      if (!data || data.length === 0) break;
      opgaver.push(...data);
      if (data.length < pageSize) break;
      page++;
      if (page > 50) break; // vaern mod en uendelig loekke, hvis noget uventet sker
    }

    let rettet = 0;
    let sprunget_over_tid = 0;
    for (const opg of opgaver) {
      const aftale = aftalePrId.get(opg.template_id as string);
      if (!aftale) continue;

      // Tidsregistrering ligger ikke i den samme select (time_log er stor og
      // ikke noedvendig for sammenligningen) - hentes kun for de raekker, der
      // rent faktisk afviger, saa vi ikke traekker hele kolonnen ned for 11.000
      // opgaver hver nat.
      const patch: Raekke = {};
      for (const kol of ARVEDE_KOLONNER) {
        const aftaleVaerdi = aftale[kol] ?? (kol === "contract_type" ? "privat" : kol === "pricing_type" ? "hourly" : kol === "needs_key_pickup" ? false : "");
        const opgVaerdi = opg[kol] ?? (kol === "contract_type" ? "privat" : kol === "pricing_type" ? "hourly" : kol === "needs_key_pickup" ? false : "");
        if (JSON.stringify(aftaleVaerdi) !== JSON.stringify(opgVaerdi)) patch[kol] = aftale[kol];
      }
      if (Object.keys(patch).length === 0) continue;

      // Sidste vaern, lige inden skrivning: har opgaven registreret tid siden
      // den blev hentet ovenfor, roerer vi den ikke. Hentes kun for de faa
      // raekker der naar hertil.
      const { data: tjek } = await admin.from("instances").select("time_log").eq("id", opg.id).maybeSingle();
      const harTid = Array.isArray(tjek?.time_log) && (tjek!.time_log as unknown[]).length > 0;
      if (harTid) { sprunget_over_tid++; continue; }

      const { error } = await admin.from("instances").update(patch).eq("id", opg.id);
      if (error) throw new Error(`kunne ikke rette opgave ${opg.id}: ${error.message}`);
      rettet++;
    }

    await log(true, `${opgaver.length} opgaver gennemgået, ${rettet} rettet, ${sprunget_over_tid} sprunget over (tid registreret siden hentning)`);
    return jsonResponse({ ok: true, opgaverGennemgaaet: opgaver.length, rettet, sprungetOverTid: sprunget_over_tid });
  } catch (e) {
    const m = String((e as Error)?.message ?? e);
    await log(false, m);
    return jsonResponse({ error: m }, 500);
  }
});
