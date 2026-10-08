// Dækningsbidrag pr. aftaletype (7.10.2026): realiseret omsætning minus den løn, der blev brugt på opgaverne.
//
// Rent regnearbejde uden React, så det kan prøves i `daekningsbidrag.test.mjs`.
//
// Lønnen regnes pr. opgave med medarbejderens sats på OPGAVENS egen dato (samme princip som lønlisten: en lønstigning må ikke ændre tidligere måneder).
// Findes der ingen sats for en registrering, gættes der ikke: minutterne tælles for sig i `udenSatsMin`, så rapporten kan sige, at bidraget er for højt, i stedet for at vise et pænt tal.
// Kørsel, bonus og de frie omkostninger hører ikke til en bestemt aftaletype og er derfor ikke med. Det er et bidrag før faste omkostninger, ikke overskuddet.

const tom = () => ({ antal: 0, omsaetning: 0, loen: 0, minutter: 0, udenSatsMin: 0, udenSatsOpgaver: 0 });

// opgaver: de opgaver, der må tælle med. beregn(t) -> { realiseretKr }. satsFor(empId, dato) -> kr/time eller null. datoAf(t) -> «YYYY-MM-DD». aar: årstal eller «alle».
// fra/til («YYYY-MM-DD», begge med) afgrænser en periode i stedet for et helt år; bruges af overblikket (src/overblik.js).
export function daekningPrSegment(opgaver, { beregn, satsFor, datoAf, aar = "alle", fra = null, til = null, segmenter }) {
  const pr = new Map();
  for (const [k] of segmenter) pr.set(k, tom());
  const ialt = tom();
  const laegTil = (m, b) => {
    m.antal += 1; m.omsaetning += b.omsaetning; m.loen += b.loen; m.minutter += b.minutter;
    m.udenSatsMin += b.udenSatsMin; if (b.udenSatsMin > 0) m.udenSatsOpgaver += 1;
  };
  for (const t of opgaver) {
    const dato = datoAf(t) || "";
    if (fra && til) { if (dato < fra || dato > til) continue; }
    else if (aar !== "alle" && dato.slice(0, 4) !== String(aar)) continue;
    const omsaetning = Number(beregn(t).realiseretKr) || 0;
    let loen = 0, minutter = 0, udenSatsMin = 0;
    for (const l of t.timeLog || t.time_log || []) {
      const min = Number(l.minutes) || 0;
      if (!min) continue;
      minutter += min;
      const sats = satsFor(l.empId, dato);
      if (sats == null) udenSatsMin += min; else loen += (min / 60) * sats;
    }
    // Opgaver uden registreret tid og uden omsætning (endnu ikke udført) siger intet om bidraget.
    if (!omsaetning && !minutter) continue;
    const b = { omsaetning, loen, minutter, udenSatsMin };
    const seg = t.contractType || t.contract_type || "privat";
    if (!pr.has(seg)) pr.set(seg, tom());
    laegTil(pr.get(seg), b);
    laegTil(ialt, b);
  }
  const med = (m) => ({ ...m, bidrag: m.omsaetning - m.loen, procent: m.omsaetning > 0 ? ((m.omsaetning - m.loen) / m.omsaetning) * 100 : null, timer: m.minutter / 60 });
  return { raekker: [...pr.entries()].map(([noegle, m]) => ({ noegle, ...med(m) })), ialt: med(ialt) };
}
