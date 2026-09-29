import { forHvertFirma, sendMail, sendPush, cors, svar, type Db, type Firma } from "../_felles/firmaer.ts";

// KUNDEDATABASEN (projekt zwbsbckoyxzzobudjxij). Sidste udkald to dage foer maaneden
// lukkes, ét firma ad gangen. Datovagten ligger i databasefunktionerne.
// Planlaeggerne i firmaet faar kontorets oversigt.
//
// { firma: "<id>" } koerer kun det ene firma. { ignorerDato: true } sender nu.

const JOB = "maaneds-paamindelse";

async function koer(db: Db, f: Firma, ignorerDato: boolean) {
  const { data, error } = await db.rpc("maanedsluk_paamindelser", { p_dry_run: true, p_ignore_dato: ignorerDato, p_only_email: null });
  if (error) throw new Error("kunne ikke hente listen: " + error.message);
  const raekker = (data ?? []) as { modtager: string; email: string; antal: number; emne: string; html: string; emp_id?: string }[];
  if (!raekker.length) { await db.rpc("log_job", { p_job: JOB, p_ok: true, p_besked: "ingen mangler ved maanedsluk" }); return { sendt: 0 }; }

  let sendt = 0, pushet = 0;
  const fejlede: string[] = [];
  for (const r of raekker) {
    const fejl = await sendMail(db, f, { email: r.email, name: r.modtager, subject: r.emne, html: r.html });
    if (fejl) fejlede.push(`${r.email}: ${fejl}`); else sendt++;
    if (r.emp_id) {
      const n = await sendPush(db, { medarbejdere: [r.emp_id], titel: "Sidste udkald inden månedsskiftet", maerke: "maanedsluk",
        tekst: r.antal === 1 ? "Én opgave mangler, før måneden lukkes." : `${r.antal} opgaver mangler, før måneden lukkes.` });
      if (n > 0) pushet += n;
    }
  }

  let kontorSendt = 0;
  try {
    const { data: kontor } = await db.rpc("maanedsluk_kontoroversigt", { p_ignore_dato: ignorerDato });
    const k = (kontor ?? [])[0];
    if (k) {
      const { data: adm } = await db.from("employees").select("name, app_email")
        .eq("firma_id", f.id).eq("is_admin", true).is("fratraadt_dato", null).not("app_email", "is", null);
      for (const a of adm ?? []) {
        if (!(await sendMail(db, f, { email: a.app_email as string, name: a.name as string, subject: k.emne, html: k.html }))) kontorSendt++;
      }
    }
  } catch (e) {
    console.error("kontoroversigt fejlede:", String((e as Error)?.message ?? e));
  }
  await db.rpc("log_job", { p_job: JOB, p_ok: fejlede.length === 0,
    p_besked: `${sendt} sendt, ${pushet} push, ${kontorSendt} til kontoret` + (fejlede.length ? `, ${fejlede.length} fejlede` : "") });
  return { sendt, pushet, kontorSendt, fejlede };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const body = await req.json().catch(() => ({}));
    const res = await forHvertFirma(JOB, body.firma ?? null, (db, f) => koer(db, f, body.ignorerDato === true));
    return svar({ ok: res.every((r) => r.ok), firmaer: res });
  } catch (e) {
    return svar({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
