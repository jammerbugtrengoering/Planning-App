// Lønperioden (besluttet 1.10.2026).
//
// Lukkedag L (Opsætning → Tidsregistrering, standard 20): perioden går fra den L. i
// en måned til den (L-1). i den næste og lukker på lukkedagen kl. 23.59. Perioden
// navngives efter den måned, den slutter i — «oktober 2026» er 20. sep – 19. okt.
// L = 1 betyder kalendermåned.
//
// Databasen har samme regel i loen_periode_slut / loen_periode_laast. De to SKAL
// svare ens: databasen afviser en medarbejders rettelse i en lukket periode, og
// skærmen skal vise det samme, før hun prøver. Ret loenperiode.test.mjs med.

const pad = (n) => String(n).padStart(2, "0");
export const isoDag = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const dato = (s) => { const [y, m, d] = String(s).slice(0, 10).split("-").map(Number); return new Date(y, m - 1, d); };

function gyldigLukkedag(l) {
  const n = Math.round(Number(l));
  return Number.isFinite(n) && n >= 1 && n <= 28 ? n : 20;
}

// Perioden, der slutter i måneden (maaned 1-12).
export function loenPeriode(aar, maaned, lukkedag = 20) {
  const l = gyldigLukkedag(lukkedag);
  if (l === 1) {
    return { fra: isoDag(new Date(aar, maaned - 1, 1)), til: isoDag(new Date(aar, maaned, 0)),
             lukkedag: isoDag(new Date(aar, maaned, 1)) };
  }
  return { fra: isoDag(new Date(aar, maaned - 2, l)), til: isoDag(new Date(aar, maaned - 1, l - 1)),
           lukkedag: isoDag(new Date(aar, maaned - 1, l)) };
}

// Sidste dag i den periode, datoen hører til.
export function periodeSlutFor(datoStr, lukkedag = 20) {
  const l = gyldigLukkedag(lukkedag);
  const d = dato(datoStr);
  if (l === 1) return isoDag(new Date(d.getFullYear(), d.getMonth() + 1, 0));
  if (d.getDate() >= l) return isoDag(new Date(d.getFullYear(), d.getMonth() + 1, l - 1));
  return isoDag(new Date(d.getFullYear(), d.getMonth(), l - 1));
}

// Måneden (aar, maaned 1-12), som perioden for datoen er opkaldt efter.
export function periodeFor(datoStr, lukkedag = 20) {
  const s = dato(periodeSlutFor(datoStr, lukkedag));
  return { aar: s.getFullYear(), maaned: s.getMonth() + 1 };
}

// Er perioden for datoen lukket? Lukkedagen er åben dagen ud (lokal tid).
export function erLaast(datoStr, lukkedag = 20, nu = new Date()) {
  const s = dato(periodeSlutFor(datoStr, lukkedag));
  const aabnerIgen = new Date(s.getFullYear(), s.getMonth(), s.getDate() + 2);
  return nu >= aabnerIgen;
}

export function periodeTekst(p) {
  const f = (s) => dato(s).toLocaleDateString("da-DK", { day: "numeric", month: "short" });
  return `${f(p.fra)} – ${f(p.til)}`;
}
