// «Simulér uge» — motoren (30.9.2026).
//
// Se overdragelse/PLAN-simulering.md for beslutningerne bag. Kort fortalt:
//   · Dagen flyttes aldrig. Klokkeslættet flyttes kun, hvis planlæggeren tillader
//     forslag (tolerance i minutter), og så markeres det.
//   · «Fast medarbejder»: den faste medarbejder på aftalen bliver på opgaven.
//     «Fri medarbejder»: alle pladser fordeles frit.
//   · Kun kørsel MELLEM opgaverne tæller — ikke hjemmefra og hjem.
//   · Kørslen regnes i kroner: km × medarbejderens egen kilometersats.
//   · Mødetid og dagstimer (kapacitet) brydes aldrig af motoren. Kørsel tæller ikke
//     med i dagstimerne, ligesom i resten af appen.
//   · Udførte opgaver og opgaver med registreret tid røres ikke («laast»).
//
// Filen er ren: ingen React, ingen database. Alt kommer ind som argumenter, så den kan
// prøves af i simulering.test.mjs og køres på en rigtig uge uden at åbne appen.
//
// ── Input ─────────────────────────────────────────────────────────────────────
// opgaver: [{
//   id, dag, adresse,
//   start,            minutter efter midnat (det aftalte klokkeslæt)
//   pladser: [{ emp, min }]   den nuværende bemanding: hvem og hvor mange minutter.
//                     En opgave uden medarbejder har én plads med emp: null.
//   kandidater,       Set/array af medarbejder-id'er, der MÅ tage opgaven (kompetencer,
//                     sygdom/ferie, weekend — regnet af appen med dens egne regler)
//   udenfor,          Set/array af kandidater, der ligger uden for opgavens område
//   fast,             aftalens faste medarbejder eller null
//   laast,            true = røres ikke (udført / registreret tid / overstået dag)
// }]
// medarbejdere: [{ id, moede (min), kap: { [dag]: min }, sats (kr/km) }]
// afstand(a, b) -> { km, min }   kørsel mellem to adresser
// valg: { tilstand: "fast"|"fri", tolerance: 0|15|30|60, balance: 0-100, standardSats }
//
// standardSats: bruges for medarbejdere UDEN kilometersats. Uden den ville deres kørsel
// koste 0 kr., og motoren ville lægge al kørsel over på dem — det skete i den første
// kørsel på uge 41 (Charlotte, Lea og Karen havde ingen sats).

const STRAF_SENT = 20;          // kr. pr. minut for sent (låste opgaver kan give det)
const STRAF_UDENFOR = 40;       // kr. pr. opgave uden for området
const STRAF_FLYT_PR_MIN = 1.5;  // kr. pr. minut et klokkeslæt foreslås flyttet
const BALANCE_FAKTOR = 3;       // kr. pr. (time²) ved balance = 100

function tilSaet(x) { return x instanceof Set ? x : new Set(x || []); }

// Én medarbejders dag: km, minutter for sent, arbejde, før mødetid.
// liste: [{ adresse, start, min }]
export function dagensTal(liste, afstand, moede = 0) {
  const s = [...liste].sort((a, b) => a.start - b.start);
  let km = 0, sent = 0, arbejde = 0, foerMoede = 0, fri = -Infinity, forrige = null;
  for (const x of s) {
    if (x.start < moede) foerMoede++;
    let frem = x.start;
    if (forrige) {
      const d = afstand(forrige.adresse, x.adresse);
      km += d.km;
      frem = Math.max(x.start, fri + d.min);
      if (frem > x.start) sent += frem - x.start;
    }
    arbejde += x.min;
    fri = frem + x.min;
    forrige = x;
  }
  return { km: Math.round(km * 10) / 10, sent, arbejde, foerMoede };
}

// Kan medarbejderen tage opgaven kl. start uden at bryde noget?
function passer(liste, ny, afstand, moede, kap) {
  if (ny.start < moede) return false;
  if (liste.reduce((s, x) => s + x.min, 0) + ny.min > kap) return false;
  for (const x of liste) {
    const [a, b] = x.start <= ny.start ? [x, ny] : [ny, x];
    if (a.start + a.min + afstand(a.adresse, b.adresse).min > b.start) return false;
  }
  return true;
}

// Prisen for én medarbejders dag i kroner (mål + straffe).
export function satsFor(emp, standardSats = 3.94) {
  return Number(emp?.sats) > 0 ? Number(emp.sats) : standardSats;
}

function dagPris(liste, emp, afstand, balance, udenforAntal, standardSats) {
  const t = dagensTal(liste, afstand, emp.moede);
  return t.km * satsFor(emp, standardSats) + t.sent * STRAF_SENT
    + (balance / 100) * BALANCE_FAKTOR * (t.arbejde / 60) ** 2
    + udenforAntal * STRAF_UDENFOR;
}

// Én dag. Returnerer { pladser: { [opgaveId]: [{ emp, min, start, flyttet }] }, ikkePlaceret: [...] }
export function simulerDag(opgaver, medarbejdere, afstand, valg = {}) {
  const { tilstand = "fri", tolerance = 0, balance = 40, standardSats = 3.94 } = valg;
  const dag = opgaver[0]?.dag;
  const emp = new Map(medarbejdere.map((e) => [e.id, e]));
  const dagens = Object.fromEntries(medarbejdere.map((e) => [e.id, []]));   // id -> [{opgId, adresse, start, min}]
  const resultat = {};
  const ikkePlaceret = [];
  const kap = (id) => (emp.get(id)?.kap?.[dag]) || 0;
  const udenforAntal = (id) => dagens[id].filter((x) => x.udenfor).length;
  const pris = (id) => dagPris(dagens[id], emp.get(id), afstand, balance, udenforAntal(id), standardSats);

  // Pladser, der skal fordeles, og pladser, der ligger fast.
  const frie = [];
  for (const o of [...opgaver].sort((a, b) => a.start - b.start || String(a.id).localeCompare(String(b.id)))) {
    resultat[o.id] = [];
    const kand = tilSaet(o.kandidater), udenfor = tilSaet(o.udenfor);
    o.pladser.forEach((p, nr) => {
      const laastHer = o.laast || (tilstand === "fast" && o.fast && p.emp === o.fast);
      if (laastHer && p.emp && emp.has(p.emp)) {
        const x = { opgId: o.id, adresse: o.adresse, start: o.start, min: p.min, udenfor: udenfor.has(p.emp) };
        dagens[p.emp].push(x);
        resultat[o.id].push({ emp: p.emp, min: p.min, start: o.start, flyttet: false, laast: true });
      } else {
        frie.push({ o, nr, min: p.min, kand, udenfor, foer: p.emp });
      }
    });
  }

  // 1) Billigste indsættelse, i klokkeslæt-rækkefølge.
  for (const f of frie) {
    const optaget = new Set(resultat[f.o.id].map((r) => r.emp));
    let bedst = null;
    const skift = [0];
    for (let d = 15; d <= tolerance; d += 15) skift.push(d, -d);
    for (const d of skift) {
      for (const e of medarbejdere) {
        if (!f.kand.has(e.id) || optaget.has(e.id)) continue;
        const ny = { opgId: f.o.id, adresse: f.o.adresse, start: f.o.start + d, min: f.min, udenfor: f.udenfor.has(e.id) };
        if (!passer(dagens[e.id], ny, afstand, e.moede, kap(e.id))) continue;
        const foer = pris(e.id);
        dagens[e.id].push(ny);
        const efter = pris(e.id);
        dagens[e.id].pop();
        const p = efter - foer + Math.abs(d) * STRAF_FLYT_PR_MIN;
        if (!bedst || p < bedst.p - 1e-9) bedst = { e: e.id, ny, p, d };
      }
      if (bedst && d === 0) break;   // flyt kun klokkeslættet, når det aftalte ikke kan lade sig gøre
    }
    if (!bedst) { ikkePlaceret.push({ opgave: f.o.id, foer: f.foer, grund: "ingen ledig medarbejder med de rette kompetencer" }); continue; }
    dagens[bedst.e].push(bedst.ny);
    resultat[f.o.id].push({ emp: bedst.e, min: f.min, start: bedst.ny.start, flyttet: bedst.d !== 0, foer: f.foer });
  }

  // 2) Forbedring: flyt én plads til en anden medarbejder, eller byt to pladser.
  //    Kun pladser, der ikke ligger fast. Samme klokkeslæt som efter trin 1.
  const flytbare = () => Object.entries(resultat).flatMap(([opgId, rk]) =>
    rk.map((r, i) => ({ opgId, i, r })).filter((x) => !x.r.laast));
  const opgaveAf = new Map(opgaver.map((o) => [o.id, o]));
  for (let runde = 0; runde < 8; runde++) {
    let forbedret = false;
    // Flyt
    for (const { opgId, i, r } of flytbare()) {
      const o = opgaveAf.get(opgId), kand = tilSaet(o.kandidater), udenfor = tilSaet(o.udenfor);
      const fra = r.emp;
      const idx = dagens[fra].findIndex((x) => x.opgId === opgId && x.start === r.start && x.min === r.min);
      if (idx < 0) continue;
      const [x] = dagens[fra].splice(idx, 1);
      const gevinstFra = pris(fra);
      dagens[fra].push(x);
      const nuFra = pris(fra);
      dagens[fra].splice(dagens[fra].length - 1, 1);
      let bedst = null;
      const optaget = new Set(resultat[opgId].map((z) => z.emp));
      for (const e of medarbejdere) {
        if (e.id === fra || !kand.has(e.id) || optaget.has(e.id)) continue;
        const ny = { ...x, udenfor: udenfor.has(e.id) };
        if (!passer(dagens[e.id], ny, afstand, e.moede, kap(e.id))) continue;
        const foer = pris(e.id);
        dagens[e.id].push(ny);
        const efter = pris(e.id);
        dagens[e.id].pop();
        const delta = (efter - foer) + (gevinstFra - nuFra);
        if (delta < -0.5 && (!bedst || delta < bedst.delta)) bedst = { e: e.id, ny, delta };
      }
      if (bedst) {
        dagens[bedst.e].push(bedst.ny);
        resultat[opgId][i] = { ...r, emp: bedst.e };
        forbedret = true;
      } else {
        dagens[fra].push(x);
      }
    }
    // Byt
    const alle = flytbare();
    for (let a = 0; a < alle.length; a++) {
      for (let b = a + 1; b < alle.length; b++) {
        const A = alle[a], B = alle[b];
        const ea = resultat[A.opgId][A.i].emp, eb = resultat[B.opgId][B.i].emp;
        if (ea === eb) continue;
        const oA = opgaveAf.get(A.opgId), oB = opgaveAf.get(B.opgId);
        if (!tilSaet(oA.kandidater).has(eb) || !tilSaet(oB.kandidater).has(ea)) continue;
        if (resultat[A.opgId].some((z, k) => k !== A.i && z.emp === eb)) continue;
        if (resultat[B.opgId].some((z, k) => k !== B.i && z.emp === ea)) continue;
        const rA = resultat[A.opgId][A.i], rB = resultat[B.opgId][B.i];
        const iA = dagens[ea].findIndex((x) => x.opgId === A.opgId && x.start === rA.start);
        const iB = dagens[eb].findIndex((x) => x.opgId === B.opgId && x.start === rB.start);
        if (iA < 0 || iB < 0) continue;
        const foer = pris(ea) + pris(eb);
        const xA = dagens[ea][iA], xB = dagens[eb][iB];
        const restA = dagens[ea].filter((_, k) => k !== iA), restB = dagens[eb].filter((_, k) => k !== iB);
        const nyA = { ...xB, udenfor: tilSaet(oB.udenfor).has(ea) }, nyB = { ...xA, udenfor: tilSaet(oA.udenfor).has(eb) };
        if (!passer(restA, nyA, afstand, emp.get(ea).moede, kap(ea))) continue;
        if (!passer(restB, nyB, afstand, emp.get(eb).moede, kap(eb))) continue;
        const gemA = dagens[ea], gemB = dagens[eb];
        dagens[ea] = [...restA, nyA]; dagens[eb] = [...restB, nyB];
        const efter = pris(ea) + pris(eb);
        if (efter < foer - 0.5) {
          resultat[A.opgId][A.i] = { ...rA, emp: eb };
          resultat[B.opgId][B.i] = { ...rB, emp: ea };
          forbedret = true;
        } else { dagens[ea] = gemA; dagens[eb] = gemB; }
      }
    }
    if (!forbedret) break;
  }

  return { pladser: resultat, ikkePlaceret };
}

// Hele ugen: dagene er uafhængige, fordi opgaver aldrig flytter dag.
export function simulerUge(opgaver, medarbejdere, afstand, valg) {
  const pladser = {}, ikkePlaceret = [];
  const dage = [...new Set(opgaver.map((o) => o.dag))];
  for (const d of dage) {
    const r = simulerDag(opgaver.filter((o) => o.dag === d), medarbejdere, afstand, valg);
    Object.assign(pladser, r.pladser);
    ikkePlaceret.push(...r.ikkePlaceret.map((x) => ({ ...x, dag: d })));
  }
  return { pladser, ikkePlaceret };
}

// Den nuværende plan i samme form som simuleringens resultat.
export function nuvaerendePlan(opgaver) {
  return Object.fromEntries(opgaver.map((o) => [o.id,
    o.pladser.filter((p) => p.emp).map((p) => ({ emp: p.emp, min: p.min, start: o.start, flyttet: false }))]));
}

// Nøgletal for en plan — samme regnestykke for «nu» og «simuleret».
export function noegletal(opgaver, medarbejdere, afstand, pladser, standardSats = 3.94) {
  const opg = new Map(opgaver.map((o) => [o.id, o]));
  const pr = {};   // `${emp}|${dag}` -> liste
  for (const [id, rk] of Object.entries(pladser)) {
    const o = opg.get(id);
    for (const r of rk) {
      const k = `${r.emp}|${o.dag}`;
      (pr[k] ||= []).push({ adresse: o.adresse, start: r.start, min: r.min });
    }
  }
  const empTal = {};
  let km = 0, kr = 0, sent = 0, overKap = 0, foerMoede = 0;
  for (const e of medarbejdere) {
    let eKm = 0, eKr = 0, eArb = 0;
    for (const d of Object.keys(e.kap || {})) {
      const liste = pr[`${e.id}|${d}`] || [];
      if (!liste.length) continue;
      const t = dagensTal(liste, afstand, e.moede);
      eKm += t.km; eKr += t.km * satsFor(e, standardSats); eArb += t.arbejde;
      sent += t.sent; foerMoede += t.foerMoede;
      if (t.arbejde > (e.kap[d] || 0)) overKap++;
    }
    km += eKm; kr += eKr;
    empTal[e.id] = { km: Math.round(eKm * 10) / 10, kr: Math.round(eKr), arbejde: eArb, udenSats: !(Number(e.sats) > 0) };
  }
  let nye = 0, flyttet = 0, ikkeTildelt = 0;
  for (const o of opgaver) {
    const foer = new Set(o.pladser.map((p) => p.emp).filter(Boolean));
    const nu = pladser[o.id] || [];
    nye += nu.filter((r) => !foer.has(r.emp)).length;
    flyttet += nu.some((r) => r.flyttet) ? 1 : 0;
    ikkeTildelt += Math.max(0, o.pladser.length - nu.length);
  }
  return { km: Math.round(km), kr: Math.round(kr), sent, overKap, foerMoede, nye, flyttet, ikkeTildelt, pr: empTal };
}
