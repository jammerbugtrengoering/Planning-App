// Forventet løn og kørsel pr. måned (9.10.2026, Jonn).
//
// Rent regnearbejde uden React, så det kan prøves i `forventetloen.test.mjs`.
//
// Overskud regner kun på det godkendte. Det passer til regnskabet, men siger intet om, hvad måneden ender på, før lønnen er godkendt. Her regnes derfor med det, der
// kommer: løn ud fra de medarbejdere, der er på opgaverne, og deres timeløn på opgavens dato; kørsel ud fra de beregnede kilometer og, for dage uden beregnede kilometer, ud fra planen.
//
// Godkendt tid tæller som den er. Ikke godkendt tæller den registrerede tid, og er der ingen, den planlagte. Så ligger tallet fast, når lønnen godkendes, og kommer
// aldrig under det, der allerede er godkendt. Se loenMedAftaltTid for, hvorfor aftalt arbejdstid også tæller.

// opgaver: opgaver med medarbejdere på, uden ferie og sygdom. h: { godkendt(empId, t), registreret(t, empId), planlagt(t, empId), sats(empId, t) -> kr/time eller null, erAflyst(t) }
export function forventetLoen(opgaver, h) {
  let faktisk = 0, forventet = 0;
  const perEmp = new Map();
  for (const t of opgaver) {
    if (h.erAflyst(t)) continue;
    for (const empId of (t.assignees || [])) {
      const sats = h.sats(empId, t);
      if (sats == null) continue;
      const reg = Number(h.registreret(t, empId)) || 0;
      let kr;
      if (h.godkendt(empId, t)) { kr = (reg / 60) * sats; faktisk += kr; }
      else kr = ((reg > 0 ? reg : (Number(h.planlagt(t, empId)) || 0)) / 60) * sats;
      forventet += kr;
      perEmp.set(empId, (perEmp.get(empId) || 0) + kr);
    }
  }
  return { faktisk, forventet, perEmp };
}

// Løn er for aftalt arbejdstid, ikke kun for de timer, der ligger som opgaver (9.10.2026, Jonn): 9.10. var planens løn ca. 190.000 kr. om måneden mod ca. 300.000 i
// Dinero, og medarbejdernes aftalte tid (kapacitet) × timeløn gav ca. 296.000. Forskellen er ejerne, som får løn, men næsten ikke står på opgaver, og de timer hos de øvrige,
// der ikke er fyldt med opgaver. Forventet løn pr. medarbejder er derfor det største af opgavernes løn og lønnen for den aftalte tid.
// perEmp: resultatet fra forventetLoen. aftaltKr: Map empId -> løn for månedens aftalte tid. Giver { forventet, uudnyttet } (uudnyttet = det, kapaciteten er mere end opgaverne).
export function loenMedAftaltTid(perEmp, aftaltKr) {
  let forventet = 0, uudnyttet = 0;
  const alle = new Set([...perEmp.keys(), ...aftaltKr.keys()]);
  for (const e of alle) {
    const opg = perEmp.get(e) || 0, aftalt = aftaltKr.get(e) || 0;
    forventet += Math.max(opg, aftalt);
    uudnyttet += Math.max(0, aftalt - opg);
  }
  return { forventet, uudnyttet };
}

// Forventet kørsel i en måned (9.10.2026, Jonn): kun én medarbejder arbejder 100 % i løsningen (Worklist), men alle andre har deres arbejdsplan i systemet. Natjobbet
// (compute-daily-km) beregner kun for udførte opgaver, så for de andre findes der ingen kilometer. Derfor:
//   - en medarbejder og dag, der HAR beregnede kilometer (km_log), tæller med dem, godkendt eller ej
//   - alle andre medarbejder-dage regnes ud fra planen: opgaverne i dagens rækkefølge, én tur mellem hver to opgaver med forskellig adresse, kilometer fra de gemte
//     adressepar (travel_overrides). Samme regel som natjobbet: ingen tur hjemmefra og hjem, og aflyste opgaver tæller ikke.
//   - et adressepar, der endnu ikke er slået op, får den typiske tur (medianen af de kendte), så en ukendt rute ikke bliver til 0 kr.
// Aktiviteter med egen tur (km_fra_adresse) er en tur for sig, med retur hvis km_tur_retur er sat, og tæller kun, når parret er kendt.
//
// linjer: km_log-linjer { employee_id, work_date, km }. opgaver: opgaver med dato og medarbejdere (inkl. aktiviteter, uden ferie og sygdom).
// h: { datoAf(t), erAflyst(t), sorter(opgaver) -> opgaver i dagens rækkefølge, adresse(t), egenTur(t) -> { fra, tilbage } | null, km(a, b) -> tal | null,
//      kmKr(empId, dato, km) -> kroner eller null (ingen sats) }
export function typiskTur(kmAfPar) {
  const v = kmAfPar.filter((x) => Number.isFinite(x) && x > 0).sort((a, b) => a - b);
  if (v.length === 0) return 0;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

export function forventetKoersel({ linjer, opgaver, maanedFra, maanedTil, typisk, h }) {
  let beregnet = 0;
  const harLinjer = new Set();
  for (const l of linjer) {
    if (l.work_date < maanedFra || l.work_date > maanedTil) continue;
    harLinjer.add(`${l.employee_id}|${l.work_date}`);
    const kr = h.kmKr(l.employee_id, l.work_date, Number(l.km) || 0);
    if (kr != null) beregnet += kr;
  }
  // medarbejder|dato -> opgaver
  const dage = new Map();
  for (const t of opgaver) {
    if (h.erAflyst(t)) continue;
    const d = h.datoAf(t);
    if (!d || d < maanedFra || d > maanedTil) continue;
    for (const empId of (t.assignees || [])) {
      const k = `${empId}|${d}`;
      if (harLinjer.has(k)) continue;
      if (!dage.has(k)) dage.set(k, []);
      dage.get(k).push(t);
    }
  }
  let planlagt = 0, skoennede = 0;
  for (const [k, liste] of dage) {
    const [empId, dato] = k.split("|");
    const egne = liste.filter((t) => h.egenTur(t));
    const kaede = h.sorter(liste.filter((t) => !h.egenTur(t) && h.adresse(t)));
    const ture = [];
    for (let i = 0; i < kaede.length - 1; i++) {
      const a = h.adresse(kaede[i]), b = h.adresse(kaede[i + 1]);
      if (a !== b) ture.push({ a, b, kendt: true });
    }
    for (const t of egne) {
      const e = h.egenTur(t);
      const til = h.adresse(t);
      if (!e.fra || !til || e.fra === til) continue;
      ture.push({ a: e.fra, b: til, kendt: false });
      if (e.tilbage) ture.push({ a: til, b: e.fra, kendt: false });
    }
    for (const tur of ture) {
      let km = h.km(tur.a, tur.b);
      if (km == null) {
        if (!tur.kendt) continue;      // en egen tur kan ikke skønnes
        km = typisk; skoennede += 1;
      }
      const kr = h.kmKr(empId, dato, km);
      if (kr != null) planlagt += kr;
    }
  }
  return { beregnet, planlagt, skoennede, forventet: beregnet + planlagt };
}
