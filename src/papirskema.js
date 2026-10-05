// Papirskemaet: det udprintede time- og kørselsskema og indlæsningen af det udfyldte.
//
// En rampe, ikke en vej (5.10.2026, Jonn): nye medarbejdere starter på papir, indtil de
// får Worklist. Alt her er derfor rene funktioner, så de kan prøves uden database, og
// så skemaet og indlæsningen aldrig kan komme til at tælle linjerne forskelligt.
// Ændrer du noget her, så ret papirskema.test.mjs i samme ombæring.


// Linjerne på skemaet for én medarbejder, i den rækkefølge de trykkes.
//
// Udskriften og indlæsningen bruger PRÆCIS den her funktion. Havde hver sin udvælgelse,
// ville nogen før eller siden få en linje på papiret, som skærmen ikke kender, eller
// omvendt — og så passer nummeret ikke længere til linjen.
export function skemaOpgaver(opgaver, empId, dageNoegler) {
  const ud = [];
  for (const dag of dageNoegler) {
    opgaver
      .filter((t) => t.day === dag && (t.assignees || []).includes(empId) && !["sygdom", "ferie"].includes(t.type))
      .sort((a, b) => String(a.scheduledTime || "99:99").localeCompare(String(b.scheduledTime || "99:99")))
      .forEach((t) => ud.push(t));
  }
  return ud;
}

// Timer, som en medarbejder skriver dem i hånden, til minutter. null = kan ikke læses.
//   «2»  «2,5»  «2.5»   timer
//   «2:30»  «2t30»  «2t 30m»  «2.30 t»   timer og minutter
//   «90 min»  «90m»     minutter
// «2.30» er to en halv time, ikke to timer og tredive minutter. Det tal skal kontoret selv
// rette, hvis det var ment som klokkeslæt — og skærmen viser altid minutterne bagefter.
export function laesTimer(tekst) {
  const t = String(tekst ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  if (!t) return null;
  let m;
  if ((m = /^(\d+)\s*(?:min|m)$/.exec(t))) return graense(Number(m[1]));
  if ((m = /^(\d+)\s*(?:t|:)\s*(\d{1,2})\s*(?:m|min)?$/.exec(t))) {
    if (Number(m[2]) > 59) return null;
    return graense(Number(m[1]) * 60 + Number(m[2]));
  }
  if ((m = /^(\d+)\s*t$/.exec(t))) return graense(Number(m[1]) * 60);
  if ((m = /^(\d+(?:[.,]\d+)?)\s*(?:t|timer)?$/.exec(t))) return graense(Math.round(Number(m[1].replace(",", ".")) * 60));
  return null;
}
// En enkelt linje over 16 timer eller på nul er en tastefejl, ikke en arbejdsdag.
function graense(min) { return Number.isFinite(min) && min > 0 && min <= 16 * 60 ? Math.round(min) : null; }

// Kilometer som tal. Tom = ikke skrevet (null); ulæselig = NaN, så skærmen kan sige det.
export function laesKm(tekst) {
  const t = String(tekst ?? "").trim().toLowerCase().replace(/\s*km$/, "").replace(",", ".");
  if (!t) return null;
  if (!/^\d+(\.\d+)?$/.test(t)) return NaN;
  const n = Number(t);
  return n <= 1000 ? n : NaN;
}

// Afvigelsen mellem det medarbejderen skrev og det systemet regnede. Systemet bestemmer
// altid kilometerne; papiret bruges kun til at se, hvor de to er uenige.
// Afviger kun, når forskellen er BÅDE stor i kilometer og i procent: 1 km på en tur på 3 er
// støj fra afrunding, og 5 % af 80 km er ikke en samtale værd.
export const KM_GRAENSE = { km: 1.5, pct: 15 };
export function kmAfvigelse(papir, system, graenser = KM_GRAENSE) {
  if (papir === null || papir === undefined || Number.isNaN(papir)) return { status: "ingen-papir", diff: null, pct: null, afviger: false };
  if (system === null || system === undefined) return { status: "ingen-system", diff: null, pct: null, afviger: false };
  const diff = Math.round((papir - system) * 10) / 10;
  const pct = system > 0 ? Math.round((Math.abs(diff) / system) * 100) : (papir > 0 ? 100 : 0);
  const afviger = Math.abs(diff) >= graenser.km && pct >= graenser.pct;
  return { status: afviger ? "afviger" : "ok", diff, pct, afviger };
}

// Noeglen, der gør indlæsningen sikker at trykke to gange på: append_time_log kender den
// og returnerer loggen uændret, hvis den allerede står der.
export function klientNoegle(empId, opgaveId) { return `papir:${empId}:${opgaveId}`; }

export function erIndlaest(opgave, empId) {
  const log = opgave?.timeLog ?? opgave?.time_log ?? [];
  const k = klientNoegle(empId, opgave?.id);
  return Array.isArray(log) && log.some((l) => l && l.kid === k);
}

// Kilometer fra systemets køreliste for hver opgave og hver dag.
// raekker: km_log-rækker { employee_id, work_date, to_instance_id, km }.
export function systemKm(raekker, empId) {
  const pr_opgave = new Map(), pr_dag = new Map();
  for (const r of raekker || []) {
    if (r.employee_id !== empId) continue;
    const km = Number(r.km) || 0;
    if (r.to_instance_id) pr_opgave.set(r.to_instance_id, (pr_opgave.get(r.to_instance_id) || 0) + km);
    if (r.work_date) pr_dag.set(r.work_date, (pr_dag.get(r.work_date) || 0) + km);
  }
  const rund = (m) => new Map([...m].map(([k, v]) => [k, Math.round(v * 10) / 10]));
  return { pr_opgave: rund(pr_opgave), pr_dag: rund(pr_dag) };
}
