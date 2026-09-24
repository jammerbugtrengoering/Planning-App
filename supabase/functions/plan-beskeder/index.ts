import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// To job i én funktion, fordi de goer det samme: fortaeller medarbejderen hvad der
// venter hende.
//
//   { job: "aendringer" }   - koeres hvert kvarter. Samler koeen af planaendringer
//                             og sender ÉN besked pr. medarbejder. Sender ogsaa
//                             paamindelsen om startede opgaver, der burde vaere
//                             afsluttet (start/stop, 24.9.2026).
//   { job: "i_morgen" }     - koeres om aftenen. Fortaeller hvad der staar i morgen.
//
// HVORFOR SAMLET OG IKKE STRAKS. En planlaegger der rydder op i ugeplanen roerer
// tyve opgaver paa fem minutter. Én besked pr. rettelse ville give medarbejderen
// tyve notifikationer for noget, der for hende er én aendring - og efter to dage af
// det slaar hun beskeder fra. Saa er hele funktionen tabt.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const JOB = "plan-beskeder";

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

// Livstegn til morgentjekket.
//
// 14.9.2026: den her funktion var det ENESTE job uden livstegn. Den koerer 96 gange
// i doegnet og sender beskeder til medarbejdernes telefoner - og holdt den op med at
// virke, ville ingen opdage det. Alle de andre job bliver passet paa; den, der taler
// direkte til medarbejderne, gjorde ikke.
//
// Men den maa ikke skrive en linje hver gang. 96 linjer i doegnet ville goere
// job_koersel ulaeselig praecis naar man skal bruge den - og det er dér, man leder,
// naar noget andet er gaaet galt. Derfor hoejst én linje i timen, naar der ikke er
// sket noget. Er der sendt en besked, eller gik noget galt, skrives der altid: dét
// er oplysninger, ingen maa gaa glip af.
async function livstegn(admin: ReturnType<typeof createClient>,
                        ok: boolean, besked: string, altid: boolean) {
  try {
    if (!altid) {
      const { data, error } = await admin
        .from("job_koersel").select("tidspunkt")
        .eq("job", JOB).order("tidspunkt", { ascending: false }).limit(1);
      // Fejler opslaget, SKRIVES der. Et manglende livstegn ligner et doedt job, og
      // den forveksling er dyrere end en linje for meget.
      if (!error) {
        const sidst = data?.[0]?.tidspunkt as string | undefined;
        // 55 minutter og ikke 60: koerslerne ligger paa kvarteret, og med 60 ville
        // maerket vandre en kvart time frem hver gang og springe en time over.
        if (sidst && Date.now() - new Date(sidst).getTime() < 55 * 60 * 1000) return;
      }
    }
    await admin.rpc("log_job", { p_job: JOB, p_ok: ok, p_besked: besked });
  } catch (e) {
    // Et livstegn, der ikke kan skrives, maa aldrig vaelte selve beskederne.
    console.error("livstegn fejlede:", String((e as Error)?.message ?? e));
  }
}

const UGEDAGE = ["mandag", "tirsdag", "onsdag", "torsdag", "fredag", "lørdag", "søndag"];
// Dagnoeglerne i instances staar med STORT forbogstav - 'Mon', ikke 'mon'. Der er en
// check-regel paa kolonnen der haandhaever det. Foerste udgave herinde brugte smaa
// bogstaver, og saa fandt aftenbeskeden nul opgaver hver eneste aften uden at fejle
// nogen steder. Roer ikke ved dem uden at se paa instances_day_check.
const DAGNOEGLER = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function isoUge(d: Date) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dag = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - dag);
  const nytaar = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return {
    uge: Math.ceil((((t.getTime() - nytaar.getTime()) / 86400000) + 1) / 7),
    aar: t.getUTCFullYear(),
  };
}

async function push(admin: ReturnType<typeof createClient>, empId: string,
                    titel: string, tekst: string, maerke: string) {
  const { error } = await admin.functions.invoke("send-push", {
    headers: { Authorization: `Bearer ${SERVICE_KEY}` },
    body: { medarbejdere: [empId], titel, tekst, url: "/", maerke },
  });
  if (error) console.error("push fejlede for", empId, String(error.message ?? error));
  return !error;
}

// Start/stop: en startet opgave, der er gaaet 15 minutter over hendes afsatte tid.
// Databasen udvaelger OG markerer i samme skridt (tidsstart_til_paamindelse), saa en
// opgave kun faar én paamindelse, ogsaa hvis to koersler overlapper. Maerket er
// opgavens id, saa en ny paamindelse erstatter en gammel paa telefonen i stedet for
// at stable dem.
//
// Fejler det her, maa det aldrig standse beskederne om planaendringer.
async function tidPaamindelser(admin: ReturnType<typeof createClient>) {
  try {
    const { data, error } = await admin.rpc("tidsstart_til_paamindelse");
    if (error) {
      await livstegn(admin, false, "paamindelser om start/stop fejlede: " + error.message, true);
      return 0;
    }
    let sendt = 0;
    for (const r of (data ?? []) as { employee_id: string; instance_id: string; titel: string }[]) {
      if (await push(admin, r.employee_id, "Er du færdig?",
        `${r.titel}: tiden kører stadig. Husk at trykke Afslut.`, "tid-" + r.instance_id)) sendt++;
    }
    if ((data ?? []).length) {
      await livstegn(admin, true, `${sendt} af ${(data ?? []).length} paamindelse(r) om start/stop sendt`, true);
    }
    return sendt;
  } catch (e) {
    console.error("tidPaamindelser:", String((e as Error)?.message ?? e));
    return 0;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  let job = "aendringer";
  try {
    const body = await req.json().catch(() => ({}));
    job = body.job === "i_morgen" ? "i_morgen" : "aendringer";

    // ── Samlede planaendringer ──────────────────────────────────────
    if (job === "aendringer") {
      const paamindet = await tidPaamindelser(admin);

      const { data: koe, error } = await admin
        .from("push_plan_koe").select("id, employee_id, slags")
        .is("sendt", null).limit(2000);
      if (error) {
        await livstegn(admin, false, "koeen kunne ikke laeses: " + error.message, true);
        return svar({ error: error.message }, 500);
      }
      if (!koe?.length) {
        await livstegn(admin, true, "ingen aendringer i koeen", false);
        return svar({ ok: true, sendt: 0, paamindet });
      }

      // Gruppér pr. medarbejder og tael hvad der er sket.
      const pr = new Map<string, { tildelt: number; flyttet: number; fjernet: number; aflyst: number; ider: number[] }>();
      for (const r of koe) {
        const e = r.employee_id as string;
        if (!pr.has(e)) pr.set(e, { tildelt: 0, flyttet: 0, fjernet: 0, aflyst: 0, ider: [] });
        const g = pr.get(e)!;
        g.ider.push(r.id as number);
        const s = r.slags as "tildelt" | "flyttet" | "fjernet" | "aflyst";
        if (s in g) (g[s] as number)++;
      }

      let sendt = 0;
      for (const [empId, g] of pr) {
        const dele: string[] = [];
        if (g.tildelt) dele.push(g.tildelt === 1 ? "1 ny opgave" : `${g.tildelt} nye opgaver`);
        if (g.flyttet) dele.push(g.flyttet === 1 ? "1 flyttet" : `${g.flyttet} flyttet`);
        if (g.fjernet) dele.push(g.fjernet === 1 ? "1 taget af din plan" : `${g.fjernet} taget af din plan`);
        if (g.aflyst) dele.push(g.aflyst === 1 ? "1 aflyst" : `${g.aflyst} aflyst`);
        if (!dele.length) continue;

        const ok = await push(admin, empId, "Din plan er ændret",
          dele.join(" · ") + ". Åbn Worklist for at se den.", "plan");
        if (ok) sendt++;

        // Markeres som sendt uanset om nogen telefon tog imod. Ellers ville koeen
        // vokse i det uendelige for en medarbejder der ikke har appen endnu, og hun
        // ville faa hele bunken paa én gang den dag hun tilmelder sig.
        await admin.from("push_plan_koe")
          .update({ sendt: new Date().toISOString() }).in("id", g.ider);
      }
      // Naaede beskeden ingen telefon, selvom der LAA noget i koeen, er det en fejl
      // og ikke en stille dag. Den skal kunne ses i morgentjekket.
      await livstegn(admin, sendt > 0,
        sendt > 0
          ? `${sendt} af ${pr.size} medarbejder(e) fik besked om planaendringer`
          : `${pr.size} medarbejder(e) havde aendringer, men ingen besked kom af sted`,
        true);
      return svar({ ok: true, medarbejdere: pr.size, sendt, paamindet });
    }

    // ── Hvad venter i morgen ───────────────────────────────────────
    const imorgen = new Date();
    imorgen.setDate(imorgen.getDate() + 1);
    const { uge, aar } = isoUge(imorgen);
    const dagNr = (imorgen.getDay() || 7) - 1;

    // Aflyste opgaver er slettemarkerede - der findes ingen status "aflyst".
    // Statuskolonnen kan kun vaere unscheduled, planlagt, i_gang eller udført.
    const { data: opgaver, error: opgFejl } = await admin
      .from("instances")
      .select("id, title, assignees, scheduled_time")
      .eq("week", uge).eq("year", aar).eq("day", DAGNOEGLER[dagNr])
      .is("deleted_at", null);
    if (opgFejl) {
      await livstegn(admin, false, "opgaverne kunne ikke laeses: " + opgFejl.message, true);
      return svar({ error: opgFejl.message }, 500);
    }

    const pr = new Map<string, { antal: number; foerste: string | null }>();
    for (const o of opgaver ?? []) {
      const liste = Array.isArray(o.assignees) ? o.assignees : [];
      for (const e of liste) {
        const id = String(e);
        if (!pr.has(id)) pr.set(id, { antal: 0, foerste: null });
        const g = pr.get(id)!;
        g.antal++;
        const t = o.scheduled_time ? String(o.scheduled_time).slice(0, 5) : null;
        if (t && (!g.foerste || t < g.foerste)) g.foerste = t;
      }
    }

    let sendt = 0;
    for (const [empId, g] of pr) {
      const tekst = (g.antal === 1 ? "1 opgave" : `${g.antal} opgaver`)
        + (g.foerste ? `, første kl. ${g.foerste}` : "") + ".";
      if (await push(admin, empId, `Din plan ${UGEDAGE[dagNr]}`, tekst, "i-morgen")) sendt++;
    }
    // Aftenbeskeden koerer én gang i doegnet og skrives altid. Ingen med opgaver i
    // morgen er en rigtig oplysning - det er sjaeldent, og saa skal det staa der.
    await livstegn(admin, true,
      `${UGEDAGE[dagNr]}: ${sendt} af ${pr.size} medarbejder(e) fik aftenbesked`, true);
    return svar({ ok: true, dag: UGEDAGE[dagNr], uge, medarbejdere: pr.size, sendt });
  } catch (e) {
    const m = String((e as Error).message ?? e);
    console.error("plan-beskeder:", m);
    await livstegn(admin, false, `${job} faldt over: ${m}`, true);
    return svar({ error: m }, 500);
  }
});
