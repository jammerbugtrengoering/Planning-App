// Samler realtime-haendelser for opgaver i bunker, saa planen tegnes én gang pr. bunke og
// ikke én gang pr. haendelse.
//
// 4.10.2026: at gemme en aftale med 100 opgaver sender 100 haendelser til hver aaben fane.
// Hver haendelse kopierede hele listen (18.500 opgaver) og fik hele planen til at tegne
// om — 100 gange i traek, i baade din og kollegaens fane. Her samles de, og listen
// opdateres én gang. Rent og uden React, saa det kan proeves for sig (realtimebunke.test.mjs).

export function nyBunke() {
  return { opdater: new Map(), slet: new Set() };
}

// Den nyeste haendelse for et id vinder; to rettelser af samme opgave flettes, saa intet
// felt fra den foerste gaar tabt. En sletning sluger de rettelser, der kom foer den.
export function laegHaendelseIBunke(bunke, type, id, raekke) {
  if (!id) return;
  if (type === "DELETE") {
    bunke.opdater.delete(id);
    bunke.slet.add(id);
    return;
  }
  bunke.slet.delete(id);
  bunke.opdater.set(id, { ...(bunke.opdater.get(id) || {}), ...raekke });
}

// Ren funktion: giver en NY liste og roerer hverken `prev` eller `bunke`. Det er et krav,
// fordi React i StrictMode koerer opdateringsfunktionen to gange.
export function anvendBunke(prev, bunke) {
  if (!bunke.opdater.size && !bunke.slet.size) return prev;
  const uden = bunke.slet.size ? prev.filter((t) => !bunke.slet.has(t.id)) : prev;
  const fundet = new Set();
  const next = uden.map((t) => {
    const ny = bunke.opdater.get(t.id);
    if (!ny) return t;
    fundet.add(t.id);
    return { ...t, ...ny };
  });
  bunke.opdater.forEach((ny, id) => { if (!fundet.has(id)) next.push(ny); });
  return next;
}
