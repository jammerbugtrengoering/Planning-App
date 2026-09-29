import { forHvertFirma, cors, svar, type Db, type Firma } from "../_felles/firmaer.ts";

// KUNDEDATABASEN (projekt zwbsbckoyxzzobudjxij). Sletter opgavefotos aeldre end
// opbevaringsfristen (12 maaneder), ét firma ad gangen. Filerne fjernes gennem
// storage-API'et, saa selve filen forsvinder og ikke kun raekken.
//
// { firma: "<id>" } koerer kun det ene firma. { dryRun: true } viser hvad der ville
// blive slettet.

const JOB = "slet-gamle-fotos";
const BUCKET = "opgavefotos";
const MAANEDER = 12;

async function koer(db: Db, f: Firma, toerloeb: boolean) {
  const { data: gamle, error } = await db.rpc("gamle_opgavefotos", { p_maaneder: MAANEDER });
  if (error) throw new Error(error.message);
  // Kun stier, der hoerer til en opgave i DETTE firma.
  let stier = ((gamle ?? []) as { sti: string }[]).map((o) => o.sti).filter(Boolean);
  if (stier.length) {
    const ider = [...new Set(stier.map((s) => s.split("/")[0]))];
    const { data: egne } = await db.from("instances").select("id").eq("firma_id", f.id).in("id", ider);
    const tilladt = new Set((egne ?? []).map((i) => i.id as string));
    stier = stier.filter((s) => tilladt.has(s.split("/")[0]));
  }
  if (toerloeb) return { villeSlette: stier.length };
  if (!stier.length) { await db.rpc("log_job", { p_job: JOB, p_ok: true, p_besked: "intet at slette" }); return { slettet: 0 }; }

  const { error: delErr } = await db.storage.from(BUCKET).remove(stier);
  if (delErr) throw new Error(delErr.message);
  const opgaveIder = [...new Set(stier.map((s) => s.split("/")[0]))];
  const { error: updErr } = await db.from("task_notes")
    .update({ photos: [], photos_deleted_at: new Date().toISOString() })
    .eq("firma_id", f.id).in("instance_id", opgaveIder).is("photos_deleted_at", null);
  if (updErr) throw new Error(updErr.message);
  await db.rpc("log_job", { p_job: JOB, p_ok: true, p_besked: `${stier.length} billeder slettet` });
  return { slettet: stier.length, opgaver: opgaveIder.length };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const body = await req.json().catch(() => ({}));
    const res = await forHvertFirma(JOB, body.firma ?? null, (db, f) => koer(db, f, body.dryRun === true));
    return svar({ ok: res.every((r) => r.ok), firmaer: res });
  } catch (e) {
    return svar({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
