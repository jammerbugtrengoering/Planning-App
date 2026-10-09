// Forventet løn og kørsel pr. måned (9.10.2026, Jonn).
//
// Rent regnearbejde uden React, så det kan prøves i `forventetloen.test.mjs`.
//
// Overskud regner kun på det godkendte. Det passer til regnskabet, men siger intet om, hvad måneden ender på, før lønnen er godkendt. Her regnes derfor med det, der
// kommer: løn ud fra de medarbejdere, der er på opgaverne, og deres timeløn på opgavens dato; kørsel ud fra de beregnede kilometer og, for dage der ikke er kørt endnu,
// et gennemsnit pr. planlagt time.
//
// Godkendt tid tæller som den er. Ikke godkendt tæller den registrerede tid, og er der ingen, den planlagte. Så ligger tallet fast, når lønnen godkendes, og kommer
// aldrig under det, der allerede er godkendt.

// opgaver: opgaver med medarbejdere på, uden ferie og sygdom. h: { godkendt(empId, t), registreret(t, empId), planlagt(t, empId), sats(empId, t) -> kr/time eller null, erAflyst(t) }
export function forventetLoen(opgaver, h) {
  let faktisk = 0, forventet = 0;
  for (const t of opgaver) {
    if (h.erAflyst(t)) continue;
    for (const empId of (t.assignees || [])) {
      const sats = h.sats(empId, t);
      if (sats == null) continue;
      const reg = Number(h.registreret(t, empId)) || 0;
      if (h.godkendt(empId, t)) { faktisk += (reg / 60) * sats; forventet += (reg / 60) * sats; continue; }
      const min = reg > 0 ? reg : (Number(h.planlagt(t, empId)) || 0);
      forventet += (min / 60) * sats;
    }
  }
  return { faktisk, forventet };
}

// Kørsel i kroner pr. planlagt time, pr. medarbejder, målt på et vindue bagud. Den medarbejder, der ikke har nok at måle på, får gennemsnittet for alle.
// linjer: { employee_id, work_date, km }. kmKr(linje) -> kroner for linjen eller null. koerende: opgaver, der giver kørsel (ikke aktiviteter).
export function koerselPrTime({ linjer, opgaver, fra, til, kmKr, planlagt, datoAf, erAflyst, mindstTimer = 8 }) {
  const kr = new Map(), timer = new Map();
  for (const l of linjer) {
    if (l.work_date < fra || l.work_date > til) continue;
    const v = kmKr(l);
    if (v == null) continue;
    kr.set(l.employee_id, (kr.get(l.employee_id) || 0) + v);
  }
  for (const t of opgaver) {
    if (erAflyst(t)) continue;
    const d = datoAf(t);
    if (!d || d < fra || d > til) continue;
    for (const empId of (t.assignees || [])) timer.set(empId, (timer.get(empId) || 0) + (Number(planlagt(t, empId)) || 0) / 60);
  }
  const alleKr = [...kr.values()].reduce((s, v) => s + v, 0);
  const alleTimer = [...timer.values()].reduce((s, v) => s + v, 0);
  const alle = alleTimer >= mindstTimer ? alleKr / alleTimer : 0;
  const pr = new Map();
  for (const [empId, tm] of timer) pr.set(empId, tm >= mindstTimer ? (kr.get(empId) || 0) / tm : alle);
  return { pr, alle };
}

// Forventet kørsel i en måned: de beregnede kilometer (godkendt eller ej) plus et skøn for planlagte dage, hvor der endnu ikke er beregnet noget.
// maanedFra/maanedTil: ISO-datoer. idag: ISO. prTime: resultatet af koerselPrTime. Giver { beregnet, skoen, forventet }.
export function forventetKoersel({ linjer, opgaver, maanedFra, maanedTil, idag, kmKr, planlagt, datoAf, erAflyst, prTime }) {
  let beregnet = 0;
  const harLinjer = new Set();
  for (const l of linjer) {
    if (l.work_date < maanedFra || l.work_date > maanedTil) continue;
    harLinjer.add(`${l.employee_id}|${l.work_date}`);
    const v = kmKr(l);
    if (v != null) beregnet += v;
  }
  let skoen = 0;
  for (const t of opgaver) {
    if (erAflyst(t)) continue;
    const d = datoAf(t);
    if (!d || d < idag || d < maanedFra || d > maanedTil) continue;
    for (const empId of (t.assignees || [])) {
      if (harLinjer.has(`${empId}|${d}`)) continue;
      skoen += ((Number(planlagt(t, empId)) || 0) / 60) * (prTime.pr.get(empId) ?? prTime.alle);
    }
  }
  return { beregnet, skoen, forventet: beregnet + skoen };
}
