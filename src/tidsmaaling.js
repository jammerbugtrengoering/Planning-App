// Hvad siger start/stop-maalingerne paa en opgave?
//
// 24.9.2026. Med start/stop gemmer databasen (afslut_tid) foruden de registrerede
// minutter ogsaa start og stop efter serverens ur, den MAALTE tid, og afstanden i meter
// til adressen ved start og slut. Aldrig koordinater.
//
// Den her fil laver det om til det, kontoret skal kunne se paa Kundetimer: blev der
// registreret noget andet end det maalte, og er der noget ved maalingen, der er vaerd
// at kigge paa. Ikke en dom — en markering. Der kan vaere gode grunde til alle sammen:
// et kaeldertrin uden signal, en telefon der loeb toer for stroem.
//
// Aendrer du noget her, saa ret tidsmaaling.test.mjs i samme ombaering.

import { afvigelse, planlagtFor } from "./opgavetid.js";

// Over denne afstand er man ikke «ved adressen». Samme graense som i Worklist.
export const LANGT_VAEK_M = 150;

export function formatAfstand(m) {
  if (m === null || m === undefined || !Number.isFinite(Number(m))) return "ukendt";
  const n = Number(m);
  if (n < 1000) return `${Math.round(n)} m`;
  return `${(n / 1000).toLocaleString("da-DK", { maximumFractionDigits: 1 })} km`;
}

// Opsummerer ALLE start/stop-poster paa en opgave (flere medarbejdere = flere poster).
// Poster uden start/stop (den gamle maade at registrere paa) taelles ikke med her.
export function opsummerMaaling(timeLog) {
  const poster = (timeLog || []).filter((l) => l && l.startStop);
  if (poster.length === 0) return null;

  let maalt = 0;
  let registreret = 0;
  let harMaalt = false;
  const bemaerk = [];

  for (const p of poster) {
    registreret += Number(p.minutes) || 0;
    if (p.udenStart) {
      bemaerk.push("ingen start registreret");
      continue;
    }
    if (Number.isFinite(Number(p.maalt))) { maalt += Number(p.maalt); harMaalt = true; }
    if (p.afstandStart === null || p.afstandStart === undefined) bemaerk.push("startet uden position");
    else if (Number(p.afstandStart) > LANGT_VAEK_M) bemaerk.push(`startet ${formatAfstand(p.afstandStart)} fra adressen`);
    if (p.afstandSlut === null || p.afstandSlut === undefined) bemaerk.push("afsluttet uden position");
    else if (Number(p.afstandSlut) > LANGT_VAEK_M) bemaerk.push(`afsluttet ${formatAfstand(p.afstandSlut)} fra adressen`);
    if (p.startSendtSent) bemaerk.push("start sendt senere");
    if (p.stopSendtSent) bemaerk.push("afslutning sendt senere");
  }

  return {
    maalt: harMaalt ? maalt : null,
    registreret,
    // Positiv: der er registreret MERE end maalt. Det er den, der er vaerd at se efter.
    forskel: harMaalt ? registreret - maalt : null,
    bemaerk: [...new Set(bemaerk)],
    automatisk: poster.some((p) => p.automatisk),
  };
}

// ── Stopuret paa opgavekortet i ugeplanen (25.9.2026) ─────────────────────────
// Kontoret skal kunne se det i ugeplanen og reagere med det samme — ikke foerst naar
// nogen aabner Kundetimer sidst paa maaneden.
//
//   groen   tiden koerer lige nu
//   orange  mere tid end planlagt, men der er skrevet hvorfor
//   roed    noget at se paa: over tiden uden begrundelse, registreret mere end maalt,
//           en markering ved maalingen, eller et ur der er gaaet over tiden
//
// koerende: tidsstart-raekker for opgaven ([{ employee_id, startet }]).
// Returnerer null, naar der intet er at vise.
export const OVER_TIDEN_MIN = 15;   // samme som paamindelsen til medarbejderen

export function stopurStatus(opgave, koerende = [], nu = Date.now(), navnFor = (id) => id) {
  if (!opgave) return null;
  if (koerende.length > 0) {
    const linjer = [];
    let over = 0;
    for (const r of koerende) {
      const start = new Date(r.startet).getTime();
      const slut = start + (planlagtFor(opgave, r.employee_id) + OVER_TIDEN_MIN) * 60000;
      const kl = new Date(start).toLocaleTimeString("da-DK", { hour: "2-digit", minute: "2-digit" });
      if (nu > slut) {
        over = Math.max(over, Math.round((nu - slut) / 60000) + OVER_TIDEN_MIN);
        linjer.push(`${navnFor(r.employee_id)} startede kl. ${kl} og er over tiden`);
      } else {
        linjer.push(`${navnFor(r.employee_id)} startede kl. ${kl}`);
      }
    }
    return over > 0
      ? { farve: "roed", kort: `${over}m over`, tekst: "Tiden kører stadig: " + linjer.join(" · ") }
      : { farve: "groen", kort: "i gang", tekst: "Tiden kører: " + linjer.join(" · ") };
  }

  const log = opgave.timeLog || opgave.time_log || [];
  if (log.length === 0) return null;
  const afv = afvigelse(opgave);
  const m = opsummerMaaling(log);
  const begrundet = log.some((l) => l.note && String(l.note).trim() && l.empId !== "planner");
  const grunde = [];
  if (m && m.forskel !== null && m.forskel > 2) grunde.push(`registreret ${m.forskel}m mere end målt`);
  if (m) grunde.push(...m.bemaerk);
  if (afv > 0 && !begrundet) grunde.push(`${afv}m over planlagt uden begrundelse`);
  if (grunde.length > 0) return { farve: "roed", kort: afv > 0 ? `+${afv}m` : "se her", tekst: grunde.join(" · ") };
  if (afv > 0) return { farve: "orange", kort: `+${afv}m`, tekst: `${afv}m over planlagt — begrundet` };
  return null;
}
