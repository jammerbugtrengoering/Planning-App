import { forHvertFirma, sendPush, cors, svar, type Db, type Firma } from "../_felles/firmaer.ts";

// KUNDEDATABASEN (projekt zwbsbckoyxzzobudjxij). Jammerbugts plan-beskeder, ét firma
// ad gangen (se ../_felles/firmaer.ts). Samme to job:
//
//   { job: "aendringer" }   - hvert kvarter. Samlede planaendringer, én besked pr.
//                             medarbejder, og paamindelsen om startede opgaver.
//   { job: "i_morgen" }     - om aftenen. Hvad der staar i morgen.
//   { job: "start" }        - hvert 5. minut. Glemt Start: push efter 5 min,
//                             systemstart efter 10 min (start_mangler_behandl).
//
// { firma: "<id>" } koerer kun det ene firma (til afproevning).

const JOB = "plan-beskeder";
const UGEDAGE = ["mandag", "tirsdag", "onsdag", "torsdag", "fredag", "lørdag", "søndag"];
// Dagnoeglerne i instances staar med STORT forbogstav (instances_day_check).
const DAGNOEGLER = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function isoUge(d: Date) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dag = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - dag);
  const nytaar = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return { uge: Math.ceil((((t.getTime() - nytaar.getTime()) / 86400000) + 1) / 7), aar: t.getUTCFullYear() };
}

// Hoejst én linje i timen, naar der intet er sket; altid, naar der er sendt noget
// eller noget gik galt (samme regel som hos Jammerbugt).
async function livstegn(db: Db, f: Firma, ok: boolean, besked: string, altid: boolean) {
  try {
    if (!altid) {
      const { data, error } = await db.from("job_koersel").select("tidspunkt")
        .eq("job", JOB).eq("firma_id", f.id).order("tidspunkt", { ascending: false }).limit(1);
      const sidst = data?.[0]?.tidspunkt as string | undefined;
      if (!error && sidst && Date.now() - new Date(sidst).getTime() < 55 * 60 * 1000) return;
    }
    await db.rpc("log_job", { p_job: JOB, p_ok: ok, p_besked: besked });
  } catch (e) {
    console.error("livstegn fejlede:", String((e as Error)?.message ?? e));
  }
}

async function aendringer(db: Db, f: Firma) {
  // Start/stop: databasen udvaelger og markerer i samme skridt (kun dette firma).
  let paamindet = 0;
  const { data: tider, error: tFejl } = await db.rpc("tidsstart_til_paamindelse");
  if (tFejl) await livstegn(db, f, false, "paamindelser om start/stop fejlede: " + tFejl.message, true);
  for (const r of (tider ?? []) as { employee_id: string; instance_id: string; titel: string }[]) {
    if (await sendPush(db, { medarbejdere: [r.employee_id], titel: "Er du færdig?",
      tekst: `${r.titel}: tiden kører stadig. Husk at trykke Afslut.`, maerke: "tid-" + r.instance_id }) >= 0) paamindet++;
  }

  const { data: koe, error } = await db.from("push_plan_koe").select("id, employee_id, slags")
    .eq("firma_id", f.id).is("sendt", null).limit(2000);
  if (error) { await livstegn(db, f, false, "koeen kunne ikke laeses: " + error.message, true); throw new Error(error.message); }
  if (!koe?.length) { await livstegn(db, f, true, "ingen aendringer i koeen", false); return { sendt: 0, paamindet }; }

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
    if (dele.length && await sendPush(db, { medarbejdere: [empId], titel: "Din plan er ændret",
      tekst: dele.join(" · ") + ". Åbn Worklist for at se den.", maerke: "plan" }) >= 0) sendt++;
    // Markeres som sendt uanset hvad, ellers vokser koeen for dem uden appen.
    await db.from("push_plan_koe").update({ sendt: new Date().toISOString() }).in("id", g.ider).eq("firma_id", f.id);
  }
  await livstegn(db, f, sendt > 0, sendt > 0
    ? `${sendt} af ${pr.size} medarbejder(e) fik besked om planaendringer`
    : `${pr.size} medarbejder(e) havde aendringer, men ingen besked kom af sted`, true);
  return { medarbejdere: pr.size, sendt, paamindet };
}

async function iMorgen(db: Db, f: Firma) {
  const imorgen = new Date();
  imorgen.setDate(imorgen.getDate() + 1);
  const { uge, aar } = isoUge(imorgen);
  const dagNr = (imorgen.getDay() || 7) - 1;

  const { data: opgaver, error } = await db.from("instances").select("id, assignees, scheduled_time")
    .eq("firma_id", f.id).eq("week", uge).eq("year", aar).eq("day", DAGNOEGLER[dagNr]).is("deleted_at", null);
  if (error) { await livstegn(db, f, false, "opgaverne kunne ikke laeses: " + error.message, true); throw new Error(error.message); }

  const pr = new Map<string, { antal: number; foerste: string | null }>();
  for (const o of opgaver ?? []) {
    for (const e of (Array.isArray(o.assignees) ? o.assignees : [])) {
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
    const tekst = (g.antal === 1 ? "1 opgave" : `${g.antal} opgaver`) + (g.foerste ? `, første kl. ${g.foerste}` : "") + ".";
    if (await sendPush(db, { medarbejdere: [empId], titel: `Din plan ${UGEDAGE[dagNr]}`, tekst, maerke: "i-morgen" }) >= 0) sendt++;
  }
  await livstegn(db, f, true, `${UGEDAGE[dagNr]}: ${sendt} af ${pr.size} medarbejder(e) fik aftenbesked`, true);
  return { medarbejdere: pr.size, sendt };
}

async function glemtStart(db: Db, f: Firma) {
  const { data, error } = await db.rpc("start_mangler_behandl");
  if (error) throw new Error("glemt start fejlede: " + error.message);
  const raekker = (data ?? []) as { employee_id: string; instance_id: string; titel: string; slags: string; kl: string }[];
  let sendt = 0;
  for (const r of raekker) {
    const system = r.slags === "systemstart";
    if (await sendPush(db, { medarbejdere: [r.employee_id], maerke: "start-" + r.instance_id,
      titel: system ? "Tiden er startet for dig" : "Husk at trykke Start",
      tekst: system
        ? `${r.titel}: tiden kører fra kl. ${r.kl}. Er det forkert, så tryk «Fortryd start» i Worklist og start selv.`
        : `${r.titel} skulle være startet kl. ${r.kl}. Åbn Worklist — står du ved adressen, starter tiden af sig selv.` }) >= 0) sendt++;
  }
  if (raekker.length) await livstegn(db, f, true, `glemt start: ${raekker.length} besked(er), ${sendt} push sendt`, true);
  return { beskeder: raekker.length, sendt };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const body = await req.json().catch(() => ({}));
    const job = body.job === "i_morgen" ? "i_morgen" : body.job === "start" ? "start" : "aendringer";
    const res = await forHvertFirma(JOB, body.firma ?? null, job === "i_morgen" ? iMorgen : job === "start" ? glemtStart : aendringer);
    return svar({ ok: res.every((r) => r.ok), job, firmaer: res });
  } catch (e) {
    return svar({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
