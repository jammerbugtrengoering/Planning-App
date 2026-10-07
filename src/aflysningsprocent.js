// Aflysningsprocent pr. aftaletype (7.10.2026).
//
// Rent regnearbejde uden React, så det kan prøves i `aflysningsprocent.test.mjs`.
//
// Procenten er aflyste opgaver ÷ alle opgaver, der skulle have været kørt i perioden, aflyste med. Kun dage til og med i dag tæller: en opgave i næste uge kan ikke være aflyst endnu,
// og tæller vi dem med i nævneren, ser aflysningerne ud til at falde, jo længere frem perioden rækker. Opgaver uden aftaletype regnes som privat, ligesom resten af appen.
// «Af kunden» og «af os» skilles ad, fordi de kræver hver sin indsats: kundens aflysninger kan koste omsætning, vores egne koster tillid.

// opgaver: egentlige opgaver (ikke ferie, sygdom eller aktiviteter), også de aflyste. erAflyst(t), partFor(t) -> «kunde» eller andet. datoAf(t) -> «YYYY-MM-DD».
export function aflysningPrSegment(opgaver, { fra, til, idag, datoAf, erAflyst, partFor, segmenter }) {
  const slut = til < idag ? til : idag;
  const pr = new Map(segmenter.map(([k]) => [k, { antal: 0, aflyst: 0, kunde: 0, os: 0 }]));
  const ialt = { antal: 0, aflyst: 0, kunde: 0, os: 0 };
  for (const t of opgaver) {
    const d = datoAf(t);
    if (!d || d < fra || d > slut) continue;
    const seg = t.contractType || t.contract_type || "privat";
    if (!pr.has(seg)) pr.set(seg, { antal: 0, aflyst: 0, kunde: 0, os: 0 });
    const m = pr.get(seg);
    m.antal += 1; ialt.antal += 1;
    if (erAflyst(t)) {
      m.aflyst += 1; ialt.aflyst += 1;
      if (partFor(t) === "kunde") { m.kunde += 1; ialt.kunde += 1; } else { m.os += 1; ialt.os += 1; }
    }
  }
  const procent = (a, b) => (b > 0 ? (a / b) * 100 : null);
  const med = (m) => ({ ...m, procent: procent(m.aflyst, m.antal), procentKunde: procent(m.kunde, m.antal), procentOs: procent(m.os, m.antal) });
  return { raekker: [...pr.entries()].map(([noegle, m]) => ({ noegle, ...med(m) })), ialt: med(ialt) };
}
