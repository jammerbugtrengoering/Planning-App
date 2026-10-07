// Nøgletal pr. postnummer (7.10.2026): den første rapport i nøgletalsrækken.
//
// Rent regnearbejde, uden React og uden kort, så det kan prøves i `postnummer.test.mjs`.
//
// Postnummeret står ikke i en kolonne på opgaven, men i adresseteksten («Rantzausvej 12, 9460 Brovst»), så det læses derfra.
// Findes der intet, tælles opgaven under «uden postnummer» og forsvinder ikke: et tal, der stille udelader 2 % af opgaverne, ville ellers ligne et rigtigt samlet tal.

const BOGSTAV = "A-Za-zÆØÅæøåÉéÜü";

// «Strandfogdensvej 70, Rødhus, 9490 Pandrup» -> { postnr: "9490", by: "Pandrup" }.
// Først et postnummer med bynavn til sidst; ellers det sidste fircifrede tal, der står for sig selv.
export function postnrFraAdresse(adresse) {
  const tekst = String(adresse || "").replace(/\s+/g, " ").trim();
  if (!tekst) return null;
  const m = tekst.match(new RegExp(`(?:^|[,\\s])([1-9]\\d{3})\\s+([${BOGSTAV}][${BOGSTAV} .\\-]*)$`));
  if (m) return { postnr: m[1], by: m[2].trim() };
  const alle = [...tekst.matchAll(/(?:^|[^\d])([1-9]\d{3})(?!\d)/g)];
  if (alle.length) return { postnr: alle[alle.length - 1][1], by: "" };
  return null;
}

export const MAAL = [
  { key: "antal", label: "Antal opgaver", enhed: "opgaver" },
  { key: "timer", label: "Planlagte timer", enhed: "timer" },
  { key: "planlagtKr", label: "Planlagt omsætning", enhed: "kr." },
  { key: "realiseretKr", label: "Realiseret omsætning", enhed: "kr." },
];

// opgaver: de opgaver, der må tælle med (kalderen afgør hvilke). beregn(t) -> { minutter, planlagtKr, realiseretKr }.
// segment: «alle» eller en aftaletype. aar: et årstal eller «alle». datoAf(t) -> «YYYY-MM-DD».
export function samlPrPostnr(opgaver, { beregn, datoAf, segment = "alle", aar = "alle" }) {
  const pr = new Map();
  const uden = { antal: 0, minutter: 0, planlagtKr: 0, realiseretKr: 0 };
  const ialt = { antal: 0, minutter: 0, planlagtKr: 0, realiseretKr: 0 };
  const laegTil = (m, b) => { m.antal += 1; m.minutter += b.minutter; m.planlagtKr += b.planlagtKr; m.realiseretKr += b.realiseretKr; };
  for (const t of opgaver) {
    if (segment !== "alle" && (t.contractType || t.contract_type || "privat") !== segment) continue;
    if (aar !== "alle" && String(datoAf(t) || "").slice(0, 4) !== String(aar)) continue;
    const b = beregn(t);
    laegTil(ialt, b);
    const p = postnrFraAdresse(t.address || t.address_text);
    if (!p) { laegTil(uden, b); continue; }
    let r = pr.get(p.postnr);
    if (!r) { r = { postnr: p.postnr, by: p.by, antal: 0, minutter: 0, planlagtKr: 0, realiseretKr: 0 }; pr.set(p.postnr, r); }
    if (!r.by && p.by) r.by = p.by;
    laegTil(r, b);
  }
  const raekker = [...pr.values()].map((r) => ({ ...r, timer: r.minutter / 60 }));
  return { raekker, uden: { ...uden, timer: uden.minutter / 60 }, ialt: { ...ialt, timer: ialt.minutter / 60 } };
}

function median(xs) {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// Midtpunkt pr. postnummer ud fra de adresser, der allerede er slået op (travel_overrides). Medianen og ikke gennemsnittet:
// en enkelt adresse, som reserven i geokoderen har gættet forkert (Viborg i stedet for Pandrup), skal ikke trække hele postnummeret væk.
export function centroider(ruter) {
  const samlet = new Map();
  const tag = (adr, lat, lng) => {
    const p = postnrFraAdresse(adr);
    // null skal ikke blive til koordinat 0 (Number(null) er 0), så et opslag uden svar ender ikke ud for Afrikas kyst.
    if (!p || lat == null || lng == null || !Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) return;
    if (!samlet.has(p.postnr)) samlet.set(p.postnr, { lat: [], lng: [] });
    const s = samlet.get(p.postnr);
    s.lat.push(Number(lat)); s.lng.push(Number(lng));
  };
  for (const r of ruter || []) { tag(r.addr_a, r.lat_a, r.lng_a); tag(r.addr_b, r.lat_b, r.lng_b); }
  const ud = {};
  for (const [postnr, s] of samlet) ud[postnr] = { lat: median(s.lat), lng: median(s.lng), n: s.lat.length };
  return ud;
}

// Varme: kvadratrod, så et postnummer med en tiendedel af toppen ikke forsvinder, og farven følger appens egen pink.
export function varmeAndel(v, max) { return max > 0 && v > 0 ? Math.min(1, Math.sqrt(v / max)) : 0; }
const FORBLEGET = [252, 228, 239];   // #FCE4EF
const HOVED = [214, 36, 122];        // #D6247A
const MOERK = [122, 17, 72];         // #7A1148
export function varmeFarve(andel) {
  const a = Math.max(0, Math.min(1, andel));
  const [fra, til, t] = a < 0.6 ? [FORBLEGET, HOVED, a / 0.6] : [HOVED, MOERK, (a - 0.6) / 0.4];
  const k = fra.map((c, i) => Math.round(c + (til[i] - c) * t));
  return "#" + k.map((c) => c.toString(16).padStart(2, "0")).join("");
}

export function vaerdi(r, maal) { return maal === "antal" ? r.antal : maal === "timer" ? r.timer : r[maal]; }
export function formatVaerdi(v, maal) {
  const n = Number(v) || 0;
  if (maal === "antal") return n.toLocaleString("da-DK");
  if (maal === "timer") return n.toLocaleString("da-DK", { maximumFractionDigits: 0 }) + " t";
  return Math.round(n).toLocaleString("da-DK") + " kr.";
}
