import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// KUNDEDATABASEN (projekt zwbsbckoyxzzobudjxij). Faelles for baggrundsjobbene.
//
// Hos Jammerbugt koerer hvert job én gang for hele databasen. Her er der mange firmaer,
// og et job maa aldrig blande dem sammen. Derfor koeres jobbet ét firma ad gangen:
//
//   * Klienten sender x-firma-id med. Databasefunktionerne (kontor_indbakke,
//     tidsstart_til_paamindelse, log_job, ...) ejes af firma_ejer og ser derfor kun
//     det firma, current_firma_id() giver — og for service_role er det x-firma-id.
//   * Service-noeglen gaar UDEN OM adgangsreglerne ved direkte tabelopslag. Derfor
//     skal hvert eneste .from(...) i et job have .eq("firma_id", f.id). Det er ikke
//     pynt: uden det faar firma A beskeder om firma B's opgaver.
//   * Fejler ét firma, fortsaetter de andre.
//
// Jobbene er IKKE sat i gang (Jonn 29.9.2026): de startes, naar den foerste loesning er
// solgt. Se JOB.md.

export const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
export const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
export const PLANLAEGNING_URL = Deno.env.get("PLANLAEGNING_URL") ?? "https://kunde-planlaegning.netlify.app";

export type Firma = { id: string; navn: string; slug: string; afsender_navn: string | null; svar_til: string | null };
export type Db = ReturnType<typeof createClient>;

export const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
export function svar(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

// «JWT issued at future»: se kontor-beskeder hos Jammerbugt. Proeves igen ved netop
// den fejl, intet andet.
export async function fetchMedGentagelse(input: Request | URL | string, init?: RequestInit): Promise<Response> {
  for (let forsoeg = 0; ; forsoeg++) {
    const res = await fetch(input, init);
    if (res.status !== 401 || forsoeg >= 3) return res;
    const tekst = await res.clone().text().catch(() => "");
    if (!/issued at future/i.test(tekst)) return res;
    await new Promise((r) => setTimeout(r, 800 * (forsoeg + 1)));
  }
}

export function klient(firmaId?: string): Db {
  return createClient(SUPABASE_URL, SERVICE_KEY, {
    global: { fetch: fetchMedGentagelse, headers: firmaId ? { "x-firma-id": firmaId } : {} },
  });
}

export async function aktiveFirmaer(): Promise<Firma[]> {
  const { data, error } = await klient().from("firma")
    .select("id, navn, slug, afsender_navn, svar_til").eq("status", "aktiv").order("oprettet");
  if (error) throw new Error("firmaerne kunne ikke laeses: " + error.message);
  return (data ?? []) as Firma[];
}

// Koerer fn for hvert aktivt firma (eller kun det ene, hvis kunFirma er sat).
export async function forHvertFirma<T>(job: string, kunFirma: string | null,
                                      fn: (db: Db, f: Firma) => Promise<T>) {
  const firmaer = (await aktiveFirmaer()).filter((f) => !kunFirma || f.id === kunFirma);
  const resultat: { firma: string; ok: boolean; svar?: T; fejl?: string }[] = [];
  for (const f of firmaer) {
    const db = klient(f.id);
    try {
      resultat.push({ firma: f.id, ok: true, svar: await fn(db, f) });
    } catch (e) {
      const m = String((e as Error)?.message ?? e);
      console.error(`${job} fejlede for ${f.id}:`, m);
      try { await db.rpc("log_job", { p_job: job, p_ok: false, p_besked: `${job} faldt over: ${m}` }); } catch { /* livstegnet maa ikke vaelte resten */ }
      resultat.push({ firma: f.id, ok: false, fejl: m });
    }
  }
  return resultat;
}

export async function sendMail(db: Db, f: Firma, m: { email: string; name?: string; subject: string; html: string }) {
  const { error } = await db.functions.invoke("send-email", {
    headers: { Authorization: `Bearer ${SERVICE_KEY}` },
    body: { ...m, afsender_navn: f.afsender_navn || f.navn, svar_til: f.svar_til || "" },
  });
  return error ? String(error.message ?? error) : null;
}

export async function sendPush(db: Db, body: { medarbejdere: string[]; titel: string; tekst: string; url?: string; maerke?: string }) {
  const { data, error } = await db.functions.invoke("send-push", {
    headers: { Authorization: `Bearer ${SERVICE_KEY}` },
    body: { url: "/", ...body },
  });
  if (error) console.error("push fejlede:", String(error.message ?? error));
  return error ? -1 : ((data as { sendt?: number })?.sendt ?? 0);
}
