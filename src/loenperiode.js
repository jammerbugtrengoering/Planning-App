// Lønperioden (besluttet 1.10.2026).
//
// Lukkedag L (Opsætning → Tidsregistrering, standard 20): perioden går fra den L. i
// en måned til den (L-1). i den næste og lukker på lukkedagen kl. 23.59. Perioden
// navngives efter den måned, den slutter i — «oktober 2026» er 20. sep – 19. okt.
// L = 1 betyder kalendermåned.
//
// Falder lukkedagen på en weekend eller helligdag, flyttes den til hverdagen FØR (Jonn 6.10.2026; indstillingen
// loen_hverdag_foer, standard til). Perioden følger med: den slutter dagen før den flyttede lukkedag og begynder dagen efter den
// forrige periodes sidste dag. Ved lukkedag 1 (kalendermåned) flyttes intet.
//
// Alle funktioner tager «reglen» som andet argument: et tal (lukkedagen, uden flytning, som før) eller { l, hverdag }.
//
// Databasen har samme regel i loen_slut_maaned / loen_periode_slut / loen_periode_laast. De to SKAL
// svare ens: databasen afviser en medarbejders rettelse i en lukket periode, og
// skærmen skal vise det samme, før hun prøver. Ret loenperiode.test.mjs med.

const pad = (n) => String(n).padStart(2, "0");
export const isoDag = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const dato = (s) => { const [y, m, d] = String(s).slice(0, 10).split("-").map(Number); return new Date(y, m - 1, d); };

function gyldigLukkedag(l) {
  const n = Math.round(Number(l));
  return Number.isFinite(n) && n >= 1 && n <= 28 ? n : 20;
}
function regel(r) {
  if (r && typeof r === "object") return { l: gyldigLukkedag(r.l), hverdag: !!r.hverdag };
  return { l: gyldigLukkedag(r), hverdag: false };
}

// Påskedag (Gauss/«anonymous Gregorian»). Samme udregning som dk_paaskedag i databasen.
function paaskedag(aar) {
  const a = aar % 19, b = Math.floor(aar / 100), c = aar % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const maaned = Math.floor((h + l - 7 * m + 114) / 31), dag = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(aar, maaned - 1, dag);
}

// Officielle danske helligdage. 24. og 31. dec. og Grundlovsdag er ikke med. Store bededag kun til og med 2023.
export function erHelligdag(d) {
  const aar = d.getFullYear(), m = d.getMonth() + 1, dag = d.getDate();
  if (m === 1 && dag === 1) return true;
  if (m === 12 && (dag === 25 || dag === 26)) return true;
  const e = paaskedag(aar);
  const forskel = Math.round((new Date(aar, m - 1, dag) - e) / 86400000);
  if ([-3, -2, 0, 1, 39, 49, 50].includes(forskel)) return true;
  return forskel === 26 && aar <= 2023;
}
export const erWeekend = (d) => d.getDay() === 0 || d.getDay() === 6;

// Den dag perioden, der slutter i måneden, lukker — efter flytning til en hverdag, hvis reglen siger det.
function lukkedagFor(aar, maaned, r) {
  const { l, hverdag } = regel(r);
  if (l === 1) return new Date(aar, maaned, 1);
  let d = new Date(aar, maaned - 1, l);
  if (hverdag) while (erWeekend(d) || erHelligdag(d)) d = new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1);
  return d;
}
const slutMaaned = (aar, maaned, r) => {
  const d = lukkedagFor(aar, maaned, r);
  return isoDag(new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1));
};
const maanederOmkring = (datoStr, fra, til) => {
  const d = dato(datoStr);
  return Array.from({ length: til - fra + 1 }, (_, i) => new Date(d.getFullYear(), d.getMonth() + fra + i, 1));
};

// Perioden, der slutter i måneden (maaned 1-12).
export function loenPeriode(aar, maaned, lukkedag = 20) {
  const til = slutMaaned(aar, maaned, lukkedag);
  const forrige = maanederOmkring(til, -2, 0).map((m) => slutMaaned(m.getFullYear(), m.getMonth() + 1, lukkedag)).filter((s) => s < til);
  const fraDag = dato(forrige[forrige.length - 1]);
  const lukke = dato(til);
  return { fra: isoDag(new Date(fraDag.getFullYear(), fraDag.getMonth(), fraDag.getDate() + 1)), til,
           lukkedag: isoDag(new Date(lukke.getFullYear(), lukke.getMonth(), lukke.getDate() + 1)) };
}

// Sidste dag i den periode, datoen hører til.
export function periodeSlutFor(datoStr, lukkedag = 20) {
  return maanederOmkring(datoStr, -1, 1)
    .map((m) => slutMaaned(m.getFullYear(), m.getMonth() + 1, lukkedag))
    .filter((s) => s >= String(datoStr).slice(0, 10)).sort()[0];
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
