import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Den daglige paamindelse om manglende registrering.
//
// Databasefunktionen kaldes med p_dry_run = true. Den tilstand SENDER ikke; den
// returnerer bare modtager, emne og faerdig html for hver medarbejder der mangler
// noget. Klokkeslaetsvagten paa 18 dansk tid ligger inde i databasefunktionen, saa
// jobbet koerer baade 16 og 17 UTC og sender kun den ene gang.
//
// Siden 2026-08-25 sendes der OGSAA push til telefonen. Mailen bliver som den er:
// sytten medarbejdere er endnu ikke onboardet, og indtil alle har appen paa
// hjemmeskaermen, ville push alene betyde at paamindelsen bare forsvandt for dem.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const JOB = "daglige-paamindelser";

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

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  // Livstegn til morgentjekket. Uden det kunne funktionen fejle i stilhed — praecis
  // det der skete da send-email begyndte at svare 401 og ingen opdagede det i et doegn.
  const log = (ok: boolean, besked?: string) =>
    admin.rpc("log_job", { p_job: JOB, p_ok: ok, p_besked: besked ?? null });

  try {
    const body = await req.json().catch(() => ({}));
    const toerloeb = body.dryRun === true;
    const ignorerUr = body.ignorerUr === true;

    const { data: raekker, error } = await admin.rpc("send_missing_registration_reminders", {
      p_dry_run: true,
      p_only_email: body.kunTil ?? null,
      p_ignore_clock: ignorerUr,
    });
    if (error) {
      await log(false, "kunne ikke hente listen: " + error.message);
      return svar({ error: error.message }, 500);
    }

    const liste = raekker ?? [];
    if (liste.length === 0) {
      // Nul modtagere er ikke en fejl. Enten er alt registreret, eller ogsaa er
      // klokkeslaetsvagten slaaet til fordi det ikke er kl. 18 endnu.
      if (!toerloeb) await log(true, "ingen manglede registrering");
      return svar({ ok: true, sendt: 0, toerloeb });
    }
    if (toerloeb) {
      return svar({
        ok: true, toerloeb: true, villeSende: liste.length,
        modtagere: liste.map((r: { modtager: string; email: string; antal: number }) =>
          ({ modtager: r.modtager, email: r.email, antal: r.antal })),
      });
    }

    // Databasefunktionen giver os mailadressen, ikke medarbejder-id'et. Push skal
    // bruge id'et, saa adresserne slaas op paa én gang - ikke ét opslag pr. person.
    const emails = liste.map((r: { email: string }) => r.email).filter(Boolean);
    const { data: medarb } = await admin
      .from("employees").select("id, app_email").in("app_email", emails);
    const idFraEmail = new Map((medarb ?? []).map((m) => [m.app_email as string, m.id as string]));

    let sendt = 0, pushet = 0;
    const fejlede: string[] = [];
    for (const r of liste) {
      // Authorization saettes EKSPLICIT. functions.invoke fra én edge-funktion til en
      // anden sender ingen header af sig selv — det kostede en hel dags paamindelser.
      const { error: mailFejl } = await admin.functions.invoke("send-email", {
        headers: { Authorization: `Bearer ${SERVICE_KEY}` },
        body: { email: r.email, name: r.modtager, subject: r.emne, html: r.html },
      });
      if (mailFejl) fejlede.push(`${r.email}: ${mailFejl.message ?? mailFejl}`);
      else sendt++;

      // Push maa ALDRIG kunne vaelte mailen. Har hun ikke en telefon tilmeldt,
      // svarer send-push bare med nul sendt, og det er i orden.
      const empId = idFraEmail.get(r.email);
      if (empId) {
        const { data: p, error: pushFejl } = await admin.functions.invoke("send-push", {
          headers: { Authorization: `Bearer ${SERVICE_KEY}` },
          body: {
            medarbejdere: [empId],
            titel: "Manglende registrering",
            tekst: r.antal === 1
              ? "Du mangler at registrere tid på én opgave."
              : `Du mangler at registrere tid på ${r.antal} opgaver.`,
            url: "/",
            maerke: "registrering",
          },
        });
        if (pushFejl) console.error("push fejlede for", r.email, String(pushFejl.message ?? pushFejl));
        else pushet += (p as { sendt?: number })?.sendt ?? 0;
      }
    }

    if (fejlede.length) console.error("paamindelser fejlede:", fejlede.join(" | "));
    await log(fejlede.length === 0, fejlede.length
      ? `${sendt} sendt, ${pushet} push, ${fejlede.length} fejlede: ${fejlede.join(" | ")}`
      : `${sendt} sendt, ${pushet} push`);

    return svar({ ok: fejlede.length === 0, sendt, pushet, fejlede });
  } catch (e) {
    const m = String((e && (e as Error).message) || e);
    await log(false, m);
    return svar({ error: m }, 500);
  }
});
