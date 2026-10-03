import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Morgentjek. Siger til hvis et natligt job enten fejlede eller slet ikke koerte —
// og siden 5.9.2026 ogsaa hvis nogen har aendret paa, HVAD systemet gemmer.
//
// Hvorfor den findes: de daglige paamindelser fejlede med 401 i et helt doegn uden
// at nogen opdagede det. Jobbet stod som "succeeded" i cron, fordi HTTP-kaldet BLEV
// udfoert - at tre mails blev afvist kunne kun ses ved at grave i logs, og pg_net
// sletter svarene efter faa timer. Et system der fejler i stilhed er vaerre end et
// der fejler hoejlydt.
//
// Der sendes KUN mail naar noget er galt. En daglig "alt er fint"-mail bliver til
// stoej, og saa opdager man heller ikke den dag der staar noget andet.
//
// 28.8.2026: der kom en falsk alarm om at koerselsberegningen ikke havde koert i 30
// timer. Den HAVDE koert syv timer foer, og raekken laa i job_koersel. To fejl i den
// her fil gjorde det muligt:
//
//   1. Fejlen fra databasen blev kastet vaek. Der stod bare { data }, aldrig
//      { data, error }. Fejlede opslaget et oejeblik, blev data null - og det er
//      praecis det samme som "jobbet har ikke koert". To vidt forskellige ting med
//      samme besked, og den ene faar folk til at lede efter en fejl der ikke findes.
//
//   2. Beskeden kunne ikke efterproeves. Der stod ikke HVORNAAR jobbet sidst koerte,
//      saa modtageren kunne ikke selv se at alarmen var forkert.
//
// Begge dele er rettet. En alarm man ikke kan stole paa er vaerre end ingen alarm,
// for saa begynder man at ignorere dem alle sammen.
//
// 5.9.2026: persondatakontrollen kom til. Privatlivsteksten staar i tre apps og i
// fortegnelsen over behandlingsaktiviteter. Tilfoejer nogen en kolonne med et navn
// eller en adresse i, er alle fire forkerte i samme oejeblik — og INGENTING gaar i
// stykker. Det er den vaerste slags fejl: den, ingen opdager. Nu sammenlignes
// databasen med persondata_register hver morgen.
//
// 12.9.2026: den samme alarm kom TO gange.
//
// Jobbet ligger paa 5 og 6 UTC, fordi Danmark skifter mellem sommer- og vintertid og
// vi vil ramme morgenen hele aaret. De andre daglige jobs har en urkontrol inde i
// databasen, saa de kun handler den ene af de to gange. Den manglede her, og saa kom
// hver alarm to gange med en times mellemrum.
//
// Loesningen er IKKE en urkontrol. Den anden koersel er reelt et gentaget forsoeg:
// gaar den foerste helt i gulvet — som fotojobbet gjorde natten til den 12. — er det
// den anden, der redder morgenen. Den skal beholdes.
//
// Derfor spaerres MAILEN og ikke koerslen. Kontrollerne koerer hver gang; er der
// allerede sendt en alarm i dag, sendes der ikke en til. Gik den foerste koersel ned,
// foer den naaede at sende, er der ingen raekke, og den anden sender som den skal.
//
// 19.9.2026: tjekket skriver nu et livstegn, ogsaa naar alt er i orden.
//
// Foer stod der KUN en linje i job_koersel, naar der var sendt en alarm. Paa en god
// morgen skrev tjekket ingenting — og saa kunne man ikke se forskel paa «der var
// ikke noget at melde» og «tjekket er holdt op med at koere». Begge dele saa ud som
// en tom log. Det er en daarlig egenskab ved netop DET job, der skal opdage, at de
// andre er gaaet i staa: det er selv det eneste, ingen holder oeje med.
//
// Livstegnet er en EGEN linje, adskilt fra mail-linjen. De to siger forskellige
// ting: «tjekket har koert» og «der er sendt en alarm i dag». Blandes de sammen,
// kan spaerren mod dobbeltmails ikke laengere kende forskel, og saa kommer alarmen
// enten to gange eller slet ikke.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
// Egen linje i job_koersel, adskilt fra selve koerslen: den siger "der er sendt en
// alarm i dag", ikke "tjekket har koert".
const MAIL_JOB = "helsetjek-mail";
// Og den anden: "tjekket har koert". Skrives hver morgen, uanset hvad der blev
// fundet.
const LIVSTEGN_JOB = "helsetjek";

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

function dkTid(t: string) {
  return new Date(t).toLocaleString("da-DK",
    { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

// Datoen i Danmark, som "2026-09-12". Bruges til at afgoere om to tidspunkter er
// samme DAG herhjemme — og det er ikke det samme som samme dag i UTC. Koerslen kl.
// 07 og koerslen kl. 08 skal regnes for samme morgen, ogsaa naar uret er skiftet.
function dkDato(t: Date | string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Copenhagen" })
    .format(new Date(t));
}

function timerSiden(t: string) {
  return Math.round((Date.now() - new Date(t).getTime()) / 3600000);
}

function tekst(s: unknown) {
  return String(s ?? "").replace(/[<>&]/g, (c) =>
    ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c] as string));
}

// Jobs vi forventer et livstegn fra, og hvor laenge der maa gaa.
//
// De natlige job koerer hver 24. time. Graensen var 30 timer, altsaa kun seks timers
// slack - bliver en koersel forsinket, eller koerer tjekket tidligt, rammer den.
// 36 timer giver plads til én forsinket nat uden at gaa glip af en nat der falder helt ud.
const FORVENTET = [
  { job: "compute-daily-km",      timer: 36, navn: "Beregning af kørsel" },
  { job: "slet-gamle-fotos",      timer: 36, navn: "Oprydning i gamle billeder" },
  // Rydder nøglebokskoder fra opgaver der er overstået. Holder den op med at køre,
  // hober det følsomste data i systemet sig op uden at nogen opdager det.
  { job: "ryd-adgangskoder",      timer: 36, navn: "Oprydning i adgangskoder" },
  { job: "daglige-paamindelser",  timer: 80, navn: "Daglig registreringspåmindelse" },
  // Maanedspaamindelsen SENDER kun to dage foer maanedsskiftet, men den KOERER hver
  // dag og skriver et livstegn uanset hvad. Derfor kan den tjekkes som ethvert andet
  // dagligt job — og det er vigtigt, for et job der kun goer noget tolv gange om
  // aaret, er netop det, der kan doe uden at nogen opdager det foer loennen mangler.
  { job: "maaneds-paamindelse",   timer: 80, navn: "Påmindelse før månedsskiftet" },
  // 14.9.2026: den her manglede, og den er den eneste, der taler direkte til
  // medarbejdernes telefoner. Den koerer hvert kvarter, men skriver hoejst ét
  // livstegn i timen, naar der ikke er sket noget - ellers ville job_koersel drukne
  // i 96 linjer om dagen. Seks timer giver plads til et par sprunget over uden at
  // et doedt job kan gaa en hel arbejdsdag ubemaerket hen.
  { job: "plan-beskeder",         timer: 6,  navn: "Beskeder til medarbejdernes telefoner" },
];

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const body = await req.json().catch(() => ({}));
    const toerloeb = body.dryRun === true;
    // Til at fremtvinge en mail igen samme dag, fx naar man selv sidder og proever.
    const sendIgen = body.sendIgen === true;
    // Send kun til én adresse. Findes paa alle de andre mailjob af samme grund: man
    // skal kunne afproeve alarmen uden at sende en falsk alarm til hele kontoret.
    const kunTil = String(body.kunTil ?? "").trim().toLowerCase();

    const problemer: string[] = [];

    for (const f of FORVENTET) {
      // Hele historikken for jobbet, nyeste foerst - ikke kun vinduet.
      //
      // Foer blev der filtreret paa tidspunkt i selve forespoergslen, og et tomt svar
      // betoed "har ikke koert". Nu hentes den sidste koersel uanset hvor gammel den
      // er, og alderen regnes bagefter. Saa kan beskeden fortaelle HVORNAAR den sidst
      // koerte - og det er den oplysning der goer en alarm til at stole paa.
      let sidste: { tidspunkt: string; ok: boolean; besked: string | null } | null = null;
      let opslagFejl: string | null = null;

      for (let forsoeg = 0; forsoeg < 2; forsoeg++) {
        const { data, error } = await admin
          .from("job_koersel").select("tidspunkt, ok, besked")
          .eq("job", f.job)
          .order("tidspunkt", { ascending: false }).limit(1);
        if (!error) { sidste = (data?.[0] as typeof sidste) ?? null; opslagFejl = null; break; }
        opslagFejl = error.message;
        // Ét gentaget forsoeg. En kortvarig hikke skal ikke blive til en alarm.
        await new Promise((r) => setTimeout(r, 1500));
      }

      if (opslagFejl) {
        // IKKE "har ikke koert". Vi ved det ikke - og det skal der staa.
        problemer.push(`<li><b>${f.navn}</b> kunne ikke tjekkes: ${opslagFejl}</li>`);
        continue;
      }

      if (!sidste) {
        problemer.push(`<li><b>${f.navn}</b> har aldrig kørt.</li>`);
        continue;
      }

      const alder = timerSiden(sidste.tidspunkt);
      if (alder > f.timer) {
        problemer.push(`<li><b>${f.navn}</b> har ikke kørt i ${alder} timer. `
          + `Sidst: ${dkTid(sidste.tidspunkt)}.</li>`);
      } else if (!sidste.ok) {
        problemer.push(`<li><b>${f.navn}</b> fejlede ${dkTid(sidste.tidspunkt)}: `
          + `${sidste.besked ?? "ingen forklaring"}</li>`);
      }
    }

    // ── Har nogen aendret paa hvad vi gemmer? ────────────────────────────
    //
    // Holdt for sig. Et nyt felt er ikke en driftsfejl, og de to ting kraever vidt
    // forskellige handlinger: den ene at nogen kigger paa et job, den anden at nogen
    // tager stilling til en personoplysning.
    //
    // Egen try: gaar det her galt, skal jobalarmerne stadig sendes. En ny kontrol maa
    // ikke kunne slaa den gamle ihjel.
    const persondata: string[] = [];
    let persondataFejl: string | null = null;
    try {
      const { data, error } = await admin.rpc("persondata_afvigelser");
      if (error) {
        persondataFejl = error.message;
      } else {
        for (const a of (data ?? []) as
             { slags: string; tabel: string; kolonne: string; daekket_af: string | null }[]) {
          persondata.push(
            `<li><b>${tekst(a.tabel)}.${tekst(a.kolonne)}</b> — ${tekst(a.slags)}`
            + (a.daekket_af ? ` (var beskrevet under «${tekst(a.daekket_af)}»)` : "")
            + `</li>`);
        }
      }
    } catch (e) {
      persondataFejl = String((e as Error)?.message ?? e);
    }

    await admin.rpc("ryd_gamle_jobkoersler");

    const noget = problemer.length > 0 || persondata.length > 0 || persondataFejl;

    // ── Livstegnet ──────────────────────────────────────────────────────
    //
    // Skrives FOER alle returneringerne, saa det staar der ogsaa paa en morgen hvor
    // der intet er at melde. Det er hele pointen: en tom log skal betyde "tjekket
    // koerte ikke", ikke "der var ingenting".
    //
    // Kun én linje pr. dag, samme spaerre som mailen bruger. Jobbet ligger paa to
    // UTC-timer for at ramme morgenen baade sommer og vinter, og to ens linjer hver
    // dag ville bare vaere stoej. Gik den foerste koersel ned foer den naaede hertil,
    // er der ingen linje — og saa skriver den anden den.
    //
    // Ikke ved toerloeb, og ikke naar der sendes til én bestemt adresse: et
    // afproevningskald maa ikke kunne komme til at ligne morgenens rigtige koersel.
    if (!toerloeb && !kunTil) {
      const { data: sidsteLiv, error: livFejl } = await admin
        .from("job_koersel").select("tidspunkt")
        .eq("job", LIVSTEGN_JOB)
        .order("tidspunkt", { ascending: false }).limit(1);
      const livTid = !livFejl ? sidsteLiv?.[0]?.tidspunkt : null;
      if (!livTid || dkDato(livTid) !== dkDato(new Date())) {
        await admin.rpc("log_job", {
          p_job: LIVSTEGN_JOB, p_ok: true,
          p_besked: noget
            ? `${problemer.length} driftsfejl, ${persondata.length} persondata`
            : "intet at melde",
        });
      }
    }

    if (!noget) return svar({ ok: true, problemer: 0, persondata: 0 });
    if (toerloeb) return svar({ ok: false, toerloeb: true, problemer, persondata, persondataFejl });

    // Er der allerede sendt en alarm i dag?
    //
    // Spoergsmaalet stilles FOERST her, efter kontrollerne. Saa koerer de hver gang,
    // og svaret kan aflaeses i svaret paa kaldet, ogsaa naar der ikke sendes mail.
    //
    // Fejler opslaget, sendes der. En dublet er til at leve med; en alarm der aldrig
    // kom af sted er ikke.
    if (!sendIgen) {
      const { data: sidsteMail, error: mailOpslagFejl } = await admin
        .from("job_koersel").select("tidspunkt")
        .eq("job", MAIL_JOB)
        .order("tidspunkt", { ascending: false }).limit(1);
      const sendtTid = !mailOpslagFejl ? sidsteMail?.[0]?.tidspunkt : null;
      if (sendtTid && dkDato(sendtTid) === dkDato(new Date())) {
        return svar({ ok: false, problemer: problemer.length,
                      persondata: persondata.length, persondataFejl,
                      sendt: 0, alleredeSendtIDag: true });
      }
    }

    const { data: adm } = await admin
      .from("employees").select("name, app_email")
      .eq("is_admin", true).not("app_email", "is", null);
    const modtagere = (adm ?? []).filter((a) =>
      !kunTil || String(a.app_email ?? "").trim().toLowerCase() === kunTil);

    let html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111">`;

    if (problemer.length) {
      html += `<p>Der er noget galt med de automatiske jobs:</p><ul>${problemer.join("")}</ul>`;
    }

    if (persondata.length) {
      html += `<div style="border-left:4px solid #B45309;background:#FEF3C7;`
        + `padding:12px 14px;margin:16px 0;border-radius:6px">`
        + `<p style="margin:0 0 8px"><b>Databasen gemmer noget andet end sidst.</b></p>`
        + `<ul style="margin:0 0 10px">${persondata.join("")}</ul>`
        + `<p style="margin:0 0 6px">Er der personoplysninger i det nye felt, skal `
        + `<b>fire ting</b> rettes:</p>`
        + `<ol style="margin:0 0 10px">`
        + `<li>Privatlivsteksten i Worklist (dansk og engelsk)</li>`
        + `<li>Privatlivsteksten i kundeportalen</li>`
        + `<li>Afsnittet «Personoplysninger» i planlægningsappens hjælp</li>`
        + `<li>Fortegnelsen over behandlingsaktiviteter</li>`
        + `</ol>`
        + `<p style="margin:0">Når feltet er klassificeret i <code>persondata_register</code>, `
        + `holder denne besked op. Er det ikke personoplysninger, skriv feltet ind med `
        + `<code>persondata = false</code> — så er der stadig taget stilling til det.</p></div>`;
    }

    if (persondataFejl) {
      html += `<p><b>Persondatakontrollen kunne ikke køre:</b> ${tekst(persondataFejl)}. `
        + `Det betyder ikke, at noget er galt — kun at vi ikke ved det.</p>`;
    }

    html += `<p style="color:#777;font-size:12px">Denne mail sendes kun når noget fejler, `
      + `og kun én gang i døgnet. Hører du ingenting, har alt kørt som det skal.</p></div>`;

    // Emnelinjen skal sige hvad det handler om. "Fejl i de automatiske jobs" paa en
    // mail om en ny kolonne faar folk til at lede det forkerte sted.
    const emne = problemer.length && persondata.length
      ? `Driftsfejl (${problemer.length}) og ændringer i persondata (${persondata.length})`
      : persondata.length
        ? `Nye felter der skal tages stilling til (${persondata.length})`
        : problemer.length
          ? `Fejl i de automatiske jobs (${problemer.length})`
          : `Persondatakontrollen kunne ikke køre`;

    let sendt = 0;
    for (const a of modtagere) {
      // Authorization saettes eksplicit: functions.invoke fra én edge-funktion til en
      // anden sender ingen header af sig selv. Det var praecis dét der gjorde at
      // paamindelserne fejlede i stilhed - den fejl maa ikke gentage sig her.
      const { error } = await admin.functions.invoke("send-email", {
        headers: { Authorization: `Bearer ${SERVICE_KEY}` },
        body: { email: a.app_email, name: a.name, subject: emne, html },
      });
      if (!error) sendt++;
    }

    // Skrives FOERST naar der faktisk er sendt noget. Gik alle mails i gulvet, skal
    // den anden koersel en time senere have lov at proeve igen.
    //
    // Og ikke naar der er sendt til én bestemt adresse: et afproevningskald maa ikke
    // kunne komme til at spaerre for morgenens rigtige alarm.
    if (sendt > 0 && !kunTil) {
      await admin.rpc("log_job", {
        p_job: MAIL_JOB, p_ok: true,
        p_besked: `${sendt} alarm(er) sendt: ${problemer.length} driftsfejl, ${persondata.length} persondata`,
      });
    }

    return svar({ ok: false, problemer: problemer.length,
                  persondata: persondata.length, persondataFejl,
                  sendt, kunTil: kunTil || null });
  } catch (e) {
    return svar({ error: String((e && (e as Error).message) || e) }, 500);
  }
});
