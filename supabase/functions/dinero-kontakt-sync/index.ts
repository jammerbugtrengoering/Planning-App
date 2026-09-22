import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Natlig synkronisering af telefon, e-mail og kontaktperson (Att. person) fra Dineros
// kontakter, ned på aftalerne i service_templates.
//
// HVORFOR service_templates og ikke instances direkte: aftalen/opgaven autoudfylder
// allerede disse tre felter fra Dinero, når kontoret VÆLGER kunden i App.jsx (se
// selectDineroCustomer / selectDineroCustomerForEdit). Det dækker "kunden vælges nu".
// Det her job dækker det modsatte: nogen retter telefonnummeret INDE I Dinero, på en
// kontakt der allerede sidder på en aftale. Uden denne synkronisering ville aftalen
// aldrig få det at vide.
//
// Skriver KUN service_templates. Den eksisterende selvhelbredelse i App.jsx
// (ARVEDE_FELTER + ensureWeekInstances + syncHealedAssignments) tager sig i forvejen
// af at bære en ændret aftale ned på alle ikke-afsluttede/ikke-fakturerede opgaver,
// første gang nogen åbner planlægningen efter denne kørsel — præcis samme vej som
// poNumber og adressen allerede går. At skrive til instances HERFRA ville duplikere
// den logik (og dens værn: aldrig røre en udført/faktureret/tidsregistreret opgave)
// uden for App.jsx, hvor den kan komme ud af trit.
//
// Undtagelsen er løsrevne ("adhoc") opgaver uden template_id — dem rammer
// selvhelbredelsen aldrig, fordi den kun kører pr. skabelon. De opdateres direkte
// herfra, med nøjagtig det samme værn som App.jsx bruger: rør aldrig en opgave der er
// sendt til Dinero, er udført, eller har registreret tid.
//
// Ikke-destruktivt ligesom poNumber/dineroContactGuid i App.jsx: skriver kun et felt,
// når Dinero FAKTISK har en værdi. En kontakt uden telefonnummer i Dinero må ikke
// slette et nummer kontoret har rettet ind i hånden på den enkelte aftale.
const DINERO_CLIENT_ID = Deno.env.get("DINERO_CLIENT_ID") ?? "";
const DINERO_CLIENT_SECRET = Deno.env.get("DINERO_CLIENT_SECRET") ?? "";
const DINERO_API_KEY = Deno.env.get("DINERO_API_KEY") ?? "";
const DINERO_ORG_ID = Deno.env.get("DINERO_ORG_ID") ?? "324545";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const JOB = "dinero-kontakt-sync";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

async function getDineroToken(): Promise<string> {
  const encoded = btoa(`${DINERO_CLIENT_ID}:${DINERO_CLIENT_SECRET}`);
  const res = await fetch("https://authz.dinero.dk/dineroapi/oauth/token", {
    method: "POST",
    headers: { Authorization: `Basic ${encoded}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "password", scope: "read write", username: DINERO_API_KEY, password: DINERO_API_KEY }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Dinero-login fejlede ${res.status}: ${text.slice(0, 300)}`);
  const data = JSON.parse(text);
  if (!data.access_token) throw new Error("Intet access_token fra Dinero");
  return data.access_token;
}

type DineroKontakt = { ContactGuid: string; Name?: string; Phone?: string; Email?: string; AttPerson?: string };

async function hentAlleKontakter(token: string): Promise<DineroKontakt[]> {
  const felter = "ContactGuid,Name,Phone,Email,AttPerson";
  const alle: DineroKontakt[] = [];
  let page = 0;
  let sider = 0;
  // Samme loft-logik som dinero-omsaetning-sync: rigeligt højt, løkken stopper selv
  // når en side kommer tom eller kortere end pageSize tilbage.
  while (sider < 30) {
    const url = `https://api.dinero.dk/v1/${DINERO_ORG_ID}/contacts?pageSize=1000&page=${page}&fields=${felter}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) {
      const tekst = await res.text();
      throw new Error(`Dinero afviste kontaktopslag (side ${page}, status ${res.status}): ${tekst.slice(0, 300)}`);
    }
    const data = await res.json();
    const coll: DineroKontakt[] = data?.Collection ?? [];
    if (coll.length === 0) break;
    alle.push(...coll);
    sider++;
    page++;
    if (coll.length < 1000) break;
  }
  return alle;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const log = (ok: boolean, besked?: string) => admin.rpc("log_job", { p_job: JOB, p_ok: ok, p_besked: besked ?? null });

  try {
    const token = await getDineroToken();
    const kontakter = await hentAlleKontakter(token);

    // Kun kontakter der faktisk har mindst ét af de tre felter — resten er der intet
    // at synkronisere for, og de skal ikke tælle med i "opdateret".
    const relevante = kontakter.filter((k) => k.Phone || k.Email || k.AttPerson);

    const { data: aftaler, error: aftalerFejl } = await admin
      .from("service_templates")
      .select("id, dinero_contact_guid, telefon, email, kontaktperson")
      .not("dinero_contact_guid", "is", null);
    if (aftalerFejl) throw new Error("kunne ikke hente aftaler: " + aftalerFejl.message);

    const aftalerPrGuid = new Map<string, typeof aftaler>();
    (aftaler ?? []).forEach((a) => {
      const liste = aftalerPrGuid.get(a.dinero_contact_guid) ?? [];
      liste.push(a);
      aftalerPrGuid.set(a.dinero_contact_guid, liste);
    });

    let aftalerOpdateret = 0;
    for (const k of relevante) {
      const rammer = aftalerPrGuid.get(k.ContactGuid);
      if (!rammer || rammer.length === 0) continue;
      for (const a of rammer) {
        const patch: Record<string, string> = {};
        if (k.Phone && k.Phone !== a.telefon) patch.telefon = k.Phone;
        if (k.Email && k.Email !== a.email) patch.email = k.Email;
        if (k.AttPerson && k.AttPerson !== a.kontaktperson) patch.kontaktperson = k.AttPerson;
        if (Object.keys(patch).length === 0) continue;
        const { error } = await admin.from("service_templates").update(patch).eq("id", a.id);
        if (error) throw new Error(`kunne ikke opdatere aftale ${a.id}: ${error.message}`);
        aftalerOpdateret++;
      }
    }

    // Løsrevne opgaver uden skabelon. Selvhelbredelsen i App.jsx kører kun pr.
    // skabelon og når derfor aldrig disse — de skal opdateres direkte, med det
    // samme værn som resten af selvhelbredelsen: aldrig en opgave der er sendt til
    // Dinero, er udført, eller allerede har registreret tid.
    const { data: loesrevne, error: loesrevneFejl } = await admin
      .from("instances")
      .select("id, dinero_contact_guid, telefon, email, kontaktperson, dinero_exported, status, time_log")
      .is("template_id", null)
      .not("dinero_contact_guid", "is", null);
    if (loesrevneFejl) throw new Error("kunne ikke hente løsrevne opgaver: " + loesrevneFejl.message);

    let opgaverOpdateret = 0;
    for (const k of relevante) {
      const rammer = (loesrevne ?? []).filter((i) => i.dinero_contact_guid === k.ContactGuid);
      for (const i of rammer) {
        const leveret = i.dinero_exported || i.status === "udført" || (Array.isArray(i.time_log) && i.time_log.length > 0);
        if (leveret) continue;
        const patch: Record<string, string> = {};
        if (k.Phone && k.Phone !== i.telefon) patch.telefon = k.Phone;
        if (k.Email && k.Email !== i.email) patch.email = k.Email;
        if (k.AttPerson && k.AttPerson !== i.kontaktperson) patch.kontaktperson = k.AttPerson;
        if (Object.keys(patch).length === 0) continue;
        const { error } = await admin.from("instances").update(patch).eq("id", i.id);
        if (error) throw new Error(`kunne ikke opdatere opgave ${i.id}: ${error.message}`);
        opgaverOpdateret++;
      }
    }

    await log(true, `${kontakter.length} kontakter gennemgået, ${aftalerOpdateret} aftaler og ${opgaverOpdateret} løsrevne opgaver opdateret`);
    return jsonResponse({ ok: true, kontakterGennemgaaet: kontakter.length, aftalerOpdateret, opgaverOpdateret });
  } catch (e) {
    const m = String((e as Error)?.message ?? e);
    await log(false, m);
    return jsonResponse({ error: m }, 500);
  }
});
