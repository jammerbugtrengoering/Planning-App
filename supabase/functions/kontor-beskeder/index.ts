import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Besked til kontoret om det, der venter (25.9.2026, bestilt af Jonn).
//
// Listen er den samme som klokken i planlaegningsappen: databasefunktionen
// kontor_indbakke(). Klokken, pushen og mailen kan derfor aldrig sige hver sit.
//
//   { job: "push" }    - hvert kvarter. KUN det hastende (kom ikke ind, ny tid i dag
//                        eller i morgen, en tid der er gaaet over tiden, en kunde der
//                        vil have noget snart). Hver sag sendes én gang.
//   { job: "morgen" }  - kl. 7 dansk tid. ALT der venter, i én mail.
//
// Modtagere: alle planlaeggere (is_admin). Jonn 25.9.2026: der er to, de ejer
// firmaet, og de skal begge have besked om alt.
//
// HVORFOR KUN DET HASTENDE SOM PUSH. Faar man besked om alt, slaar man beskederne
// fra — og saa er det hastende ogsaa vaek. Resten staar i klokken og i morgenmailen.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

// «JWT issued at future» (26.9.2026). Supabase laver en kortlivet noegle til hvert
// kald, og en gang imellem gaar databasens ur et splitsekund bagefter den, der lavede
// noeglen. Saa afvises kaldet, selvom intet er galt. Det ramte ca. hvert femtende
// kvarter og gav en fejlmail om morgenen. Kaldet proeves derfor igen op til tre gange
// med en kort pause — KUN ved netop den fejl. Alt andet kommer frem som foer.
async function fetchMedGentagelse(input: Request | URL | string, init?: RequestInit): Promise<Response> {
  for (let forsoeg = 0; ; forsoeg++) {
    const res = await fetch(input, init);
    if (res.status !== 401 || forsoeg >= 3) return res;
    const tekst = await res.clone().text().catch(() => "");
    if (!/issued at future/i.test(tekst)) return res;
    await new Promise((r) => setTimeout(r, 800 * (forsoeg + 1)));
  }
}
const JOB = "kontor-beskeder";
// jammerbugtrengoering-service er WORKLIST. Planlaegningsappen ligger her.
const PLANLAEGNING_URL = "https://jammerbugtrengoering-planning.netlify.app";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function svar(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

type Linje = {
  art: string; ref: string; instance_id: string | null; titel: string; tekst: string;
  tidspunkt: string; haster: boolean; farve: string; kvitterbar: boolean;
};

const esc = (s: unknown) => String(s ?? "")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function danskTime(): number {
  return Number(new Intl.DateTimeFormat("da-DK", { hour: "2-digit", hour12: false, timeZone: "Europe/Copenhagen" })
    .format(new Date()));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { global: { fetch: fetchMedGentagelse } });
  const log = (ok: boolean, besked: string) => admin.rpc("log_job", { p_job: JOB, p_ok: ok, p_besked: besked });

  let job = "push";
  try {
    const body = await req.json().catch(() => ({}));
    job = body.job === "morgen" ? "morgen" : "push";
    const ignorerUr = body.ignorerUr === true;

    const { data: planlaeggere, error: pFejl } = await admin.from("employees")
      .select("id, name, app_email").eq("is_admin", true).is("fratraadt_dato", null);
    if (pFejl) { await log(false, "planlaeggere kunne ikke laeses: " + pFejl.message); return svar({ error: pFejl.message }, 500); }

    const { data, error } = await admin.rpc("kontor_indbakke");
    if (error) { await log(false, `${job}: indbakken kunne ikke laeses: ${error.message}`); return svar({ error: error.message }, 500); }
    const linjer = (data ?? []) as Linje[];

    // ── Push: det hastende, én gang pr. sag ──────────────────────────────
    if (job === "push") {
      const haster = linjer.filter((l) => l.haster);
      if (!haster.length) return svar({ ok: true, sendt: 0 });
      const { data: sendtFoer } = await admin.from("kontor_push_sendt").select("art, ref")
        .in("ref", haster.map((l) => l.ref));
      const kendt = new Set((sendtFoer ?? []).map((r) => `${r.art}|${r.ref}`));
      const nye = haster.filter((l) => !kendt.has(`${l.art}|${l.ref}`));
      if (!nye.length) return svar({ ok: true, sendt: 0 });

      // Markeres FOER afsendelsen. Gaar pushen galt, er sagen stadig i klokken og i
      // morgenmailen; sendte vi foerst, kunne en fejl bagefter give samme besked hvert
      // kvarter resten af dagen.
      await admin.from("kontor_push_sendt").upsert(nye.map((l) => ({ art: l.art, ref: l.ref })), { onConflict: "art,ref" });

      const titel = nye.length === 1 ? nye[0].titel : `${nye.length} ting haster på kontoret`;
      const tekst = nye.length === 1
        ? nye[0].tekst
        : nye.slice(0, 3).map((l) => l.titel).join(" · ") + (nye.length > 3 ? " …" : "");
      const { data: p, error: pushFejl } = await admin.functions.invoke("send-push", {
        headers: { Authorization: `Bearer ${SERVICE_KEY}` },
        body: { medarbejdere: (planlaeggere ?? []).map((e) => e.id), titel, tekst: tekst.slice(0, 180),
                url: PLANLAEGNING_URL, maerke: "kontor" },
      });
      const antal = (p as { sendt?: number })?.sendt ?? 0;
      await log(!pushFejl, pushFejl
        ? `push til planlaeggere fejlede: ${pushFejl.message ?? pushFejl}`
        : `${nye.length} hastende sag(er), push naaede ${antal} enhed(er)`);
      return svar({ ok: !pushFejl, sager: nye.length, enheder: antal });
    }

    // ── Morgenmail: alt der venter ───────────────────────────────────────
    // Cron koerer kl. 5 og 6 UTC; vagten her sender kun, naar klokken er 7 i Danmark.
    // Saa passer det baade sommer og vinter.
    if (!ignorerUr && danskTime() !== 7) return svar({ ok: true, sendt: 0, grund: "ikke kl. 7" });
    if (!linjer.length) { await log(true, "morgenmail: intet venter"); return svar({ ok: true, sendt: 0 }); }

    const orden: Record<string, number> = { roed: 0, orange: 1, blaa: 2 };
    const sorteret = [...linjer].sort((a, b) => Number(b.haster) - Number(a.haster)
      || (orden[a.farve] ?? 3) - (orden[b.farve] ?? 3));
    const farve: Record<string, string> = { roed: "#DC2626", orange: "#D97706", blaa: "#4F46E5" };
    const raekker = sorteret.map((l) => `
      <tr><td style="padding:8px 10px;border-bottom:1px solid #F1F5F9;vertical-align:top">
        <span style="display:inline-block;width:8px;height:8px;border-radius:4px;background:${farve[l.farve] ?? "#94A3B8"}"></span>
      </td><td style="padding:8px 10px 8px 0;border-bottom:1px solid #F1F5F9">
        <div style="font-weight:700;font-size:14px;color:#111">${esc(l.titel)}${l.haster ? ' <span style="color:#DC2626;font-size:12px">· haster</span>' : ""}</div>
        <div style="font-size:13px;color:#475569;margin-top:2px">${esc(l.tekst)}</div>
      </td></tr>`).join("");
    const emne = `Til kontoret: ${linjer.length} ${linjer.length === 1 ? "ting venter" : "ting venter"}`;
    const html = `<div style="font-family:-apple-system,Segoe UI,Arial,sans-serif;max-width:640px">
      <h2 style="font-size:18px;margin:0 0 6px">Godmorgen</h2>
      <p style="font-size:14px;color:#475569;margin:0 0 14px">Det her venter på kontoret. Det samme står under klokken i planlægningsappen, og det forsvinder, når det er klaret.</p>
      <table style="border-collapse:collapse;width:100%">${raekker}</table>
      <p style="margin-top:18px"><a href="${PLANLAEGNING_URL}" style="background:#D6247A;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;font-weight:700">Åbn planlægningen</a></p>
    </div>`;

    let sendt = 0;
    const fejlede: string[] = [];
    for (const e of planlaeggere ?? []) {
      if (!e.app_email) continue;
      const { error: mailFejl } = await admin.functions.invoke("send-email", {
        headers: { Authorization: `Bearer ${SERVICE_KEY}` },
        body: { email: e.app_email, name: e.name, subject: emne, html },
      });
      if (mailFejl) fejlede.push(`${e.app_email}: ${mailFejl.message ?? mailFejl}`); else sendt++;
    }
    await log(fejlede.length === 0, `morgenmail: ${linjer.length} sager, sendt til ${sendt}` +
      (fejlede.length ? `, fejlede: ${fejlede.join(" | ")}` : ""));
    return svar({ ok: fejlede.length === 0, sager: linjer.length, sendt, fejlede });
  } catch (e) {
    const m = String((e as Error)?.message ?? e);
    await log(false, `${job} faldt over: ${m}`);
    return svar({ error: m }, 500);
  }
});
