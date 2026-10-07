// Udnyttelsesgrad pr. medarbejder (7.10.2026): hvor stor en del af den tid, medarbejderen er til rådighed, der er fyldt med opgaver.
//
// Rent regnearbejde uden React, så det kan prøves i `udnyttelse.test.mjs`.
//
// Nævneren er kapaciteten fra medarbejderkortet (minutter pr. ugedag) for hver dag i perioden, minus ferie og sygdom: ellers ser en medarbejder på ferie ud til at være dårligt udnyttet.
// Tælleren er opgavernes tid hos kunden. Kørsel og kontortid er ikke med. «Planlagt» er hele perioden; «udført» er den registrerede tid på dagene til og med i dag, målt mod kapaciteten for de samme dage — en halv måned må ikke måles mod en hel måneds kapacitet.

export const LAV_GRAENSE = 60;    // under: der er plads til flere opgaver
export const HOEJ_GRAENSE = 95;   // over: næsten ingen luft til sygdom og ændringer

const UGEDAG = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function dageIPerioden(fra, til) {
  const ud = [];
  const [ay, am, ad] = fra.split("-").map(Number);
  const slut = Date.UTC(...til.split("-").map((x, i) => (i === 1 ? Number(x) - 1 : Number(x))));
  for (let d = new Date(Date.UTC(ay, am - 1, ad)); d.getTime() <= slut; d.setUTCDate(d.getUTCDate() + 1)) {
    ud.push({ iso: d.toISOString().slice(0, 10), dag: UGEDAG[d.getUTCDay()] });
  }
  return ud;
}

// opgaver: ALLE opgaver, også ferie og sygdom (de trækker kapacitet fra). erBlok(t) og erUdelukket(t) (fx aflyst) afgør hvilke.
// planlagtFor(t, empId) -> minutter. datoAf(t) -> «YYYY-MM-DD». fra/til/idag: «YYYY-MM-DD».
export function udnyttelsePrMedarbejder({ medarbejdere, opgaver, fra, til, idag, datoAf, planlagtFor, erBlok, erUdelukket }) {
  const dage = dageIPerioden(fra, til);
  const blok = new Map();     // «emp|dato» -> minutter ferie/syg
  const planlagt = new Map(); // emp -> minutter
  const udfoert = new Map();  // emp -> minutter til og med i dag
  for (const t of opgaver) {
    const dato = datoAf(t);
    if (!dato || dato < fra || dato > til) continue;
    if (erBlok(t)) {
      for (const e of t.assignees || []) blok.set(`${e}|${dato}`, (blok.get(`${e}|${dato}`) || 0) + (Number(t.duration) || 0));
      continue;
    }
    if (erUdelukket(t)) continue;
    for (const e of t.assignees || []) planlagt.set(e, (planlagt.get(e) || 0) + planlagtFor(t, e));
    if (dato <= idag) {
      for (const l of t.timeLog || t.time_log || []) udfoert.set(l.empId, (udfoert.get(l.empId) || 0) + (Number(l.minutes) || 0));
    }
  }
  const raekker = [];
  for (const m of medarbejdere) {
    let kapacitet = 0, kapTilDato = 0, fravaer = 0;
    for (const { iso, dag } of dage) {
      if (m.fratraadtDato && iso > m.fratraadtDato) continue;
      const kap = Number((m.capacity || {})[dag]) || 0;
      if (!kap) continue;
      const b = Math.min(kap, blok.get(`${m.id}|${iso}`) || 0);
      kapacitet += kap - b; fravaer += b;
      if (iso <= idag) kapTilDato += kap - b;
    }
    if (kapacitet === 0 && !(planlagt.get(m.id) > 0)) continue;
    const p = planlagt.get(m.id) || 0, u = udfoert.get(m.id) || 0;
    raekker.push({
      id: m.id, navn: m.name, kapacitet, fravaer, planlagt: p, udfoert: u, kapTilDato,
      planlagtPct: kapacitet > 0 ? (p / kapacitet) * 100 : null,
      udfoertPct: kapTilDato > 0 ? (u / kapTilDato) * 100 : null,
    });
  }
  const sum = (f) => raekker.reduce((s, r) => s + f(r), 0);
  const kap = sum((r) => r.kapacitet), kapD = sum((r) => r.kapTilDato), p = sum((r) => r.planlagt), u = sum((r) => r.udfoert);
  return { raekker, ialt: { kapacitet: kap, fravaer: sum((r) => r.fravaer), planlagt: p, udfoert: u, kapTilDato: kapD, planlagtPct: kap > 0 ? (p / kap) * 100 : null, udfoertPct: kapD > 0 ? (u / kapD) * 100 : null } };
}

export function status(pct) {
  if (pct == null) return "ingen";
  return pct < LAV_GRAENSE ? "plads" : pct > HOEJ_GRAENSE ? "fuld" : "sund";
}
