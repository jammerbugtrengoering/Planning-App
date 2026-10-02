// Prøver opsummeringen af start/stop-målinger (Kundetimer).
//
// Det, der ikke må gå galt: en ren registrering må ikke få en markering, og en
// registrering, der er rettet op i forhold til det målte, må ikke gå under radaren.
import { opsummerMaaling, formatAfstand, LANGT_VAEK_M, stopurStatus, startSlutLinjer } from "./src/tidsmaaling.js";

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

// 29.9.2026: afslutning langt vaek skal ses ogsaa uden start, og tidspunkterne skal vises.
const udenStartVaek = opsummerMaaling([{ startStop: true, udenStart: true, minutes: 60, afstandSlut: 5358 }]);
er("uden start, afsluttet 5,4 km vaek: begge markeret", udenStartVaek.bemaerk,
  ["ingen start registreret", "afsluttet 5,4 km fra adressen"]);
er("uden start, afsluttet 5,4 km vaek: roed",
  stopurStatus({ ...opg, timeLog: [{ minutes: 60, empId: "e1", startStop: true, udenStart: true, afstandSlut: 5358 }] }, [], nu).farve, "roed");
const stop = Date.UTC(2026, 8, 29, 5, 31);   // 07:31 dansk sommertid
const linjer = startSlutLinjer([{ startStop: true, udenStart: true, minutes: 60, empId: "e1", stop, afstandSlut: 5358 }]);
er("linje: ingen start", linjer[0].start, "Ingen start");
er("linje: afsluttet kl. og afstand", linjer[0].slut, "Afsluttet kl. 07.31 · 5,4 km fra adressen");
er("linje: langt vaek", linjer[0].vaekSlut, true);
const sys = startSlutLinjer([{ startStop: true, minutes: 60, empId: "e1", start: Date.UTC(2026, 8, 29, 5, 0), stop, startetAfSystem: true, afstandSlut: 20 }]);
er("linje: startet af systemet", sys[0].start, "Startet kl. 07.00 af systemet");
er("systemstart markeres", opsummerMaaling([{ startStop: true, minutes: 31, maalt: 31, startetAfSystem: true, afstandStart: null, afstandSlut: 20 }]).bemaerk,
  ["startet af systemet"]);
er("koerende systemstart vises i teksten",
  stopurStatus(opg, [{ employee_id: "e1", startet: new Date(nu - 5 * 60000).toISOString(), kilde: "system" }], nu).tekst.includes("startet af systemet"), true);

console.log(fejl ? `\nTidsmåling: ${fejl} fejlede, ${ok} i orden.` : `Tidsmåling: ${ok} kontroller i orden.`);
process.exit(fejl ? 1 : 0);// Tolerance (2.10.2026): 56 min tilpasset til 60 er ikke «registreret mere end målt».
{
  const m = opsummerMaaling([{ startStop: true, minutes: 60, maalt: 56, afstandStart: 10, afstandSlut: 10, tilpasset: { fra: 56, tolerance: 5 } }]);
  er("tilpasset: forskel mod målt regnes på det indtastede", m.forskel, 0);
}


