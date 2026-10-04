// Tests af realtime-bunkerne. Koeres ved hvert build.
//
// Hvad de beskytter mod: at en haendelse gaar tabt eller bliver anvendt i forkert
// raekkefoelge, naar de samles. En tabt sletning efterlader en opgave, der ikke findes;
// en tabt rettelse viser kollegaens aendring forkert, indtil nogen genindlaeser.
import { nyBunke, laegHaendelseIBunke, anvendBunke } from "./src/realtimebunke.js";

let fejl = 0, koert = 0;
function er(hvad, faktisk, forventet) {
  koert++;
  if (JSON.stringify(faktisk) !== JSON.stringify(forventet)) {
    fejl++;
    console.error(`  ✗ ${hvad}\n      fik       ${JSON.stringify(faktisk)}\n      forventet ${JSON.stringify(forventet)}`);
  }
}

const liste = [{ id: "a", status: "planlagt", lokalt: 1 }, { id: "b", status: "planlagt" }, { id: "c", status: "planlagt" }];

{ const b = nyBunke(); er("tom bunke giver samme liste", anvendBunke(liste, b) === liste, true); }

{ const b = nyBunke();
  laegHaendelseIBunke(b, "UPDATE", "a", { status: "udført" });
  er("en rettelse flettes ind og beholder lokale felter", anvendBunke(liste, b)[0], { id: "a", status: "udført", lokalt: 1 }); }

{ const b = nyBunke();
  laegHaendelseIBunke(b, "INSERT", "d", { id: "d", status: "ny" });
  er("en ny opgave lægges bagerst", anvendBunke(liste, b).map((t) => t.id), ["a", "b", "c", "d"]); }

{ const b = nyBunke();
  laegHaendelseIBunke(b, "DELETE", "b", null);
  er("en sletning fjerner opgaven", anvendBunke(liste, b).map((t) => t.id), ["a", "c"]); }

{ const b = nyBunke();
  laegHaendelseIBunke(b, "UPDATE", "b", { status: "udført" });
  laegHaendelseIBunke(b, "DELETE", "b", null);
  er("rettelse og så sletning: opgaven er væk", anvendBunke(liste, b).map((t) => t.id), ["a", "c"]); }

{ const b = nyBunke();
  laegHaendelseIBunke(b, "INSERT", "d", { id: "d", status: "ny", tid: "08:00" });
  laegHaendelseIBunke(b, "UPDATE", "d", { id: "d", status: "planlagt" });
  er("to hændelser på samme id flettes, den nyeste vinder", anvendBunke(liste, b).find((t) => t.id === "d"),
     { id: "d", status: "planlagt", tid: "08:00" }); }

{ const b = nyBunke();
  for (let i = 0; i < 100; i++) laegHaendelseIBunke(b, "INSERT", "n" + i, { id: "n" + i });
  er("100 nye opgaver giver 100 på listen, ikke dubletter", anvendBunke(liste, b).length, 103); }

{ const b = nyBunke(); laegHaendelseIBunke(b, "UPDATE", "a", { status: "x" });
  const foer = JSON.stringify(liste);
  anvendBunke(liste, b); anvendBunke(liste, b);
  er("rører ikke den gamle liste, og kan køres to gange (StrictMode)", JSON.stringify(liste), foer);
  er("anden kørsel giver samme resultat", anvendBunke(liste, b)[0].status, "x"); }

if (fejl > 0) { throw new Error(`${fejl} af ${koert} kontroller fejlede i realtimebunkerne.`); }
console.log(`Realtimebunker: ${koert} kontroller i orden.`);
