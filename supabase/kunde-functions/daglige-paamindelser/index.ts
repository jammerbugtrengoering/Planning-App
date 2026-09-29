import { forHvertFirma, sendMail, sendPush, cors, svar, type Db, type Firma } from "../_felles/firmaer.ts";

// KUNDEDATABASEN (projekt zwbsbckoyxzzobudjxij). Den daglige paamindelse om manglende
// registrering kl. 18, ét firma ad gangen. Databasefunktionen laver listen for det
// firma, x-firma-id peger paa; mail og push sendes her.
//
// { firma: "<id>" } koerer kun det ene firma. { ignorerUr: true } sender nu.
// { dryRun: true } viser modtagerne uden at sende.

const JOB = "daglige-paamindelser";

async function koer(db: Db, f: Firma, ignorerUr: boolean, toerloeb: boolean) {
  const { data, error } = await db.rpc("send_missing_registration_reminders",
    { p_dry_run: true, p_only_email: null, p_ignore_clock: ignorerUr });
  if (error) throw new Error("kunne ikke hente listen: " + error.message);
  const liste = (data ?? []) as { modtager: string; email: string; antal: number; emne: string; html: string }[];
  if (toerloeb) return { villeSende: liste.length, modtagere: liste.map((r) => ({ modtager: r.modtager, antal: r.antal })) };
  if (!liste.length) { await db.rpc("log_job", { p_job: JOB, p_ok: true, p_besked: "ingen manglede registrering" }); return { sendt: 0 }; }

  const { data: medarb } = await db.from("employees").select("id, app_email")
    .eq("firma_id", f.id).in("app_email", liste.map((r) => r.email).filter(Boolean));
  const idFraEmail = new Map((medarb ?? []).map((m) => [m.app_email as string, m.id as string]));

  let sendt = 0, pushet = 0;
  const fejlede: string[] = [];
  for (const r of liste) {
    const fejl = await sendMail(db, f, { email: r.email, name: r.modtager, subject: r.emne, html: r.html });
    if (fejl) fejlede.push(`${r.email}: ${fejl}`); else sendt++;
    const empId = idFraEmail.get(r.email);
    if (empId) {
      const n = await sendPush(db, { medarbejdere: [empId], titel: "Manglende registrering", maerke: "registrering",
        tekst: r.antal === 1 ? "Du mangler at registrere tid på én opgave." : `Du mangler at registrere tid på ${r.antal} opgaver.` });
      if (n > 0) pushet += n;
    }
  }
  await db.rpc("log_job", { p_job: JOB, p_ok: fejlede.length === 0,
    p_besked: `${sendt} sendt, ${pushet} push` + (fejlede.length ? `, ${fejlede.length} fejlede: ${fejlede.join(" | ")}` : "") });
  return { sendt, pushet, fejlede };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const body = await req.json().catch(() => ({}));
    const res = await forHvertFirma(JOB, body.firma ?? null,
      (db, f) => koer(db, f, body.ignorerUr === true, body.dryRun === true));
    return svar({ ok: res.every((r) => r.ok), firmaer: res });
  } catch (e) {
    return svar({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
