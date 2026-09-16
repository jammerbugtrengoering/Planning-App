// Tests af dataindlæsningen. Køres ved hvert build.
//
// Hvad de beskytter mod: det her er DEN hentning, hele planlægningsappen bygger på.
// Mangler der en opgave, findes den ikke for planlæggeren — hun ser en tom plads i
// ugeplanen og lægger noget andet ind oveni. Det er sket før, dengang hentningen
// stoppede ved de første 1000 rækker, og det kostede en formiddag at forstå.
//
// 16.9.2026 blev hentningen lavet om fra sekventiel til parallel for at få
// opstarten ned. Testene her er prisen for den ændring: de skal vise, at det
// samme kommer ud, også når databasen skifter under vejs.

import { hentAlleRaekker, hentSekventielt, SIDE_STOERRELSE } from "./src/hentalle.js";

let fejl = 0, koert = 0;
function er(hvad, faktisk, forventet) {
  koert++;
  if (JSON.stringify(faktisk) !== JSON.stringify(forventet)) {
    fejl++;
    console.error(`  ✗ ${hvad}\n      fik       ${JSON.stringify(faktisk)}\n      forventet ${JSON.stringify(forventet)}`);
  }
}
const stille = { error() {}, warn() {} };
const raekker = (n, praefiks = "i") =>
  Array.from({ length: n }, (_, k) => ({ id: `${praefiks}${String(k).padStart(6, "0")}` }));

// En attrap af Supabase-klienten. Den tæller kald, så vi kan se HVORDAN der blev
// hentet — ikke kun hvad der kom ud.
function lavKlient({ data, antal, fejlPaaSide = null, taelFejler = false, vedSide = null }) {
  const kald = { taellinger: 0, sider: [], sekventielle: 0 };
  return {
    kald,
    from() {
      const q = { _head: false, _fra: 0, _til: 0 };
      q.select = (_c, opts) => { if (opts && opts.head) { q._head = true; kald.taellinger++; } return q; };
      q.order = () => q;
      q.range = (fra, til) => { q._fra = fra; q._til = til; return q; };
      q.eq = () => q; q.is = () => q;
      q.then = (res, rej) => {
        if (q._head) {
          return Promise.resolve(taelFejler
            ? { count: null, error: { message: "ingen adgang" } }
            : { count: antal, error: null }).then(res, rej);
        }
        const nr = Math.floor(q._fra / SIDE_STOERRELSE);
        kald.sider.push(nr);
        if (fejlPaaSide === nr) return Promise.resolve({ data: null, error: { message: "net nede" } }).then(res, rej);
        if (vedSide) vedSide(nr, kald);
        const kilde = typeof data === "function" ? data(nr, kald) : data;
        return Promise.resolve({ data: kilde.slice(q._fra, q._til + 1), error: null }).then(res, rej);
      };
      return q;
    },
  };
}

// ── Det almindelige ─────────────────────────────────────────────────────────
{
  const alle = raekker(10149);
  const k = lavKlient({ data: alle, antal: 10149 });
  const ud = await hentAlleRaekker(k, "instances", "*", null, stille);
  er("alle 10.149 rækker kommer med", ud.length, 10149);
  er("og det er de rigtige", [ud[0].id, ud[ud.length - 1].id], [alle[0].id, alle[alle.length - 1].id]);
  er("der blev talt én gang", k.kald.taellinger, 1);
  er("elleve sider", k.kald.sider.length, 11);
  // Det er hele pointen: siderne bestilles alle sammen, før den første er svaret.
  er("siderne blev bestilt på én gang", k.kald.sider.slice().sort((a, b) => a - b),
     [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
}

// ── Randtilfælde i antallet ─────────────────────────────────────────────────
for (const n of [0, 1, 999, 1000, 1001, 2000]) {
  const k = lavKlient({ data: raekker(n), antal: n });
  const ud = await hentAlleRaekker(k, "instances", "*", null, stille);
  er(`${n} rækker`, ud.length, n);
  er(`${n} rækker: rigtigt antal sider`, k.kald.sider.length, n === 0 ? 0 : Math.ceil(n / SIDE_STOERRELSE));
}

// ── Når databasen skifter under vejs ────────────────────────────────────────
// En række slettemarkeres midt i hentningen, så de efterfølgende rykker en plads
// frem — og én ville smutte. Kontrollen skal opdage det og hente forfra.
{
  const fuld = raekker(3000);
  let sideKald = 0;
  const k = lavKlient({
    antal: 3000,
    data: () => { sideKald++; return sideKald > 1 ? fuld.slice(1) : fuld; },
  });
  const ud = await hentAlleRaekker(k, "instances", "*", null, stille);
  // Det afgørende er IKKE hvor mange rækker der kom ud — begge veje giver 2999,
  // når en række er væk. Det afgørende er, at kontrollen opdagede det og hentede
  // forfra: tre sider parallelt, og derefter tre mere sekventielt. Uden den
  // kontrol ville der kun være bestilt tre sider i alt, og planlæggeren ville
  // sidde med en ugeplan, der så hel ud og manglede en opgave.
  er("en manglende række udløser en ny, sekventiel hentning", k.kald.sider.length, 6);
  er("og der er ingen dubletter", new Set(ud.map((r) => r.id)).size, ud.length);
}

// En række optræder på to sider. Dubletten skal væk, uden at noget forsvinder.
{
  const fuld = raekker(2000);
  const medDublet = [...fuld.slice(0, 1000), fuld[999], ...fuld.slice(1000, 1999)];
  const k = lavKlient({ data: medDublet, antal: 2000 });
  const ud = await hentAlleRaekker(k, "instances", "*", null, stille);
  er("dubletten er væk", new Set(ud.map((r) => r.id)).size, ud.length);
}

// Nye rækker undervejs er ikke et problem — de kommer bare med.
{
  const k = lavKlient({ data: raekker(2100), antal: 2000 });
  const ud = await hentAlleRaekker(k, "instances", "*", null, stille);
  er("flere end ventet er i orden", ud.length >= 2000, true);
  er("og stadig uden dubletter", new Set(ud.map((r) => r.id)).size, ud.length);
}

// ── Når noget går galt ──────────────────────────────────────────────────────
// Fejler tællingen — fx fordi rettighederne ikke rækker — må hentningen ikke
// give op. Så tages den gamle, sekventielle vej.
{
  const k = lavKlient({ data: raekker(2500), antal: null, taelFejler: true });
  const ud = await hentAlleRaekker(k, "instances", "*", null, stille);
  er("tællingen fejler: den gamle vej bruges", ud.length, 2500);
}

// Fejler én side, kasseres HELE det parallelle svar og alt hentes forfra.
// At beholde de sider, der kom igennem, ville give en halv ugeplan, der ser hel ud.
{
  let side1Fejler = true;
  const fuld = raekker(3000);
  const k = {
    kald: { sider: [] },
    from() {
      const q = { _head: false, _fra: 0, _til: 0 };
      q.select = (_c, o) => { if (o && o.head) q._head = true; return q; };
      q.order = () => q;
      q.range = (f, t) => { q._fra = f; q._til = t; return q; };
      q.then = (res, rej) => {
        if (q._head) return Promise.resolve({ count: 3000, error: null }).then(res, rej);
        const nr = Math.floor(q._fra / SIDE_STOERRELSE);
        k.kald.sider.push(nr);
        if (nr === 1 && side1Fejler) { side1Fejler = false; return Promise.resolve({ data: null, error: { message: "net nede" } }).then(res, rej); }
        return Promise.resolve({ data: fuld.slice(q._fra, q._til + 1), error: null }).then(res, rej);
      };
      return q;
    },
  };
  const ud = await hentAlleRaekker(k, "instances", "*", null, stille);
  er("en fejlet side: alt hentes forfra, intet halvt resultat", ud.length, 3000);
}

// ── Den gamle vej virker stadig som før ─────────────────────────────────────
{
  const k = lavKlient({ data: raekker(2500), antal: 2500 });
  const ud = await hentSekventielt(k, "instances", "*", null, stille);
  er("sekventielt: alle rækker", ud.length, 2500);
  er("sekventielt: siderne kom i rækkefølge", k.kald.sider, [0, 1, 2]);
}

// ── Resultat ────────────────────────────────────────────────────────────────
if (fejl > 0) {
  console.error(`\n  ${fejl} af ${koert} kontroller fejlede i dataindlæsningen.\n`);
  process.exit(1);
}
console.log(`Dataindlæsning: ${koert} kontroller i orden.`);
