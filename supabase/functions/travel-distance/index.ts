import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const ORS_API_KEY = Deno.env.get("ORS_API_KEY") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
// 2.10.2026: DAWA er lukket (410 Gone). Registret er nu GSearch, som kraever en token.
const GS_TOKEN = Deno.env.get("DATAFORSYNINGEN_TOKEN") ?? "";

// Mindste koeretid mellem to adresser der FAKTISK ligger forskellige steder.
//
// Ruteberegningen runder ned, saa alt under et halvt minuts koersel blev til 0 — og saa
// tegnede tidslinjen ingen transport. Planen troede hun kunne teleportere. Hun skal
// pakke sammen, ud til bilen, koere, parkere og ind ad en ny doer.
//
// Gulvet gaelder KUN naar km > 0. Flere adresser findes i basen i to skrivemaader —
// "Klitheden Syd 69, 9492 Blokhus" og "Klitheden Syd 69,9492 Blokhus" — og dér er 0
// det rigtige svar. To minutter ville vaere opdigtet transport til samme doer.
const MINDSTE_MINUTTER = 2;

// Loft for hvad der regnes for en plausibel rute.
//
// 100 km er rigtigt for ruten mellem to rengoeringsopgaver: firmaet koerer i
// Jammerbugt-omraadet, saa et svar paa 400 km betyder naesten altid, at en adresse er
// geokodet forkert — og et forkert tal i kilometerpengene er vaerre end ingen tal.
//
// Men en enkeltstaaende tur er en anden sag. At hente materialer i Odder eller tage paa
// kursus i Koebenhavn ER langt, og det er med vilje. Derfor kan kalderen saette sit eget
// loft pr. tur. Uden angivelse gaelder de 100 km som hidtil.
//
// Vi opdagede det ved at proeve: den foerste aktivitetstur, Odder–Blokhus, kom tilbage
// uden kilometer, fordi de 180 km ramte loftet.
const STANDARD_MAX_KM = 100;
const ABSOLUT_MAX_KM = 600;   // laengere end Danmark er langt. Saa er det en fejl.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type"
};
function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json"
    }
  });
}

// Foerste koordinatpar i GSearch' MultiPoint.
function foerstePunkt(g) {
  let c = g && g.coordinates;
  while (Array.isArray(c) && Array.isArray(c[0])) c = c[0];
  return Array.isArray(c) && c.length >= 2 && Number.isFinite(c[0]) && Number.isFinite(c[1]) ? c : null;
}

// Danmarks adresseregister (GSearch). Erstatter DAWA, som lukkede i 2026.
// «Accept-Encoding: identity» er noedvendig — uden den knaekker Deno paa svaret
// («unexpected end of file»), maalt 2.10.2026.
// «Simonivej 49 stuen, Pandrup» og «Torvet 7B, 1.sal, 9492 Blokhus» findes ikke i
// registret som skrevet. Vej + husnummer + (postnummer eller by) findes. Etage, doer og
// supplerende bynavn skaeres fra (2.10.2026: 5 af 35 gamle ruter fejlede paa det).
function delAdresse(q) {
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
function renTekst(q) {
  const { vej, postnr, by } = delAdresse(q);
  return [vej, postnr || by].filter(Boolean).join(", ");
}

async function geocodeRegister(address) {
  if (!GS_TOKEN) return null;
  return (await geocodeRegisterEn(address)) || (renTekst(address) !== address ? await geocodeRegisterEn(renTekst(address)) : null);
}
async function geocodeRegisterEn(address) {
  try {
    const url = "https://api.dataforsyningen.dk/rest/gsearch/v2.0/adresse?q=" + encodeURIComponent(address)
      + "&limit=1&srid=4326&token=" + encodeURIComponent(GS_TOKEN);
    const res = await fetch(url, { headers: { "Accept-Encoding": "identity" } });
    if (!res.ok) return null;
    const data = await res.json();
    const hit = Array.isArray(data) ? data[0] : null;
    const p = hit ? foerstePunkt(hit.geometri || hit.geometry) : null;
    return p ? { lat: p[1], lng: p[0] } : null;
  } catch (e) {
    return null;
  }
}
async function geocodeOrs(address) {
  const url = "https://api.openrouteservice.org/geocode/search?api_key=" + encodeURIComponent(ORS_API_KEY) + "&text=" + encodeURIComponent(address) + "&size=1&boundary.country=DK";
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  const feature = data && data.features && data.features[0];
  if (!feature) return null;
  const coords = feature.geometry.coordinates;
  return {
    lat: coords[1],
    lng: coords[0]
  };
}

// Geokodning med reserve — og med besked om HVEM der svarede.
//
// 19.9.2026: kilden skrives nu med. Foer stod der bare "api" paa hver raekke, og saa
// kunne man ikke bagefter se, om et sted var slaaet op i Danmarks officielle
// adresseregister eller hos OpenRouteService.
//
// Hvorfor det betyder noget: falder registret ud, bliver kilometrene ved med
// at blive beregnet — bare fra en anden og mindre praecis kilde. Ingenting gaar i
// stykker, ingen faar en fejl, og tallene glider stille. Og det ender i skattefri
// koerselsgodtgoerelse, altsaa penge paa en loenseddel.
//
// En reserve, der skjuler et nedbrud, er farligere end slet ingen reserve. Den skal
// beholdes — men den skal kunne ses.
//
// 2.10.2026: registret er GSearch (kilde "gsearch"). Ruter fra foer har "dawa".
async function geocode(address) {
  const reg = await geocodeRegister(address);
  if (reg) return { ...reg, kilde: "gsearch" };
  const ors = await geocodeOrs(address);
  if (ors) return { ...ors, kilde: "ors" };
  return null;
}

// "gsearch" naar BEGGE adresser kom fra registret. Ellers staar der, hvad der faktisk
// skete. Saa er reglen til at huske: alt andet end "gsearch"/"dawa" betyder, at registret
// ikke svarede paa mindst én af de to adresser.
function kildeMaerke(a, b) {
  const x = (a && a.kilde) || "?";
  const y = (b && b.kilde) || "?";
  return x === y ? x : x + "+" + y;
}

async function route(a, b) {
  const res = await fetch("https://api.openrouteservice.org/v2/directions/driving-car", {
    method: "POST",
    headers: {
      "Authorization": ORS_API_KEY,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      coordinates: [
        [a.lng, a.lat],
        [b.lng, b.lat]
      ],
      preference: "shortest"
    })
  });
  if (!res.ok) return null;
  const data = await res.json();
  const summary = data && data.routes && data.routes[0] && data.routes[0].summary;
  if (!summary) return null;
  const km = Math.round(summary.distance / 1000 * 10) / 10;
  const raa = Math.round(summary.duration / 60);
  return {
    km,
    minutes: km > 0 ? Math.max(MINDSTE_MINUTTER, raa) : raa
  };
}
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", {
    headers: corsHeaders
  });
  if (!ORS_API_KEY) return jsonResponse({
    error: "ORS_API_KEY mangler. Saet den under Edge Functions -> Secrets."
  }, 500);
  try {
    const body = await req.json();
    const pairs = body.pairs;
    if (!Array.isArray(pairs) || pairs.length === 0) return jsonResponse({
      error: "pairs mangler"
    }, 400);
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const results = [];
    for (const pair of pairs) {
      const a = String(pair.a || "").trim();
      const b = String(pair.b || "").trim();
      // Loft pr. tur. Kalderen kan haeve det, men ikke uden graenser.
      const maxKm = Math.min(Number(pair.maxKm) > 0 ? Number(pair.maxKm) : STANDARD_MAX_KM, ABSOLUT_MAX_KM);
      if (!a || !b || a === b) {
        results.push({
          a, b, km: 0, minutes: 0, cached: true
        });
        continue;
      }
      const sorted = [a, b].sort();
      const addrA = sorted[0], addrB = sorted[1];
      const { data: existing } = await supabase.from("travel_overrides").select("*").eq("addr_a", addrA).eq("addr_b", addrB).maybeSingle();
      if (existing && existing.km !== null) {
        results.push({
          a, b, km: Number(existing.km), minutes: existing.minutes ?? null, cached: true
        });
        continue;
      }
      let geoA, geoB;
      // Blev der slaaet op nu, eller genbruges gamle koordinater? Kilden maa kun
      // skrives om, naar der FAKTISK er slaaet op — ellers ville en genbrugt raekke
      // se ud som et friskt svar fra registret.
      let slogOp = false;
      if (existing && existing.lat_a !== null && existing.lat_b !== null) {
        geoA = { lat: existing.lat_a, lng: existing.lng_a };
        geoB = { lat: existing.lat_b, lng: existing.lng_b };
      } else {
        [geoA, geoB] = await Promise.all([
          geocode(addrA),
          geocode(addrB)
        ]);
        slogOp = true;
      }
      if (!geoA || !geoB) {
        results.push({
          a, b, km: null, minutes: null, error: "kunne ikke geokode adresse"
        });
        continue;
      }
      const dist = await route(geoA, geoB);
      if (!dist) {
        results.push({
          a, b, km: null, minutes: null, error: "kunne ikke beregne rute"
        });
        continue;
      }
      if (dist.km > maxKm) {
        results.push({
          a, b, km: null, minutes: null,
          error: `Ruten er ${dist.km} km, hvilket er over graensen paa ${maxKm} km. Er turen rigtig, saa hæv graensen — ellers er en af adresserne formentlig geokodet forkert.`
        });
        continue;
      }
      const kilde = slogOp ? kildeMaerke(geoA, geoB) : ((existing && existing.source) || "api");
      await supabase.from("travel_overrides").upsert({
        id: existing && existing.id || crypto.randomUUID(),
        addr_a: addrA,
        addr_b: addrB,
        km: dist.km,
        minutes: dist.minutes,
        source: kilde,
        lat_a: geoA.lat,
        lng_a: geoA.lng,
        lat_b: geoB.lat,
        lng_b: geoB.lng
      }, {
        onConflict: "id"
      });
      results.push({
        a, b, km: dist.km, minutes: dist.minutes, cached: false, kilde
      });
    }
    return jsonResponse({ results });
  } catch (e) {
    return jsonResponse({
      error: String(e && e.message || e)
    }, 500);
  }
});
