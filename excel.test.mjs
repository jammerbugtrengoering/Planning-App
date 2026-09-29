// Proever den lille Excel-skriver (src/excel.js). Koeres af «npm run build».
import { lavXlsx, crc32, kolonneNavn } from "./src/excel.js";
import { writeFileSync } from "node:fs";

let ok = 0, fejl = 0;
function er(navn, faktisk, forventet) {
  const a = JSON.stringify(faktisk), b = JSON.stringify(forventet);
  if (a === b) ok++; else { fejl++; console.error(`FEJL ${navn}: fik ${a}, ventede ${b}`); }
}

er("crc32 kendt vaerdi", crc32(new TextEncoder().encode("123456789")), 0xCBF43926);
er("kolonne A", kolonneNavn(0), "A");
er("kolonne Z", kolonneNavn(25), "Z");
er("kolonne AA", kolonneNavn(26), "AA");
const fil = lavXlsx("September 2026", [["Kunde", "Timer"], ["Æble & Pære <ApS>", 1.5], ["", 2]]);
er("zip starter med PK", [fil[0], fil[1]], [0x50, 0x4B]);
if (process.env.EXCEL_UD) writeFileSync(process.env.EXCEL_UD, fil);

console.log(fejl ? `\nExcel: ${fejl} fejlede, ${ok} i orden.` : `Excel: ${ok} kontroller i orden.`);
process.exit(fejl ? 1 : 0);
