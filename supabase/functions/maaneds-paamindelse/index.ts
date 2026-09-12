import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Sidste udkald, to dage foer maaneden lukkes.
//
// Den daglige paamindelse ser syv dage tilbage. Den her ser HELE maaneden, og det er
// hele pointen: den 28. kan man stadig naa at rette op paa den 3., og efter
// maanedsskiftet kan man ikke. Timer, kilometer og fakturagrundlag afgoeres af den
// maaned, opgaven ligger i.
//
// Datovagten ligger i databasefunktionerne, saa jobbet kan koere hver dag og selv
// finde ud af, hvornaar det skal sende. Maanederne er ikke lige lange, og reglen skal
// ikke vedligeholdes tolv gange om aaret.
//
// Kontoret faar sin egen kopi. Medarbejderen kan redde sin loen og sin koersel — hun
// kan ikke redde faktureringen, for det er kontoret der sender regningen.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const JOB = "maaneds-paamindelse";

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
  const log = (ok: boolean, besked?: string) =>
    admin.rpc("log_job", { p_job: JOB, p_ok: ok, p_besked: besked ?? null });

  try {
    const body = await req.json().catch(() => ({}));
    const toerloeb = body.dryRun === true;
    const ignorerDato = body.ignorerDato === true;
    const kunTil = body.kunTil ?? null;

    const { data: liste, error } = await admin.rpc("maanedsluk_paamindelser", {
      p_dry_run: true, p_ignore_dato: ignorerDato, p_only_email: kunTil,
    });
    if (error) {
      await log(false, "kunne ikke hente listen: " + error.message);
      return svar({ error: error.message }, 500);
    }

    const raekker = liste ?? [];

    if (toerloeb) {
      const { data: kontor } = await admin.rpc("maanedsluk_kontoroversigt", { p_ignore_dato: ignorerDato });
      return svar({
        ok: true, toerloeb: true, villeSende: raekker.length,
        modtagere: raekker.map((r: { modtager: string; email: string; antal: number }) =>
          ({ modtager: r.modtager, email: r.email, antal: r.antal })),
        kontor: (kontor ?? [])[0] ?? null,
        html: raekker[0]?.html ?? null,
      });
    }

    if (raekker.length === 0) {
      // Nul er ikke en fejl. Enten er det ikke den rigtige dag, eller ogsaa er alt
      // registreret — og det sidste er jo netop det, vi gerne vil have.
      await log(true, "ingen mangler ved maanedsluk");
      return svar({ ok: true, sendt: 0 });
    }

    let sendt = 0, pushet = 0;
    const fejlede: string[] = [];

    for (const r of raekker) {
      // Authorization saettes EKSPLICIT. functions.invoke fra én edge-funktion til en
      // anden sender ingen header af sig selv — det kostede en hel dags paamindelser.
      const { error: mailFejl } = await admin.functions.invoke("send-email", {
        headers: { Authorization: `Bearer ${SERVICE_KEY}` },
        body: { email: r.email, name: r.modtager, subject: r.emne, html: r.html },
      });
      if (mailFejl) fejlede.push(`${r.email}: ${mailFejl.message ?? mailFejl}`);
      else sendt++;

      // Push maa ALDRIG kunne vaelte mailen.
      if (r.emp_id) {
        const { data: p, error: pushFejl } = await admin.functions.invoke("send-push", {
          headers: { Authorization: `Bearer ${SERVICE_KEY}` },
          body: {
            medarbejdere: [r.emp_id],
            titel: "Sidste udkald inden månedsskiftet",
            tekst: r.antal === 1
              ? "Én opgave mangler, før måneden lukkes. Ellers mister du timerne og kørslen."
              : `${r.antal} opgaver mangler, før måneden lukkes. Ellers mister du timerne og kørslen.`,
            url: "/",
            maerke: "maanedsluk",
          },
        });
        if (pushFejl) console.error("push fejlede for", r.email, String(pushFejl.message ?? pushFejl));
        else pushet += (p as { sendt?: number })?.sendt ?? 0;
      }
    }

    // Kontorets kopi. Fejler den, skal medarbejdernes mails stadig taelle som sendt —
    // de er det vigtigste, og de er allerede ude.
    let kontorSendt = 0;
    try {
      const { data: kontor } = await admin.rpc("maanedsluk_kontoroversigt", { p_ignore_dato: ignorerDato });
      const k = (kontor ?? [])[0];
      if (k) {
        const { data: adm } = await admin
          .from("employees").select("name, app_email")
          .eq("is_admin", true).is("fratraadt_dato", null).not("app_email", "is", null);
        for (const a of (adm ?? [])) {
          const { error: e2 } = await admin.functions.invoke("send-email", {
            headers: { Authorization: `Bearer ${SERVICE_KEY}` },
            body: { email: a.app_email, name: a.name, subject: k.emne, html: k.html },
          });
          if (!e2) kontorSendt++;
        }
      }
    } catch (e) {
      console.error("kontoroversigt fejlede:", String((e as Error)?.message ?? e));
    }

    if (fejlede.length) console.error("maanedspaamindelser fejlede:", fejlede.join(" | "));
    await log(fejlede.length === 0,
      `${sendt} sendt, ${pushet} push, ${kontorSendt} til kontoret`
      + (fejlede.length ? `, ${fejlede.length} fejlede: ${fejlede.join(" | ")}` : ""));

    return svar({ ok: fejlede.length === 0, sendt, pushet, kontorSendt, fejlede });
  } catch (e) {
    const m = String((e && (e as Error).message) || e);
    await log(false, m);
    return svar({ error: m }, 500);
  }
});
