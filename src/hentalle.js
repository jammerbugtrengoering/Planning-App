// Henter ALLE rækker fra en tabel.
//
// PostgREST returnerer højst 1000 rækker pr. kald, og uden eksplicit sortering er
// det en VILKÅRLIG delmængde, der kan variere fra indlæsning til indlæsning. Med
// 2500+ opgaver betød det, at planlæggeren kun så ca. 40 % af data — og ikke de
// samme 40 % hver gang. Derfor hentes der i sider, sorteret stabilt på id.
//
// 16.9.2026: siderne hentes nu PÅ ÉN GANG i stedet for efter hinanden. Med godt
// 10.000 opgaver var det elleve hentninger, der hver ventede på den forrige, og
// ventetiden lagde sig oven i hinanden — så opstarten blev langsommere for hver
// aftale, kontoret oprettede. Nu spørges der først om antallet, og så hentes alle
// siderne samtidig.
//
// Prisen er, at siderne læses på lidt forskellige tidspunkter. Bliver en række
// oprettet eller slettemarkeret imens, kan den samme række nå at komme med to
// gange — eller i værste fald smutte. Derfor:
//   1. dubletter fjernes på id
//   2. antallet kontrolleres mod det, databasen sagde
//   3. passer det ikke, hentes det hele om ad den gamle, sekventielle vej
//
// Den gamle vej er stadig derinde og har stadig det sidste ord. Et hurtigt svar,
// der mangler en opgave, er værre end et langsomt, der ikke gør: en opgave, der
// ikke er hentet, findes ikke for planlæggeren — hun ser en tom plads i ugeplanen
// og lægger noget andet ind oveni.
//
// Ændrer du noget her, så ret hentalle.test.mjs i samme ombæring.

export const SIDE_STOERRELSE = 1000;

export async function hentSekventielt(supabase, table, columns, filter, log = console) {
  let from = 0;
  // Efter id og ikke en liste: ogsaa den sekventielle vej kan faa den samme raekke
  // to gange. Bliver en raekke slettemarkeret mellem to sider, rykker de oevrige en
  // plads frem, og den, der stod paa graensen, kommer med igen. Det var ikke et
  // problem, saa laenge hentningen bare skulle vaere hel — men en dublet i
  // ugeplanen er en opgave, der ser ud til at skulle koeres to gange.
  const efterId = new Map();
  for (;;) {
    let query = supabase
      .from(table).select(columns).order("id", { ascending: true })
      .range(from, from + SIDE_STOERRELSE - 1);
    if (filter) query = filter(query);
    const { data, error } = await query;
    if (error) {
      log.error(`hentSekventielt(${table}) fejlede:`, error.message);
      break;
    }
    if (!data || data.length === 0) break;
    data.forEach((raekke) => efterId.set(raekke.id, raekke));
    if (data.length < SIDE_STOERRELSE) break;
    from += SIDE_STOERRELSE;
  }
  return [...efterId.values()];
}

export async function hentAlleRaekker(supabase, table, columns = "*", filter = null, log = console) {
  // Hvor mange er der? head: true henter kun tallet, ikke rækkerne.
  let antal = null;
  try {
    let taeller = supabase.from(table).select(columns, { count: "exact", head: true });
    if (filter) taeller = filter(taeller);
    const { count, error } = await taeller;
    if (!error && typeof count === "number") antal = count;
  } catch (e) {
    log.warn(`hentAlleRaekker(${table}): kunne ikke tælle —`, String((e && e.message) || e));
  }

  // Kender vi ikke antallet, er der ingen sider at fordele. Så går vi den gamle vej.
  if (antal === null) return hentSekventielt(supabase, table, columns, filter, log);
  if (antal === 0) return [];

  const sider = Math.ceil(antal / SIDE_STOERRELSE);
  const svar = await Promise.all(
    Array.from({ length: sider }, (_, i) => {
      let query = supabase
        .from(table).select(columns).order("id", { ascending: true })
        .range(i * SIDE_STOERRELSE, (i + 1) * SIDE_STOERRELSE - 1);
      if (filter) query = filter(query);
      return query;
    }),
  );

  const fejlet = svar.find((r) => r && r.error);
  if (fejlet) {
    log.error(`hentAlleRaekker(${table}) fejlede:`, fejlet.error.message);
    return hentSekventielt(supabase, table, columns, filter, log);
  }

  const efterId = new Map();
  svar.forEach((r) => (r.data || []).forEach((raekke) => efterId.set(raekke.id, raekke)));
  const raekker = [...efterId.values()];

  // Færre end databasen sagde? Så er noget skredet undervejs, og vi tager den
  // sikre vej. Flere end forventet er ikke et problem — det er nye rækker, og
  // dubletter er allerede væk.
  if (raekker.length < antal) {
    log.warn(`hentAlleRaekker(${table}): fik ${raekker.length} af ${antal} — henter forfra sekventielt`);
    return hentSekventielt(supabase, table, columns, filter, log);
  }
  return raekker;
}
