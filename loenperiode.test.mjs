// Tests af lønperioden. Køres ved hvert build. Samme regel som loen_periode_slut og
// loen_periode_laast i databasen — de to må aldrig blive uenige.
import { loenPeriode, periodeSlutFor, periodeFor, erLaast } from "./src/loenperiode.js";

let fejl = 0, koert = 0;
function er(hvad, faktisk, forventet) {
  koert++;
  if (JSON.stringify(faktisk) !== JSON.stringify(forventet)) {
    fejl++;
    console.error(`  ✗ ${hvad}\n      fik       ${JSON.stringify(faktisk)}\n      forventet ${JSON.stringify(forventet)}`);
  }
}

er("oktober = 20. sep – 19. okt", loenPeriode(2026, 10, 20), { fra: "2026-09-20", til: "2026-10-19", lukkedag: "2026-10-20" });
er("januar over årsskiftet", loenPeriode(2027, 1, 20), { fra: "2026-12-20", til: "2027-01-19", lukkedag: "2027-01-20" });
er("kalendermåned ved lukkedag 1", loenPeriode(2026, 2, 1), { fra: "2026-02-01", til: "2026-02-28", lukkedag: "2026-03-01" });
er("5. okt hører til perioden der slutter 19. okt", periodeSlutFor("2026-10-05"), "2026-10-19");
er("19. okt er sidste dag", periodeSlutFor("2026-10-19"), "2026-10-19");
er("20. okt starter ny periode", periodeSlutFor("2026-10-20"), "2026-11-19");
er("25. dec → januar", periodeFor("2026-12-25"), { aar: 2027, maaned: 1 });
er("som databasen: 2026-12-25 slutter 2027-01-19", periodeSlutFor("2026-12-25"), "2027-01-19");
er("ugyldig lukkedag falder tilbage til 20", periodeSlutFor("2026-10-05", 40), "2026-10-19");

// Lukket på lukkedagen kl. 23.59 — åben hele lukkedagen.
er("åben den 20. kl. 23.30", erLaast("2026-10-10", 20, new Date(2026, 9, 20, 23, 30)), false);
er("lukket den 21. kl. 00.00", erLaast("2026-10-10", 20, new Date(2026, 9, 21, 0, 0)), true);
er("ny periode er åben", erLaast("2026-10-20", 20, new Date(2026, 9, 21, 8, 0)), false);
er("kalendermåned: åben den 1. i næste måned", erLaast("2026-09-15", 1, new Date(2026, 9, 1, 12, 0)), false);
er("kalendermåned: lukket den 2.", erLaast("2026-09-15", 1, new Date(2026, 9, 2, 0, 0)), true);

if (fejl > 0) {
  console.error(`\n  ${fejl} af ${koert} kontroller fejlede i lønperioden.\n`);
  process.exit(1);
}
console.log(`Lønperiode: ${koert} kontroller i orden.`);
