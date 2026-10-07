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

// Adressen som nøgle: samme adresse skal ramme samme linje, uanset store/små bogstaver og mellemrum («Rantzausvej 12,  9460 Brovst»).
export function adresseNoegle(adresse) {
  return String(adresse || "").toLowerCase().replace(/\s+/g, " ").replace(/\s*,\s*/g, ", ").trim();
}

function saml(opgaver, { beregn, datoAf, segment = "alle", aar = "alle" }, noegleFor) {
  const pr = new Map();
  const tom = () => ({ antal: 0, minutter: 0, planlagtKr: 0, realiseretKr: 0 });
  const uden = tom();
  const ialt = tom();
  const laegTil = (m, b) => { m.antal += 1; m.minutter += b.minutter; m.planlagtKr += b.planlagtKr; m.realiseretKr += b.realiseretKr; };
  for (const t of opgaver) {
    if (segment !== "alle" && (t.contractType || t.contract_type || "privat") !== segment) continue;
    if (aar !== "alle" && String(datoAf(t) || "").slice(0, 4) !== String(aar)) continue;
    const b = beregn(t);
    laegTil(ialt, b);
    const adr = t.address || t.address_text;
    const p = postnrFraAdresse(adr);
    const noegle = noegleFor(adr, p);
    if (!noegle) { laegTil(uden, b); continue; }
    let r = pr.get(noegle);
    if (!r) { r = { noegle, postnr: p ? p.postnr : "", by: p ? p.by : "", adresse: String(adr || "").trim(), ...tom() }; pr.set(noegle, r); }
    if (!r.by && p && p.by) r.by = p.by;
    laegTil(r, b);
  }
  const raekker = [...pr.values()].map((r) => ({ ...r, timer: r.minutter / 60 }));
  return { raekker, uden: { ...uden, timer: uden.minutter / 60 }, ialt: { ...ialt, timer: ialt.minutter / 60 } };
}

// opgaver: de opgaver, der må tælle med (kalderen afgør hvilke). beregn(t) -> { minutter, planlagtKr, realiseretKr }.
// segment: «alle» eller en aftaletype. aar: et årstal eller «alle». datoAf(t) -> «YYYY-MM-DD».
// Opgaver uden postnummer tælles for sig (uden) og med i ialt.
export function samlPrPostnr(opgaver, opts) {
  const res = saml(opgaver, opts, (adr, p) => (p ? p.postnr : null));
  return { ...res, raekker: res.raekker.map((r) => ({ ...r, adresse: "" })) };
}

// Samme tal pr. adresse. En opgave uden adresse tælles under «uden». Adressen kan godt mangle postnummeret og står så stadig på kortet, hvis den er slået op.
export function samlPrAdresse(opgaver, opts) {
  return saml(opgaver, opts, (adr) => adresseNoegle(adr) || null);
}

// Koordinater pr. adresse ud fra de ruter, der allerede er slået op. Medianen, hvis samme adresse står i flere ruter (og dermed er slået op flere gange).
export function adresseKoordinater(ruter) {
  const samlet = new Map();
  const tag = (adr, lat, lng) => {
    const k = adresseNoegle(adr);
    if (!k || lat == null || lng == null || !Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) return;
    if (!samlet.has(k)) samlet.set(k, { lat: [], lng: [] });
    const s = samlet.get(k);
    s.lat.push(Number(lat)); s.lng.push(Number(lng));
  };
  for (const r of ruter || []) { tag(r.addr_a, r.lat_a, r.lng_a); tag(r.addr_b, r.lat_b, r.lng_b); }
  const ud = {};
  for (const [k, s] of samlet) ud[k] = { lat: median(s.lat), lng: median(s.lng) };
  return ud;
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
