// Hvad er aftalerne værd — i et bestemt år, eller over hele deres løbetid?
//
// Kontraktsummen på Aftaler-siden svarer på «hvad er aftalen værd i alt». Det her
// svarer på «hvor meget af den falder i 2027», og det er to forskellige spørgsmål:
// en toårig aftale underskrevet i september har kun en tredjedel af sin værdi i
// underskriftsåret.
//
// Værdien regnes ud fra de BESØG, der faktisk er lagt i planen, og ikke fra
// «uger × timepris». Så havner hvert besøg i det år, det ligger i, uden at nogen
// skal regne på skudår og ugenumre — og en aftale, der er opsagt midtvejs, tæller
// kun det, der er tilbage af den.
//
// Ét besøg = én persons tid, ligesom kontraktsummen på Aftaler-siden. Sætter
// planlæggeren to medarbejdere på samme opgave, ændrer det ikke, hvad kunden har
// aftalt — det ændrer kun, hvor hurtigt arbejdet er fra hånden.
//
// Ændrer du noget her, så ret portefoelje.test.mjs i samme ombæring.

const BLOKTYPER = ["sygdom", "ferie", "aktivitet"];

// Året et besøg falder i — kalenderåret, ikke ISO-ugeåret.
//
// De to er ikke det samme: uge 1 i 2027 begynder mandag den 4. januar, men uge 53
// i 2026 løber til og med søndag den 3. januar 2027. Et besøg den 2. januar hører
// regnskabsmæssigt til 2027, selvom det ligger i ISO-uge 53 af 2026. Uden det her
// ville nytårsugen lande i det forkerte regnskabsår hvert eneste år.
export function besoegsAar(inst) {
  if (!inst || !inst.year || !inst.week) return null;
  const dage = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const jan4 = new Date(inst.year, 0, 4);
  const mandag = new Date(jan4);
  mandag.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7) + (inst.week - 1) * 7);
  const idx = dage.indexOf(inst.day);
  mandag.setDate(mandag.getDate() + (idx < 0 ? 0 : idx));
  return mandag.getFullYear();
}

// Hvad er ét besøg værd?
export function besoegsVaerdi(inst, sats) {
  if (!inst) return 0;
  if (inst.pricingType === "fixed") return Number(inst.fixedPrice) || 0;
  return ((Number(inst.duration) || 0) / 60) * (Number(sats) || 0);
}

function median(tal) {
  if (!tal.length) return 0;
  const s = [...tal].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// aar = et årstal, eller null for hele løbetiden.
//
// Kun AKTIVE aftaler tælles med. En udgået aftale er ikke en del af porteføljen,
// selvom den har kørt en del af året — det, den nåede at levere, står under
// Rapportering som realiseret omsætning, og det er dér, det hører hjemme.
export function portefoeljeTal({ templates = [], instances = [], pricing = {}, aar = null }) {
  const aktive = new Map();
  templates.forEach((t) => { if (t && t.status === "aktiv") aktive.set(t.id, t); });

  // Pr. aftale: hvad falder der i perioden?
  const pr = new Map();
  instances.forEach((i) => {
    if (!i || !i.templateId || !aktive.has(i.templateId)) return;
    if (BLOKTYPER.includes(i.type)) return;
    if (aar !== null && besoegsAar(i) !== aar) return;
    const tpl = aktive.get(i.templateId);
    const type = i.contractType || tpl.contractType || "privat";
    const vaerdi = besoegsVaerdi(i, pricing[type]);
    const minutter = i.pricingType === "fixed" ? (Number(i.duration) || 0) : (Number(i.duration) || 0);
    if (!pr.has(i.templateId)) pr.set(i.templateId, { type, vaerdi: 0, minutter: 0, besoeg: 0, varigheder: [] });
    const g = pr.get(i.templateId);
    g.vaerdi += vaerdi;
    g.minutter += minutter;
    g.besoeg += 1;
    g.varigheder.push(Number(i.duration) || 0);
  });

  const raekker = [...pr.values()];
  const vaerdier = raekker.map((r) => r.vaerdi);
  const alleVarigheder = raekker.flatMap((r) => r.varigheder);
  const sum = (a) => a.reduce((s, x) => s + x, 0);

  const perType = {};
  raekker.forEach((r) => {
    if (!perType[r.type]) perType[r.type] = { aftaler: 0, vaerdi: 0, minutter: 0, besoeg: 0, vaerdier: [], varigheder: [] };
    const p = perType[r.type];
    p.aftaler += 1; p.vaerdi += r.vaerdi; p.minutter += r.minutter; p.besoeg += r.besoeg;
    p.vaerdier.push(r.vaerdi); p.varigheder.push(...r.varigheder);
  });

  return {
    aftaler: raekker.length,
    besoeg: sum(raekker.map((r) => r.besoeg)),
    minutter: sum(raekker.map((r) => r.minutter)),
    vaerdi: sum(vaerdier),
    gnsVaerdi: raekker.length ? sum(vaerdier) / raekker.length : 0,
    medianVaerdi: median(vaerdier),
    mindsteVaerdi: vaerdier.length ? Math.min(...vaerdier) : 0,
    stoersteVaerdi: vaerdier.length ? Math.max(...vaerdier) : 0,
    gnsMinPrBesoeg: alleVarigheder.length ? sum(alleVarigheder) / alleVarigheder.length : 0,
    medianMinPrBesoeg: median(alleVarigheder),
    perType: Object.entries(perType).map(([type, p]) => ({
      type,
      aftaler: p.aftaler,
      besoeg: p.besoeg,
      minutter: p.minutter,
      vaerdi: p.vaerdi,
      gnsVaerdi: p.vaerdi / p.aftaler,
      medianVaerdi: median(p.vaerdier),
      gnsMinPrBesoeg: p.varigheder.length ? sum(p.varigheder) / p.varigheder.length : 0,
    })).sort((a, b) => b.vaerdi - a.vaerdi),
  };
}

// Hvilke år er der overhovedet besøg i? Listen bygges af data og ikke af en fast
// række årstal — ellers ville en aftale, der løber til 2029, falde ud af rapporten
// uden at nogen opdagede det.
export function aarMedBesoeg(templates = [], instances = []) {
  const aktive = new Set(templates.filter((t) => t && t.status === "aktiv").map((t) => t.id));
  const aar = new Set();
  instances.forEach((i) => {
    if (!i || !i.templateId || !aktive.has(i.templateId)) return;
    if (BLOKTYPER.includes(i.type)) return;
    const a = besoegsAar(i);
    if (a) aar.add(a);
  });
  return [...aar].sort((a, b) => a - b);
}
