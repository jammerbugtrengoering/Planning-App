// Omsætning pr. medarbejder (8.10.2026).
//
// Rent regnearbejde uden React, så det kan prøves i `medarbejderomsaetning.test.mjs`.
//
// En opgaves realiserede omsætning (beregn(t).realiseretKr, samme tal som alle de andre rapporter) fordeles på dem, der leverede den:
//   - Timeopgaver: efter hver enkelts FAKTURERBARE minutter. En elev (oplæring) leverer ikke noget, kunden betaler for, så vedkommende får 0 kr, men tiden tæller som løn.
//   - Fastpris: efter planlagt tid for dem på opgaven, eleverne undtaget; ved en ufordelt opgave deles lige.
// Kontorets egne registreringer (empId «planner», fx forgæves besøg, der faktureres alligevel) tilhører ingen medarbejder og står for sig som «Kontoret».
// Fordelingen går altid op: summen på medarbejderne plus kontoret er præcis opgavens realiserede omsætning, så rapporten aldrig viser mere eller mindre end Budget-fanen.

import { fakturaMinutterForLinje, planlagtFor, erUnderOplaering } from "./opgavetid.js";

export const KONTORET = "planner";

function andele(t) {
  const log = t.timeLog || t.time_log || [];
  const fast = (t.pricingType || t.pricing_type) === "fixed";
  const v = new Map();
  if (!fast) {
    for (const l of log) {
      if (erUnderOplaering(t, l.empId)) continue;
      v.set(l.empId, (v.get(l.empId) || 0) + fakturaMinutterForLinje(l));
    }
    return v;
  }
  const folk = (t.assignees || []).filter((e) => !erUnderOplaering(t, e));
  const vaegte = folk.map((e) => [e, planlagtFor(t, e)]);
  const sum = vaegte.reduce((s, [, m]) => s + m, 0);
  for (const [e, m] of vaegte) v.set(e, sum > 0 ? m : 1);
  return v;
}

// opgaver: egentlige opgaver (ikke blokeringer eller aflyste). beregn(t) -> { realiseretKr }. loenFor(empId, dato) -> kr/time eller null. datoAf(t) -> «YYYY-MM-DD».
// periode: { aar, maaned } (maaned 0 = hele året). segment: «alle» eller en aftaletype.
export function omsaetningPrMedarbejder(opgaver, { beregn, loenFor, datoAf, aar, maaned = 0, segment = "alle" }) {
  const pr = new Map();
  const ny = () => ({ omsaetning: 0, fakturerbarMin: 0, registreretMin: 0, loen: 0, udenSatsMin: 0, opgaver: 0 });
  const get = (e) => { if (!pr.has(e)) pr.set(e, ny()); return pr.get(e); };
  let ialt = 0;
  for (const t of opgaver) {
    const d = datoAf(t) || "";
    if (!d.startsWith(String(aar))) continue;
    if (maaned && Number(d.slice(5, 7)) !== maaned) continue;
    if (segment !== "alle" && (t.contractType || t.contract_type || "privat") !== segment) continue;
    const kr = Number(beregn(t).realiseretKr) || 0;
    // Løn og tid regnes pr. medarbejder uanset omsætning: en opgave uden omsætning (endnu ikke faktureret, eller kun oplæring) koster stadig løn.
    const set = new Set();
    for (const l of t.timeLog || t.time_log || []) {
      const min = Number(l.minutes) || 0;
      if (!min || l.empId === KONTORET) continue;
      const m = get(l.empId); set.add(l.empId);
      m.registreretMin += min;
      const sats = loenFor(l.empId, d);
      if (sats == null) m.udenSatsMin += min; else m.loen += (min / 60) * sats;
    }
    for (const e of set) get(e).opgaver += 1;
    if (!kr) continue;
    const v = andele(t);
    const sum = [...v.values()].reduce((s, x) => s + x, 0);
    ialt += kr;
    if (sum <= 0) { get(KONTORET).omsaetning += kr; continue; }
    for (const [e, vaegt] of v) {
      const m = get(e);
      m.omsaetning += kr * (vaegt / sum);
      m.fakturerbarMin += (t.pricingType || t.pricing_type) === "fixed" ? 0 : vaegt;
    }
  }
  const raekker = [...pr.entries()].map(([id, m]) => ({
    id, ...m, timer: m.registreretMin / 60,
    krPrTime: m.registreretMin > 0 ? m.omsaetning / (m.registreretMin / 60) : null,
    bidrag: m.omsaetning - m.loen,
    andel: ialt > 0 ? (m.omsaetning / ialt) * 100 : null,
  }));
  return { raekker, ialt };
}
