import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Lukker en medarbejders adgang. To handlinger, samme funktion, fordi de begge
// kræver servicenøglen — og den må aldrig ligge i en browser.
//
//   handling: "fratraed"   Hun stopper. Login'et slettes, og rækken bliver stående
//                          med en fratædelsesdato.
//   handling: "lukAdgang"  Hun skal bare ikke kunne logge ind lige nu. Login'et
//                          slettes, men hun er stadig medarbejder og kan planlægges.
//
// Hvorfor rækken bliver stående ved fratædelse: employee_wage_history og km_log står
// med kaskade, så en sletning ville tage løn- og kørselsdokumentationen med sig. Den
// skal kunne fremvises bagefter, også år senere. Før denne funktion var det præcis
// omvendt: sletningen fjernede dokumentationen og lod login'et blive.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function svar(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...cors, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const jwt = (req.headers.get("Authorization") ?? "").replace("Bearer ", "").trim();
    const { data: { user: kalder } } = await admin.auth.getUser(jwt);
    if (!kalder) return svar({ error: "ikke_logget_ind" }, 401);

    const { data: mig } = await admin
      .from("employees").select("id, is_admin, fratraadt_dato")
      .eq("auth_user_id", kalder.id).maybeSingle();
    if (!mig?.is_admin || mig.fratraadt_dato) return svar({ error: "kun_planlaegger" }, 403);

    const body = await req.json().catch(() => ({}));
    const handling = body.handling === "lukAdgang" ? "lukAdgang" : "fratraed";
    const empId = String(body.empId ?? "").trim();
    if (!empId) return svar({ error: "medarbejder_mangler" }, 400);

    // Man kan ikke lukke sig selv ude. Ellers kunne den sidste planlægger spærre hele
    // kontoret ude med ét tryk, og ingen kunne lukke op igen.
    if (empId === mig.id) return svar({ error: "ikke_dig_selv" }, 400);

    const { data: emp } = await admin
      .from("employees").select("id, name, auth_user_id, is_admin, fratraadt_dato")
      .eq("id", empId).maybeSingle();
    if (!emp) return svar({ error: "ukendt_medarbejder" }, 404);

    // Den sidste aktive planlægger må ikke miste sin adgang. Uden hende kan ingen
    // oprette medarbejdere, rette aftaler eller åbne adgang igen.
    if (emp.is_admin) {
      const { count } = await admin
        .from("employees").select("id", { count: "exact", head: true })
        .eq("is_admin", true).is("fratraadt_dato", null).not("auth_user_id", "is", null);
      if ((count ?? 0) <= 1) return svar({ error: "sidste_planlaegger" }, 400);
    }

    let dato: string | null = null;
    if (handling === "fratraed") {
      dato = String(body.dato ?? "").match(/^\d{4}-\d{2}-\d{2}$/)
        ? body.dato : new Date().toISOString().slice(0, 10);

      // Datoen først. Går sletningen af login'et galt bagefter, står hun som fratådt
      // og er alligevel spærret ude af current_employee_id() og is_admin() — det er
      // den sikre halve vej. Omvendt rækkefølge ville efterlade en aktiv medarbejder
      // uden login, som ingen kan få øje på.
      const { error: datoFejl } = await admin
        .from("employees").update({ fratraadt_dato: dato }).eq("id", empId);
      if (datoFejl) return svar({ error: datoFejl.message }, 500);
    }

    // Selve login'et. Sessionerne falder med i samme øjeblik, fordi auth.sessions står
    // med kaskade — hun bliver altså også logget ud af en telefon der allerede er åben.
    let loginSlettet = false;
    let loginFejl: string | null = null;
    if (emp.auth_user_id) {
      const { error } = await admin.auth.admin.deleteUser(emp.auth_user_id);
      if (error) loginFejl = error.message; else loginSlettet = true;
    } else {
      loginSlettet = true;  // der var intet login at slette
    }

    // employees.auth_user_id står med ON DELETE SET NULL, så koblingen rydder sig selv.
    // Var der ikke noget login, ryddes felterne her, så rækken ikke peger på noget der
    // ikke findes.
    if (loginSlettet) {
      await admin.from("employees")
        .update({ auth_user_id: null, app_email: null }).eq("id", empId);
    }

    return svar({ ok: true, handling, navn: emp.name, dato, loginSlettet, loginFejl });
  } catch (e) {
    return svar({ error: String((e as Error).message ?? e) }, 500);
  }
});
