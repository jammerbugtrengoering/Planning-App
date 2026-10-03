import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Push til planlaeggernes telefoner, naar Netlify er faerdig med at udgive en af de
// tre apps (3.10.2026, Jonns oenske: alle planlaeggere, baade lykkedes og fejlede).
//
// Hvorfor: Claude committer og pusher selv fra 3.10.2026, og Netlify udgiver inden for
// et minut. GitHub giver ingen besked om et almindeligt push, og Netlify har ingen app
// med push. Uden det her opdager kontoret foerst en ny udgave, naar baandet om
// «ny version» dukker op — og et FEJLET deploy opdager ingen, for saa sker der netop
// ingenting.
//
// Kaldes af Netlifys «Outgoing webhook» (Deploy succeeded / Deploy failed) paa hvert
// site. verify_jwt er slaaet fra, fordi Netlify ikke har et Supabase-login. I stedet
// signerer Netlify hvert kald (JWS i X-Webhook-Signature) med en hemmelighed, der skal
// staa ens i Netlify og i Supabase-secret NETLIFY_DEPLOY_HEMMELIGHED. Mangler den,
// afvises alt — hellere ingen besked end en aaben dør, hvor enhver kan sende push ud
// i firmaets navn.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const HEMMELIGHED = Deno.env.get("NETLIFY_DEPLOY_HEMMELIGHED") ?? "";

// Netlify-sitenavn -> det navn, kontoret kender appen under.
const APPS: Record<string, string> = {
  "jammerbugtrengoering-planning": "Planlægning",
  "jammerbugtrengoering-service": "Worklist",
  "jammerbugtrengoering-kundeportal": "Kundeportalen",
};

function svar(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function b64urlTilBytes(s: string) {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64.padEnd(b64.length + (4 - b64.length % 4) % 4, "="));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}
const hex = (buf: ArrayBuffer) => Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");

// Netlifys signatur: en JWT (HS256) med { iss: "netlify", sha256: <sha256 af kroppen> }.
// Begge dele tjekkes: at den er signeret med vores hemmelighed, OG at den hoerer til
// netop denne krop — ellers kunne en gammel signatur genbruges med et andet indhold.
async function signaturGyldig(signatur: string, krop: string) {
  const dele = signatur.split(".");
  if (dele.length !== 3) return false;
  const noegle = await crypto.subtle.importKey("raw", new TextEncoder().encode(HEMMELIGHED),
    { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  const ok = await crypto.subtle.verify("HMAC", noegle, b64urlTilBytes(dele[2]),
    new TextEncoder().encode(`${dele[0]}.${dele[1]}`));
  if (!ok) return false;
  try {
    const claims = JSON.parse(new TextDecoder().decode(b64urlTilBytes(dele[1])));
    const sum = hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(krop)));
    return claims.iss === "netlify" && claims.sha256 === sum;
  } catch { return false; }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return svar({ error: "kun_post" }, 405);
  if (!HEMMELIGHED) {
    console.error("deploy-besked: NETLIFY_DEPLOY_HEMMELIGHED mangler — alt afvises");
    return svar({ error: "ikke_sat_op" }, 503);
  }

  const krop = await req.text();
  if (!(await signaturGyldig(req.headers.get("X-Webhook-Signature") ?? "", krop))) {
    console.error("deploy-besked: ugyldig signatur");
    return svar({ error: "ugyldig_signatur" }, 401);
  }

  let d: Record<string, unknown>;
  try { d = JSON.parse(krop); } catch { return svar({ error: "ugyldig_json" }, 400); }

  // Kun den rigtige udgivelse. Forhaandsvisninger og andre grene er ikke noget,
  // kontoret skal vaekkes af.
  if (d.context && d.context !== "production") return svar({ ok: true, sprunget_over: "ikke_produktion" });

  const site = String(d.name ?? "");
  const app = APPS[site] ?? site;
  const lykkedes = d.state === "ready";
  // Commit-beskeden er det, der siger hvad der er ændret. Den er skrevet uden æøå
  // (regel i CLAUDE.md), men kort og til at forstå.
  const hvad = String(d.title ?? d.commit_ref ?? "").split("\n")[0].slice(0, 120);
  const admin = String(d.admin_url ?? "");

  const titel = lykkedes ? `${app} er opdateret` : `${app}: udgivelsen fejlede`;
  const tekst = lykkedes
    ? (hvad || "Ny version er ude.") + " — genindlæs appen for at få den."
    : `Ændringen er IKKE ude. ${hvad}`.trim();
  // Lykkedes: åbn appen. Fejlede: åbn deployet hos Netlify, hvor fejlen står.
  const url = lykkedes ? String(d.ssl_url ?? d.url ?? "/") : (admin && d.id ? `${admin}/deploys/${d.id}` : admin || "/");

  const db = createClient(SUPABASE_URL, SERVICE_KEY);
  const { data: planlaeggere, error } = await db.from("employees")
    .select("id").eq("is_admin", true).is("fratraadt_dato", null);
  if (error) return svar({ error: error.message }, 500);
  const ider = (planlaeggere ?? []).map((p) => p.id);
  if (!ider.length) return svar({ ok: true, sendt: 0 });

  // Authorization saettes eksplicit: functions.invoke fra én edge-funktion til en anden
  // sender ingen header af sig selv (se START-PROMPT.md).
  const { data: p, error: pushFejl } = await db.functions.invoke("send-push", {
    headers: { Authorization: `Bearer ${SERVICE_KEY}` },
    body: { medarbejdere: ider, titel, tekst, url, maerke: `udgivelse-${site}` },
  });
  if (pushFejl) {
    console.error("deploy-besked: push fejlede", String(pushFejl.message ?? pushFejl));
    return svar({ ok: false, error: "push_fejlede" });
  }
  console.log(`deploy-besked: ${site} ${d.state} -> ${(p as { sendt?: number })?.sendt ?? 0} sendt`);
  return svar({ ok: true, site, state: d.state, sendt: (p as { sendt?: number })?.sendt ?? 0 });
});
