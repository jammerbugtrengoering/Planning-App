// Timepriser med gyldighedsdato (3.10.2026).
//
// Foer laa timeprisen som ét tal pr. kontrakttype. Rettede man det, regnede alt om —
// ogsaa fakturering og rapporter for maaneder, der allerede var sendt til Dinero.
// Nu har hver sats en gyldig_fra, og en opgave prissaettes med den sats, der gjaldt
// paa opgavens dato. Samme princip som satsPaaDato for loen og kilometer.
//
// Databasen (tabellen timepris_satser og triggeren timepris_laas) soerger for, at en
// sats aldrig kan laegges ind, rettes eller slettes med en dato, der rammer en
// faktureret opgave. Denne fil skal bare regne rigtigt ud fra satserne.
//
// Ren logik uden React og Supabase, saa den kan testes i timepriser.test.mjs.

// Raekker fra databasen -> { [kontrakttype]: [{ sats, gyldig_fra }] } med nyeste foerst.
export function lavPrisliste(raekker = []) {
  const ud = {};
  for (const r of raekker || []) {
    if (!r || !r.contract_type || !r.gyldig_fra) continue;
    (ud[r.contract_type] ||= []).push({
      id: r.id ?? null,
      sats: Number(r.hourly_rate) || 0,
      gyldig_fra: String(r.gyldig_fra).slice(0, 10),
    });
  }
  for (const liste of Object.values(ud)) liste.sort((a, b) => (a.gyldig_fra < b.gyldig_fra ? 1 : -1));
  return ud;
}

// Satsen for en kontrakttype paa en dato ("YYYY-MM-DD").
//
// Ukendt type falder tilbage paa privat, som resten af appen goer. Ligger datoen foer
// den foerste sats (eller mangler den), bruges den aeldste sats — en opgave skal ikke
// pludselig staa til 0 kr, fordi den ligger foer startsatsen. Databasen har altid en
// startsats fra 2000, saa i praksis sker det kun, hvis data mangler.
export function timeprisPaaDato(prisliste, type, dato) {
  const liste = (prisliste && (prisliste[type] || prisliste.privat)) || [];
  if (!liste.length) return 0;
  if (!dato) return liste[0].sats;
  const d = String(dato).slice(0, 10);
  const fundet = liste.find((r) => r.gyldig_fra <= d);
  return (fundet || liste[liste.length - 1]).sats;
}

// Dagens sats for hver type: { privat: 315, ... }. Bruges hvor der ikke er en
// bestemt opgavedato — forslag paa nye tilbud og overslag over en aftales fremtid.
export function satserPaaDato(prisliste, dato) {
  const ud = {};
  for (const type of Object.keys(prisliste || {})) ud[type] = timeprisPaaDato(prisliste, type, dato);
  return ud;
}

// Kommende satser (gyldig_fra efter dato), aeldste foerst, til visning.
export function kommendeSatser(prisliste, type, dato) {
  const d = String(dato).slice(0, 10);
  return ((prisliste && prisliste[type]) || []).filter((r) => r.gyldig_fra > d).slice().reverse();
}
