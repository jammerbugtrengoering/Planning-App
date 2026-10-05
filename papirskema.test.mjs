// Tests af papirskemaet. Køres ved hvert build.
//
// Hvad de beskytter mod: tid, der bliver til penge på en lønseddel, og kilometer, kontoret
// skal tage en svær samtale på. En tastefejl i aflæsningen af «2.30» eller en afvigelse, der
// lyver, er værre end ingen indlæsning.
import { skemaOpgaver, laesTimer, laesKm, kmAfvigelse, klientNoegle, erIndlaest, systemKm, KM_GRAENSE } from "./src/papirskema.js";

let fejl = 0, koert = 0;
function er(hvad, faktisk, forventet) {
  koert++;
  if (JSON.stringify(faktisk) !== JSON.stringify(forventet)) {
    fejl++;
    console.error(`  ✗ ${hvad}\n      fik       ${JSON.stringify(faktisk)}\n      forventet ${JSON.stringify(forventet)}`);
  }
}

// ── Timer ───────────────────────────────────────────────────────────────────
er("2", laesTimer("2"), 120);
er("2,5", laesTimer("2,5"), 150);
er("2.5", laesTimer("2.5"), 150);
er("1,25 t", laesTimer("1,25 t"), 75);
er("2:30", laesTimer("2:30"), 150);
er("2t30", laesTimer("2t30"), 150);
er("2t 30m", laesTimer("2t 30m"), 150);
er("2 t", laesTimer("2 t"), 120);
er("90 min", laesTimer("90 min"), 90);
er("45m", laesTimer("45m"), 45);
er("2.30 er to en halv time", laesTimer("2.30"), 138);
er("tom", laesTimer(""), null);
er("tekst", laesTimer("hele dagen"), null);
er("nul", laesTimer("0"), null);
er("negativ", laesTimer("-2"), null);
er("over 16 timer", laesTimer("17"), null);
er("90 minutter i timer-felt er ikke 90 timer", laesTimer("90"), null);
er("2:75 er ikke et klokkeslæt", laesTimer("2:75"), null);

// ── Km ──────────────────────────────────────────────────────────────────────
er("km 12", laesKm("12"), 12);
er("km 12,5 km", laesKm("12,5 km"), 12.5);
er("km tom", laesKm(""), null);
er("km tekst", Number.isNaN(laesKm("ca. 12")), true);
er("km over 1000", Number.isNaN(laesKm("5000")), true);

// ── Afvigelser ──────────────────────────────────────────────────────────────
er("samme tal", kmAfvigelse(14, 14).status, "ok");
er("lille forskel er støj", kmAfvigelse(15, 14).status, "ok");
er("stor forskel i km men lille i procent", kmAfvigelse(82, 80).status, "ok");
er("stor i begge", kmAfvigelse(22, 14), { status: "afviger", diff: 8, pct: 57, afviger: true });
er("for lidt skrevet afviger også", kmAfvigelse(8, 14).afviger, true);
er("ingen systemkm", kmAfvigelse(10, null).status, "ingen-system");
er("ingen papirkm", kmAfvigelse(null, 14).status, "ingen-papir");
er("NaN papirkm", kmAfvigelse(NaN, 14).status, "ingen-papir");
er("system nul, papir 10", kmAfvigelse(10, 0).afviger, true);
er("grænsen er både km og procent", [KM_GRAENSE.km, KM_GRAENSE.pct], [1.5, 15]);

// ── Linjerne på skemaet ─────────────────────────────────────────────────────
const t = (id, day, tid, ekstra = {}) => ({ id, day, scheduledTime: tid, assignees: ["e1"], type: "fixed", ...ekstra });
const opg = [t("c", "Tue", "09:00"), t("a", "Mon", null), t("b", "Mon", "08:00"), t("x", "Mon", "07:00", { assignees: ["e2"] }),
             t("s", "Mon", "06:00", { type: "sygdom" }), t("w", "Sat", "10:00")];
er("rækkefølge: dag, så klokkeslæt, uden tid sidst", skemaOpgaver(opg, "e1", ["Mon", "Tue", "Wed", "Thu", "Fri"]).map((x) => x.id), ["b", "a", "c"]);
er("andres opgaver og sygdom er ikke med", skemaOpgaver(opg, "e1", ["Mon"]).map((x) => x.id), ["b", "a"]);
er("weekend kun når dagen er bedt om", skemaOpgaver(opg, "e1", ["Sat", "Sun"]).map((x) => x.id), ["w"]);

// ── Allerede indlæst ────────────────────────────────────────────────────────
er("nøgle", klientNoegle("e1", "i9"), "papir:e1:i9");
er("ikke indlæst", erIndlaest({ id: "i9", timeLog: [{ minutes: 60, empId: "e1" }] }, "e1"), false);
er("indlæst", erIndlaest({ id: "i9", timeLog: [{ minutes: 60, empId: "e1", kid: "papir:e1:i9" }] }, "e1"), true);
er("en andens indlæsning tæller ikke", erIndlaest({ id: "i9", time_log: [{ kid: "papir:e2:i9" }] }, "e1"), false);

// ── Systemets km ────────────────────────────────────────────────────────────
const km = systemKm([
  { employee_id: "e1", work_date: "2026-10-05", to_instance_id: "a", km: 6.04 },
  { employee_id: "e1", work_date: "2026-10-05", to_instance_id: "b", km: "8" },
  { employee_id: "e1", work_date: "2026-10-05", to_instance_id: null, km: 5 },
  { employee_id: "e2", work_date: "2026-10-05", to_instance_id: "a", km: 99 },
], "e1");
er("km pr. opgave", [...km.pr_opgave], [["a", 6], ["b", 8]]);
er("km pr. dag tæller hjemturen med", [...km.pr_dag], [["2026-10-05", 19]]);

if (fejl > 0) { throw new Error(`${fejl} af ${koert} kontroller fejlede i papirskemaet.`); }
console.log(`Papirskema: ${koert} kontroller i orden.`);
