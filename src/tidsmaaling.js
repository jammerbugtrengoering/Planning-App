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
