import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const JOB = "compute-daily-km";

// Hvor lang en tur der regnes for plausibel.
//
// Mellem to rengoeringsopgaver er 100 km rigeligt: firmaet koerer i Jammerbugt, saa et
// svar paa 400 km betyder naesten altid en fejlgeokodet adresse.
//
// En enkeltstaaende tur er en anden sag. At hente materialer i Odder eller tage paa
// kursus i Koebenhavn ER langt, og det er med vilje. Vi fandt det ved at proeve: den
// foerste aktivitetstur kom tilbage uden kilometer, fordi 180 km ramte loftet.
const MAKS_KM_RUTE = 100;
const MAKS_KM_EGEN_TUR = 500;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

// Returns YYYY-MM-DD for "yesterday" in Europe/Copenhagen, robust across DST.
function yesterdayCopenhagen() {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Copenhagen", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const map = {};
  parts.forEach((p) => { map[p.type] = p.value; });
  const todayCph = new Date(Date.UTC(Number(map.year), Number(map.month) - 1, Number(map.day)));
  todayCph.setUTCDate(todayCph.getUTCDate() - 1);
  return todayCph.toISOString().slice(0, 10);
}

function isoWeekInfo(dateStr) {
  const d = new Date(dateStr + "T00:00:00Z");
  const dayNum = (d.getUTCDay() + 6) % 7; // Mon=0..Sun=6
  d.setUTCDate(d.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const firstDayNum = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNum + 3);
  const week = 1 + Math.round((d - firstThursday) / (7 * 24 * 3600 * 1000));
  const DAY_KEYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  return { year: d.getUTCFullYear(), week, day: DAY_KEYS[dayNum] };
}

const BLOCK_TYPES = ["sygdom", "ferie"];

// Er der en fra-adresse, er aktiviteten en TUR og ikke bare et sted paa ruten.
//
// Destinationen er aktivitetens egen adresse — hun koerer hen til det, der staar i
// planen. Kun startpunktet kan systemet ikke gaette, og derfor er det det eneste, der
// skal skrives.
//
// En tur haenges IKKE ind i dagens rutekaede. Ellers ville strækningen taelle to
// gange: én gang som sin egen tur, og én gang som led mellem opgaven foer og
// opgaven efter.
function erEgenTur(t) {
  return !!(String(t.km_fra_adresse || "").trim() && String(t.address_text || "").trim());
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  // Livstegn til morgentjekket. Uden det kan jobbet holde op med at virke uden at
  // nogen opdager det — kilometerpengene ville bare stille og roligt udeblive.
  const log = (ok, besked) =>
    supabase.rpc("log_job", { p_job: JOB, p_ok: ok, p_besked: besked ?? null });

  try {
    const body = await req.json().catch(() => ({}));
    const targetDate = body.date || yesterdayCopenhagen();
    const { year, week, day } = isoWeekInfo(targetDate);

    const { data: instances, error: instErr } = await supabase
      .from("instances")
      .select("id, assignees, address_text, type, completed_at, status, km_fra_adresse, km_tur_retur")
      .eq("year", year)
      .eq("week", week)
      .eq("day", day)
      .eq("status", "udført");
    if (instErr) { await log(false, instErr.message); return jsonResponse({ error: instErr.message }, 500); }

    const ikkeBlok = (instances || []).filter((t) => !BLOCK_TYPES.includes(t.type));

    // Aktiviteter med egen tur haandteres for sig. Resten kaedes sammen som hidtil.
    const egneTure = ikkeBlok.filter(erEgenTur);
    const relevant = ikkeBlok.filter((t) => !erEgenTur(t) && t.address_text);

    const { data: employees, error: empErr } = await supabase.from("employees").select("id");
    if (empErr) { await log(false, empErr.message); return jsonResponse({ error: empErr.message }, 500); }
    const empMap = {};
    (employees || []).forEach((e) => { empMap[e.id] = e; });

    const byEmp = {};
    relevant.forEach((t) => {
      (t.assignees || []).forEach((empId) => {
        if (!byEmp[empId]) byEmp[empId] = [];
        byEmp[empId].push(t);
      });
    });

    const allLegs = [];
    Object.entries(byEmp).forEach(([empId, tasks]) => {
      const emp = empMap[empId];
      if (!emp) return;
      const sorted = tasks.slice().sort((a, b) => new Date(a.completed_at) - new Date(b.completed_at));
      const chain = sorted.map((t) => ({ addr: t.address_text, instanceId: t.id }));
      for (let i = 0; i < chain.length - 1; i++) {
        const from = chain[i], to = chain[i + 1];
        if (!from.addr || !to.addr || from.addr === to.addr) continue;
        allLegs.push({ empId, from, to, maxKm: MAKS_KM_RUTE });
      }
    });

    // Enkeltstaaende ture: fra det angivne startpunkt til aktivitetens egen adresse.
    // Begge ender peger paa aktiviteten, saa kontoret kan se hvad turen hoerte til, og
    // saa Min koersel i Worklist kan vise den.
    egneTure.forEach((t) => {
      const fra = String(t.km_fra_adresse).trim();
      const til = String(t.address_text).trim();
      if (fra === til) return;   // samme adresse er ingen tur
      (t.assignees || []).forEach((empId) => {
        if (!empMap[empId]) return;
        allLegs.push({ empId, from: { addr: fra, instanceId: t.id }, to: { addr: til, instanceId: t.id }, maxKm: MAKS_KM_EGEN_TUR });
        // Tur/retur er to linjer og ikke ét dobbelt tal. Saa kan kontoret godkende
        // eller afvise hver vej for sig — koerte hun kun den ene vej, fjernes den
        // anden uden at hele turen ryger.
        if (t.km_tur_retur) {
          allLegs.push({ empId, from: { addr: til, instanceId: t.id }, to: { addr: fra, instanceId: t.id }, maxKm: MAKS_KM_EGEN_TUR });
        }
      });
    });

    if (allLegs.length === 0) {
      // Nul ture er ikke en fejl — det er en dag hvor ingen havde to adresser.
      await log(true, "ingen ture at beregne for " + targetDate);
      return jsonResponse({ ok: true, date: targetDate, legs: 0 });
    }

    const { data: distData, error: distErr } = await supabase.functions.invoke("travel-distance", {
      // Authorization saettes eksplicit: functions.invoke fra én edge-funktion til en
      // anden sender ingen header af sig selv, og travel-distance kraever et token.
      headers: { Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` },
      body: { pairs: allLegs.map((l) => ({ a: l.from.addr, b: l.to.addr, maxKm: l.maxKm })) },
    });
    if (distErr) {
      await log(false, "travel-distance fejlede: " + distErr.message);
      return jsonResponse({ error: "travel-distance failed: " + distErr.message }, 500);
    }
    const results = (distData && distData.results) || [];

    const rows = allLegs.map((leg, i) => {
      const r = results[i] || {};
      return {
        employee_id: leg.empId,
        work_date: targetDate,
        year, week, day,
        leg_order: i,
        from_address: leg.from.addr,
        to_address: leg.to.addr,
        from_instance_id: leg.from.instanceId,
        to_instance_id: leg.to.instanceId,
        km: typeof r.km === "number" ? r.km : null,
        minutes: typeof r.minutes === "number" ? r.minutes : null,
      };
    });

    const perEmpCounter = {};
    rows.forEach((r) => {
      const key = r.employee_id;
      perEmpCounter[key] = (perEmpCounter[key] ?? -1) + 1;
      r.leg_order = perEmpCounter[key];
    });

    const { error: upsertErr } = await supabase
      .from("km_log")
      .upsert(rows, { onConflict: "employee_id,work_date,leg_order" });
    if (upsertErr) { await log(false, upsertErr.message); return jsonResponse({ error: upsertErr.message }, 500); }

    // Ture uden km er en stille fejl i sig selv: kilometerpengene bliver for smaa,
    // og ingen opdager det uden at kigge. Derfor med i beskeden.
    const udenKm = rows.filter((r) => r.km === null).length;
    const antalEgne = egneTure.length;
    const halePaaBesked = antalEgne > 0 ? ` (heraf ${antalEgne} aktivitet${antalEgne === 1 ? "" : "er"} med egen tur)` : "";
    await log(udenKm === 0, udenKm === 0
      ? `${rows.length} ture beregnet for ${targetDate}${halePaaBesked}`
      : `${rows.length} ture for ${targetDate}, men ${udenKm} uden km — tjek adresserne${halePaaBesked}`);

    return jsonResponse({ ok: true, date: targetDate, legs: rows.length, egneTure: antalEgne, udenKm });
  } catch (e) {
    const m = String((e && e.message) || e);
    await log(false, m);
    return jsonResponse({ error: m }, 500);
  }
});
