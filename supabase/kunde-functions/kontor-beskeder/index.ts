import { forHvertFirma, sendMail, sendPush, cors, svar, PLANLAEGNING_URL, type Db, type Firma } from "../_felles/firmaer.ts";

// KUNDEDATABASEN (projekt zwbsbckoyxzzobudjxij). Jammerbugts kontor-beskeder, ét firma
// ad gangen. Listen er firmaets egen kontor_indbakke() — den samme som klokken.
//
//   { job: "push" }    - hvert kvarter. Kun det hastende, én gang pr. sag.
//   { job: "morgen" }  - kl. 7 dansk tid. Alt der venter, i én mail til planlaeggerne.
//
// { firma: "<id>" } koerer kun det ene firma. { ignorerUr: true } sender morgenmailen nu.

const JOB = "kontor-beskeder";

type Linje = { art: string; ref: string; titel: string; tekst: string; haster: boolean; farve: string };

const esc = (s: unknown) => String(s ?? "")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function danskTime(): number {
  return Number(new Intl.DateTimeFormat("da-DK", { hour: "2-digit", hour12: false, timeZone: "Europe/Copenhagen" }).format(new Date()));
}

async function koer(db: Db, f: Firma, job: "push" | "morgen") {
  const log = (ok: boolean, besked: string) => db.rpc("log_job", { p_job: JOB, p_ok: ok, p_besked: besked });
  const { data: planlaeggere, error: pFejl } = await db.from("employees").select("id, name, app_email")
    .eq("firma_id", f.id).eq("is_admin", true).is("fratraadt_dato", null);
  if (pFejl) throw new Error("planlaeggere kunne ikke laeses: " + pFejl.message);

  const { data, error } = await db.rpc("kontor_indbakke");
  if (error) throw new Error("indbakken kunne ikke laeses: " + error.message);
  const linjer = (data ?? []) as Linje[];
  const adresse = `${PLANLAEGNING_URL}/${f.slug}`;

  if (job === "push") {
    const haster = linjer.filter((l) => l.haster);
    if (!haster.length) return { sendt: 0 };
    const { data: sendtFoer } = await db.from("kontor_push_sendt").select("art, ref")
      .eq("firma_id", f.id).in("ref", haster.map((l) => l.ref));
    const kendt = new Set((sendtFoer ?? []).map((r) => `${r.art}|${r.ref}`));
    const nye = haster.filter((l) => !kendt.has(`${l.art}|${l.ref}`));
    if (!nye.length) return { sendt: 0 };
    // Markeres FOER afsendelsen, saa en fejl ikke giver samme besked hvert kvarter.
    await db.from("kontor_push_sendt").upsert(nye.map((l) => ({ firma_id: f.id, art: l.art, ref: l.ref })), { onConflict: "firma_id,art,ref" });
    const titel = nye.length === 1 ? nye[0].titel : `${nye.length} ting haster på kontoret`;
    const tekst = nye.length === 1 ? nye[0].tekst
      : nye.slice(0, 3).map((l) => l.titel).join(" · ") + (nye.length > 3 ? " …" : "");
    const antal = await sendPush(db, { medarbejdere: (planlaeggere ?? []).map((e) => e.id as string),
      titel, tekst: tekst.slice(0, 180), url: adresse, maerke: "kontor" });
    await log(antal >= 0, antal >= 0 ? `${nye.length} hastende sag(er), push naaede ${antal} enhed(er)` : "push til planlaeggere fejlede");
    return { sager: nye.length, enheder: antal };
  }

  if (!linjer.length) { await log(true, "morgenmail: intet venter"); return { sendt: 0 }; }
  const orden: Record<string, number> = { roed: 0, orange: 1, blaa: 2 };
  const farve: Record<string, string> = { roed: "#DC2626", orange: "#D97706", blaa: "#4F46E5" };
  const raekker = [...linjer].sort((a, b) => Number(b.haster) - Number(a.haster) || (orden[a.farve] ?? 3) - (orden[b.farve] ?? 3))
    .map((l) => `<tr><td style="padding:8px 10px;border-bottom:1px solid #F1F5F9;vertical-align:top">`
      + `<span style="display:inline-block;width:8px;height:8px;border-radius:4px;background:${farve[l.farve] ?? "#94A3B8"}"></span></td>`
      + `<td style="padding:8px 10px 8px 0;border-bottom:1px solid #F1F5F9"><div style="font-weight:700;font-size:14px;color:#111">${esc(l.titel)}`
      + `${l.haster ? ' <span style="color:#DC2626;font-size:12px">· haster</span>' : ""}</div>`
      + `<div style="font-size:13px;color:#475569;margin-top:2px">${esc(l.tekst)}</div></td></tr>`).join("");
  const html = `<div style="font-family:-apple-system,Segoe UI,Arial,sans-serif;max-width:640px">`
    + `<h2 style="font-size:18px;margin:0 0 6px">Godmorgen</h2>`
    + `<p style="font-size:14px;color:#475569;margin:0 0 14px">Det her venter på kontoret. Det samme står under klokken i planlægningen.</p>`
    + `<table style="border-collapse:collapse;width:100%">${raekker}</table>`
    + `<p style="margin-top:18px"><a href="${adresse}" style="background:#2563EB;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;font-weight:700">Åbn planlægningen</a></p></div>`;
  let sendt = 0;
  const fejlede: string[] = [];
  for (const e of planlaeggere ?? []) {
    if (!e.app_email) continue;
    const fejl = await sendMail(db, f, { email: e.app_email as string, name: e.name as string,
      subject: `Til kontoret: ${linjer.length} ting venter`, html });
    if (fejl) fejlede.push(`${e.app_email}: ${fejl}`); else sendt++;
  }
  await log(fejlede.length === 0, `morgenmail: ${linjer.length} sager, sendt til ${sendt}` + (fejlede.length ? `, fejlede: ${fejlede.join(" | ")}` : ""));
  return { sager: linjer.length, sendt, fejlede };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const body = await req.json().catch(() => ({}));
    const job = body.job === "morgen" ? "morgen" : "push";
    // Cron koerer kl. 5 og 6 UTC; der sendes kun, naar klokken er 7 i Danmark.
    if (job === "morgen" && body.ignorerUr !== true && danskTime() !== 7) return svar({ ok: true, sendt: 0, grund: "ikke kl. 7" });
    const res = await forHvertFirma(JOB, body.firma ?? null, (db, f) => koer(db, f, job));
    return svar({ ok: res.every((r) => r.ok), job, firmaer: res });
  } catch (e) {
    return svar({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
