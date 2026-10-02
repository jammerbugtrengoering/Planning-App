import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// JAMMERBUGT RENGOERINGS DATABASE.
//
// Koeretabel til «Simulér uge» (30.9.2026, se overdragelse/PLAN-simulering.md).
//
// Ind: { adresser: ["Østergade 27, 9440 Aabybro", ...] }   (en dags adresser, højst 50)
// Ud:  { tabel: { "<a>|<b>": { km, min, kilde } }, mangler: [...adresser uden punkt] }
//
// Rækkefølgen for hvert par:
//   1. travel_overrides — de ruter, kilometerpengene bygger paa (korteste rute).
//   2. koeretabel — tidligere hentet til simuleringen.
//   3. OpenRouteServices matrix — ÉT kald for alle manglende par paa dagen. Gemmes i
//      koeretabel, ALDRIG i travel_overrides, saa simuleringen ikke kan flytte
//      kilometerpenge.
//
// Kortpunkter: travel_overrides' lat/lng, ellers adresse_punkt, ellers Danmarks
// adresseregister (GSearch) eller ORS — DAWA lukkede 2026. Kun kundeadresser — aldrig medarbejderes position.
//
// Kun planlaeggere. Gratis-kvoten hos ORS er 500 matrix-kald i doegnet og højst 3.500
// par pr. kald (50 × 50) — en dag har typisk under 40 adresser.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ORS_API_KEY = Deno.env.get("ORS_API_KEY") ?? "";
const MINDSTE_MINUTTER = 2;   // samme gulv som travel-distance
const MAX_ADRESSER = 50;
const SKIL = "|";   // skilletegn i tabellens noegler: "<a>|<b>"

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const svar = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

// Geokodning (2.10.2026). DAWA (api.dataforsyningen.dk/adresser) er lukket og svarer
// 410 Gone. Nu: GSearch (Danmarks adresseregister), naar DATAFORSYNINGEN_TOKEN er sat,
// ellers OpenRouteService. Samme regler som edge-funktionen adresse-opslag.
// ORS' svar bruges KUN, naar postnummeret passer — et punkt i den forkerte by giver
// forkerte kilometer, og det er vaerre end ingen.
const GS_TOKEN = Deno.env.get("DATAFORSYNINGEN_TOKEN") ?? "";
// «Simonivej 49 stuen, Pandrup» og «Torvet 7B, 1.sal, 9492 Blokhus» findes ikke i
// registret som skrevet. Vej + husnummer + (postnummer eller by) findes. Etage, doer og
// supplerende bynavn skaeres fra (2.10.2026: 5 af 35 gamle ruter fejlede paa det).
function delAdresse(q: string): { vej: string; postnr: string; by: string } {
  const dele = q.split(",").map((s) => s.trim()).filter(Boolean);
  const foerste = dele[0] || q.trim();
  const postnr = (q.match(/\b(\d{4})\b(?!.*\b\d{4}\b)/) ?? [])[1] ?? "";
  const uden = foerste.replace(/\b\d{4}\b.*$/, "").trim() || foerste;
  const m = uden.match(/^(.*?\D\s*\d+\s?[A-Za-zÆØÅæøå]?)(?=$|[\s.,])/);
  const vej = (m ? m[1] : uden).trim();
  const sidste = dele.length > 1 ? dele[dele.length - 1].replace(/\b\d{4}\b/, "").trim() : "";
  const by = postnr ? "" : (sidste || (foerste.match(/\d+\s?[A-Za-zÆØÅæøå]?\s+([A-Za-zÆØÅæøå][\wÆØÅæøå .-]*)$/) ?? [])[1] || "");
  return { vej, postnr, by: by.replace(/^(stuen|st\.?|\d+\.?\s*sal)\b\s*/i, "").trim() };
}
function renTekst(q: string): string {
  const { vej, postnr, by } = delAdresse(q);
  return [vej, postnr || by].filter(Boolean).join(", ");
}
function foerstePunkt(g: any): [number, number] | null {
  let c = g?.coordinates;
  while (Array.isArray(c) && Array.isArray(c[0])) c = c[0];
  return Array.isArray(c) && c.length >= 2 && Number.isFinite(c[0]) && Number.isFinite(c[1]) ? [c[0], c[1]] : null;
}
async function geocodeRegister(adresse: string): Promise<{ lat: number; lng: number } | null> {
  if (!GS_TOKEN) return null;
  return (await geocodeRegisterEn(adresse)) ?? (renTekst(adresse) !== adresse ? await geocodeRegisterEn(renTekst(adresse)) : null);
}
async function geocodeRegisterEn(adresse: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const r = await fetch("https://api.dataforsyningen.dk/rest/gsearch/v2.0/adresse?q=" + encodeURIComponent(adresse)
      + "&limit=1&srid=4326&token=" + encodeURIComponent(GS_TOKEN),
      { headers: { "Accept-Encoding": "identity" } });   // ellers «unexpected end of file»
    if (!r.ok) return null;
    const d = await r.json();
    const p = Array.isArray(d) && d[0] ? foerstePunkt(d[0].geometri ?? d[0].geometry) : null;
    return p ? { lat: p[1], lng: p[0] } : null;
  } catch { return null; }
}
async function geocodeOrsDk(adresse: string): Promise<{ lat: number; lng: number } | null> {
  if (!ORS_API_KEY) return null;
  try {
    const { postnr } = delAdresse(adresse);
    const r = await fetch("https://api.openrouteservice.org/geocode/search?api_key=" + encodeURIComponent(ORS_API_KEY)
      + "&text=" + encodeURIComponent(renTekst(adresse))
      + "&boundary.country=DK&layers=address&size=5&focus.point.lat=57.16&focus.point.lon=9.73");
    if (!r.ok) return null;
    const d = await r.json();
    const f = (d?.features ?? []).find((x: any) => !postnr || String(x?.properties?.postalcode ?? "") === postnr);
    const p = f ? foerstePunkt(f.geometry) : null;
    return p ? { lat: p[1], lng: p[0] } : null;
  } catch { return null; }
}

async function geocode(adresse: string): Promise<{ lat: number; lng: number; kilde: string } | null> {
  const g = await geocodeRegister(adresse);
  if (g) return { ...g, kilde: "gsearch" };
  const o = await geocodeOrsDk(adresse);
  return o ? { ...o, kilde: "ors" } : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  try {
    const jwt = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    const { data: { user } } = await admin.auth.getUser(jwt);
    if (!user) return svar({ error: "ikke_logget_ind" }, 401);
    const { data: mig } = await admin.from("employees").select("is_admin")
      .eq("auth_user_id", user.id).is("fratraadt_dato", null).maybeSingle();
    if (!mig?.is_admin) return svar({ error: "kun_planlaegger" }, 403);

    const b = await req.json().catch(() => ({}));
    const adresser = [...new Set((b.adresser ?? []).map((a: unknown) => String(a ?? "").trim()).filter(Boolean))] as string[];
    if (!adresser.length) return svar({ tabel: {}, mangler: [] });
    if (adresser.length > MAX_ADRESSER) return svar({ error: `Højst ${MAX_ADRESSER} adresser ad gangen.` }, 400);

    const noegle = (a: string, c: string) => (a < c ? a + SKIL + c : c + SKIL + a);
    const tabel: Record<string, { km: number; min: number; kilde: string }> = {};

    // 1 + 2: det, der allerede findes.
    // To opslag i stedet for én or()-streng: en adresse med komma eller parentes i ville
    // stille give et forkert antal raekker (samme erfaring som i src/vindue.js).
    const kol = "addr_a, addr_b, km, minutes, lat_a, lng_a, lat_b, lng_b";
    const [{ data: r1 }, { data: r2 }] = await Promise.all([
      admin.from("travel_overrides").select(kol).in("addr_a", adresser),
      admin.from("travel_overrides").select(kol).in("addr_b", adresser),
    ]);
    const ruter = [...(r1 ?? []), ...(r2 ?? [])];
    const saet = new Set(adresser);
    const punkt: Record<string, { lat: number; lng: number }> = {};
    for (const r of ruter) {
      if (r.lat_a != null && saet.has(r.addr_a)) punkt[r.addr_a] ||= { lat: Number(r.lat_a), lng: Number(r.lng_a) };
      if (r.lat_b != null && saet.has(r.addr_b)) punkt[r.addr_b] ||= { lat: Number(r.lat_b), lng: Number(r.lng_b) };
      if (saet.has(r.addr_a) && saet.has(r.addr_b) && r.km != null && r.minutes != null)
        tabel[noegle(r.addr_a, r.addr_b)] = { km: Number(r.km), min: Number(r.minutes), kilde: "rute" };
    }
    const { data: gemte } = await admin.from("koeretabel").select("addr_a, addr_b, km, minutes")
      .in("addr_a", adresser).in("addr_b", adresser);
    for (const r of gemte ?? []) {
      const k = noegle(r.addr_a, r.addr_b);
      if (!tabel[k]) tabel[k] = { km: Number(r.km), min: Number(r.minutes), kilde: "matrix" };
    }

    // Kortpunkter til de adresser, der mangler et.
    const { data: pkt } = await admin.from("adresse_punkt").select("adresse, lat, lng").in("adresse", adresser);
    for (const p of pkt ?? []) if (p.lat != null) punkt[p.adresse] ||= { lat: Number(p.lat), lng: Number(p.lng) };
    for (const a of adresser) {
      if (punkt[a]) continue;
      const g = await geocode(a);
      if (g) {
        punkt[a] = { lat: g.lat, lng: g.lng };
        await admin.from("adresse_punkt").upsert({ adresse: a, lat: g.lat, lng: g.lng, kilde: g.kilde, hentet: new Date().toISOString() });
      }
    }
    const mangler = adresser.filter((a) => !punkt[a]);

    // 3: ét matrix-kald for de par, der stadig mangler.
    const medPunkt = adresser.filter((a) => punkt[a]);
    const manglerPar = medPunkt.some((a, i) => medPunkt.slice(i + 1).some((c) => !tabel[noegle(a, c)]));
    let orsKald = 0;
    if (manglerPar && medPunkt.length > 1) {
      if (!ORS_API_KEY) return svar({ error: "ORS_API_KEY mangler under Edge Functions -> Secrets." }, 500);
      const r = await fetch("https://api.openrouteservice.org/v2/matrix/driving-car", {
        method: "POST",
        headers: { Authorization: ORS_API_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ locations: medPunkt.map((a) => [punkt[a].lng, punkt[a].lat]), metrics: ["distance", "duration"], units: "km" }),
      });
      orsKald = 1;
      if (!r.ok) return svar({ error: `OpenRouteService svarede ${r.status}`, tabel, mangler }, 502);
      const d = await r.json();
      const nye: { addr_a: string; addr_b: string; km: number; minutes: number }[] = [];
      for (let i = 0; i < medPunkt.length; i++) {
        for (let j = i + 1; j < medPunkt.length; j++) {
          const k = noegle(medPunkt[i], medPunkt[j]);
          if (tabel[k]) continue;
          // Gennemsnit af de to retninger: ensrettede veje giver lidt forskel.
          const km = Math.round(((d.distances[i][j] + d.distances[j][i]) / 2) * 10) / 10;
          const raa = Math.round(((d.durations[i][j] + d.durations[j][i]) / 2) / 60);
          const min = km > 0 ? Math.max(MINDSTE_MINUTTER, raa) : raa;
          tabel[k] = { km, min, kilde: "matrix" };
          const [x, y] = medPunkt[i] < medPunkt[j] ? [medPunkt[i], medPunkt[j]] : [medPunkt[j], medPunkt[i]];
          nye.push({ addr_a: x, addr_b: y, km, minutes: min });
        }
      }
      for (let i = 0; i < nye.length; i += 500) await admin.from("koeretabel").upsert(nye.slice(i, i + 500));
    }
    return svar({ tabel, mangler, orsKald });
  } catch (e) {
    console.error("koeretabel:", String((e as Error)?.message ?? e));
    return svar({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
