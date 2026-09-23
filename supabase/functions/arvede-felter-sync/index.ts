import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Natlig selvhelbredelse for opgaver, klienten aldrig naar.
//
// App.jsx's egen selvhelbredelse (ensureWeekInstances + gemArvedeFelter) retter kun de
// opgaver, der bliver hentet ind i en aabnet uge - typisk et par maaneder frem
// (UGER_FREM i vindue.js). Opgaver dannet langt ude i horisonten bliver ALDRIG hentet
// af en almindelig aabning af appen, og staar indtil da med en forkert kontrakttype,
// adresse eller kontaktoplysninger, uden at nogen kan se det.
//
// 22.9.2026: fundet ved at 20 Nexus-opgaver i 2027-2028 stadig havde contract_type
// "privat" fra oprettelsen, selvom aftalen for laengst var rettet til "nexus".
//
// 23.9.2026, TRE rettelser efter foerste koersel:
//
// 1) SKRIVEVEJEN VIRKEDE ALDRIG. Baade denne og appens gemArvedeFelter brugte en
//    upsert med kun de tolv arvede kolonner. Postgres tjekker NOT NULL paa den raekke,
//    der ville blive INDSAT, foer den opdager at id'et findes — og title, type, week og
//    duration har ingen standardvaerdi. Bevist med en proeve, der rullede sig selv
//    tilbage. Nu skrives der gennem opdater_arvede_felter(), en UPDATE, som kun roerer
//    de tolv kolonner. Samme funktion bruges af appen, og vaernene mod at roere leveret
//    arbejde staar ogsaa inde i den.
//
// 2) FEM FELTER MAA KUN ARVES, NAAR AFTALEN HAR EN VAERDI. Foerste version skrev alle
//    tolv ubetinget. Men appen har et vaern paa po_number, dinero_contact_guid, telefon,
//    email og kontaktperson: de kopieres kun ned, hvis aftalen HAR en vaerdi.
//    Grunden staar ved selvhelbredelsen i App.jsx: paa Nexus og AEldrelov staar
//    BORGERENS NAVN i opgavens PO-felt, mens kommunens aftale er tom. Det navn ender som
//    kommentar paa fakturalinjen, saa kommunen kan se, hvem regningen vedroerer.
//    En ubetinget kopi ned ville slette det. Jammerbugt Kommunes aftale med Louise
//    Carstensen Pedersen er netop saadan: navnet staar paa opgaven, ikke paa aftalen.
//
// 3) FOR LANGSOM. Én SELECT + én UPDATE pr. raekke timede ud paa 30 sekunder. Nu:
//    én SELECT pr. side, og rettelserne i portioner paa 200.
//
// Reglerne herunder SKAL vaere de samme som i ensureWeekInstances i App.jsx. Aendrer du
// den ene, saa aendr den anden — ellers helbreder de to forskelligt, og en opgave bliver
// rettet frem og tilbage hver nat.
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const JOB = "arvede-felter-sync";
const BATCH = 200;

const KOLONNER = [
  "customer_name", "address_text", "dinero_contact_guid", "po_number",
  "needs_key_pickup", "contract_type", "pricing_type", "fixed_price",
  "video_url", "telefon", "email", "kontaktperson",
] as const;

// Kun hvis aftalen HAR en vaerdi. Ellers beholder opgaven sin egen.
const KUN_HVIS_AFTALEN_HAR = new Set(["dinero_contact_guid", "po_number", "telefon", "email", "kontaktperson"]);

type Raekke = Record<string, unknown>;

// Hvad opgaven SKAL have, givet aftalen. Samme standardvaerdier som App.jsx.
function maal(aftale: Raekke, opg: Raekke): Raekke {
  const ud: Raekke = { id: opg.id };
  for (const k of KOLONNER) {
    const a = aftale[k];
    if (KUN_HVIS_AFTALEN_HAR.has(k)) {
      ud[k] = (a !== null && a !== undefined && a !== "") ? a : (opg[k] ?? null);
    } else if (k === "contract_type") ud[k] = a || "privat";
    else if (k === "pricing_type") ud[k] = a || "hourly";
    else if (k === "needs_key_pickup") ud[k] = !!a;
    else if (k === "fixed_price") ud[k] = a ?? null;
    else ud[k] = a ?? "";                       // customer_name, address_text, video_url
  }
  return ud;
}

// Er der noget at skrive? Tomt og null regnes som ens, ellers ville hver nat
// «rette» tusindvis af raekker fra null til "" og tilbage.
function norm(v: unknown): string {
  return JSON.stringify(v === null || v === undefined ? "" : v);
}
function afviger(opg: Raekke, m: Raekke): boolean {
  return KOLONNER.some((k) => norm(opg[k]) !== norm(m[k]));
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok");
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const log = (ok: boolean, besked: string) =>
    admin.rpc("log_job", { p_job: JOB, p_ok: ok, p_besked: besked });

  try {
    const { data: aftaler, error: aftalerFejl } = await admin
      .from("service_templates").select(["id", ...KOLONNER].join(", "));
    if (aftalerFejl) throw new Error("kunne ikke hente aftaler: " + aftalerFejl.message);
    const aftalePrId = new Map<string, Raekke>((aftaler ?? []).map((a: Raekke) => [a.id as string, a]));

    // Kun opgaver, der maa roeres. dinero_exported kan vaere null paa aeldre raekker;
    // «not is true» tager baade false og null med. «= false» ville springe dem over.
    const opgaver: Raekke[] = [];
    for (let side = 0; side < 60; side++) {
      const { data, error } = await admin
        .from("instances")
        .select(["id", "template_id", "time_log", ...KOLONNER].join(", "))
        .not("template_id", "is", null)
        .is("deleted_at", null)
        .neq("status", "udført")
        .not("dinero_exported", "is", true)
        .order("id", { ascending: true })
        .range(side * 1000, side * 1000 + 999);
      if (error) throw new Error(`kunne ikke hente opgaver (side ${side}): ${error.message}`);
      if (!data || data.length === 0) break;
      opgaver.push(...data);
      if (data.length < 1000) break;
    }

    const rettelser: Raekke[] = [];
    let medTid = 0;
    for (const opg of opgaver) {
      const aftale = aftalePrId.get(opg.template_id as string);
      if (!aftale) continue;
      const m = maal(aftale, opg);
      if (!afviger(opg, m)) continue;
      if (Array.isArray(opg.time_log) && opg.time_log.length > 0) { medTid++; continue; }
      rettelser.push(m);
    }

    let rettet = 0;
    for (let i = 0; i < rettelser.length; i += BATCH) {
      const { data, error } = await admin.rpc("opdater_arvede_felter", { raekker: rettelser.slice(i, i + BATCH) });
      if (error) throw new Error(`portion ${i / BATCH + 1} fejlede: ${error.message}`);
      rettet += Number(data) || 0;
    }

    const besked = `${opgaver.length} opgaver gennemgået, ${rettelser.length} afveg, ${rettet} rettet, ${medTid} sprunget over (tid registreret)`;
    await log(true, besked);
    return new Response(JSON.stringify({ ok: true, gennemgaaet: opgaver.length, afveg: rettelser.length, rettet, medTid }),
      { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    const m = String((e as Error)?.message ?? e);
    await log(false, m);
    return new Response(JSON.stringify({ error: m }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
});
