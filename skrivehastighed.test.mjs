// Vaern mod en fejl i hastighed: at gemme en aftale maa ikke tage tid i kvadrat.
// Koeres ved hvert build.
//
// 4.10.2026 tog det over et minut at gemme en aftale. Aarsagen var ikke databasen, men
// `efter.filter((i) => !foer.find((c) => c.id === i.id))` — n gange n sammenligninger
// pr. uge, og en aftale gennemgaar op til 104 uger. Med 18.500 opgaver stod browseren
// stille i cirka 70 sekunder, og tiden steg med kvadratet af antal aftaler.
//
// Testen laeser kildeteksten, fordi funktionen ligger i App.jsx og ikke kan importeres.
import { readFileSync } from "node:fs";

const kilde = readFileSync(new URL("./src/App.jsx", import.meta.url), "utf8");
let fejl = 0;
function kraev(hvad, ok) { if (!ok) { fejl++; console.error(`  ✗ ${hvad}`); } }

kraev("ingen opgave-liste maa soeges igennem med .find paa id inde i et filter (brug nyeOpgaver)",
  !/\.filter\(\(\w+\) => !\w+\.find\(\(\w+\) => \w+\.id === \w+\.id\)\)/.test(kilde));
kraev("nyeOpgaver findes", /function nyeOpgaver\(efter, foer\)/.test(kilde));
kraev("nyeOpgaver slaar op i et Set", /function nyeOpgaver[\s\S]{0,200}new Set\(/.test(kilde));
kraev("ensureWeekInstances bruger pladsIndeks og ikke findIndex over hele listen",
  /pladsIndeks\.get\(/.test(kilde) && !/list\.findIndex\(\(i\) => i\.templateId === tpl\.id/.test(kilde));

// Maaling: samme arbejde som en aftale paa to aar, med lige saa mange opgaver som i dag.
const N = 20000, UGER = 104;
const kendte = Array.from({ length: N }, (_, i) => ({ id: "i" + i }));
const t0 = performance.now();
for (let u = 0; u < UGER; u++) {
  const kendt = new Set(kendte.map((i) => i.id));
  [...kendte, { id: "ny" + u }].filter((i) => !kendt.has(i.id));
}
const ms = performance.now() - t0;
kraev(`104 uger med ${N} opgaver skal tage under 3 sekunder (tog ${ms.toFixed(0)} ms)`, ms < 3000);

if (fejl) throw new Error(`Skrivehastighed: ${fejl} fejl`);
console.log("Skrivehastighed: kontroller i orden.");
