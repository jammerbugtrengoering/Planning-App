// Forventet omsætning pr. måned (9.10.2026, Jonn).
//
// Rent regnearbejde uden React, så det kan prøves i `forventet.test.mjs`.
//
// Reglen: en måned, der er slut, står på det, der blev faktureret i Dinero. Indeværende og kommende måneder står på planlagt, dog aldrig lavere end det allerede
// fakturerede. Sikkerheden er andelen af forventet, der allerede er faktureret: 0 % den dag, året begynder, og 100 %, når året er fakturaet. Hver faktura flytter
// tallet fra et gæt til et faktum, og tallet bliver mere præcist måned for måned.
//
// Hvorfor ikke «faktureret + planlagt for det, der ikke er sendt til Dinero»: opgavernes flag `dinero_exported` bliver ikke sat, når der fakturaeres (9.10.2026: 1 ud af
// 700 opgaver i uge 36-41). Så ville rest være hele planlagt, og en halvt faktureret måned blev talt dobbelt.
//
// Før oktober 2026 lå ikke alle opgaver i systemet, så planlagt for de måneder siger ikke noget om, hvad der skulle fakturere. Dér tæller kun det fakturerede.
export const FULD_PLAN_FRA = { aar: 2026, maaned: 10 };

export function planenErFuld(aar, maaned) {
  return aar > FULD_PLAN_FRA.aar || (aar === FULD_PLAN_FRA.aar && maaned >= FULD_PLAN_FRA.maaned);
}

const tal = (v) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : 0; };

// faktureret: bogført i Dinero for måneden. planlagt: værdien af måndens planlagte opgaver (ikke aflyste). idag: { aar, maaned } (1-12).
export function forventetMaaned({ aar, maaned, faktureret, planlagt, idag }) {
  const f = tal(faktureret);
  const slut = aar < idag.aar || (aar === idag.aar && maaned < idag.maaned);
  if (slut || !planenErFuld(aar, maaned)) {
    return { forventet: f, faktureret: f, sikkerhed: f > 0 ? 1 : null, afsluttet: true };
  }
  const forventet = Math.max(f, tal(planlagt));
  return { forventet, faktureret: f, sikkerhed: forventet > 0 ? f / forventet : null, afsluttet: false };
}

export function forventetAar(maaneder) {
  const forventet = maaneder.reduce((s, m) => s + m.forventet, 0);
  const faktureret = maaneder.reduce((s, m) => s + m.faktureret, 0);
  return { forventet, faktureret, sikkerhed: forventet > 0 ? faktureret / forventet : null };
}
