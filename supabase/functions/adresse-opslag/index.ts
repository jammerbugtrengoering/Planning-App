import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Adresseopslag for planlaegningsappen og Worklist (2.10.2026).
//
// Hvorfor den findes: DAWA (api.dataforsyningen.dk/adresser...) blev lukket og svarer
// 410 Gone paa ALLE opslag. Appene kaldte DAWA direkte fra browseren, saa adressefeltet
// gav ingen forslag, og Worklist kunne ikke finde opgavens adresse til start/stop.
//
// Nu gaar alle opslag herigennem, saa en ny kilde kun skal skiftes ét sted:
//   1. GSearch (Dataforsyningens afloeser for DAWA) — kun hvis secret
//      DATAFORSYNINGEN_TOKEN er sat. Den laver Jonn selv paa dataforsyningen.dk.
//   2. Ellers OpenRouteService (ORS_API_KEY findes allerede til ruteberegning).
//
// Svaret har samme form som DAWA's autocomplete, saa appene skulle kun skifte kaldet:
//   { forslag: [{ tekst, adresse: { id, x (laengde), y (bredde), vejnavn, husnr, postnr,
//     postnrnavn } }], kilde: "gsearch" | "ors" }
// Worklists stolPaaOpslag (src/startstop.js) laeser vejnavn/husnr/postnr.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ORS_API_KEY = Deno.env.get("ORS_API_KEY") ?? "";
const GS_TOKEN = Deno.env.get("DATAFORSYNINGEN_TOKEN") ?? "";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const svar = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

type Adresse = { id: string; x: number | null; y: number | null; vejnavn: string; husnr: string; postnr: string; postnrnavn: string };
type Forslag = { tekst: string; adresse: Adresse; kilde: string };

// ORS (OpenStreetMap) kender postnummeret, men ikke postdistriktets navn: den skriver
// «Jammerbugt» eller «Løkken», hvor adressen hedder 9700 Brønderslev eller 9492 Blokhus.
// Navnene her er de officielle postdistrikter i Nordjylland og de stoerste byer.
// Mangler et nummer, bruges ORS' eget bynavn.
const POSTDISTRIKT: Record<string, string> = {
  "9000": "Aalborg", "9200": "Aalborg SV", "9210": "Aalborg SØ", "9220": "Aalborg Øst", "9230": "Svenstrup J",
  "9240": "Nibe", "9260": "Gistrup", "9270": "Klarup", "9280": "Storvorde", "9293": "Kongerslev",
  "9300": "Sæby", "9310": "Vodskov", "9320": "Hjallerup", "9330": "Dronninglund", "9340": "Asaa",
  "9352": "Dybvad", "9362": "Gandrup", "9370": "Hals", "9380": "Vestbjerg", "9381": "Sulsted",
  "9382": "Tylstrup", "9400": "Nørresundby", "9430": "Vadum", "9440": "Aabybro", "9460": "Brovst",
  "9480": "Løkken", "9490": "Pandrup", "9492": "Blokhus", "9493": "Saltum", "9500": "Hobro",
  "9510": "Arden", "9520": "Skørping", "9530": "Støvring", "9541": "Suldrup", "9550": "Mariager",
  "9560": "Hadsund", "9574": "Bælum", "9575": "Terndrup", "9600": "Aars", "9610": "Nørager",
  "9620": "Aalestrup", "9631": "Gedsted", "9632": "Møldrup", "9640": "Farsø", "9670": "Løgstør",
  "9681": "Ranum", "9690": "Fjerritslev", "9700": "Brønderslev", "9740": "Jerslev J", "9750": "Østervrå",
  "9760": "Vrå", "9800": "Hjørring", "9830": "Tårs", "9850": "Hirtshals", "9870": "Sindal",
  "9881": "Bindslev", "9900": "Frederikshavn", "9940": "Læsø", "9970": "Strandby", "9981": "Jerup",
  "9982": "Ålbæk", "9990": "Skagen", "7700": "Thisted", "7730": "Hanstholm", "7741": "Frøstrup",
  "7742": "Vesløs", "8000": "Aarhus C", "8800": "Viborg", "5000": "Odense C", "7100": "Vejle",
};

// Foerste koordinatpar i en GeoJSON-geometri, uanset om det er Point eller MultiPoint.
function foerstePunkt(g: any): [number, number] | null {
  let c = g?.coordinates;
  while (Array.isArray(c) && Array.isArray(c[0])) c = c[0];
  return Array.isArray(c) && c.length >= 2 && Number.isFinite(c[0]) && Number.isFinite(c[1]) ? [c[0], c[1]] : null;
}

async function gsearch(q: string, antal: number): Promise<Forslag[] | null> {
  if (!GS_TOKEN) return null;
  try {
    const url = "https://api.dataforsyningen.dk/rest/gsearch/v2.0/adresse?q=" + encodeURIComponent(q)
      + "&limit=" + antal + "&srid=4326&token=" + encodeURIComponent(GS_TOKEN);
    // Uden «identity» knaekker Deno paa svaret («unexpected end of file») — maalt.
    const r = await fetch(url, { headers: { "Accept-Encoding": "identity" } });
    if (!r.ok) return null;
    const d = await r.json();
    if (!Array.isArray(d)) return null;
    return d.map((a: any) => {
      const p = foerstePunkt(a.geometri ?? a.geometry);
      return {
        tekst: String(a.visningstekst ?? "").trim(),
        adresse: {
          id: String(a.id ?? a.visningstekst ?? ""), x: p ? p[0] : null, y: p ? p[1] : null,
          vejnavn: String(a.vejnavn ?? ""), husnr: String(a.husnummer ?? a.husnr ?? ""),
          postnr: String(a.postnummer ?? a.postnr ?? ""), postnrnavn: String(a.postnummernavn ?? a.postnrnavn ?? ""),
        },
        kilde: "gsearch",
      };
    }).filter((f: Forslag) => f.tekst);
  } catch { return null; }
}

// ORS skriver «Guldstjernevej 18, Brønderslev, DK». Vi bygger selv teksten i den
// danske form «Guldstjernevej 18, 9700 Brønderslev», saa den ligner det, folk skriver.
function orsBy(p: any): string {
  return POSTDISTRIKT[String(p.postalcode ?? "")] ?? p.locality ?? p.localadmin ?? p.county ?? "";
}
function orsTekst(p: any): string {
  const vej = [p.street, p.housenumber].filter(Boolean).join(" ");
  const by = [p.postalcode, orsBy(p)].filter(Boolean).join(" ");
  if (vej && by) return vej + ", " + by;
  return String(p.label ?? "").replace(/,\s*(DK|Danmark|Denmark)$/i, "");
}

// Fokus paa firmaets omraade (Aabybro/Jammerbugt), saa «Guldstjernevej 7» giver den i
// 9700 og ikke den i Roskilde. Det er en vaegtning, ikke et filter.
const FOKUS = "&focus.point.lat=57.16&focus.point.lon=9.73";

// Folk skriver «Guldstjernevej 18, V. Hjermitslev, 9700 Brønderslev». ORS finder
// intet med det supplerende bynavn med, saa der spoerges paa «vej nr, postnr».
function delAdresse(q: string): { vej: string; postnr: string } {
  const vej = q.split(",")[0].trim();
  const postnr = (q.match(/\b(\d{4})\b(?!.*\b\d{4}\b)/) ?? [])[1] ?? "";
  return { vej: vej.replace(/\b\d{4}\b.*$/, "").trim() || vej, postnr };
}

function orsForslag(d: any): Forslag[] {
  const set = new Set<string>();
  return (d?.features ?? []).map((f: any) => {
    const p = foerstePunkt(f.geometry);
    const pr = f.properties ?? {};
    return {
      tekst: orsTekst(pr),
      adresse: {
        id: String(pr.gid ?? pr.id ?? ""), x: p ? p[0] : null, y: p ? p[1] : null,
        vejnavn: String(pr.street ?? ""), husnr: String(pr.housenumber ?? ""),
        postnr: String(pr.postalcode ?? ""), postnrnavn: String(orsBy(pr)),
      },
      kilde: "ors",
    };
  }).filter((f: Forslag) => f.tekst && f.adresse.vejnavn && !set.has(f.tekst) && set.add(f.tekst));
}

async function orsKald(ep: string, tekst: string, antal: number): Promise<Forslag[] | null> {
  const url = "https://api.openrouteservice.org/geocode/" + ep + "?api_key=" + encodeURIComponent(ORS_API_KEY)
    + "&text=" + encodeURIComponent(tekst) + "&boundary.country=DK&layers=address&size=" + antal + FOKUS;
  const r = await fetch(url);
  if (!r.ok) return null;
  return orsForslag(await r.json());
}

async function ors(q: string, antal: number): Promise<Forslag[] | null> {
  if (!ORS_API_KEY) return null;
  try {
    const { vej, postnr } = delAdresse(q);
    const tekst = postnr ? vej + ", " + postnr : vej;
    let liste = await orsKald("autocomplete", tekst, antal);
    if (liste === null) return null;
    // Kender vi postnummeret og ramte autocomplete ikke, er «search» bedre til hele adresser.
    if (postnr && !liste.some((f) => f.adresse.postnr === postnr)) {
      const s = await orsKald("search", tekst, antal);
      if (s && s.length) liste = s;
    }
    if (postnr) liste.sort((a, b) => Number(b.adresse.postnr === postnr) - Number(a.adresse.postnr === postnr));
    return liste.slice(0, antal);
  } catch { return null; }
}

// Afstand i km fra firmaets omraade (FOKUS). Bruges kun til at sortere.
function kmFraFokus(f: Forslag): number {
  const { x, y } = f.adresse;
  if (x == null || y == null) return 9999;
  const dLat = (y - 57.16) * 111, dLon = (x - 9.73) * 111 * Math.cos(57.16 * Math.PI / 180);
  return Math.sqrt(dLat * dLat + dLon * dLon);
}

// Registret (GSearch) foerst. Det har ingen vaegtning efter sted, saa «Guldstjernevej 7»
// giver den i Vestbjerg foerst og «Østerg» en plads i Glamsbjerg — maalt 2.10.2026.
// Derfor hentes flere svar, og de sorteres: skrevet postnummer foerst, saa naermest
// Aabybro. Finder registret intet i naerheden, og er der intet postnummer skrevet,
// bruges ORS' forslag (som er vaegtet efter sted) foran.
// Finder registret intet med hele teksten («Passagen 43,3.sal,9440 Aabybro»), proeves
// igen med «vej nr, postnr».
async function slaaOp(q: string, antal: number): Promise<Forslag[] | null> {
  const { vej, postnr } = delAdresse(q);
  let gs = await gsearch(q, 20);
  if (gs && !gs.length && (vej + (postnr ? ", " + postnr : "")) !== q) gs = await gsearch(postnr ? vej + ", " + postnr : vej, 20);
  if (gs && gs.length) {
    gs.sort((a, b) => (Number(b.adresse.postnr === postnr) - Number(a.adresse.postnr === postnr)) || (kmFraFokus(a) - kmFraFokus(b)));
    const naer = gs.some((f) => kmFraFokus(f) < 60);
    if (!postnr && !naer) {
      const o = (await ors(q, antal)) ?? [];
      const set = new Set(o.map((f) => f.tekst));
      return [...o.filter((f) => kmFraFokus(f) < 60), ...gs.filter((f) => !set.has(f.tekst))].slice(0, antal);
    }
    return gs.slice(0, antal);
  }
  return await ors(q, antal);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    // Kun indloggede brugere — ellers kunne alle bruge vores ORS-kvote.
    const jwt = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: { user } } = await admin.auth.getUser(jwt);
    if (!user) return svar({ error: "ikke_logget_ind" }, 401);

    const b = await req.json().catch(() => ({}));
    const q = String(b.q ?? "").trim().slice(0, 200);
    const antal = Math.min(Math.max(Number(b.antal) || 6, 1), 10);
    if (q.length < 3) return svar({ forslag: [], kilde: null });

    const forslag = await slaaOp(q, antal);
    if (forslag) return svar({ forslag, kilde: forslag[0]?.kilde ?? (GS_TOKEN ? "gsearch" : "ors") });
    return svar({ error: "intet_register_svarede" }, 502);
  } catch (e) {
    return svar({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
