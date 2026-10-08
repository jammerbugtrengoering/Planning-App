// Sygefravær og vikardækning (7.10.2026): to spørgsmål ud fra de sygdomsblokeringer, planlæggeren lægger på en medarbejder.
//
// Rent regnearbejde uden React, så det kan prøves i `sygefravaer.test.mjs`.
//
// Sygefraværet er sygdomsblokeringernes timer ÷ den kapacitet, medarbejderen havde i perioden FØR ferie og sygdom er trukket fra (ellers kan en medarbejder aldrig nå op på det, vedkommende faktisk var væk).
// Der gemmes ingen årsag, og rapporten viser kun dage, aldrig noget om, hvad der var galt.
//
// Vikardækningen tager de opgaver, hvor den FASTE medarbejder (aftalens faste medarbejder) var syg den dag, og ser, hvad der blev af dem:
//   dækket      en anden medarbejder står på opgaven
//   ikke dækket ingen står på den (eller den faste står der stadig), så kunden risikerer at stå uden besøg
//   aflyst      opgaven er aflyst
// Opgaver uden fast medarbejder eller uden dato (fleksible og ad hoc-opgaver uden dag) kan ikke kobles til en sygedag og er ikke med.

import { dageIPerioden } from "./udnyttelse.js";

// opgaver: ALLE opgaver, også blokeringer. erSygdom(t): er det en sygdomsblokering. fastFor(t) -> id på aftalens faste medarbejder eller null.
export function sygefravaerOgVikar({ medarbejdere, opgaver, fra, til, datoAf, erSygdom, erAflyst, fastFor }) {
  const dage = dageIPerioden(fra, til);
  const syg = new Map();   // «emp|dato» -> { min, gruppe }
  const grupper = new Map(); // emp -> Set af blockGroupId (en sygemelding = en periode)
  for (const t of opgaver) {
    if (!erSygdom(t)) continue;
    const d = datoAf(t);
    if (!d || d < fra || d > til) continue;
    for (const e of t.assignees || []) {
      const k = `${e}|${d}`;
      syg.set(k, { min: (syg.get(k)?.min || 0) + (Number(t.duration) || 0) });
      if (!grupper.has(e)) grupper.set(e, new Set());
      grupper.get(e).add(t.blockGroupId || t.id);
    }
  }
  const raekker = [];
  for (const m of medarbejdere) {
    let brutto = 0, sygMin = 0, sygeDage = 0;
    for (const { iso, dag } of dage) {
      if (m.fratraadtDato && iso > m.fratraadtDato) continue;
      const kap = Number((m.capacity || {})[dag]) || 0;
      if (!kap) continue;
      brutto += kap;
      const s = syg.get(`${m.id}|${iso}`);
      if (s) { sygMin += Math.min(kap, s.min); sygeDage += 1; }
    }
    if (brutto === 0 && sygeDage === 0) continue;
    raekker.push({
      id: m.id, navn: m.name, brutto, sygMin, sygeDage, perioder: (grupper.get(m.id) || new Set()).size,
      procent: brutto > 0 ? (sygMin / brutto) * 100 : null,
    });
  }
  const sum = (f) => raekker.reduce((s, r) => s + f(r), 0);
  const b = sum((r) => r.brutto), s = sum((r) => r.sygMin);
  const ialt = { brutto: b, sygMin: s, sygeDage: sum((r) => r.sygeDage), perioder: sum((r) => r.perioder), procent: b > 0 ? (s / b) * 100 : null };

  const beroerte = [];
  for (const t of opgaver) {
    if (erSygdom(t)) continue;
    const d = datoAf(t);
    if (!d || d < fra || d > til) continue;
    const fast = fastFor(t);
    if (!fast || !syg.has(`${fast}|${d}`)) continue;
    const folk = t.assignees || [];
    const udfald = erAflyst(t) ? "aflyst" : folk.length > 0 && !folk.includes(fast) ? "daekket" : "ikkeDaekket";
    beroerte.push({ t, dato: d, fast, udfald, vikarer: folk.filter((x) => x !== fast) });
  }
  beroerte.sort((a, b2) => a.dato.localeCompare(b2.dato));
  const tael = (u) => beroerte.filter((x) => x.udfald === u).length;
  const daekket = tael("daekket"), ikke = tael("ikkeDaekket"), aflyst = tael("aflyst");
  return { raekker, ialt, beroerte, vikar: { berorte: beroerte.length, daekket, ikkeDaekket: ikke, aflyst, procent: beroerte.length ? (daekket / beroerte.length) * 100 : null } };
}
