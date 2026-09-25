// Prøver opsummeringen af start/stop-målinger (Kundetimer).
//
// Det, der ikke må gå galt: en ren registrering må ikke få en markering, og en
// registrering, der er rettet op i forhold til det målte, må ikke gå under radaren.
import { opsummerMaaling, formatAfstand, LANGT_VAEK_M, stopurStatus } from "./src/tidsmaaling.js";

let fejl = 0, ok = 0;
function er(navn, faktisk, forventet) {
  const a = JSON.stringify(faktisk), b = JSON.stringify(forventet);
  if (a === b) { ok++; return; }
  fejl++; console.error(`FEJL: ${navn}\n      fik      ${a}\n      forventet ${b}`);
}

// Den gamle måde at registrere på: ingen opsummering.
er("uden start/stop-poster er der intet at opsummere",
  opsummerMaaling([{ minutes: 60, empId: "e1" }]), null);
er("tom log", opsummerMaaling([]), null);
er("ingen log", opsummerMaaling(undefined), null);

// Ren registrering: målt 38, registreret 38, ved adressen begge gange.
const ren = opsummerMaaling([{ startStop: true, minutes: 38, maalt: 38, afstandStart: 12, afstandSlut: 20 }]);
er("ren: målt", ren.maalt, 38);
er("ren: forskel", ren.forskel, 0);
er("ren: ingen bemærkninger", ren.bemaerk, []);

// Det, det hele handler om: målt 30, registreret 60.
const rettet = opsummerMaaling([{ startStop: true, minutes: 60, maalt: 30, afstandStart: 10, afstandSlut: 15, note: "Kunden bad om ekstra" }]);
er("rettet op: forskel +30", rettet.forskel, 30);

// Afsluttet hjemme i sofaen.
const hjemme = opsummerMaaling([{ startStop: true, minutes: 45, maalt: 45, afstandStart: 8, afstandSlut: 6200 }]);
er("afsluttet langt væk står der", hjemme.bemaerk, ["afsluttet 6,2 km fra adressen"]);

// Lige ved grænsen: ikke markeret. Lige over: markeret.
er("ved grænsen er ikke langt væk",
  opsummerMaaling([{ startStop: true, minutes: 30, maalt: 30, afstandStart: LANGT_VAEK_M, afstandSlut: 5 }]).bemaerk, []);
er("lige over grænsen er",
  opsummerMaaling([{ startStop: true, minutes: 30, maalt: 30, afstandStart: LANGT_VAEK_M + 1, afstandSlut: 5 }]).bemaerk,
  [`startet ${LANGT_VAEK_M + 1} m fra adressen`]);

// Uden position — ikke en fejl, men den skal kunne ses.
er("uden position begge veje",
  opsummerMaaling([{ startStop: true, minutes: 50, maalt: 50, afstandStart: null, afstandSlut: null }]).bemaerk,
  ["startet uden position", "afsluttet uden position"]);

// Ingen start kom frem: tiden tæller, men der er intet målt.
const udenStart = opsummerMaaling([{ startStop: true, udenStart: true, minutes: 60 }]);
er("uden start: intet målt", udenStart.maalt, null);
er("uden start: ingen forskel at regne", udenStart.forskel, null);
er("uden start: markeret", udenStart.bemaerk, ["ingen start registreret"]);

// Kom frem via skrivekøen.
er("sendt senere begge veje",
  opsummerMaaling([{ startStop: true, minutes: 40, maalt: 40, afstandStart: 5, afstandSlut: 5, startSendtSent: true, stopSendtSent: true }]).bemaerk,
  ["start sendt senere", "afslutning sendt senere"]);

// To medarbejdere på samme opgave: tiderne lægges sammen, markeringer slås sammen.
const to = opsummerMaaling([
  { startStop: true, minutes: 60, maalt: 40, afstandStart: 10, afstandSlut: 10 },
  { startStop: true, minutes: 40, maalt: 40, afstandStart: null, afstandSlut: 12 },
  { minutes: 15, empId: "planner" },  // gammel post tælles ikke med
]);
er("to: målt i alt", to.maalt, 80);
er("to: registreret i alt", to.registreret, 100);
er("to: forskel", to.forskel, 20);
er("to: markeringer", to.bemaerk, ["startet uden position"]);

// Automatisk start noteres.
er("automatisk",
  opsummerMaaling([{ startStop: true, minutes: 30, maalt: 30, afstandStart: 5, afstandSlut: 5, automatisk: true }]).automatisk, true);

// Afstande læses som mennesker læser dem.
er("meter", formatAfstand(42), "42 m");
er("kilometer med komma", formatAfstand(3400), "3,4 km");
er("hele kilometer", formatAfstand(12000), "12 km");
er("ukendt", formatAfstand(null), "ukendt");

// ---- Stopuret i ugeplanen ----
const nu = new Date(2026, 8, 25, 12, 0).getTime();
const opg = { duration: 60, assignees: ["e1"], timeLog: [] };
er("intet registreret, intet koerende: intet ur", stopurStatus(opg, [], nu), null);
er("koerer inden for tiden: groen",
  stopurStatus(opg, [{ employee_id: "e1", startet: new Date(nu - 30 * 60000).toISOString() }], nu).farve, "groen");
er("koerer 90 min paa 60: roed",
  stopurStatus(opg, [{ employee_id: "e1", startet: new Date(nu - 90 * 60000).toISOString() }], nu).farve, "roed");
er("praecis som planlagt: intet ur",
  stopurStatus({ ...opg, timeLog: [{ minutes: 60, empId: "e1" }] }, [], nu), null);
er("over uden begrundelse: roed",
  stopurStatus({ ...opg, timeLog: [{ minutes: 80, empId: "e1" }] }, [], nu).farve, "roed");
er("over med begrundelse: orange",
  stopurStatus({ ...opg, timeLog: [{ minutes: 80, empId: "e1", note: "ekstra vinduer" }] }, [], nu).farve, "orange");
er("maalt 30, registreret 60 — som planlagt, men roed",
  stopurStatus({ ...opg, timeLog: [{ minutes: 60, empId: "e1", startStop: true, maalt: 30, afstandStart: 5, afstandSlut: 5, note: "x" }] }, [], nu).farve, "roed");
er("afsluttet langt vaek: roed",
  stopurStatus({ ...opg, timeLog: [{ minutes: 60, empId: "e1", startStop: true, maalt: 60, afstandStart: 5, afstandSlut: 4000 }] }, [], nu).farve, "roed");
er("oplaering taeller ikke som overforbrug",
  stopurStatus({ ...opg, assignees: ["e1", "e2"], oplaeringMedarbejdere: ["e2"],
    timeLog: [{ minutes: 60, empId: "e1" }, { minutes: 60, empId: "e2" }] }, [], nu), null);

console.log(fejl ? `\nTidsmåling: ${fejl} fejlede, ${ok} i orden.` : `Tidsmåling: ${ok} kontroller i orden.`);
process.exit(fejl ? 1 : 0);
