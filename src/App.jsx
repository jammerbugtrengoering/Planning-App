import React, { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { supabase } from "./supabaseClient";
import {
  Plus, Download, X, Clock, AlertTriangle,
  Trash2, Pencil, Repeat, Zap, CalendarClock, Wand2, Star, ChevronLeft, ChevronRight, ChevronUp, ChevronDown,
  ClipboardList, Video, CheckCircle2, LogIn, ListChecks, Check, Lock, Navigation, Building2, Car, Copy,
  Thermometer, Palmtree, Mail,
} from "lucide-react";

// ---------- Opgavenoter og billeder ----------
// Medarbejderne kan skrive kommentarer og tage billeder ude hos kunden. Noterne
// hentes samlet ved indlaesning og grupperes pr. opgave, saa hverken ugeplanen
// eller faktureringen skal slaa op i databasen for hver eneste linje.
function grupperNoter(raekker) {
  const kort = {};
  (raekker || []).forEach((n) => {
    if (!kort[n.instance_id]) kort[n.instance_id] = [];
    kort[n.instance_id].push(n);
  });
  return kort;
}

// Bucket'en er privat, fordi billederne er fra kundernes hjem. Der findes derfor
// ingen fast URL — den skal signeres og udloeber af sig selv efter en time.
async function signeredeFotoUrls(stier) {
  if (!stier || stier.length === 0) return {};
  const { data, error } = await supabase.storage.from("opgavefotos").createSignedUrls(stier, 3600);
  if (error) return {};
  const kort = {};
  (data || []).forEach((d, i) => { if (d?.signedUrl) kort[stier[i]] = d.signedUrl; });
  return kort;
}

// Viser medarbejdernes kommentarer og billeder. Bruges baade i banneret i ugeplanen
// og under fakturering, hvor beslutningen om at fakturere faktisk traeffes.
function OpgaveNoter({ noter, employees, tom, kompakt }) {
  const [urls, setUrls] = React.useState({});
  const stier = React.useMemo(
    () => (noter || []).flatMap((n) => n.photos || []),
    [noter],
  );
  React.useEffect(() => {
    let afbrudt = false;
    if (stier.length === 0) { setUrls({}); return; }
    signeredeFotoUrls(stier).then((kort) => { if (!afbrudt) setUrls(kort); });
    return () => { afbrudt = true; };
    // Sammensat noegle frem for selve listen: ellers ville en ny array-reference ved
    // hver render starte en ny signering, og billederne ville blinke.
  }, [stier.join("|")]);

  if (!noter || noter.length === 0) {
    return tom ? <div style={{ fontSize: 12, color: "#94A3B8", fontStyle: "italic" }}>{tom}</div> : null;
  }

  const hvemNaar = (n) => {
    const hvem = (employees || []).find((e) => e.id === n.employee_id)?.name || "Medarbejder";
    const naar = new Date(n.created_at).toLocaleString("da-DK", {
      day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit",
    });
    return `${hvem} · ${naar}`;
  };

  // I faktureringen ligger noterne inde i en tabel. Ét kort pr. notat gjorde raekken
  // fire gange saa hoej som selve fakturalinjen, og overblikket forsvandt. Kompakt
  // laegger derfor alt paa én linje der ombryder: tekster foerst, billeder til hoejre.
  if (kompakt) {
    const tekster = noter.filter((n) => n.text);
    const billeder = noter.flatMap((n) => (n.photos || []).map((sti) => ({ sti, n })));
    const slettede = noter.filter((n) => n.photos_deleted_at).length;
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        {tekster.map((n) => (
          <span key={n.id} title={hvemNaar(n)}
            style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, color: "#334155",
                     background: "#fff", border: "1px solid #E2E8F0", borderRadius: 999, padding: "3px 10px", cursor: "help" }}>
            <span style={{ opacity: 0.6 }}>{n.kind === "forgaeves" ? "🚫" : "💬"}</span>
            {n.text}
          </span>
        ))}
        {billeder.map(({ sti, n }) => (
          urls[sti]
            ? <a key={sti} href={urls[sti]} target="_blank" rel="noreferrer" title={hvemNaar(n)}>
                <img src={urls[sti]} alt="" style={{ width: 40, height: 40, objectFit: "cover", borderRadius: 5, border: "1px solid #E2E8F0", display: "block" }} />
              </a>
            : <div key={sti} style={{ width: 40, height: 40, borderRadius: 5, background: "#F1F5F9" }} />
        ))}
        {slettede > 0 && (
          <span style={{ fontSize: 11, color: "#94A3B8", fontStyle: "italic" }}>
            Billeder slettet efter 12 måneder
          </span>
        )}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {noter.map((n) => {
        const hvem = (employees || []).find((e) => e.id === n.employee_id)?.name || "Medarbejder";
        const tid = new Date(n.created_at).toLocaleString("da-DK", {
          day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit",
        });
        return (
          <div key={n.id} style={{ background: "#F8FAFC", border: "1px solid #F1F5F9", borderRadius: 8, padding: "8px 10px" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#94A3B8", display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
              {hvem} · {tid}
              {n.kind === "forgaeves" && (
                <span style={{ background: "#FEE2E2", color: "#B91C1C", borderRadius: 999, padding: "1px 7px", fontSize: 10, fontWeight: 800 }}>
                  Kom ikke ind
                </span>
              )}
            </div>
            {n.text && <div style={{ fontSize: 13, color: "#111111", lineHeight: 1.45, whiteSpace: "pre-wrap" }}>{n.text}</div>}
            {(n.photos || []).length > 0 && (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
                {(n.photos || []).map((sti) => (
                  urls[sti]
                    ? <a key={sti} href={urls[sti]} target="_blank" rel="noreferrer">
                        <img src={urls[sti]} alt="" style={{ width: 64, height: 64, objectFit: "cover", borderRadius: 6, border: "1px solid #E2E8F0", display: "block" }} />
                      </a>
                    : <div key={sti} style={{ width: 64, height: 64, borderRadius: 6, background: "#F1F5F9" }} />
                ))}
              </div>
            )}
            {n.photos_deleted_at && (
              <div style={{ fontSize: 11, color: "#94A3B8", fontStyle: "italic", marginTop: 5 }}>
                Billederne er slettet efter 12 måneder. Teksten står tilbage.
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---------- Constants ----------
// SKILLS og customers hentes fra Supabase – se loadAll() i App-komponenten.
// Fallback bruges kun hvis databasen ikke svarer ved første render.
const SKILLS_FALLBACK = ["Gulvvask", "Vinduespolering", "Sanitær", "Højtryk", "Tæpperens", "Køkkenhygiejne"];
const LEVELS = [
  { v: 1, label: "Nybegynder", short: "N" },
  { v: 2, label: "Øvet", short: "Ø" },
  { v: 3, label: "Ekspert", short: "E" },
];
const LEVEL_LABEL = { 1: "Nybegynder", 2: "Øvet", 3: "Ekspert" };
const DAYS = [
  { key: "Mon", label: "Mandag" },
  { key: "Tue", label: "Tirsdag" },
  { key: "Wed", label: "Onsdag" },
  { key: "Thu", label: "Torsdag" },
  { key: "Fri", label: "Fredag" },
];
const ALL_DAYS = [
  ...DAYS,
  { key: "Sat", label: "Lørdag" },
  { key: "Sun", label: "Søndag" },
];
const TYPE_META = {
  fixed: { label: "Fast interval", icon: Repeat, color: "#9C1B5D", bg: "#FCE4EF" },
  // Omdøbt fra "Ad hoc" til "Fleksibel" — den gamle "flexible"-type (der oprettede
  // gentagne instanser frem til en udløbsdato) er nedlagt til fordel for denne
  // simplere type: en enkeltstående opgave uden fast dag, der lander i "Ikke
  // tildelt" og planlægges manuelt (eller via markering + auto-planlægning).
  adhoc: { label: "Fleksibel", icon: Zap, color: "#B45309", bg: "#FEF3C7" },
  // Bevaret udelukkende for korrekt visning af evt. ældre data af denne type —
  // kan IKKE længere vælges ved oprettelse af en ny opgave (se CREATABLE_TYPES).
  flexible: { label: "Fleksibel (ældre)", icon: CalendarClock, color: "#111111", bg: "#EDEDED" },
  aktivitet: { label: "Anden aktivitet", icon: Building2, color: "#7C3AED", bg: "#EDE9FE" },
  sygdom: { label: "Sygdom", icon: Thermometer, color: "#B91C1C", bg: "#FEE2E2" },
  ferie: { label: "Ferie", icon: Palmtree, color: "#0E7490", bg: "#CFFAFE" },
};
// De eneste typer man må vælge ved oprettelse af en ny opgave i "Ny opgave"-
// modalen. Sygdom/Ferie oprettes udelukkende via den dedikerede Sygdom/Ferie-
// knap (addBlock-flowet), og den gamle "flexible"-type er nedlagt.
const CREATABLE_TYPES = ["fixed", "adhoc"];
// Kontrakttyper samlet ét sted: etiket, ikon og farver. Skal der en ny til, tilfoejes
// den her (plus en raekke i pricing-tabellen og i instances_contract_type_check).
// Aarsager til at en aftale ophoerer. Vaerdierne matcher databasens check-constraint.
const CANCEL_REASONS = [
  { key: "kunde", label: "Opsagt af kunden" },
  { key: "os", label: "Opsagt af Jammerbugt Rengøring" },
  { key: "fejl", label: "Fejl" },
];
function cancelReasonLabel(key) {
  const r = CANCEL_REASONS.find((x) => x.key === key);
  return r ? r.label : "";
}
// Omregner en opgaves uge/aar/dag til en rigtig dato, saa den kan sammenlignes
// med aftalens ophoersdato. Samme ISO-regel som resten af appen: uge 1 er den
// uge der indeholder 4. januar.
function instanceDateString(t) {
  if (!t || !t.year || !t.week || !t.day) return "";
  const order = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const jan4 = new Date(t.year, 0, 4);
  const monday = new Date(jan4);
  monday.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7) + (t.week - 1) * 7);
  const idx = order.indexOf(t.day);
  monday.setDate(monday.getDate() + (idx < 0 ? 0 : idx));
  const mm = String(monday.getMonth() + 1).padStart(2, "0");
  const dd = String(monday.getDate()).padStart(2, "0");
  return monday.getFullYear() + "-" + mm + "-" + dd;
}
const CONTRACT_TYPES = [
  { key: "privat",    label: "Privat",   icon: "🏠", color: "#9C1B5D", bg: "#FFF6FA", chart: "#D6247A" },
  { key: "erhverv",   label: "Erhverv",  icon: "💼", color: "#0F766E", bg: "#F0FDFA", chart: "#0D9488" },
  { key: "nexus",     label: "Nexus",    icon: "🏢", color: "#4F46E5", bg: "#EEF2FF", chart: "#4F46E5" },
  { key: "aeldrelov", label: "Ældrelov", icon: "👴", color: "#C2410C", bg: "#FFF7ED", chart: "#C2410C" },
];
const CONTRACT_META = Object.fromEntries(CONTRACT_TYPES.map((c) => [c.key, c]));
function contractMeta(key) { return CONTRACT_META[key] || CONTRACT_META.privat; }
function contractLabel(key) { return contractMeta(key).label; }
function contractIconLabel(key) { const c = contractMeta(key); return c.icon + " " + c.label; }
// Bruges til at afgøre om en instans er en blokering (sygdom/ferie) i stedet for
// en rigtig rengøringsopgave — blokeringer skal ikke tælle med i fakturagrundlag,
// rapportering osv., og skal forhindre auto-planlægning af den pågældende medarbejder.
const BLOCK_TYPES = ["sygdom", "ferie"];
// Timeloen bruges kun til loensummerne i Medarbejder-eksport. Satsen ligger i sin
// egen tabel med adgang kun for administratorer — se kommentaren paa employee_wages.
const STANDARD_TIMELOEN = 170;
// Bruges kun hvis en kaldende funktion ikke har transportindstillingerne ved haanden.
const DEFAULT_TRAVEL = { defaultMinutes: 20, dayStart: "07:00", overrides: {} };
// Planlaegningshorisont: hvor mange uger frem opgaverne altid materialiseres.
const HORIZON_WEEKS = 4;

// Bruger crypto.randomUUID når den er tilgængelig (alle moderne browsere).
// Math.random gav kun ~36^7 kombinationer og var i praksis kollisionsfølsom,
// når mange instanser blev genereret i samme sekund ved "Planlæg alle uger".
function uid(p) {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return p + crypto.randomUUID().replace(/-/g, "").slice(0, 16);
  return p + Math.random().toString(36).slice(2, 9) + Date.now().toString(36);
}
// Oversætter en valgt kalenderdato til en gyldig hverdags-nøgle (Mon-Fri).
// Databasen tillader kun Mon-Fri (eller NULL) i "day"/"deadline"-felterne —
// virksomheden planlægger ikke i weekenden. Falder en valgt dato i weekenden,
// rulles den tilbage til fredag (bevarer "senest udført"-betydningen: fredag
// er stadig inden for den valgte uge, blot ikke selve lørdag/søndag), i
// stedet for at gemme en ugyldig dag-værdi, som ellers ville få hele
// opgaven til at fejle stille i databasen ved oprettelse.
// Fælles fejlhåndtering for databaseskrivninger. Tidligere blev fejl fra Supabase
// ignoreret de fleste steder, så en handling kunne se ud til at lykkes i browseren
// uden nogensinde at blive gemt — og først blive opdaget ved næste genindlæsning
// (det var præcis sådan en nyoprettet ad hoc-opgave kunne forsvinde sporløst).
// Returnerer true hvis der VAR en fejl, så kaldstedet kan afbryde.
function dbFail(error, whatFailed) {
  if (!error) return false;
  console.error(`${whatFailed} fejlede:`, error.message, error.details ?? "");
  alert(`Kunne ikke ${whatFailed} — prøv igen.\n\n(${error.message})`);
  return true;
}

// Henter ALLE raekker fra en tabel. Supabase/PostgREST returnerer hoejst 1000
// raekker pr. kald, og uden eksplicit sortering er det en VILKAARLIG delmaengde
// der kan variere fra indlaesning til indlaesning. Med 2500+ opgaver betoed det
// at planlaeggeren kun saa ca. 40% af data - og ikke de samme 40% hver gang.
// Vi henter derfor i sider indtil der ikke er flere, sorteret stabilt paa id.
async function fetchAllRows(table, columns = "*", filter = null) {
  const pageSize = 1000;
  let from = 0;
  const rows = [];
  for (;;) {
    let query = supabase
      .from(table).select(columns).order("id", { ascending: true })
      .range(from, from + pageSize - 1);
    if (filter) query = filter(query);
    const { data, error } = await query;
    if (error) {
      console.error(`fetchAllRows(${table}) fejlede:`, error.message);
      break;
    }
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return rows;
}

function weekdayKeyFor(date) {
  const dayKeys = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const dow = date.getDay();
  return dayKeys[dow];
}
function sortEmployeesByName(list) {
  return [...(list || [])].sort((a, b) =>
    (a.name || "").localeCompare(b.name || "", "da", { sensitivity: "base" })
  );
}
function initials(name) { return name.split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase(); }
function fmtMin(min) {
  const h = Math.floor(min / 60), m = Math.round(min % 60);
  return h > 0 ? `${h}t${m > 0 ? " " + m + "m" : ""}` : `${m}m`;
}
function defaultCapacity() { return { Mon: 480, Tue: 480, Wed: 480, Thu: 480, Fri: 480, Sat: 0, Sun: 0 }; }
function rs(skill, minLevel = 1) { return { skill, minLevel }; }

// ---------- Week helpers ----------
function mondayOf(date) {
  const d = new Date(date);
  const dow = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - dow);
  d.setHours(0, 0, 0, 0);
  return d;
}
function isoWeekNumber(date) {
  // Brug lokal dato for korrekt dansk tidszone
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const dayNum = (d.getDay() + 6) % 7; // Man=0 ... Søn=6
  d.setDate(d.getDate() - dayNum + 3); // Nærmeste torsdag
  const yearStart = new Date(d.getFullYear(), 0, 1);
  return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
}
// Beregner både ISO-ugenummer OG det år ugen hører til (kan afvige fra
// kalenderåret omkring årsskiftet, fx 30. dec. kan høre til uge 1 i det nye år).
// Bruges i stedet for isoWeekNumber alene, hver gang begge dele skal matches
// konsistent (fx ved navigation og instans-generering på tværs af årsskifter).
function isoWeekInfo(date) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const dayNum = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - dayNum + 3); // Nærmeste torsdag afgør ISO-uge-året
  const isoYear = d.getFullYear();
  const yearStart = new Date(isoYear, 0, 1);
  const week = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return { week, year: isoYear };
}
// Finder mandagen i en given (uge, år)-kombination. Modstykket til isoWeekInfo.
function mondayOfWeek(week, year) {
  const jan4 = new Date(year, 0, 4);
  const jan4Day = (jan4.getDay() + 6) % 7;
  const weekOneMonday = new Date(jan4);
  weekOneMonday.setDate(jan4.getDate() - jan4Day);
  const monday = new Date(weekOneMonday);
  monday.setDate(weekOneMonday.getDate() + (week - 1) * 7);
  return monday;
}
// Beregner den faktiske kalendermåned/år en opgave-instans hører til, ud fra
// dens rigtige dato (mandag i ugen + evt. den konkrete ugedag), i stedet for
// at gætte ud fra ISO-ugenummeret alene. Bruges i Tid & Eksport og Rapportering
// så en uge der strækker sig over et månedsskift (fx uge 31: 27. jul - 2. aug)
// altid lander i præcis én måned - den måned den pågældende dag faktisk falder i.
// Har opgaven ingen fast ugedag endnu (uplaceret adhoc/Fleksibel-opgave), bruges
// ugens mandag som bedste bud på dato.
function instanceMonthYear(t, fallbackYear) {
  const year = t.year ?? fallbackYear;
  const monday = mondayOfWeek(t.week, year);
  const date = new Date(monday);
  if (t.day) {
    const dayIdx = ALL_DAYS.findIndex((d) => d.key === t.day);
    if (dayIdx >= 0) date.setDate(monday.getDate() + dayIdx);
  }
  return { month: date.getMonth(), year: date.getFullYear() };
}

function weekMeta(weekNo, year) {
  const monday = mondayOfWeek(weekNo, year);
  const friday = new Date(monday); friday.setDate(monday.getDate() + 4);
  const fmt = (d) => d.toLocaleDateString("da-DK", { day: "numeric", month: "short" });
  return { label: `${fmt(monday)} – ${fmt(friday)}`, weekNo, year, monday };
}

// Finder index (0 = mandag) for den tidligste hverdag i (week, year) man
// stadig må planlægge en "forsinket" (fra en tidligere uge) opgave ind på —
// bruges til at fange forsinkede opgaver op fra i dag og frem i stedet for at
// forsøge at placere dem på en dag der allerede er passeret. Ligger ugen helt
// i fremtiden er hele ugen åben (index 0); er ugen allerede helt overstået,
// returneres ALL_DAYS.length, så der ikke findes nogen gyldig dag tilbage.
function earliestAllowedDayIndex(week, year) {
  const monday = mondayOfWeek(week, year);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.round((today - monday) / 86400000);
  if (diffDays <= 0) return 0;
  if (diffDays >= ALL_DAYS.length) return ALL_DAYS.length;
  return diffDays;
}

// ---------- Skill matching ----------
function meetsRequirement(emp, req) { return (emp.skills[req.skill] || 0) >= req.minLevel; }
function candidatesFor(t, employees, areas = [], employeeAreas = []) {
  const zipCode = (t.address || "").match(/\b(\d{4})\b/)?.[1];
  let areaEmployeeIds = null;
  let hasArea = false;
  if (zipCode && areas.length > 0) {
    const matchingArea = areas.find((a) => (a.zip_codes || []).includes(zipCode));
    if (matchingArea) {
      const areaEmpIds = employeeAreas.filter((ea) => ea.area_id === matchingArea.id).map((ea) => ea.employee_id);
      if (areaEmpIds.length > 0) { areaEmployeeIds = new Set(areaEmpIds); hasArea = true; }
    }
  }
  const inArea = employees.filter((e) => {
    if (areaEmployeeIds && !areaEmployeeIds.has(e.id)) return false;
    return t.requiredSkills.every((r) => meetsRequirement(e, r));
  });
  // Fallback: alle med rette kompetencer hvis ingen i område
  const fallback = inArea.length === 0
    ? employees.filter((e) => t.requiredSkills.every((r) => meetsRequirement(e, r)))
    : inArea;
  return { candidates: fallback, outsideArea: hasArea && inArea.length === 0 };
}
function skillScore(e, t) { return t.requiredSkills.reduce((s, r) => s + (e.skills[r.skill] || 0), 0); }
function skillLabel(t) { return t.requiredSkills.map((r) => `${r.skill}${r.minLevel > 1 ? ` (≥${LEVEL_LABEL[r.minLevel]})` : ""}`).join(" + "); }

// ---------- Checklists (reusable tasklists) ----------
function ci(text, description = "", videoUrl = "") { return { text, description, videoUrl }; }

const seedChecklistTemplates = [
  { id: "cl1", name: "Gulvvask – standard", items: [
    ci("Fej gulvet for løst støv"),
    ci("Vask med neutralt gulvsæbe (1 dl pr. 5 liter vand)", "Brug aldrig klorbaseret sæbe på trægulve – det ødelægger lakken."),
    ci("Sæt 'Vådt gulv'-skilt", "", "https://example.com/videoer/opsaetning-skilt"),
    ci("Lad gulvet lufttørre"),
    ci("Skyl og tøm moppe efter brug"),
  ]},
  { id: "cl2", name: "Sanitær – standard", items: [
    ci("Brug engangshandsker"),
    ci("Sanitér toilet, håndvask og armaturer", "Lad desinfektionsmiddel virke min. 5 minutter før aftørring."),
    ci("Fyld op: sæbe, papir, håndklæder"),
    ci("Tjek for skader/lækager og noter"),
  ]},
  { id: "cl3", name: "Kantine dybderens", items: [
    ci("Rengør alle overflader"),
    ci("Tøm og rengør køleskabe", "Tjek udløbsdatoer og kasser fordærvet mad iht. hygiejneregler."),
    ci("Sorter og tøm affald"),
    ci("Afkalk kaffemaskine", "", "https://example.com/videoer/afkalkning-kaffemaskine"),
  ]},
  { id: "cl4", name: "Facadevinduer", items: [
    ci("Monter teleskopstang", "", "https://example.com/videoer/teleskopstang-opsaetning"),
    ci("Vinduessæbe + gummiskraber"),
    ci("Tjek vejrudsigt før opstart", "Undgå direkte sol på våde ruder – det giver striber."),
    ci("Aftør vandpletter på karm"),
  ]},
];

function instantiateChecklist(items) {
  return items.map((it) => {
    const o = typeof it === "string" ? { text: it } : it;
    return { id: uid("ck"), text: o.text, description: o.description || "", videoUrl: o.videoUrl || "", done: false };
  });
}
function buildChecklistItems(checklistTemplateIds, extraItems, checklistTemplatesLib, existingItems) {
  const libItems = (checklistTemplateIds || []).flatMap((id) => {
    const cl = (checklistTemplatesLib || []).find((c) => c.id === id);
    return cl ? cl.items : [];
  });
  const customItems = (extraItems || []).map((text) => ({ text: typeof text === "string" ? text : text.text }));
  const combined = [...libItems, ...customItems];
  const prevByText = new Map((existingItems || []).map((it) => [it.text, it]));
  return combined.map((it) => {
    const prev = prevByText.get(it.text);
    return {
      id: prev ? prev.id : uid("ck"),
      text: it.text,
      description: it.description || "",
      videoUrl: it.videoUrl || "",
      done: prev ? !!prev.done : false,
    };
  });
}
function checklistProgress(t) {
  const items = t.checklist || [];
  return { done: items.filter((i) => i.done).length, total: items.length };
}
function itemText(x) { return typeof x === "string" ? x : x.text; }

// ---------- Seed data ----------
// ---------- Scheduling engine (operates on ONE week's instances) ----------
const WEEKEND_DAYS = ["Sat", "Sun"];
function isWeekendDay(day) { return WEEKEND_DAYS.includes(day); }

// Dags dato i lokal tid som YYYY-MM-DD. toISOString alene ville give UTC og dermed
// i gaar sent paa aftenen dansk tid — saa ville en aftale oprettet kl. 23 faa lov
// at starte "i gaar", stik imod reglen om at startdatoen ikke maa ligge i fortiden.
function todayIso() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

// Alle uger fra startdato til udloebsdato, i rigtige 7-dages spring saa aarsskifter
// haandteres korrekt. Samme regnestykke som i addTask, men paa modulniveau saa
// godkendelsen af en kladde bruger noejagtig samme uger som oprettelsen — ellers
// kunne de to veje danne forskellige opgaver af den samme aftale.
// Loftet paa 104 uger er en sikring mod en udloebsdato langt ude i fremtiden.
function ugerFraStartTilUdloeb(startDateStr, expiryDateStr) {
  const startMonday = mondayOf(startDateStr ? new Date(startDateStr) : new Date());
  if (!expiryDateStr) return [isoWeekInfo(startMonday)];

  const expiryMonday = mondayOf(new Date(expiryDateStr));
  const weeks = [];
  let cursor = new Date(startMonday);
  while (cursor <= expiryMonday && weeks.length < 104) {
    weeks.push(isoWeekInfo(cursor));
    cursor.setDate(cursor.getDate() + 7);
  }
  return weeks.length ? weeks : [isoWeekInfo(startMonday)];
}
// Maa medarbejderen overhovedet arbejde denne dag? Weekend kraever en aftale.
function canWorkOn(emp, day) { return !isWeekendDay(day) || !!(emp && emp.weekendOk); }
function usedMinutes(list, empId, day) {
  return list.filter((t) => t.assignees.includes(empId) && t.day === day).reduce((s, t) => s + t.duration, 0);
}

// Dagens samlede transporttid for en medarbejder hvis koersel er en del af hendes
// arbejdstid: hjemmefra til foerste opgave, mellem hver opgave, og fra sidste opgave
// hjem. Returnerer 0 for alle andre, saa de planlaegges praecis som foer.
//
// Hovedparten er IKKE paa ordningen: deres transport afregnes med kilometerpenge og
// taeller derfor ikke i kapaciteten. Derfor er nul-tilfaeldet det foerste der tjekkes,
// og hele regnestykket springes over.
function dagensTransport(list, emp, day, travelSettings = DEFAULT_TRAVEL) {
  if (!emp || !emp.travelInWorktime || !emp.homeAddress) return 0;
  // Blokeringer (sygdom, ferie) og opgaver uden adresse skal ud FOER raekkefoelgen
  // laegges. Ellers kunne en ferieblokering ligge foerst paa dagen, og turen hjemmefra
  // ville blive regnet til en adresse der ikke findes — altsaa nul, lydloest.
  // Samme filter som der bruges naar rutetiderne hentes, ellers passer de to ikke.
  const opgaver = sortDayTasks(list.filter((t) =>
    (t.assignees || []).includes(emp.id) && t.day === day
    && !BLOCK_TYPES.includes(t.type) && !!t.address));
  if (opgaver.length === 0) return 0;
  let minutter = getHomeTravelMinutes(emp, opgaver[0].address, travelSettings);
  for (let i = 0; i < opgaver.length - 1; i++) {
    minutter += getTravelMinutes(opgaver[i].address, opgaver[i + 1].address, travelSettings);
  }
  minutter += getHomeTravelMinutes(emp, opgaver[opgaver.length - 1].address, travelSettings);
  return minutter;
}

// Det dagen faktisk er belagt med. For de fleste er det summen af opgavernes
// varighed; for dem paa transportordningen er koerslen lagt til.
function belastning(employees, list, empId, day, travelSettings = DEFAULT_TRAVEL) {
  const emp = employees.find((e) => e.id === empId);
  return usedMinutes(list, empId, day) + dagensTransport(list, emp, day, travelSettings);
}

function remaining(employees, list, empId, day, travelSettings = DEFAULT_TRAVEL) {
  const emp = employees.find((e) => e.id === empId);
  // Weekend: har medarbejderen aftalen, er der ingen oevre graense (arbejdet afregnes
  // med tillaeg og planlaegges efter behov). Har hun den ikke, er der ingen tid at give af.
  if (isWeekendDay(day)) return canWorkOn(emp, day) ? Infinity : 0;
  return (emp?.capacity?.[day] ?? 0) - belastning(employees, list, empId, day, travelSettings);
}
// remaining() giver Infinity i weekenden for dem med aftalen. Det kan ikke bruges til
// rangering (Infinity - Infinity er NaN, og alle scorer ville vaere lige), saa til
// sortering bruges en endelig vaerdi der falder med den tid der allerede ligger paa
// dagen - saa weekendarbejdet stadig fordeles jaevnt i stedet for at hobe sig op.
function remainingForScore(employees, list, empId, day, travelSettings = DEFAULT_TRAVEL) {
  const r = remaining(employees, list, empId, day, travelSettings);
  if (Number.isFinite(r)) return r;
  return 100000 - belastning(employees, list, empId, day, travelSettings);
}
function scheduleWeek(weekInstances, employees, autoOnly = false, areas = [], employeeAreas = [], restrictToIds = null, travelSettings = DEFAULT_TRAVEL) {
  let list = weekInstances.map((t) => ({ ...t }));

  // En medarbejder må aldrig auto-planlægges på en dag hvor de har en
  // sygdom/ferie-blokering liggende — uanset om de i øvrigt har ledig kapacitet.
  function isBlocked(empId, day) {
    return list.some((t2) => BLOCK_TYPES.includes(t2.type) && (t2.assignees || []).includes(empId) && t2.day === day);
  }

  // En opgave med et fast klokkeslæt (scheduledTime) må ikke auto-placeres
  // oven i en anden allerede tildelt opgave med et fast klokkeslæt samme dag
  // hos samme medarbejder — opgaver uden fast klokkeslæt er fleksible og
  // fortrænger ikke dette tjek, de lander bare i den ledige tid der er tilbage.
  // Ville placeringen skubbe en aftale? Vi laegger opgaven ind i dagen og regner
  // dagen igennem med praecis samme funktion som tidslinjen bruger — inklusive
  // koeretiden mellem adresserne. Kan en opgave med aftalt klokkeslaet derefter
  // ikke begynde til tiden, er placeringen ikke lovlig.
  //
  // Tidligere sammenlignede vi kun to faste klokkeslaet med hinanden. Det oversaa
  // det almindelige tilfaelde: en opgave uden fast tid lagt tidligere paa dagen,
  // som sammen med koerslen skubber en aftalt opgave for sent i gang.
  function hasTimeConflict(empId, day, task) {
    const dayTasks = list.filter(
      (t2) => t2.id !== task.id && (t2.assignees || []).includes(empId)
        && t2.day === day && !BLOCK_TYPES.includes(t2.type)
    );
    // Er der ingen aftalte klokkeslaet i spil, er der ikke noget at bryde.
    if (!task.scheduledTime && !dayTasks.some((t2) => t2.scheduledTime)) return false;
    const emp = employees.find((e) => e.id === empId);
    const segs = computeDaySchedule([...dayTasks, task], travelSettings, emp);
    return segs.some((s) => s.type === "task" && (s.lateBy || 0) > 0);
  }

  list.forEach((t) => {
    // Opgaver markeret med _forceWindow (forsinkede opgaver fra en tidligere
    // uge, der genoptages i den viste uge) skal søges hen over en dag-window
    // ligesom fleksible opgaver, i stedet for at blive tvunget ind på deres
    // oprindelige (allerede passerede) dag — håndteres i loopet nedenfor.
    if ((t.assignees && t.assignees.length) || !t.day || t.type === "flexible" || t._forceWindow) return;
    if (autoOnly && !t.includeInAuto) return;
    // Rør aldrig ved en instans der ikke er i den udtrykkelige "skal planlægges"-liste —
    // det forhindrer at eksisterende opgaver, som planlæggeren bevidst har sat til
    // "ikke tildelt", bliver auto-tildelt igen ved næste visning af ugen.
    if (restrictToIds && !restrictToIds.has(t.id)) return;
    const { candidates: allCandidates, outsideArea } = candidatesFor(t, employees, areas, employeeAreas);
    const candidates = allCandidates.filter((e) => !isBlocked(e.id, t.day) && canWorkOn(e, t.day));
    if (candidates.length === 0) { t.warning = "no_skill"; return; }
    // En opgave med fast klokkeslaet maa ikke laegges oven i en anden tidsfastsat
    // opgave hos samme medarbejder. Tjekket fandtes kun i den fleksible gren, saa to
    // opgaver med klokkeslaet paa samme dag kunne ende oven i hinanden.
    const conflictFree = candidates.filter((e) => !hasTimeConflict(e.id, t.day, t));
    const pool = conflictFree.length ? conflictFree : candidates;
    const ranked = [...pool].sort((a, b) => {
      const diff = skillScore(b, t) - skillScore(a, t);
      if (diff !== 0) return diff;
      return remainingForScore(employees, list, b.id, t.day, travelSettings) - remainingForScore(employees, list, a.id, t.day, travelSettings);
    });
    const withRoom = ranked.find((c) => remaining(employees, list, c.id, t.day, travelSettings) >= t.duration);
    const pick = withRoom || ranked[0];
    t.assignees = [pick.id];
    t.status = "planlagt";
    t.warning = (withRoom && conflictFree.length) ? null : "overloaded";
    if (outsideArea) t.outsideArea = true; // Markér som planlagt uden for område
  });

  list.forEach((t) => {
    // Enhver opgave uden en fast dag (uanset type — det dækker nu både den
    // gamle "flexible"-type OG almindelige "adhoc"/"Fleksibel"-opgaver, som
    // altid oprettes med day=null og lander i "Ikke tildelt") søges placeret
    // via et dag-vindue i stedet for at kræve en bestemt, forudbestemt dag.
    if ((t.assignees && t.assignees.length) || (t.day && !t._forceWindow)) return;
    if (autoOnly && !t.includeInAuto) return;
    if (restrictToIds && !restrictToIds.has(t.id)) return;
    // _forceWindow (array af dag-nøgler) styrer et forsinket-opgave-genoptag:
    // søg kun blandt de dage, der er angivet (typisk i dag og frem), i stedet
    // for det normale deadline-vindue for rigtige fleksible opgaver.
    const deadlineIdx = ALL_DAYS.findIndex((d) => d.key === (t.deadline || "Fri"));
    // En opgave må aldrig auto-placeres på en dag der allerede er passeret —
    // vinduet starter derfor tidligst i dag (earliestAllowedDayIndex), ikke
    // altid mandag, når det er den viste/indeværende uge der planlægges i.
    const earliestIdx = earliestAllowedDayIndex(t.week, t.year);
    const window = t._forceWindow ? ALL_DAYS.filter((d) => t._forceWindow.includes(d.key)) : ALL_DAYS.slice(earliestIdx, deadlineIdx + 1);
    const { candidates, outsideArea } = candidatesFor(t, employees, areas, employeeAreas);
    if (candidates.length === 0) { t.warning = "no_skill"; return; }
    let best = null;
    window.forEach((d) => {
      candidates.forEach((e) => {
        if (isBlocked(e.id, d.key)) return;
        if (!canWorkOn(e, d.key)) return;
        // Gaelder ogsaa opgaver uden fast tid: de maa ikke presse en aftalt opgave.
        if (hasTimeConflict(e.id, d.key, t)) return;
        const rem = remaining(employees, list, e.id, d.key, travelSettings);
        const remScore = remainingForScore(employees, list, e.id, d.key, travelSettings);
        const fits = rem >= t.duration ? 1 : 0;
        // En opgave med et ønsket starttidspunkt bør helst placeres hos en
        // medarbejder/dag hvor det tidspunkt rent faktisk er nåeligt — dvs.
        // medarbejderens allerede planlagte tid denne dag ikke i sig selv
        // skubber forbi det ønskede klokkeslæt, inden opgaven overhovedet nås.
        let timeScore = 0;
        if (t.scheduledTime) {
          const desiredMin = parseTimeToMinutes(t.scheduledTime);
          // Belastning frem for varighed: er koerslen en del af arbejdstiden, skubber
          // turen hjemmefra ogsaa ankomsten til dagens senere opgaver.
          const estimatedArrival = parseTimeToMinutes(e.startTime || "07:00") + belastning(employees, list, e.id, d.key, travelSettings);
          timeScore = estimatedArrival <= desiredMin ? 2000 : -2000;
        }
        const score = fits * 1_000_000 + timeScore + skillScore(e, t) * 1000 + remScore;
        if (!best || score > best.score) best = { day: d.key, empId: e.id, rem, score };
      });
    });
    // Der ER kandidater med kompetencen (tjekket ovenfor) - naar best er tom, skyldes
    // det at der ikke fandtes en lovlig dag: fristen er passeret, eller alle dage i
    // vinduet er blokeret. "no_skill" her var direkte misvisende.
    if (!best) { t.warning = "no_slot"; return; }
    t.day = best.day; t.assignees = [best.empId]; t.status = "planlagt";
    t.warning = best.rem < t.duration ? "overloaded" : null;
    if (outsideArea) t.outsideArea = true;
    // En forsinket opgave, der genoptages i en anden uge end den oprindeligt
    // hørte til, er pr. definition uden for den aftalte kadence — markér den
    // derfor synligt som "uden for aftale", uanset hvilken dag den endte på.
    if (t._forceWindow) { t.offSchedule = true; t.onSchedule = false; }
  });

  // Slutkontrol: fjern ALTID en blokeret medarbejder fra en opgave, uanset om
  // opgaven lige er (gen)tildelt i dette kald, eller allerede eksisterede fra
  // før. Dette reparerer automatisk enhver opgave der fejlagtigt endte hos en
  // medarbejder, som nu har en sygdom/ferie-blokering den dag (fx pga. en
  // race mellem en reload og en blokering der lige var ved at blive gemt).
  list.forEach((t) => {
    if (BLOCK_TYPES.includes(t.type) || !t.day || !(t.assignees && t.assignees.length)) return;
    const stillOk = t.assignees.filter((empId) => !isBlocked(empId, t.day));
    if (stillOk.length !== t.assignees.length) {
      t.assignees = stillOk;
      if (stillOk.length === 0) {
        t.status = "unscheduled";
        if (t.type === "flexible") t.day = null;
      }
    }
  });

  return list;
}

function ensureWeekInstances(week, year, allInstances, templates, employees, areas = [], employeeAreas = [], travelSettings = DEFAULT_TRAVEL) {
  let list = [...allInstances];
  const weekMonday = mondayOfWeek(week, year);
  const newlyCreatedIds = new Set();
  
  templates.forEach((tpl) => {
    if (!tpl.days || tpl.days.length === 0) return; /* En kladde er under udarbejdelse og maa aldrig danne opgaver. Uden denne linje ville en halvfaerdig aftale materialisere op til 104 uger i det sekund nogen aabnede appen - og det er praecis det, kladden skal forhindre. */ if (tpl.status === "kladde") return;
    
    // Skip if past expiry date
    if (tpl.expiryDate) {
      const expiryMonday = mondayOf(new Date(tpl.expiryDate));
      if (weekMonday > expiryMonday) return;
    }
    
    // Skip if before start date
    if (tpl.startDate) {
      const startMonday = mondayOf(new Date(tpl.startDate));
      if (weekMonday < startMonday) return;
    }
    
    // Gentagelsesinterval (Plan parametre): spring uger over der ikke matcher
    // det valgte interval (uge/14 dage/måned/3 måned), talt fra startdatoen.
    // Maanedlig og kvartalsvis planlaegges efter KALENDERMAANED, ikke efter 4 hhv. 13
    // uger. Den gamle ugebaserede beregning gav 13 besoeg om aaret paa en maanedlig
    // aftale og skred loebende i forhold til kalenderen.
    const PLAN_INTERVAL_MONTHS = { maaned: 1, "3_maaned": 3 };
    const PLAN_INTERVAL_WEEKS = { uge: 1, "14_dage": 2 };
    const intervalMonths = PLAN_INTERVAL_MONTHS[tpl.planInterval];
    if (intervalMonths) {
      // Uden startdato findes der intet anker for kadencen.
      if (!tpl.startDate) return;
      const startDate = new Date(tpl.startDate);
      const weekEnd = new Date(weekMonday);
      weekEnd.setDate(weekEnd.getDate() + 6);
      // Besoeget lander i den uge der indeholder samme dato i maaneden som startdatoen.
      // Datoen klippes til maanedens sidste dag, saa fx den 31. ogsaa rammer februar.
      // En uge kan straekke sig over to maaneder, saa begge proeves: ellers ville en
      // ultimo-dato som den 31. blive sprunget over hver gang ugen laa hen over et
      // maanedsskift. Datoen ligger i praecis een uge, saa der dannes aldrig dubletter.
      const monthsToTry = [
        { y: weekMonday.getFullYear(), m: weekMonday.getMonth() },
        { y: weekEnd.getFullYear(), m: weekEnd.getMonth() },
      ];
      let matchesMonth = false;
      for (const cand of monthsToTry) {
        const monthsSinceStart =
          (cand.y - startDate.getFullYear()) * 12 + (cand.m - startDate.getMonth());
        if (monthsSinceStart < 0 || monthsSinceStart % intervalMonths !== 0) continue;
        const daysInMonth = new Date(cand.y, cand.m + 1, 0).getDate();
        const target = new Date(cand.y, cand.m, Math.min(startDate.getDate(), daysInMonth));
        if (target >= weekMonday && target <= weekEnd) { matchesMonth = true; break; }
      }
      if (!matchesMonth) return;
    } else {
      const planIntervalWeeks = PLAN_INTERVAL_WEEKS[tpl.planInterval] || 1;
      if (planIntervalWeeks > 1) {
        const anchorMonday = tpl.startDate ? mondayOf(new Date(tpl.startDate)) : weekMonday;
        const weeksSinceAnchor = Math.round((weekMonday - anchorMonday) / (7 * 24 * 60 * 60 * 1000));
        if (weeksSinceAnchor % planIntervalWeeks !== 0) return;
      }
    }
    
    // Filter days to only those within start/expiry interval and not excluded
    const DAY_STRING_TO_INDEX = { "Mon": 0, "Tue": 1, "Wed": 2, "Thu": 3, "Fri": 4, "Sat": 5, "Sun": 6 };
    
    // Convert day strings to numeric indices if needed
    const dayIndices = (tpl.days || []).map((d) => 
      typeof d === "string" ? DAY_STRING_TO_INDEX[d] : d
    ).filter((d) => d !== undefined);
    
    const daysToCreate = dayIndices.filter((day) => {
      try {
        // Create a date for this specific day
        const dayDate = new Date(weekMonday);
        dayDate.setDate(dayDate.getDate() + day);
        
        // Convert to ISO date string for consistent comparison (YYYY-MM-DD)
        const year = dayDate.getFullYear();
        const month = String(dayDate.getMonth() + 1).padStart(2, "0");
        const dateNum = String(dayDate.getDate()).padStart(2, "0");
        const dayDateString = `${year}-${month}-${dateNum}`;
        
        // Check if day is in excludedDays
        if (tpl.excludedDays && Array.isArray(tpl.excludedDays) && tpl.excludedDays.length > 0) {
          if (tpl.excludedDays.includes(dayDateString)) {
            return false;
          }
        }
        
        // Check if day is before startDate (compare as strings: YYYY-MM-DD)
        if (tpl.startDate) {
          const startDateStr = typeof tpl.startDate === 'string' 
            ? tpl.startDate.slice(0, 10)  // Ensure it's just YYYY-MM-DD
            : new Date(tpl.startDate).toISOString().slice(0, 10);
          
          if (dayDateString < startDateStr) {
            return false;
          }
        }
        
        // En udgaaet aftale danner ingen opgaver efter ophoersdatoen. Opgaver til og
        // med datoen bliver staaende og skal stadig koeres og faktureres.
        if (tpl.status === "udgaaet" && tpl.cancelledEffectiveDate) {
          const stopStr = String(tpl.cancelledEffectiveDate).slice(0, 10);
          if (dayDateString > stopStr) return false;
        }

        // Check if day is after expiryDate (compare as strings: YYYY-MM-DD)
        if (tpl.expiryDate) {
          const expiryDateStr = typeof tpl.expiryDate === 'string'
            ? tpl.expiryDate.slice(0, 10)  // Ensure it's just YYYY-MM-DD
            : new Date(tpl.expiryDate).toISOString().slice(0, 10);
          
          if (dayDateString > expiryDateStr) {
            return false;
          }
        }
        
        return true;
      } catch (e) {
        console.error("Error filtering day:", e);
        return true;
      }
    });
    
    const DAY_INDEX_TO_STRING = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    daysToCreate.forEach((dayIdx) => {
      const day = DAY_INDEX_TO_STRING[dayIdx];
      const existingIdx = list.findIndex((i) => i.templateId === tpl.id && i.week === week && i.year === year && i.day === day);
      if (existingIdx === -1) {
        const newInst = {
          id: uid("i"), templateId: tpl.id, title: tpl.title, requiredSkills: tpl.requiredSkills,
          // En dag kan kraeve mere tid end aftalens normale varighed — fx hovedrengoering
          // om onsdagen. Er der ikke sat noget for dagen, gaelder aftalens varighed.
          duration: (tpl.dayDurations && tpl.dayDurations[day]) || tpl.duration,
          type: "fixed", day, week, year,
          // Har aftalen en fast medarbejder, foedes opgaven direkte med vedkommende.
          // Auto-planlaegningen roerer aldrig en opgave der allerede har en medarbejder,
          // saa tildelingen staar ved magt - og sygdom/ferie fjerner den igen som normalt.
          assignees: tpl.preferredEmployeeId ? [tpl.preferredEmployeeId] : [],
          status: tpl.preferredEmployeeId ? "planlagt" : "unscheduled", timeLog: [],
          checklist: instantiateChecklist(tpl.checklistItems || []),
          checklistTemplateIds: tpl.checklistTemplateIds || [], extraItems: tpl.extraItems || [],
          videoUrl: tpl.videoUrl || "",
          customerName: tpl.customerName || "", address: tpl.address || "", poNumber: tpl.poNumber || "",
          dineroContactGuid: tpl.dineroContactGuid || "",
          accessInstructions: tpl.accessInstructions || "",
          // Arves fra aftalen. Kan slaas fra paa den enkelte dag hvor noeglen
          // allerede er udleveret, uden at aftalen aendres.
          needsKeyPickup: !!tpl.needsKeyPickup,
          deliversProducts: !!tpl.deliversProducts,
          templateDays: tpl.days, // for off-schedule detection
          scheduledTime: (tpl.dayTimes && tpl.dayTimes[day]) || null,
          contractType: tpl.contractType || "privat",
          pricingType: tpl.pricingType || "hourly",
          fixedPrice: tpl.fixedPrice ?? null,
          expiryDate: tpl.expiryDate || null,
          dineroSynced: tpl.dineroSynced ?? false,
        };
        list.push(newInst);
        newlyCreatedIds.add(newInst.id);
      } else {
        // Selvhelbredende: hold allerede-materialiserede, ikke-fakturerede opgaver i sync
        // med skabelonen, saa rettelser paa aftalen altid slaar igennem - ogsaa for opgaver
        // der blev oprettet foer rettelsen, uden at man skal aabne hver enkelt opgave manuelt.
        const existing = list[existingIdx];
        // Roer aldrig en opgave der allerede er sendt til Dinero, er udfoert, eller
        // har registreret tid: saa er arbejdet leveret, og en senere prisaendring paa
        // aftalen maa ikke omprissaette det med tilbagevirkende kraft.
        const alreadyDelivered =
          existing.dineroExported ||
          existing.status === "udført" ||
          ((existing.timeLog || []).reduce((s, l) => s + (l.minutes || 0), 0) > 0);
        if (!alreadyDelivered) {
          list[existingIdx] = {
            ...existing,
            customerName: tpl.customerName || "",
            address: tpl.address || "",
            poNumber: tpl.poNumber || "",
            accessInstructions: tpl.accessInstructions || "",
            needsKeyPickup: !!tpl.needsKeyPickup,
            deliversProducts: !!tpl.deliversProducts,
            contractType: tpl.contractType || "privat",
            pricingType: tpl.pricingType || "hourly",
            fixedPrice: tpl.fixedPrice ?? null,
            videoUrl: tpl.videoUrl || "",
          };
        }
      }
    });
  });
  const thisWeek = list.filter((i) => i.week === week && i.year === year);
  const others = list.filter((i) => !(i.week === week && i.year === year));
  // Auto-planlæg kun instanser der er helt nyoprettede i dette kald.
  return [...others, ...scheduleWeek(thisWeek, employees, false, areas, employeeAreas, newlyCreatedIds, travelSettings)];
}

function statusLabel(s) { return { unscheduled: "Ubemandet", planlagt: "Planlagt", udført: "Udført" }[s] || s; }

// ---------- Transport / travel time between service orders ----------
// Koeretiden mellem to adresser er den faktiske rutetid: edge-funktionen
// "travel-distance" slaar ruten op hos OpenRouteService og gemmer baade km og
// minutter i tabellen travel_overrides, saa hvert adressepar kun koster ét opslag.
// De gemte minutter indlaeses som overrides. Standardtiden fra transport-
// indstillingerne bruges kun som fallback for par vi endnu ikke har en rute for
// (fx hvis adressen ikke kunne geokodes).
// Bemaerk: for hovedparten taeller transporttid bevidst IKKE med i kapaciteten —
// koersel afregnes med kilometerpenge, ikke som arbejdstid. Undtagelsen er de
// medarbejdere der har travelInWorktime sat; for dem laegger dagensTransport()
// koerslen til belastningen, og de faar ogsaa et ben hjemmefra og hjem.
function travelKey(a, b) { return [a, b].sort().join(" || "); }
// Hjemmebenene har deres EGET opslag, noeglet paa medarbejder-id og kundens adresse.
// De maa ikke ligge i den almindelige overrides-liste: den vises i klartekst under
// Transporttid, og saa kunne enhver planlaegger laese medarbejdernes privatadresser
// ud af listen — stik imod hele grunden til at adressen ligger i en beskyttet tabel.
function hjemKey(empId, adresse) { return empId + " || " + adresse; }
function getHomeTravelMinutes(emp, adresse, travelSettings) {
  if (!emp || !emp.homeAddress || !adresse || emp.homeAddress === adresse) return 0;
  const gemt = (travelSettings.hjemOverrides || {})[hjemKey(emp.id, adresse)];
  return gemt ?? travelSettings.defaultMinutes;
}
function getTravelMinutes(addrA, addrB, travelSettings) {
  if (!addrA || !addrB || addrA === addrB) return 0;
  const key = travelKey(addrA, addrB);
  return travelSettings.overrides[key] ?? travelSettings.defaultMinutes;
}
function parseTimeToMinutes(str) {
  const [h, m] = (str || "07:00").split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}
function fmtClock(minutesFromMidnight) {
  const h = Math.floor(minutesFromMidnight / 60) % 24;
  const m = Math.round(minutesFromMidnight % 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
// Builds an ordered timeline for one employee's tasks on one day, inserting a
// "Transport" segment whenever consecutive tasks have different addresses.
// Raekkefoelgen paa dagen: opgaver med fast klokkeslaet foerst og kronologisk,
// derefter resten i den raekkefoelge de kommer. Bruges baade naar dagen tegnes
// og naar vi finder ud af hvilke adressepar der skal hentes koeretid for, saa
// de to aldrig kan komme til at regne paa hver sin raekkefoelge.
function sortDayTasks(dayTasks) {
  return [...dayTasks].sort((a, b) => {
    const at = a.scheduledTime, bt = b.scheduledTime;
    if (at && bt) return parseTimeToMinutes(at) - parseTimeToMinutes(bt);
    if (at) return -1;
    if (bt) return 1;
    return 0;
  });
}
function computeDaySchedule(dayTasks, travelSettings, employee) {
  // Opgaver med et fast klokkeslæt (scheduledTime — sat pr. ugedag på en fast
  // aftale, eller som ønsket tidspunkt på en fleksibel opgave) skal altid ligge
  // kronologisk først og bestemme rækkefølgen. Opgaver uden fast klokkeslæt
  // lander derefter i den rækkefølge de kommer, på den ledige tid der er
  // tilbage efter de faste opgaver.
  const sorted = sortDayTasks(dayTasks);
  // Dagen starter ved medarbejderens mødetid hvis den er sat, ellers ved det
  // generelle standard-starttidspunkt fra transportindstillingerne.
  let cursor = parseTimeToMinutes((employee && employee.startTime) || travelSettings.dayStart);
  const segments = [];
  // Er koerslen en del af arbejdstiden, begynder dagen hjemme. Turen ud til foerste
  // opgave laegges derfor foerst paa tidslinjen, og moedetiden er tidspunktet hvor
  // hun tager hjemmefra — ikke hvor hun staar hos den foerste kunde.
  const hjemTaeller = !!(employee && employee.travelInWorktime && employee.homeAddress);
  if (hjemTaeller && sorted.length > 0) {
    const ud = getHomeTravelMinutes(employee, sorted[0].address, travelSettings);
    if (ud > 0) {
      segments.push({ type: "transport", hjem: true, minutes: ud, start: cursor, end: cursor + ud, key: `hjem->${sorted[0].id}` });
      cursor += ud;
    }
  }
  sorted.forEach((t, idx) => {
    if (idx > 0) {
      const prev = sorted[idx - 1];
      const travel = getTravelMinutes(prev.address, t.address, travelSettings);
      if (travel > 0) {
        segments.push({ type: "transport", minutes: travel, start: cursor, end: cursor + travel, key: `${prev.id}->${t.id}` });
        cursor += travel;
      }
    }
    // Et fast klokkeslæt skubber cursoren frem (venter til det angivne tidspunkt)
    // hvis der er tid tilovers inden — ellers fortsætter den bare hvor den er.
    if (t.scheduledTime) {
      cursor = Math.max(cursor, parseTimeToMinutes(t.scheduledTime));
    }
    // Et aftalt klokkeslaet er en aftale med kunden og skal staa fast. Tidligere
    // bestemte det kun raekkefoelgen, saa en opgave aftalt til kl. 11 blev tegnet
    // fra arbejdsdagens start. Nu skubbes tidslinjen frem til det aftalte tidspunkt,
    // og opgaver uden fast tid fylder hullerne ud omkring den.
    // Kan opgaven ikke naa at begynde til aftalt tid, fordi dagen allerede er
    // fyldt op foer den, er det en konflikt planlaeggeren skal kunne se og rette.
    let lateBy = 0;
    if (t.scheduledTime) {
      const fastTid = parseTimeToMinutes(t.scheduledTime);
      if (fastTid > cursor) cursor = fastTid;
      else if (cursor > fastTid) lateBy = cursor - fastTid;
    }
    segments.push({ type: "task", task: t, start: cursor, end: cursor + t.duration, lateBy });
    cursor += t.duration;
  });
  // Turen hjem efter sidste opgave. Den staar til sidst, saa tidslinjen viser hvornaar
  // arbejdsdagen faktisk slutter for hende — det er dét tidspunkt der taeller i lønnen.
  if (hjemTaeller && sorted.length > 0) {
    const hjem = getHomeTravelMinutes(employee, sorted[sorted.length - 1].address, travelSettings);
    if (hjem > 0) {
      segments.push({ type: "transport", hjem: true, minutes: hjem, start: cursor, end: cursor + hjem, key: `${sorted[sorted.length - 1].id}->hjem` });
    }
  }
  return segments;
}
function cycleStatus(s) { return { planlagt: "udført", udført: "planlagt", unscheduled: "planlagt" }[s] || "planlagt"; }
// Hvem afsluttede opgaven, og hvornår — vist på kortene i ugeplanen.
// Skelner mellem medarbejderen (afsluttet ude hos kunden) og planlæggeren
// (sat manuelt fra kontoret), fordi det er to forskellige ting.
function completionInfo(t, employees) {
  if (t.status !== "udført") return null;
  const by = t.completedBy ?? t.completed_by ?? null;
  const at = t.completedAt ?? t.completed_at ?? null;
  const when = at
    ? new Date(at).toLocaleString("da-DK", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
    : null;
  if (by === "planner") return { label: "Udført (sat af planlægger)", byEmployee: false, when };
  const emp = by ? employees.find((e) => e.id === by) : null;
  if (emp) return { label: `Udført af ${emp.name}`, byEmployee: true, when };
  // Ældre opgaver fra før vi begyndte at registrere det
  return { label: "Udført", byEmployee: true, when: null };
}

function statusColor(s) { return { planlagt: "#9C1B5D", udført: "#111111", unscheduled: "#94A3B8" }[s]; }

// Map day strings to numbers (0=Mon, 1=Tue, 2=Wed, 3=Thu, 4=Fri)
const DAY_STRING_TO_NUM = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4 };

// Send email notification via Supabase Edge Function
async function notifyEmployeeOfChanges(employeeEmail, employeeName, taskTitle, changeType) {
  try {
    const response = await fetch(
      'https://gteowfoahsfpunzgdxum.supabase.co/functions/v1/send-email',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: employeeEmail,
          name: employeeName,
          subject: `Ændring i din dagsplan - ${changeType}`,
          html: `
            <h2>Hej ${employeeName},</h2>
            <p>${changeType}</p>
            <p>Opgave: <strong>${taskTitle}</strong></p>
            <p>Tjek venligst din dagsplan i Rengøringsplan for at se detaljerne.</p>
            <p>Med venlig hilsen,<br/>Jammerbugt Rengøring</p>
          `
        })
      }
    );

    if (response.ok) {
      console.log('✅ Email sent to', employeeEmail);
      return true;
    } else {
      console.error('❌ Email error:', await response.json());
      return false;
    }
  } catch (error) {
    console.error('❌ Email error:', error);
    return false;
  }
}

export default function App() {
  // ── Auth ──
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [passwordRecovery, setPasswordRecovery] = useState(false);
  const [recoveryToken, setRecoveryToken] = useState(null);
  const [recoveryLoading, setRecoveryLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session); setAuthLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setSession(session); setAuthLoading(false);
    });
    return () => subscription.unsubscribe();
  }, []);

useEffect(() => {
    if (window.location.hash.includes("type=recovery")) { setPasswordRecovery(true); return; }
    const params = new URLSearchParams(window.location.search);
      const tokenHash = params.get("token_hash");
      const type = params.get("type");
      if (tokenHash && type === "recovery") { setRecoveryToken(tokenHash); }
}, []);

    async function confirmRecovery() {
          if (!recoveryToken) return;
          setRecoveryLoading(true);
          const { error } = await supabase.auth.verifyOtp({ token_hash: recoveryToken, type: "recovery" });
          setRecoveryLoading(false);
          window.history.replaceState(null, "", window.location.pathname);
          setRecoveryToken(null);
          if (error) setLoginError("Nulstillingslinket er udløbet eller allerede brugt. Bed om et nyt.");
          else setPasswordRecovery(true);
    }

  async function signIn() {
    if (!loginEmail.trim() || !loginPassword) return;
    setLoginLoading(true); setLoginError("");
    const { error } = await supabase.auth.signInWithPassword({
      email: loginEmail.trim(),
      password: loginPassword,
    });
    setLoginLoading(false);
    if (error) setLoginError("Forkert e-mail eller adgangskode");
  }

  async function requestPasswordReset() {
    if (!loginEmail.trim()) { setLoginError("Indtast din e-mail for at nulstille adgangskoden"); return; }
    setLoginLoading(true); setLoginError(""); setResetSent(false);
    const { error } = await supabase.auth.resetPasswordForEmail(loginEmail.trim(), {
      redirectTo: window.location.origin + "/",
    });
    setLoginLoading(false);
    if (error) setLoginError("Kunne ikke sende nulstillingslink — prøv igen.");
    else setResetSent(true);
  }

  if (authLoading) {
    return <div style={{ display:"flex",alignItems:"center",justifyContent:"center",height:"100svh",color:"#9C1B5D",fontFamily:"system-ui",fontSize:15 }}>Indlæser…</div>;
  }

if (recoveryToken) {
    return (
          <div style={{ display:"flex",alignItems:"center",justifyContent:"center",minHeight:"100vh",background:"#FFF6FA",fontFamily:"'Inter',system-ui,sans-serif" }}>
                  <div style={{ background:"#fff",borderRadius:18,padding:32,width:360,boxShadow:"0 8px 32px rgba(0,0,0,0.10)" }}>
                            <div style={{ fontWeight:700,fontSize:17,color:"#111111",marginBottom:6 }}>Nulstil adgangskode</div>
                            <div style={{ fontSize:13,color:"#94A3B8",marginBottom:20 }}>Klik nedenfor for at fortsætte med at nulstille din adgangskode.</div>
                            <button onClick={confirmRecovery} disabled={recoveryLoading} style={{ width:"100%",padding:"13px 0",borderRadius:10,border:"none",background:"#D6247A",color:"#fff",fontWeight:700,fontSize:15,cursor:"pointer" }}>{recoveryLoading ? "Bekræfter…" : "Fortsæt"}</button>
                  </div>
          </div>
        );
}
if (passwordRecovery) {
    return <SetNewPasswordScreen onDone={() => { setPasswordRecovery(false); window.history.replaceState(null, "", window.location.pathname); }} />;
  }

    if (!session) {
    return (
      <div style={{ display:"flex",alignItems:"center",justifyContent:"center",minHeight:"100svh",background:"#FFF6FA",fontFamily:"'Inter',system-ui,sans-serif" }}>
        <div style={{ background:"#fff",borderRadius:18,padding:32,width:360,boxShadow:"0 8px 32px rgba(0,0,0,0.10)" }}>
          <div style={{ display:"flex",alignItems:"center",gap:12,marginBottom:28 }}>
            <div style={{ width:44,height:44,borderRadius:12,background:"#D6247A",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700,fontSize:16,color:"#fff" }}>RP</div>
            <div>
              <div style={{ fontWeight:700,fontSize:17,color:"#111111" }}>Rengøringsplan</div>
              <div style={{ fontSize:12,color:"#94A3B8" }}>Planlægningssystem</div>
            </div>
          </div>
          <div style={{ fontSize:13,fontWeight:600,color:"#475569",marginBottom:6 }}>E-mailadresse</div>
          <input
            type="email" value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") signIn(); }}
            placeholder="din@email.dk" autoFocus
            style={{ width:"100%",padding:"11px 12px",borderRadius:10,border:"1px solid #E2E8F0",fontSize:15,color:"#111111",background:"#fff",boxSizing:"border-box",marginBottom:10 }}
          />
          <div style={{ fontSize:13,fontWeight:600,color:"#475569",marginBottom:6 }}>Adgangskode</div>
          <input
            type="password" value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") signIn(); }}
            placeholder="••••••••"
            style={{ width:"100%",padding:"11px 12px",borderRadius:10,border:"1px solid #E2E8F0",fontSize:15,color:"#111111",background:"#fff",boxSizing:"border-box",marginBottom:10 }}
          />
          {loginError && <div style={{ fontSize:13,color:"#B91C1C",marginBottom:8,padding:"8px 10px",background:"#FEF2F2",borderRadius:8 }}>{loginError}</div>}
          <button
            disabled={loginLoading || !loginEmail.trim() || !loginPassword}
            onClick={signIn}
            style={{ width:"100%",padding:"13px 0",borderRadius:10,border:"none",background:"#D6247A",color:"#fff",fontWeight:700,fontSize:15,cursor:"pointer",opacity:(loginLoading||!loginEmail.trim()||!loginPassword)?0.6:1 }}>
            {loginLoading ? "Logger ind…" : "Log ind"}
          </button>
            <button
              type="button"
              onClick={requestPasswordReset}
              disabled={loginLoading || !loginEmail.trim()}
              style={{ width:"100%",padding:"10px 0",marginTop:10,border:"none",background:"transparent",color:"#D6247A",fontWeight:600,fontSize:13,cursor:"pointer",textAlign:"center" }}>
              Glemt adgangskode?
            </button>
            {resetSent && <div style={{ fontSize:13,color:"#166534",marginTop:8,padding:"8px 10px",background:"#F0FDF4",borderRadius:8 }}>Der er sendt et link til nulstilling af adgangskode til {loginEmail.trim()}, hvis e-mailen findes i systemet.</div>}
        </div>
      </div>
    );
  }

  return <PlanningApp session={session} onSignOut={() => supabase.auth.signOut()} />;
}

function SetNewPasswordScreen({ onDone }) {
  const [pw1, setPw1] = useState("");
  const [pw2, setPw2] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function save() {
    if (pw1.length < 6) { setErr("Adgangskoden skal være mindst 6 tegn"); return; }
    if (pw1 !== pw2) { setErr("Adgangskoderne er ikke ens"); return; }
    setLoading(true); setErr("");
    const { error } = await supabase.auth.updateUser({ password: pw1 });
    setLoading(false);
    if (error) setErr("Kunne ikke opdatere adgangskode — prøv igen.");
    else setDone(true);
  }

  return (
    <div style={{ display:"flex",alignItems:"center",justifyContent:"center",minHeight:"100svh",background:"#FFF6FA",fontFamily:"'Inter',system-ui,sans-serif" }}>
      <div style={{ background:"#fff",borderRadius:18,padding:32,width:360,boxShadow:"0 8px 32px rgba(0,0,0,0.10)" }}>
        <div style={{ display:"flex",alignItems:"center",gap:12,marginBottom:28 }}>
          <div style={{ width:44,height:44,borderRadius:12,background:"#D6247A",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700,fontSize:16,color:"#fff" }}>RP</div>
          <div>
            <div style={{ fontWeight:700,fontSize:17,color:"#111111" }}>Rengøringsplan</div>
            <div style={{ fontSize:12,color:"#94A3B8" }}>Nulstil adgangskode</div>
          </div>
        </div>
        {done ? (
          <>
            <div style={{ fontSize:13,color:"#166534",marginBottom:16,padding:"8px 10px",background:"#F0FDF4",borderRadius:8 }}>Din adgangskode er opdateret.</div>
            <button onClick={onDone} style={{ width:"100%",padding:"13px 0",borderRadius:10,border:"none",background:"#D6247A",color:"#fff",fontWeight:700,fontSize:15,cursor:"pointer" }}>Fortsæt</button>
          </>
        ) : (
          <>
            <div style={{ fontSize:13,fontWeight:600,color:"#475569",marginBottom:6 }}>Ny adgangskode</div>
            <input
              type="password" value={pw1} onChange={(e) => setPw1(e.target.value)}
              placeholder="••••••••" autoFocus
              style={{ width:"100%",padding:"11px 12px",borderRadius:10,border:"1px solid #E2E8F0",fontSize:15,color:"#111111",background:"#fff",boxSizing:"border-box",marginBottom:10 }}
            />
            <div style={{ fontSize:13,fontWeight:600,color:"#475569",marginBottom:6 }}>Gentag adgangskode</div>
            <input
              type="password" value={pw2} onChange={(e) => setPw2(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") save(); }}
              placeholder="••••••••"
              style={{ width:"100%",padding:"11px 12px",borderRadius:10,border:"1px solid #E2E8F0",fontSize:15,color:"#111111",background:"#fff",boxSizing:"border-box",marginBottom:10 }}
            />
            {err && <div style={{ fontSize:13,color:"#B91C1C",marginBottom:8,padding:"8px 10px",background:"#FEF2F2",borderRadius:8 }}>{err}</div>}
            <button
              disabled={loading || !pw1 || !pw2}
              onClick={save}
              style={{ width:"100%",padding:"13px 0",borderRadius:10,border:"none",background:"#D6247A",color:"#fff",fontWeight:700,fontSize:15,cursor:"pointer",opacity:(loading||!pw1||!pw2)?0.6:1 }}>
              {loading ? "Gemmer…" : "Gem ny adgangskode"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}


// ── Modulhjælp ────────────────────────────────────────────────────────────────
// Hvert modul har sin egen "?"-knap. Indholdet er det samme som i den trykte
// brugervejledning, men vises for det modul man faktisk står i.
const MODULE_HELP = {
  uge: { title: "Ugeplan", intro: "Her planlægger du ugen. Hver medarbejder har en række, hver dag en kolonne.", blocks: [
    { h: "Sådan planlægger systemet", p: [
        "Opgaverne oprettes automatisk ud fra aftalerne, fire uger frem. Det sker når du åbner appen, og alt nyt gemmes med det samme.",
        "Horisonten opretter opgaverne, men fordeler dem ikke. Aftaler med fast medarbejder får hende straks — alt andet ligger i Ikke tildelt indtil du trykker Planlæg.",
        "Bladrer du længere frem end fire uger, oprettes ugen når du åbner den, men den gemmes først når du rører den. Tildel en medarbejder, flyt eller ret noget, ellers er den væk igen når du lukker appen.",
        "Horisonten ruller med dagen, og der kommer aldrig dubletter — systemet tjekker på aftale, uge, år og dag.",
        "Om en opgave overhovedet opstår afhænger af fem ting: dagen skal være valgt på aftalen, intervallet skal ramme, og dagen skal ligge efter startdatoen, før udløbsdatoen og ikke efter en eventuel ophørsdato. Mangler der opgaver, er det næsten altid startdatoen eller intervallet.",
        "Har aftalen en fast medarbejder, sættes vedkommende på med det samme, hver gang en ny opgave opstår.",
        "Har den ikke det, finder Planlæg en medarbejder ud fra tre ting: de krævede kompetencer, om medarbejderen er tilknyttet kundens område, og om der er timer nok tilbage den dag.",
        "Blandt dem der kan løse opgaven, vælges den med mest ledig tid, så arbejdet fordeler sig jævnt.",
        "En opgave med fast klokkeslæt lægges aldrig oven i en anden opgave med fast klokkeslæt hos samme medarbejder.",
        "Weekender planlægges kun for medarbejdere der har weekendarbejde sat på. For dem er der ingen timegrænse, da det altid er en aftale.",
        "Kørslen mellem to opgaver beregnes som den faktiske rutetid mellem de to adresser og vises på tidslinjen. Den tæller ikke med i medarbejderens kapacitet, da kørsel afregnes med kilometerpenge og ikke som arbejdstid.",
        "Sygdom og ferie fjerner automatisk medarbejderen fra opgaverne i perioden. Er der ingen tilbage, ryger opgaven i Ikke tildelt."] },
    { h: "Ønsker om ny tid fra medarbejderne", p: [
        "Aftaler en medarbejder en ny tid med kunden, flytter hun ikke selv opgaven. Hun sender et ønske, og du planlægger ændringen.",
        "Ønskerne står øverst i Ugeplan i en gul boks, og du får samtidig en mail. Der står hvem der spørger, hvilken opgave og kunde, fra hvad til hvad, og hvorfor.",
        "«Godkend og flyt» rykker opgaven til det aftalte tidspunkt og beholder medarbejderen — det er hende der har lavet aftalen med kunden.",
        "Passer den nye tid ikke ind i hendes dag, dukker det op som en tidskonflikt på opgaven, og så kan du flytte videre derfra.",
        "«Afvis» kræver en begrundelse, som sendes til medarbejderen på mail, så hun ved at hun skal kontakte kunden igen.",
        "Alt gemmes: hvem, hvornår, hvad opgaven stod til før, hvad der blev ønsket, og hvad du svarede."] },
    { h: "Når en kunde opsiger aftalen", p: [
        "Gå ind på aftalen under Aftaler, eller åbn en hvilken som helst opgave på den, og vælg «Markér som udgået».",
        "Vælg årsag — opsagt af kunden, opsagt af Jammerbugt Rengøring, eller fejl — og angiv sidste dag aftalen gælder.",
        "Opgaver til og med den dato bliver stående og skal stadig køres og faktureres. Alt efter datoen fjernes fra ugeplan, fakturering, rapportering og medarbejdernes app.",
        "Udførte opgaver røres aldrig, så alt der er kørt kan stadig faktureres og indgår i regnskabet.",
        "Aftalen bliver stående på Aftaler-siden med kontraktsummen, markeret UDGÅET. Så kan du se hvad aftalen var værd, og hvad I nåede at realisere.",
        "Det kan ikke fortrydes i appen, så du bliver bedt om at bekræfte."] },
    { h: "Fast medarbejder på en aftale", p: [
        "Vælg medarbejderen under Ansvarlig medarbejder når du opretter aftalen, så følger han eller hun aftalen resten af perioden.",
        "Du kan også gøre det fra en åben opgave: tildel medarbejderen, og tryk så «Gør fast på aftalen».",
        "Det slår igennem på alle kommende opgaver på aftalen. Udførte opgaver røres ikke.",
        "Tilføjer du derimod bare en medarbejder på en enkelt opgave, gælder det kun den ene opgave. Brug det til afløsning."] },
    { h: "Ikke tildelt", p: ["En opgave havner her hvis den er ny, hvis medarbejderen er blevet syg, eller hvis systemet ikke kunne finde nogen der passer.",
                             "Træk den over på en medarbejder, eller sæt Auto-planlæg og tryk Planlæg."] },
    { h: "Hvorfor bliver en opgave ikke planlagt?", p: [
        "«Ingen har alle krævede kompetencer» — ingen har kompetencerne på det krævede niveau. Sænk kravet, eller giv kompetencen under Medarbejdere.",
        "«Ingen ledig dag inden fristen» — fristen er passeret, eller alle dage er optaget eller blokeret. Ret fristen på opgaven.",
        "«Overbelastet» — opgaven er lagt på alligevel, men medarbejderen har ikke timer nok den dag."] },
    { h: "Ret dato og tidspunkt", p: [
        "På en fleksibel opgave: klik på opgaven, find «Frist og tidspunkt» og tryk Rediger. Sæt ny dato og evt. ønsket starttidspunkt, og tryk «Gem og planlæg igen». Opgaven flytter til den rigtige uge og får en medarbejder, hvis nogen kan nå det.",
        "På en fast aftale: klik på opgaven og find «Aftalt tidspunkt». Klokkeslættet står nu også øverst ved siden af ugedagen.",
        "Vælger du «Gælder alle mandage på aftalen», gemmes tiden på selve aftalen, og alle kommende mandage rettes med. Uden fluebenet ændres kun den ene opgave — og næste uge får aftalens hidtidige tid igen.",
        "Udførte opgaver og opgaver sendt til Dinero røres aldrig. Historikken skal matche det der faktisk blev leveret."] },
    { h: "Weekend", p: ["Knappen Man–Fre / Man–Søn bestemmer om lørdag og søndag vises.", "Åbner du en uge hvor der allerede ligger opgaver i weekenden, slås kolonnerne til af sig selv.", "Slår du dem fra igen, står der ved siden af knappen hvor mange weekendopgaver der er skjult — så du ikke overser dem."] }, { h: "Sådan er «Ny opgave» og serviceordren bygget op", p: ["Begge skærme er delt i tre farvede afsnit, så det er tydeligt hvad der hører sammen. Farverne betyder det samme begge steder.", "Rosa er kunden: kontrakttype, prismodel, titel, fakturakunde, adresse, fakturabeskrivelse og adgangsforhold. Det er det der ender på fakturaen.", "Grønt er selve opgaven: krævede kompetencer, varighed, tjeklister og instruktionsvideo.", "Blåt er tid: i «Ny opgave» hedder det Planlægning og rummer fast interval eller fleksibel, ansvarlig medarbejder, start- og udløbsdato, interval og ugedage.", "Klikker du på en opgave i ugeplanen, åbner serviceordren med de samme tre farver. Der hedder det blå afsnit Udførelse og rummer status, medarbejdere på opgaven, tasks og tidsregistrering.", "I «Ny opgave» bliver Annuller og Gem og planlæg stående nederst, uanset hvor langt du har scrollet."] },
    { h: "Beskeder fra medarbejderne", p: [
        "Øverst i ugeplanen kommer et banner, når en medarbejder har meldt noget ind. Der er to slags.",
        "«Ønske om ny tid» betyder at medarbejderen har aftalt et nyt tidspunkt med kunden. Tryk «Godkend og flyt», så rykkes opgaven — eller «Afvis» og skriv hvorfor, så får hun en mail.",
        "«Forgæves besøg» betyder at medarbejderen ikke kunne komme ind, og at opgaven ikke blev udført. Banneret bliver rødt.",
        "Her er der ingen tid registreret, og opgaven ville derfor stå til 0 kr. Det er dig der afgør om kunden skal betale alligevel.",
        "Tryk «Sæt til udført og fakturér», så registreres antallet af minutter i feltet ved siden af, og opgaven kommer med på fakturaen. Feltet starter på opgavens planlagte varighed — sæt det ned hvis kun turen skal faktureres.",
        "Har medarbejderen samtidig foreslået en ny dato, kan du i stedet trykke «Flyt til …».",
        "Skal kunden ikke betale, tryk «Fakturér ikke». Opgaven bliver stående uden registreret tid og falder dermed selv ud af fakturagrundlaget."] },
    { h: "Udlevering af produkter", p: [
        "Sæt fluebenet «Der udleveres produkter til kunden» under Opgaven, hvis der bruges rengøringsmidler eller andet hos kunden.",
        "Med fluebenet bliver medarbejderen spurgt om produktforbrug når hun afslutter opgaven, og forbruget trækkes fra lageret og kommer med på fakturaen.",
        "Uden fluebenet springes spørgsmålet helt over i medarbejder-appen. Hun får ét trin mindre, og tælleren siger fx «1 af 2».",
        "Sat på aftalen gentager det sig på alle kommende opgaver. Du kan slå det til eller fra på en enkelt opgave i serviceordren, hvor det står lige under nøglefluebenet.",
        "Alle aftaler starter med det slået fra. Der var ikke registreret en eneste udlevering i systemet, da fluebenet blev indført, så det er sat op til at du selv vælger hvor det hører til."] },
    { h: "Nøgle eller adgangskort på kontoret", p: [
        "Skal medarbejderen forbi kontoret efter en nøgle eller et adgangskort, sæt fluebenet «Nøgle/adgangskort skal hentes på kontoret først» under Adgang.",
        "Sættes det på aftalen, gentager det sig på alle kommende opgaver. Er nøglen eller kortet allerede udleveret en enkelt uge, kan du slå det fra på den ene opgave uden at røre aftalen.",
        "Medarbejderen ser det på selve opgavekortet i dagslisten — altså inden hun kører — og ikke først når hun åbner opgaven."] },
    { h: "Adgangsoplysninger og logning", p: [
        "Nøgleboks- og alarmkoder ligger nu i en beskyttet tabel. De sendes ikke længere ud til medarbejder-appen sammen med opgaven.",
        "I appen er teksten skjult bag knappen «Vis adgangsoplysninger». Trykker hun, tjekker databasen at hun er på opgaven, skriver en linje i loggen med navn og tidspunkt, og svarer så med teksten.",
        "Det betyder at loggen er fuldstændig: der findes ingen anden vej til koden. Tidligere lå koden i det svar appen fik, uanset om den blev vist — og så kunne man læse den uden at det blev registreret.",
        "Du redigerer teksten som hidtil under Adgang på opgaven eller aftalen. Kun administratorer kan se og rette den.",
        "Åbn en opgave og tryk «Vis hvem der har åbnet adgangen» under kundeoplysningerne. Så står navn og tidspunkt for hver åbning, nyeste først.",
        "Loggen hentes først når du trykker — den vokser med hver åbning, og de fleste opgaver skal ikke slæbe den med hver gang de åbnes.",
        "Er der ingen linjer, har ingen åbnet adgangsoplysningerne på den opgave. Bemærk at der også logges når en medarbejder åbner en opgave uden adgangsoplysninger; ellers ville sporet have huller."] },
    { h: "Kommentarer og billeder", p: [
        "Medarbejderne kan skrive en kommentar og tage billeder på enhver opgave — også dem der gik som de skulle.",
        "Er der en kommentar på en opgave, står der 💬 på den i ugeplanen. Er der billeder med, står der 📷 i stedet.",
        "Selve kommentaren og billederne ser du under Fakturering, lige under opgavens linje. Det er dér du skal bruge dem.",
        "Billederne slettes automatisk efter 12 måneder, fordi billeder fra kundernes hjem er personoplysninger. Teksten bliver stående."] },
    { h: "Nexus-kvittering", p: [
        "På en Nexus-opgave bliver medarbejderen ved afslutningen mindet om at kvittere i KMD Nexus, og sætter et flueben når hun har gjort det.",
        "Fluebenet spærrer ikke — hun kan afslutte uden. Til gengæld markeres opgaven med «Nexus!» i ugeplanen og «Ikke kvitteret i Nexus» på fakturalinjen.",
        "Kommunen betaler efter det der står i Nexus, så en manglende kvittering er noget du skal følge op på med medarbejderen — ikke noget du kan rette her.",
        "Er der intet mærke, er der kvitteret, eller opgaven er ikke en Nexus-opgave."] },
  ], warn: "En fleksibel opgave har en «senest udført»-dato. Er fristen passeret, planlægges opgaven ikke — den rulles ikke videre af sig selv. Ret fristen, så placeres den med det samme." },

  employees: { title: "Medarbejdere", intro: "Her styrer du hvem der kan hvad, hvor meget tid de har, og hvilke områder de dækker.", blocks: [
    { h: "Sådan læses listen", p: [
        "Denne side er stamdata: hvem medarbejderne er, hvad de kan, hvor mange timer de har, og hvem der har adgang til appen. Hvor meget der er planlagt i en bestemt uge, står i Ugeplan — ikke her.",
        "Hver medarbejder er én linje med det aftalte timetal, weekendaftale og mødetid.",
        "Mærkaterne til højre er det du ellers ikke kan se: manglende app-adgang, kørsel som arbejdstid, administrator, og de to første kompetencer.",
        "Tryk på linjen for at folde den ud. Så kommer kompetencer med niveau, områder, timer pr. dag, app-adgang og udleveringshistorik. Flere kan være åbne ad gangen, så du kan sammenligne to medarbejdere.",
        "Søgefeltet søger i både navn og kompetencer, så «vindue» finder dem der kan vinduespolering. Sorteringen og områdefilteret virker sammen med søgningen.",
        "«Mangler app-adgang først» er en hurtig vej til dem du skal oprette et login til."] },
    { h: "Opret og redigér", p: ["Tryk «Ny medarbejder», eller «Redigér» når du har foldet en linje ud.",
        "Mødetid bruges til at beregne hvornår dagens første opgave kan starte.",
        "Timeløn bruges til lønsummerne i Medarbejder-eksport. Nye medarbejdere starter på 170 kr.",
        "Dialogen er delt i fire afsnit: Personen, Kan, Tid, og Løn og transport bag hængelås.",
        "Under Kan vises kun de kompetencer hun har. Tryk «Tilføj kompetence» for at se resten.",
        "Under Tid kan du sætte mandagens timetal på alle dage med ét tryk, og du kan se ugens sum — så du kan tjekke at det passer med hendes ansættelse.",
        "Administrator-fluebenet står for sig med rød ramme. Det giver adgang til hele planlægningsappen, til kollegernes løn og hjemmeadresser, til kundernes nøglebokskoder, til budgetterne i Rapportering, og til at markere fakturalinjer som sendt til Dinero. Sæt det kun på kontorets folk."] },
    { h: "Kørsel som arbejdstid", p: [
        "Nogle medarbejdere har kørsel med i arbejdstiden. Sæt fluebenet «Kørsel er en del af arbejdstiden» på hendes kort og skriv hjemmeadressen.",
        "Så tæller dagens kørsel i hendes kapacitet: hjemmefra til første opgave, mellem opgaverne, og fra sidste opgave hjem. På kortet står hvor meget af ugen der går til kørsel.",
        "Uden fluebenet planlægges hun præcis som hidtil. Transporten vises stadig på tidslinjen, men optager ingen kapacitet, og kørslen afregnes med kilometerpenge.",
        "Mødetiden bliver tidspunktet hvor hun tager hjemmefra — ikke hvor hun står hos den første kunde.",
        "Kan dagen ikke holde når kørslen tælles med, lægges opgaven på alligevel og dagen markeres «Overbelastet». Så forsvinder ingenting ud af syne, men du kan se at der skal flyttes noget.",
        "Uden hjemmeadresse slår ordningen ikke til, uanset fluebenet. Der er ingen adresse at regne fra."] },
    { h: "Hvem kan se hjemmeadressen", p: [
        "Adressen ligger i sin egen tabel med adgang for administratorer og for medarbejderen selv. Kollegerne kan ikke se den, heller ikke gennem medarbejder-appen.",
        "Adressen sendes til rutetjenesten for at beregne køretiden, på samme måde som kundernes adresser. Det er en databehandling af personoplysninger, og den bør stå i jeres dokumentation.",
        "Kilometerpengene røres ikke af ordningen. De beregnes stadig kun mellem opgaver med registreret tid — kørsel mellem hjem og arbejde indgår ikke."] },
    { h: "Hvem kan se lønnen", p: [
        "Timelønnen ligger i sin egen tabel, som kun administratorer har adgang til. Det er håndhævet i databasen, ikke kun i skærmbilledet.",
        "Er du ikke administrator, står feltet tomt, og lønkolonnerne i Medarbejder-eksport vises slet ikke — heller ikke i CSV-filen.",
        "Medarbejder-appen henter aldrig lønnen. En medarbejder kan altså ikke se hverken sin egen eller kollegernes sats der."] },
    { h: "Kompetencer", p: ["Ligger under knappen «Kompetencer» øverst på siden. Her opretter, omdøber og sletter du de færdigheder du kan kræve på en opgave.", "En kompetence er et krav, ikke et ønske: kan medarbejderen den ikke på det krævede niveau, kommer hun slet ikke i betragtning til opgaven.", "Selve niveauet sættes pr. medarbejder på hendes eget kort — Nybegynder, Øvet eller Ekspert. Kræver opgaven Øvet, er Nybegynder ikke nok.", "Blandt dem der lever op til kravene, vælges den med det højeste samlede niveau. Står to lige, vælges den med mest ledig tid den dag.", "Sletter du en kompetence, fjernes den fra alle medarbejdere og fra alle opgaver.", "Omdøber du en kompetence, følger medarbejderne og aftalerne med. Men opgaver der allerede ligger i kalenderen, husker det gamle navn og viser derefter «Ingen har alle krævede kompetencer» — så ret kompetencen på de opgaver, eller lad være med at omdøbe når der er oprettet opgaver."] },
        { h: "Områder", p: ["Ligger under knappen «Områder». Et område er et navn og en række postnumre, og du klikker de medarbejdere til der dækker det.", "Ved planlægning aflæses postnummeret i opgavens adresse. Findes der et område med det postnummer, søges der kun blandt de medarbejdere der er knyttet til området.", "Har adressen intet postnummer, eller er postnummeret ikke lagt ind på noget område, planlægges der frit blandt alle med kompetencerne.", "Er der ikke klikket en eneste medarbejder på et område, springes området over. Et tomt område spærrer altså ikke — det gør ingenting.", "Kan ingen i området løse opgaven, planlægges den alligevel hos en der kan, og opgaven mærkes «Planlagt uden for medarbejderens område». En opgave bliver aldrig liggende alene fordi den falder uden for et område.", "Sletter du et område, forsvinder tilknytningerne med det samme. Opgaverne røres ikke."] },
    { h: "Adgang til Worklist", p: ["Fold medarbejderen ud, skriv e-mailen og tryk Opret. Hun får en mail og kan logge ind i medarbejder-appen.",
        "«Luk adgang» fjerner loginet, men beholder medarbejderen og hendes historik. Brug den når nogen holder op."] },
    { h: "Arbejdstøj", p: [
        "Medarbejderne bestiller selv arbejdstøj i deres app, og du godkender bestillingerne under Lager. Her på medarbejderen ser du kun hvad hun har fået udleveret.",
        "Fold hende ud og tryk «Se historik» for de seneste 20 udleveringer."] },
    { h: "Sletning", p: [
        "«Slet» spørger nu først, og fortæller hvor mange kommende opgaver der mister hende — de går tilbage til «Ikke tildelt», og du skal selv planlægge dem på ny.",
        "Udførte opgaver beholder hendes navn og tidsregistrering, så historik og fakturagrundlag ikke ændrer sig.",
        "Sletningen fjerner ikke hendes login. Skal hun ikke kunne komme ind i appen, brug «Luk adgang» først.",
        "Holder hun bare op, er det som regel bedre at lukke adgangen og lade medarbejderen stå — så bevares sammenhængen i gamle uger."] },
  ], warn: "Weekendarbejde kræver flueben på medarbejderen. Uden det kan hun slet ikke planlægges lørdag og søndag. Med fluebenet er der ingen timegrænse i weekenden — derfor står der Ja/Nej og ikke et timetal." },

  checklists: { title: "Tjeklister", intro: "Tjeklister er de arbejdsopgaver medarbejderen sætter flueben ved ude hos kunden.", blocks: [
    { h: "Sådan gør du", p: ["Tryk «Ny tjekliste» og giv den et navn.",
        "Tilføj punkter i den rækkefølge de skal udføres.",
        "Sæt evt. beskrivelse og video på det enkelte punkt — det ses direkte i medarbejder-appen.",
        "Vælg tjeklisten når du opretter en opgave. Der kan vælges flere."] },
  ], warn: "Retter du i en tjekliste, slår ændringen igennem med det samme på alle opgaver der endnu ikke er udført — også dem der allerede ligger i kalenderen. Punkter medarbejderen har sat flueben ved bevares. Udførte opgaver røres ikke, så det står fast hvad der faktisk blev gjort." },

  time: { title: "Fakturering", intro: "Her omsætter du udført arbejde til fakturakladder i Dinero.", blocks: [
    { h: "Kolonnerne", p: ["Planlagt er den tid der er sat af. Registreret er den tid medarbejderen har logget.",
        "Dinero (blå) markerer at linjen er sendt. Det grønne flueben er fakturagrundlag."] },
    { h: "Sådan fakturerer du", p: ["Vælg måned og år.", "Gennemgå listen og ret manglende registreringer med medarbejderen.",
        "Sæt fakturagrundlag på det der skal faktureres.", "Tryk «Eksportér til Dinero» og bekræft.",
        "Linjerne markeres som sendt, så de ikke kan faktureres igen."] },
    { h: "Produkter", p: ["Produktforbrug vises som egne linjer under opgaven med antal og beløb.",
        "Hver produktlinje har sit eget flueben, men kræver at selve opgaven også er fakturagrundlag."] },
    { h: "Timepriser", p: ["Tryk «Timepriser» for at rette satsen pr. kontrakttype. Satsen bruges i fakturering, ugebelægning og rapportering.",
        "Opgaver med fastpris bruger deres egen pris i stedet."] },
    { h: "Kommentarer og billeder fra medarbejderen", p: [
        "Har medarbejderen skrevet en kommentar eller taget billeder ude hos kunden, står de direkte under opgavens linje.",
        "Brug dem når du skal afgøre beløbet — et billede af et usædvanligt beskidt køkken er det argument du skal bruge over for kunden bagefter.",
        "Er kommentaren mærket «Kom ikke ind», blev opgaven ikke udført. Er der alligevel registreret tid på den, er det fordi du selv har besluttet i ugeplanen at den skal faktureres.",
        "Billederne slettes automatisk efter 12 måneder. Står der at de er slettet, er teksten stadig gyldig dokumentation for hvad der skete.",
        "Står der «Ikke kvitteret i Nexus» på linjen, har medarbejderen afsluttet uden at kvittere i KMD Nexus. Tjek det før du fakturerer — kommunen betaler efter Nexus."] },
  ], warn: "Der faktureres kun registreret tid. Er der ikke logget tid, springes selve arbejdet over — også selvom opgaven er markeret som fakturagrundlag. Bekræftelsen fortæller hvor mange det gælder. Forbrugte produkter kommer stadig med." },

  inventory: { title: "Lager", intro: "Både det medarbejderne bruger hos kunderne, og arbejdstøj de kan bestille.", blocks: [
    { h: "De to slags produkter", p: ["Kundeprodukter bruges hos kunden og faktureres videre. De skal have varenummer og pris.",
        "Medarbejderprodukter er arbejdstøj og handsker. Dem bestiller medarbejderne selv, og du godkender."] },
    { h: "Daglig brug", p: ["«Justér» retter beholdningen efter optælling eller leverance.",
        "«Nyt produkt» opretter en vare — husk varenummer og pris på kundeprodukter.",
        "Varer under minimumbeholdning fremhæves.",
        "Bestillinger skal godkendes, før de trækkes fra lageret."] },
  ], warn: "Retter du prisen på et kundeprodukt, slår den igennem i Fakturering med det samme. Allerede sendte fakturalinjer røres ikke." },

  contracts: { title: "Aftaler", intro: "De faste kundeaftaler, sorteret så den der udløber først står øverst.", blocks: [
    { h: "Sådan læses den", p: ["Kontraktsum er forventet omsætning over hele perioden ud fra planlagte timer.",
        "Realiseret er hvad der faktisk er registreret.", "Dage tilbage viser hvor længe der er til aftalen udløber."] },
    { h: "Gentagelse", p: ["En aftale kan gentages hver uge, hver 14. dag, hver måned eller hvert kvartal."] }, { h: "Under udarbejdelse", p: ["Er du ikke færdig med en ny aftale, så tryk «Gem som kladde» i stedet for «Gem og planlæg».", "En kladde opretter ingen opgaver. Den ligger og venter, og du kan rette alle felter i den så mange gange du vil.", "Find den igen med filteret «Under udarbejdelse» øverst her på siden. Tallet i knappen viser hvor mange der ligger.", "Tryk «Åbn og godkend» for at rette videre. Inde i aftalen vælger du så «Gem kladde» hvis du stadig ikke er færdig, eller «Godkend og planlæg» når den er klar.", "Først ved godkendelsen oprettes opgaverne — fra startdatoen og frem til udløbsdatoen. Det kan være mange på én gang, så tjek datoerne inden du godkender.", "Startdatoen kan ikke ligge i fortiden. Har en kladde ligget så længe at datoen er løbet fra dig, skal den rettes før du kan godkende."] }, { h: "Filtre", p: ["Den øverste række filtrerer på status, den nederste på kontrakttype. De virker sammen, så du kan fx se alle udgåede Nexus-aftaler."] },
  ], warn: "Måned betyder kalendermåned. En månedlig aftale lander i den uge der indeholder samme dato som startdatoen — altså 12 besøg om året. Er startdatoen den 31., rammes sidste dag i korte måneder, så ingen måned springes over." },

  reports: { title: "Rapportering", intro: "Budget mod faktisk omsætning, opdelt pr. kontrakttype.", blocks: [
    { h: "Tallene", p: ["Budget er det du selv lægger ind med «Redigér budget».",
        "Planlagt er værdien af det der ligger i kalenderen.",
        "Registreret er den tid der faktisk er logget.",
        "Forecast fremskriver resten af året."] },
  ], warn: "Er «Registreret» meget lavere end «Planlagt», er det som regel manglende tidsregistrering — ikke manglende arbejde. Tjek Medarbejder-eksport." },

  medExport: { title: "Medarbejder-eksport", intro: "Grundlaget for løn: timer og kørsel pr. medarbejder.", blocks: [
    { h: "Sådan gør du", p: ["Vælg måned og år.", "«Afvigelse» viser hvor medarbejderen har skrevet en begrundelse.",
        "«Heraf weekend» er timer der udløser tillæg.",
        "Tryk «Eksportér CSV» og send til lønsystemet. Filen har egne kolonner for weekend og weekendtimer, og en sumlinje nederst."] },
    { h: "Løn", p: [
        "Hver medarbejder har en timeløn på sit kort under Medarbejdere. Nye medarbejdere starter på 170 kr.",
        "«Planlagt løn» er den afsatte tid gange medarbejderens sats. «Registreret løn» er den tid hun faktisk har registreret.",
        "Øverst står de to summer for hele måneden: planlagt lønsum og registreret lønsum.",
        "Er registreret lønsum meget lavere end planlagt, er det som regel manglende tidsregistrering — ikke sparede lønkroner. Kig i kolonnen «Registreret» først.",
        "Satsen bruges kun her. Den indgår ikke i fakturering eller rapportering, som regner med timepriser over for kunden."] },
    { h: "Hvis tallene ikke passer", p: ["Timer mangler — medarbejderen har ikke registreret.",
        "Kørsel mangler — der er ikke registreret tid, eller adresserne mangler.",
        "Weekendtimer er 0 — tjek weekendaftalen, og at opgaven lå lørdag eller søndag."] },
  ], warn: "Kørsel beregnes automatisk hver nat ud fra opgaverne — men kun for opgaver med registreret tid. Derfor får medarbejderne en påmindelse på mail hver dag kl. 18." },
};

// Udskriver hjaelpen som den staar lige nu. Hjaelpeteksten er kilden — der findes
// ikke en separat PDF der skal huskes opdateret. Browserens "Gem som PDF" i
// udskriftsvinduet giver filen.
function udskrivHjaelp(noegler) {
  const dele = noegler.map((k) => ({ key: k, h: MODULE_HELP[k] })).filter((x) => x.h);
  const esc = (s) => String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const idag = new Date().toLocaleDateString("da-DK", { day: "numeric", month: "long", year: "numeric" });
  const titel = dele.length === 1 ? dele[0].h.title : "Brugervejledning";
  const krop = dele.map((x) => (
    `<section><h2>${esc(x.h.title)}</h2><p class="intro">${esc(x.h.intro)}</p>` +
    (x.h.blocks || []).map((b) =>
      `<h3>${esc(b.h)}</h3>` + (b.p || []).map((l) => `<p>${esc(l)}</p>`).join("")
    ).join("") +
    (x.h.warn ? `<p class="warn">${esc(x.h.warn)}</p>` : "") + `</section>`
  )).join("");
  const w = window.open("", "_blank");
  if (!w) { alert("Tillad pop op-vinduer for at kunne udskrive vejledningen."); return; }
  w.document.write(
    `<!doctype html><html lang="da"><head><meta charset="utf-8"><title>${esc(titel)}</title><style>` +
    `body{font-family:Inter,-apple-system,system-ui,sans-serif;color:#111;line-height:1.55;max-width:760px;margin:0 auto;padding:28px 26px}` +
    `h1{color:#9C1B5D;font-size:26px;margin:0 0 4px}` +
    `.dato{color:#94A3B8;font-size:12px;margin:0 0 26px}` +
    `h2{color:#9C1B5D;font-size:19px;margin:26px 0 4px;page-break-after:avoid}` +
    `h3{font-size:14.5px;margin:16px 0 4px;page-break-after:avoid}` +
    `p{font-size:13.5px;margin:4px 0}` +
    `.intro{color:#475569;margin-bottom:8px}` +
    `.warn{background:#FEF3C7;border-left:4px solid #D97706;padding:10px 12px;font-weight:600;border-radius:4px}` +
    `section{page-break-inside:auto}` +
    `@page{margin:16mm}` +
    `</style></head><body><h1>Rengøringsplan</h1><p class="dato">${esc(titel)} · udskrevet ${esc(idag)}</p>${krop}</body></html>`
  );
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 400);
}
function ModuleHelp({ view, onClose }) {
  const h = MODULE_HELP[view];
  if (!h) return null;
  return (
    <div onClick={onClose} style={{ position:"fixed", inset:0, background:"rgba(17,17,17,0.45)", zIndex:200, display:"flex", justifyContent:"flex-end" }}>
      <div onClick={(e) => e.stopPropagation()}
        style={{ width:"min(560px, 100%)", background:"#fff", height:"100%", display:"flex", flexDirection:"column", boxShadow:"-4px 0 24px rgba(0,0,0,0.18)" }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"16px 20px", background:"#111", color:"#fff" }}>
          <div>
            <div style={{ fontSize:11, letterSpacing:0.6, color:"#94A3B8", fontWeight:700 }}>HJÆLP</div>
            <div style={{ fontWeight:800, fontSize:17 }}>{h.title}</div>
            <div style={{ display:"flex", gap:6, marginTop:8 }}>
              <button onClick={() => udskrivHjaelp([view])}
                style={{ border:"1px solid #555", background:"transparent", color:"#fff", borderRadius:8, padding:"4px 10px", fontSize:11.5, cursor:"pointer" }}>
                Udskriv dette modul
              </button>
              <button onClick={() => udskrivHjaelp(Object.keys(MODULE_HELP))}
                style={{ border:"1px solid #555", background:"transparent", color:"#fff", borderRadius:8, padding:"4px 10px", fontSize:11.5, cursor:"pointer" }}>
                Hele vejledningen
              </button>
            </div>
          </div>
          <button onClick={onClose} style={{ border:"none", background:"#333", color:"#fff", borderRadius:8, width:34, height:34, fontSize:17, cursor:"pointer" }}>✕</button>
        </div>
        <div style={{ flex:1, overflowY:"auto", padding:"18px 20px 30px", textAlign:"left" }}>
          <div style={{ fontSize:14.5, lineHeight:1.55, color:"#334155", marginBottom:18 }}>{h.intro}</div>
          {h.blocks.map((b, i) => (
            <div key={i} style={{ marginBottom:18 }}>
              <div style={{ fontWeight:800, fontSize:15, color:"#111111", marginBottom:6 }}>{b.h}</div>
              {b.p.map((line, j) => (
                <div key={j} style={{ fontSize:14, lineHeight:1.55, color:"#334155", marginBottom:5 }}>{line}</div>
              ))}
            </div>
          ))}
          {h.warn && (
            <div style={{ background:"#FEF3C7", borderLeft:"4px solid #D97706", borderRadius:6,
                          padding:"12px 14px", fontSize:14, lineHeight:1.5, color:"#111111", fontWeight:600 }}>
              {h.warn}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function HelpButton({ onClick }) {
  return (
    <button onClick={onClick} title="Hjælp til dette modul"
      style={{ position:"fixed", right:22, bottom:22, zIndex:150, width:54, height:54, borderRadius:"50%",
               border:"none", background:"#D6247A", color:"#fff", fontSize:26, fontWeight:800, lineHeight:1,
               cursor:"pointer", boxShadow:"0 4px 16px rgba(214,36,122,0.45)" }}>?</button>
  );
}

function PlanningApp({ session, onSignOut }) {
  const [lang, setLang] = useState(() => localStorage.getItem("rp_lang") || "da");
  useEffect(() => { localStorage.setItem("rp_lang", lang); }, [lang]);

  const L = {
    da: { schedule:"Ugeplan", employees:"Medarbejdere", checklists:"Tjeklister", time:"Fakturering", inventory:"Lager", contracts:"Aftaler", reports:"Rapportering", medExport:"Medarbejder-eksport", signOut:"Log ud", sub:"Ugeplanlægning · kapacitet · kompetenceniveauer" },
    en: { schedule:"Schedule", employees:"Employees", checklists:"Checklists", time:"Time & Export", inventory:"Inventory", contracts:"Contracts", reports:"Reporting", medExport:"Employee export", signOut:"Sign out", sub:"Weekly planning · capacity · skill levels" },
  }[lang];
  // ── Dynamiske master-data fra Supabase ──
  const [skills, setSkills] = useState(SKILLS_FALLBACK);
  const [customers, setCustomers] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [areas, setAreas] = useState([]);
  const [employeeAreas, setEmployeeAreas] = useState([]);
  const [pricing, setPricing] = useState({ privat: 450, erhverv: 550, nexus: 380, aeldrelov: 410 }); // [{employee_id, area_id}]
  const [budgets, setBudgets] = useState([]); // [{id, contract_type, year, month, amount}]
  const [templates, setTemplates] = useState([]);
  const [checklistTemplates, setChecklistTemplates] = useState([]);
  const [instances, setInstances] = useState([]);
  const [travelSettings, setTravelSettings] = useState({ defaultMinutes: 20, dayStart: "07:00", overrides: {} });
  const [loading, setLoading] = useState(true);

  // I stedet for et råt, ubegrænset uge-heltal (som tidligere kunne løbe løbsk til
  // fx "uge 67" ved gentagne klik på "næste uge" uden at rulle om ved årsskiftet),
  // holder vi styr på ugen via en rigtig dato (mandagen i den viste uge). Uge- og
  // årstal udledes altid herfra, så navigation aldrig kan give et ugyldigt resultat.
  const [weekAnchor, setWeekAnchor] = useState(() => mondayOf(new Date()));
  const { week: weekOffset, year: weekYear } = isoWeekInfo(weekAnchor);
  const [view, setView] = useState("uge");
  const [showAddTask, setShowAddTask] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showAddBlock, setShowAddBlock] = useState(false);
  const [showAddActivity, setShowAddActivity] = useState(false);
  const [copyPayload, setCopyPayload] = useState(null); /* Redigeres en kladde, ligger dens id her. Er den null, opretter modalen en ny aftale. */ const [editTplId, setEditTplId] = useState(null);
  const [showAddEmp, setShowAddEmp] = useState(false);
  const [editEmp, setEditEmp] = useState(null);
  const [toast, setToast] = useState(null);
  const [running, setRunning] = useState({});
  const [dragId, setDragId] = useState(null);
  const [openTaskId, setOpenTaskId] = useState(null);
  const [showTravelSettings, setShowTravelSettings] = useState(false);
  const [productUsage, setProductUsage] = useState([]);

  function notify(msg) { setToast(msg); setTimeout(() => setToast(null), 2800); }

  // ── Kundeprodukter brugt på opgaver — bruges til fakturaoverblik og Dinero-eksport ──
  // Eksponeret som en almindelig funktion (ikke kun i useEffect), så Lager-visningen
  // kan bede om en genindlæsning når et produkts pris/varenummer ændres — ellers ville
  // fakturagrundlaget vise en forældet pris indtil man genindlæser hele siden.
  const loadProductUsage = useCallback(async () => {
    const { data, error } = await supabase
      .from("inventory_transactions")
      .select("*, inventory_items(name, item_number, price, unit, category_id, inventory_categories(type, billable))")
      .eq("type", "out")
      .eq("status", "approved")
      .not("instance_id", "is", null);
    if (!error && data) {
      // Kun kategorier markeret som billable viderefaktureres. Rengoeringsmidler bruges
      // ogsaa hos kunden, men er indeholdt i timeprisen - kun forbrugsartikler saettes
      // paa fakturaen. Skal en anden kategori med, saettes billable paa den i databasen.
      setProductUsage(data.filter((tx) => tx.inventory_items?.inventory_categories?.billable === true));
    }
  }, [supabase]);

  useEffect(() => {
    loadProductUsage();
  }, [loadProductUsage]);

  // Slår en enkelt produktlinje til/fra som fakturagrundlag — uafhængigt af opgavens egen toggle.
  async function toggleProductInvoiceReady(txId, next) {
    setProductUsage((prev) => prev.map((tx) => (tx.id === txId ? { ...tx, invoice_ready: next } : tx)));
    const { error } = await supabase.from("inventory_transactions").update({ invoice_ready: next }).eq("id", txId);
    if (error) {
      notify("Kunne ikke opdatere fakturagrundlag for produktlinjen");
      setProductUsage((prev) => prev.map((tx) => (tx.id === txId ? { ...tx, invoice_ready: !next } : tx)));
    }
  }

  // Manuel rettelse af "sendt til Dinero"-status for en enkelt produktlinje (admin).
  async function toggleProductDineroExported(txId, next) {
    setProductUsage((prev) => prev.map((tx) => (tx.id === txId ? { ...tx, dinero_exported: next } : tx)));
    const { error } = await supabase.from("inventory_transactions").update({ dinero_exported: next }).eq("id", txId);
    if (error) {
      notify("Kunne ikke opdatere Dinero-status for produktlinjen");
      setProductUsage((prev) => prev.map((tx) => (tx.id === txId ? { ...tx, dinero_exported: !next } : tx)));
    }
  }

  // Markér produktlinjer som sendt til Dinero efter en succesfuld fakturakladde-oprettelse.
  async function markProductLinesDineroExported(txIds) {
    if (!txIds.length) return;
    const now = new Date().toISOString();
    setProductUsage((prev) => prev.map((tx) => (txIds.includes(tx.id) ? { ...tx, dinero_exported: true, dinero_exported_at: now } : tx)));
    const { error: markErr } = await supabase.from("inventory_transactions")
      .update({ dinero_exported: true, dinero_exported_at: now }).in("id", txIds);
    if (markErr) {
      // Kladden ER dannet i Dinero, saa linjerne maa ikke fremstaa som ikke-sendte:
      // sig det tydeligt, saa de ikke bliver faktureret igen ved naeste eksport.
      notify("Fakturakladden blev oprettet, men produktlinjerne kunne ikke markeres som sendt til Dinero — tjek dem manuelt");
    }
  }

  // ── Supabase: load alt ved opstart ──
  useEffect(() => {
    // Henter en tabel og proever ÉN gang igen efter en tvungen fornyelse af sessionen,
    // hvis svaret var 401.
    //
    // Baggrund: ved sideindlaesning giver klienten den gemte session med det samme og
    // fornyer den derefter i baggrunden. Starter indlaesningen inden fornyelsen er
    // faerdig, sendes den udloebne token med, og den forespoergsel der er undervejs
    // faar 401. De oevrige, der afsendes et oejeblik senere, lykkes — saa det ser ud
    // som om én bestemt tabel er tom, mens resten af appen fungerer.
    //
    // Det farlige var ikke fejlen, men at den var lydloes: svaret blev laest som en tom
    // liste, og planlaeggeren fik at vide at der ikke var nogen kommentarer.
    async function hentMedFornyelse(navn, byg) {
      let svar = await byg();
      if (svar.error && (svar.status === 401 || /jwt|token/i.test(svar.error.message || ""))) {
        await supabase.auth.refreshSession();
        svar = await byg();
      }
      if (svar.error) {
        console.error(`kunne ikke hente ${navn}:`, svar.error.message);
        notify(`Kunne ikke hente ${navn} — genindlæs siden. Oplysningerne vises som tomme indtil da.`);
      }
      return { data: svar.data };
    }

    async function loadAll() {
      setLoading(true);
      const [
        { data: skillsData },
        { data: customersData },
        { data: empData },
        { data: empSkillsData },
        { data: empCapData },
        { data: clData },
        { data: clItemsData },
        { data: tplData },
        { data: tplSkillsData },
        { data: instData },
      { data: onskerData },
      { data: noterData },
      { data: wageData },
      { data: homeData },
      { data: instAccessData },
      { data: custAccessData },
        { data: travelData },
        { data: overridesData },
      ] = await Promise.all([
        supabase.from("skills").select("*"),
        supabase.from("customers").select("*"),
        supabase.from("employees").select("*"),
        supabase.from("employee_skills").select("*"),
        supabase.from("employee_capacity").select("*"),
        supabase.from("checklist_templates").select("*"),
        supabase.from("checklist_template_items").select("*").order("sort_order"),
        supabase.from("service_templates").select("*"),
        supabase.from("service_template_skills").select("*"),
        // Slettemarkerede opgaver (aftalen er sat som udgaaet) hentes aldrig ind.
      // Dermed forsvinder de fra ugeplan, fakturering, rapportering og alt andet
      // paa én gang, uden at hvert modul skal huske at filtrere.
      fetchAllRows("instances", "*", (q) => q.is("deleted_at", null)).then((data) => ({ data })),
      hentMedFornyelse("ønsker om ny tid", () => supabase.from("reschedule_requests").select("*").eq("status", "afventer")),
      hentMedFornyelse("kommentarer og billeder", () => supabase.from("task_notes").select("*").order("created_at", { ascending: false })),
      // Timeloen. Politikken slipper kun administratorer ind, saa for alle andre
      // kommer der en tom liste tilbage — helt uden fejl, og uden at loennen laekker.
      hentMedFornyelse("timelønninger", () => supabase.from("employee_wages").select("*")),
      // Hjemmeadresse og transportordning. Samme historie som loennen: er man ikke
      // administrator, kommer der en tom liste tilbage, og ordningen slaar ikke til.
      hentMedFornyelse("transportordninger", () => supabase.from("employee_home").select("*")),
      // Adgangsoplysninger ligger i beskyttede tabeller. Planlaeggeren er administrator
      // og kan laese dem direkte; medarbejderne kan kun naa dem gennem hent_adgangsinfo.
      hentMedFornyelse("adgangsoplysninger", () => supabase.from("instance_access").select("*")),
      hentMedFornyelse("adgangsoplysninger på kunder", () => supabase.from("customer_access").select("*")),
        supabase.from("travel_settings").select("*").eq("id","default").single(),
        supabase.from("travel_overrides").select("*"),
      ]);
      // Load areas
      const [{ data: areasData }, { data: empAreasData }, { data: pricingData }, { data: budgetsData }] = await Promise.all([
        supabase.from("areas").select("*").order("name"),
        supabase.from("employee_areas").select("*"),
        supabase.from("pricing").select("*"),
        supabase.from("budgets").select("*"),
      ]);
      if (areasData) setAreas(areasData);
      if (empAreasData) setEmployeeAreas(empAreasData);
      if (pricingData?.length) {
        const p = {};
        pricingData.forEach((r) => { p[r.contract_type] = r.hourly_rate; });
        setPricing((prev) => ({ ...prev, ...p }));
      }
      if (budgetsData) setBudgets(budgetsData);

      // Skills
      if (skillsData?.length) setSkills(skillsData.map((s) => s.name));

      // Customers
      if (customersData) setCustomers(customersData);

      // Employees – saml skills og capacity op
      let empMapped = [];
      if (empData?.length) {
        empMapped = empData.map((e) => ({
          id: e.id, name: e.name, color: e.color,
          auth_user_id: e.auth_user_id ?? null,
          app_email: e.app_email ?? null,
          isAdmin: e.is_admin ?? false,
          weekendOk: e.weekend_ok ?? false,
          startTime: e.start_time || null,
          // Er man ikke administrator, giver politikken paa employee_wages ingen
          // raekker, og satsen bliver null. Eksporten viser da en streg i stedet for
          // et forkert beloeb — den maa ikke gaette paa standardsatsen.
          hourlyWage: (wageData || []).find((w) => w.employee_id === e.id)?.hourly_wage ?? null,
          homeAddress: (homeData || []).find((h) => h.employee_id === e.id)?.home_address ?? null,
          travelInWorktime: (homeData || []).find((h) => h.employee_id === e.id)?.travel_in_worktime ?? false,
          skills: Object.fromEntries(
            (empSkillsData || []).filter((s) => s.employee_id === e.id)
              .map((s) => {
                const skill = skillsData?.find((sk) => sk.id === s.skill_id);
                return [skill?.name ?? s.skill_id, s.level];
              })
          ),
          capacity: Object.fromEntries(
            (empCapData || []).filter((c) => c.employee_id === e.id)
              .map((c) => [c.weekday, c.minutes])
          ),
        }));
        setEmployees(sortEmployeesByName(empMapped));
      }

      // Checklist-skabeloner – saml items ind
      let clMapped = [];
      if (clData?.length) {
        clMapped = clData.map((cl) => ({
          id: cl.id, name: cl.name,
          items: (clItemsData || []).filter((i) => i.checklist_template_id === cl.id)
            .map((i) => ({ text: i.text, description: i.description, videoUrl: i.video_url })),
        }));
        setChecklistTemplates(clMapped);
      }

      // Adgangsoplysninger laegges i opslag, saa de kan slaas op pr. opgave og pr. kunde
      // uden at loebe hele listen igennem hver gang. Refs frem for state alene, fordi
      // realtime-opdateringer sker uden for render og skal kunne slaa det samme op.
      const instAccess = Object.fromEntries((instAccessData || []).map((r) => [r.instance_id, r.adgangstekst]));
      const custAccess = Object.fromEntries((custAccessData || []).map((r) => [r.customer_id, r.adgangstekst]));
      instAccessRef.current = instAccess;
      custAccessRef.current = custAccess;

      // Serviceordre-skabeloner – saml skills op + hent kundedata
      if (tplData?.length) {
        const mapped = tplData.map((t) => {
          const cust = customersData?.find((c) => c.id === t.customer_id);
          // Kundeoplysninger og kontrakttype gemmes som almindelig tekst direkte på
          // skabelonen (customer_name/address_text/...) — ligesom på instanserne —
          // fremfor via customer_id-relationen, som reelt aldrig bliver udfyldt af
          // UI'et. Falder tilbage til customer_id-opslaget for evt. ældre data.
          return {
            id: t.id, title: t.title, duration: t.duration, days: t.days,
            dayTimes: t.day_times || {}, dayDurations: t.day_durations || {}, preferredTime: t.preferred_time || null,
            videoUrl: t.video_url, poNumber: t.po_number,
            customerName: t.customer_name || cust?.name || "",
            address: t.address_text || cust?.address || "",
            // Aftalens egen tekst staar stadig paa service_templates: den tabel kan
            // slet ikke laeses af medarbejdere, saa den behoevede ikke flyttes.
            accessInstructions: t.access_instructions || custAccess[t.customer_id] || "",
            needsKeyPickup: t.needs_key_pickup ?? false,
            deliversProducts: t.delivers_products ?? false,
            contractType: t.contract_type || "privat",
            pricingType: t.pricing_type || "hourly",
            fixedPrice: t.fixed_price,
            planInterval: t.plan_interval || "uge",
            dineroSynced: t.dinero_synced ?? false,
            checklistTemplateIds: t.checklist_template_ids || [],
            extraItems: t.extra_items || [],
            checklistItems: buildChecklistItems(t.checklist_template_ids || [], t.extra_items || [], clMapped, []),
            startDate: t.start_date || null,
            expiryDate: t.expiry_date || null,
            preferredEmployeeId: t.preferred_employee_id || "",
            dineroContactGuid: t.dinero_contact_guid || "",
            status: t.status || "aktiv",
            cancelReason: t.cancel_reason || null,
            cancelledAt: t.cancelled_at || null,
            cancelledEffectiveDate: t.cancelled_effective_date || null,
            excludedDays: t.excluded_days ? JSON.parse(t.excluded_days) : [],
            requiredSkills: (tplSkillsData || [])
              .filter((s) => s.template_id === t.id)
              .map((s) => {
                const skill = skillsData?.find((sk) => sk.id === s.skill_id);
                return { skill: skill?.name ?? s.skill_id, minLevel: s.min_level };
              }),
          };
        });
        setTemplates(mapped);

        // Opbyg instanser fra skabeloner + eksisterende instanser
        const { week: currentWeek, year: currentYear } = isoWeekInfo(new Date());
        const existingInst = (instData || []).map((i) => {
          const cust = customersData?.find((c) => c.id === i.customer_id);
          return {
            ...i,
            templateId: i.template_id ?? null,
            timeLog: i.time_log ?? [],
            requiredSkills: i.required_skills ?? [],
            customerName: (i.customer_name || cust?.name || i.customer_id) ?? "",
            address: (i.address_text || cust?.address) ?? "",
            accessInstructions: instAccess[i.id] || custAccess[i.customer_id] || "",
            needsKeyPickup: i.needs_key_pickup ?? false,
            deliversProducts: i.delivers_products ?? false,
            contractType: i.contract_type || "privat",
            pricingType: i.pricing_type || "hourly",
            fixedPrice: i.fixed_price,
            scheduledTime: i.scheduled_time ? i.scheduled_time.slice(0, 5) : null,
            checklistTemplateIds: i.checklist_template_ids || [],
            extraItems: i.extra_items || [],
            invoiceReady: i.invoice_ready ?? false,
            dineroExported: i.dinero_exported ?? false,
            startDate: i.start_date || null,
            expiryDate: i.expiry_date || null,
            blockGroupId: i.block_group_id || null,
            dineroSynced: i.dinero_synced ?? false,
            includeInAuto: i.include_in_auto ?? false,
            offSchedule: i.off_schedule ?? false, completedBy: i.completed_by ?? null, completedAt: i.completed_at ?? null,
          nexusConfirmed: i.nexus_confirmed ?? null,
            onSchedule: i.on_schedule ?? false,
          };
        });
        // Planlaegningshorisont: opgaverne materialiseres altid fire uger frem, saa
        // planen kan overskues en maaned ud, og aftaler med fast medarbejder faar
        // vedkommende paa med det samme i stedet for foerst naar ugen aabnes.
        let allInst = existingInst;
        const horizonAnchor = mondayOf(new Date());
        for (let hw = 0; hw < HORIZON_WEEKS; hw++) {
          const hd = new Date(horizonAnchor);
          hd.setDate(hd.getDate() + hw * 7);
          const hi = isoWeekInfo(hd);
          allInst = ensureWeekInstances(hi.week, hi.year, allInst, mapped, empMapped, areasData || [], empAreasData || [], travelSettings);
        }
        // Den viste uge kan ligge uden for horisonten (hvis planlaeggeren har bladret).
        allInst = ensureWeekInstances(currentWeek, currentYear, allInst, mapped, empMapped, areasData || [], empAreasData || [], travelSettings);
        setNyTidOnsker(onskerData || []);
        setOpgaveNoter(grupperNoter(noterData));
        setInstances(allInst);
        syncHealedAssignments(existingInst, allInst);
        // Nye opgaver i horisonten skal gemmes med det samme. Ellers findes de kun
        // i browseren, og medarbejder-appen ville aldrig faa dem at se.
        const knownIds = new Set(existingInst.map((t) => t.id));
        allInst.filter((t) => !knownIds.has(t.id)).forEach(syncInstance);
      } else if (instData?.length) {
        setInstances(instData.map((i) => ({
          ...i, timeLog: i.time_log ?? [], requiredSkills: i.required_skills ?? [],
          templateId: i.template_id ?? null,
          contractType: i.contract_type || "privat",
          pricingType: i.pricing_type || "hourly",
          fixedPrice: i.fixed_price,
          scheduledTime: i.scheduled_time ? i.scheduled_time.slice(0, 5) : null,
          checklistTemplateIds: i.checklist_template_ids || [],
          extraItems: i.extra_items || [],
          invoiceReady: i.invoice_ready ?? false,
          dineroExported: i.dinero_exported ?? false,
          startDate: i.start_date || null,
          expiryDate: i.expiry_date || null,
          blockGroupId: i.block_group_id || null,
          dineroSynced: i.dinero_synced ?? false,
          includeInAuto: i.include_in_auto ?? false,
          offSchedule: i.off_schedule ?? false, completedBy: i.completed_by ?? null, completedAt: i.completed_at ?? null,
          nexusConfirmed: i.nexus_confirmed ?? null,
          onSchedule: i.on_schedule ?? false,
        })));
        setNyTidOnsker(onskerData || []);
        setOpgaveNoter(grupperNoter(noterData));
      }

      // Transport
      if (travelData) {
        const overrides = Object.fromEntries(
          (overridesData || []).map((o) => [travelKey(o.addr_a, o.addr_b), o.minutes])
        );
        setTravelSettings({ defaultMinutes: travelData.default_minutes, dayStart: travelData.day_start, overrides });
      }

      setLoading(false);
    }
    loadAll();
  }, []);

  // Henter faktisk koeretid for de adressepar der optraeder i den viste uge, men
  // som vi endnu ikke har en rute for. Edge-funktionen gemmer selv resultatet i
  // travel_overrides, saa et par kun slaas op én gang — derefter ligger tiden klar
  // ved naeste indlaesning. Par vi ikke faar svar paa, proeves ikke igen i denne
  // session, saa en adresse der ikke kan geokodes ikke udloeser kald i en uendelighed.
  const [cancelTarget, setCancelTarget] = useState(null);
  // Id'et paa den medarbejder der er ved at blive slettet. Sletningen sker foerst naar
  // bekraeftelsen er givet — knappen udloeser kun spoergsmaalet.
  const [sletMedarbejder, setSletMedarbejder] = useState(null);
  // Oensker om ny tid fra medarbejderne. De aendrer ikke selv planen — de beder om
  // en aendring, og backoffice afgoer og planlaegger den.
  const [nyTidOnsker, setNyTidOnsker] = useState([]);
  // Medarbejdernes kommentarer og billeder. Hentes samlet og lægges i et opslag pr.
  // opgave, saa hverken ugeplanen eller faktureringen skal spoerge databasen pr. linje.
  const [opgaveNoter, setOpgaveNoter] = useState({});
  const [afvisId, setAfvisId] = useState(null);
  const [afvisNote, setAfvisNote] = useState("");
  // Minutter kontoret vil fakturere for et forgaeves besoeg, pr. melding. Starter
  // paa opgavens planlagte varighed, men kan saettes ned hvis kun turen faktureres.
  const [forgaevesMin, setForgaevesMin] = useState({});
  const travelTried = useRef(new Set());
  useEffect(() => {
    if (loading) return;
    const byEmpDay = {};
    instances.forEach((t) => {
      if (t.week !== weekOffset || t.year !== weekYear) return;
      if (BLOCK_TYPES.includes(t.type) || !t.day || !t.address) return;
      (t.assignees || []).forEach((empId) => {
        const k = empId + "|" + t.day;
        if (!byEmpDay[k]) byEmpDay[k] = [];
        byEmpDay[k].push(t);
      });
    });
    const missing = [];
    const seen = new Set();
    const hjemMangler = [];
    const hjemSeen = new Set();
    function maaskeHent(a, b) {
      if (!a || !b || a === b) return;
      const key = travelKey(a, b);
      if (travelSettings.overrides[key] !== undefined) return;
      if (seen.has(key) || travelTried.current.has(key)) return;
      seen.add(key);
      missing.push({ a, b });
    }
    Object.entries(byEmpDay).forEach(([noegle, tasks]) => {
      const sorted = sortDayTasks(tasks);
      for (let i = 0; i < sorted.length - 1; i++) {
        maaskeHent(sorted[i].address, sorted[i + 1].address);
      }
      // Hjemmebenene skal ogsaa have en rigtig rutetid, ellers ville de tælle med
      // standardsatsen paa 20 minutter og give et forkert billede af hendes dag.
      // Kun for dem paa ordningen — andres privatadresser sendes ikke til rutetjenesten.
      if (sorted.length === 0) return;
      const empId = noegle.split("|")[0];
      const emp = employees.find((e) => e.id === empId);
      if (!emp || !emp.travelInWorktime || !emp.homeAddress) return;
      // Resultatet gemmes under medarbejder-id, ikke under adresseparret, saa
      // privatadressen aldrig havner i den liste der vises under Transporttid.
      [sorted[0].address, sorted[sorted.length - 1].address].forEach((adresse) => {
        if (!adresse || adresse === emp.homeAddress) return;
        const hk = hjemKey(emp.id, adresse);
        if ((travelSettings.hjemOverrides || {})[hk] !== undefined) return;
        if (hjemSeen.has(hk) || travelTried.current.has(hk)) return;
        hjemSeen.add(hk);
        hjemMangler.push({ empId: emp.id, hjem: emp.homeAddress, adresse });
      });
    });
    if (missing.length === 0 && hjemMangler.length === 0) return;
    // Alle par sendes i ét kald. Hjemmebenene ligger til sidst, saa svarene kan
    // fordeles: de foerste i den almindelige liste, resten i det beskyttede opslag.
    const alle = [...missing.map((p) => ({ a: p.a, b: p.b })),
                  ...hjemMangler.map((h) => ({ a: h.hjem, b: h.adresse }))];
    missing.forEach((p) => travelTried.current.add(travelKey(p.a, p.b)));
    hjemMangler.forEach((h) => travelTried.current.add(hjemKey(h.empId, h.adresse)));
    const glemProevet = () => {
      missing.forEach((p) => travelTried.current.delete(travelKey(p.a, p.b)));
      hjemMangler.forEach((h) => travelTried.current.delete(hjemKey(h.empId, h.adresse)));
    };
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke("travel-distance", {
          body: { pairs: alle },
        });
        if (cancelled) return;
        if (error) {
          // Naeste genindlaesning maa gerne proeve igen — det kan vaere et midlertidigt udfald.
          glemProevet();
          console.error("travel-distance:", error.message);
          return;
        }
        const results = (data && data.results) || [];
        const next = {};
        const nextHjem = {};
        results.forEach((r, i) => {
          if (!r || typeof r.minutes !== "number") return;
          // Positionen afgoer hvor svaret hoerer til. Adresseparret duer ikke som
          // noegle for hjemmebenene — det er praecis det vi vil undgaa at gemme.
          if (i < missing.length) {
            if (r.a && r.b) next[travelKey(r.a, r.b)] = r.minutes;
          } else {
            const h = hjemMangler[i - missing.length];
            if (h) nextHjem[hjemKey(h.empId, h.adresse)] = r.minutes;
          }
        });
        if (Object.keys(next).length === 0 && Object.keys(nextHjem).length === 0) return;
        setTravelSettings((prev) => ({
          ...prev,
          overrides: { ...prev.overrides, ...next },
          hjemOverrides: { ...(prev.hjemOverrides || {}), ...nextHjem },
        }));
      } catch (e) {
        glemProevet();
        console.error("travel-distance:", e);
      }
    })();
    return () => { cancelled = true; };
    // employees skal med i deps: uden den ville en nyligt indtastet hjemmeadresse
    // ikke udloese et opslag, og hjemmebenene ville blive staaende paa standardsatsen.
  }, [instances, employees, weekOffset, weekYear, travelSettings.overrides, loading]);

  // ── Supabase Realtime: hold "instances" i sync på tværs af faner/apps ──
  // Uden dette abonnement indlæses instances kun én gang ved opstart (loadAll
  // ovenfor) — ændringer lavet i medarbejder-appen (status, tid, begrundelse,
  // osv.) mens planlægningsappen allerede er åben, dukkede derfor aldrig op
  // uden et manuelt genindlæs af siden. Dette lytter på INSERT/UPDATE/DELETE
  // på "instances" og fletter ændringen ind i den lokale state med det samme,
  // så også flere hurtige statusskift efter hinanden altid afspejles korrekt.
  useEffect(() => {
    function mapRealtimeInstanceRow(i) {
      return {
        ...i,
        templateId: i.template_id ?? null,
        timeLog: i.time_log ?? [],
        requiredSkills: i.required_skills ?? [],
        customerName: i.customer_name ?? i.customer_id ?? "",
        dineroContactGuid: i.dinero_contact_guid || "",
        address: i.address_text ?? "",
        // Kolonnen paa instances staar tom nu. Teksten slaas op i det beskyttede opslag.
        accessInstructions: instAccessRef.current[i.id] || custAccessRef.current[i.customer_id] || "",
        needsKeyPickup: i.needs_key_pickup ?? false,
        deliversProducts: i.delivers_products ?? false,
        contractType: i.contract_type || "privat",
        pricingType: i.pricing_type || "hourly",
        fixedPrice: i.fixed_price,
        scheduledTime: i.scheduled_time ? i.scheduled_time.slice(0, 5) : null,
        checklistTemplateIds: i.checklist_template_ids || [],
        extraItems: i.extra_items || [],
        invoiceReady: i.invoice_ready ?? false,
        dineroExported: i.dinero_exported ?? false,
        startDate: i.start_date || null,
        expiryDate: i.expiry_date || null,
        blockGroupId: i.block_group_id || null,
        dineroSynced: i.dinero_synced ?? false,
        includeInAuto: i.include_in_auto ?? false,
        offSchedule: i.off_schedule ?? false,
        completedBy: i.completed_by ?? null,
        completedAt: i.completed_at ?? null,
        nexusConfirmed: i.nexus_confirmed ?? null,
        onSchedule: i.on_schedule ?? false,
      };
    }

    const channel = supabase
      .channel("instances-sync")
      .on("postgres_changes", { event: "*", schema: "public", table: "instances" }, (payload) => {
        if (payload.eventType === "DELETE") {
          const deletedId = payload.old?.id;
          if (!deletedId) return;
          setInstances((prev) => prev.filter((t) => t.id !== deletedId));
          return;
        }
        const mapped = mapRealtimeInstanceRow(payload.new);
        setInstances((prev) => {
          const idx = prev.findIndex((t) => t.id === mapped.id);
          if (idx === -1) return [...prev, mapped];
          const next = [...prev];
          next[idx] = { ...next[idx], ...mapped };
          return next;
        });
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  // ── Supabase: sync-helpers ──
  // Saettes laengere nede i render, hvor isAdminUser er regnet ud.
  const isAdminRef = useRef(false);
  // Adgangsoplysninger pr. opgave og pr. kunde. Refs frem for state, fordi de laeses
  // fra realtime-haandteringen og fra sync-funktioner der ligger uden for render.
  const instAccessRef = useRef({});
  const custAccessRef = useRef({});
  const syncEmployee = useCallback(async (emp) => {
    const { data: skillRows_db } = await supabase.from("skills").select("id, name");
    const { error: empErr } = await supabase.from("employees").upsert({ id: emp.id, name: emp.name, color: emp.color, is_admin: emp.isAdmin ?? false, weekend_ok: emp.weekendOk ?? false, start_time: emp.startTime || null }, { onConflict: "id" });
    if (dbFail(empErr, "gemme medarbejderen")) return;
    // Timeloennen skrives kun hvis den er sat. Er man ikke administrator, kunne den
    // ikke laeses ved indlaesningen, og et blindt gem ville overskrive den rigtige
    // sats med standardsatsen — politikken afviser det, men vi undlader helt at spoerge.
    // Timeloen og transportordning skrives KUN af en administrator. Begge tabeller kan
    // kun laeses af administratorer, saa for alle andre er vaerdierne i formularen
    // standardvaerdier og ikke det der staar i databasen — et gem ville saette
    // timeloennen til 170 og slaa transportordningen fra.
    //
    // Tidligere stod her "if (emp.hourlyWage != null)" og "!== undefined", men
    // formularen udfylder altid begge felter, saa betingelserne var altid sande.
    // Politikken afviste skrivningen, men brugeren fik en fejlbesked oven i hovedet.
    if (isAdminRef.current) {
      const { error: wageErr } = await supabase.from("employee_wages")
        .upsert({ employee_id: emp.id, hourly_wage: emp.hourlyWage ?? STANDARD_TIMELOEN, updated_at: new Date().toISOString() }, { onConflict: "employee_id" });
      if (dbFail(wageErr, "gemme timelønnen")) return;

      const { error: homeErr } = await supabase.from("employee_home")
        .upsert({ employee_id: emp.id, home_address: emp.homeAddress || null, travel_in_worktime: !!emp.travelInWorktime, updated_at: new Date().toISOString() }, { onConflict: "employee_id" });
      if (dbFail(homeErr, "gemme transportordningen")) return;
    }
    const skillRows = Object.entries(emp.skills || {})
      .map(([name, level]) => {
        const match = skillRows_db?.find((s) => s.name === name);
        return match ? { skill_id: match.id, level } : null;
      }).filter(Boolean);
    // Slet-og-indsaet koeres i databasen som een transaktion. Foer blev kompetencerne
    // slettet foerst, og fejlede indsaettelsen bagefter, stod medarbejderen tilbage
    // helt uden kompetencer - lydloest, for der blev ikke tjekket for fejl.
    const { error: skillErr } = await supabase.rpc("replace_employee_skills", {
      p_employee_id: emp.id, p_rows: skillRows,
    });
    if (dbFail(skillErr, "gemme medarbejderens kompetencer")) return;
    const capRows = Object.entries(emp.capacity || {}).map(([weekday, minutes]) => ({ employee_id: emp.id, weekday, minutes }));
    if (capRows.length) {
      const { error: capErr } = await supabase.from("employee_capacity").upsert(capRows, { onConflict: "employee_id,weekday" });
      if (capErr) dbFail(capErr, "gemme medarbejderens kapacitet");
    }
    // Sørg for at der findes en kapacitetsrække for alle syv dage. Weekend oprettes
    // med 0 minutter: dagen findes, så planlæggeren kan hæve den for en enkelt
    // medarbejder, men ingen bliver ledige i weekenden af sig selv.
    const DEFAULT_CAP_MINUTES = { Mon: 480, Tue: 480, Wed: 480, Thu: 480, Fri: 480, Sat: 0, Sun: 0 };
    // Bemærk: der tjekkes mod undefined og ikke falsy — ellers ville en bevidst sat
    // kapacitet på 0 blive skrevet tilbage til standardværdien ved hver gemning.
    const missingDays = Object.keys(DEFAULT_CAP_MINUTES).filter(dk => (emp.capacity || {})[dk] === undefined);
    if (missingDays.length) {
      const { error: seedErr } = await supabase.from("employee_capacity").upsert(
        missingDays.map(weekday => ({ employee_id: emp.id, weekday, minutes: DEFAULT_CAP_MINUTES[weekday] })),
        { onConflict: "employee_id,weekday" }
      );
      if (seedErr) dbFail(seedErr, "oprette manglende kapacitetsdage");
    }
  }, []);

  const removeEmployee = useCallback(async (id) => {
    const { error: delEmpErr } = await supabase.from("employees").delete().eq("id", id);
    if (dbFail(delEmpErr, "slette medarbejderen")) return;
  }, []);

  const syncInstance = useCallback(async (inst) => {
    const { error } = await supabase.from("instances").upsert({
      id: inst.id, template_id: inst.templateId ?? null, title: inst.title,
      type: inst.type, week: inst.week, year: inst.year ?? null, day: inst.day ?? null,
      deadline: inst.deadline ?? null, duration: inst.duration,
      status: inst.status ?? "unscheduled", video_url: inst.videoUrl ?? "",
      customer_id: null, po_number: inst.poNumber ?? "",
      dinero_contact_guid: inst.dineroContactGuid || null,
      warning: inst.warning ?? null,
      assignees: inst.assignees ?? [],
      checklist: inst.checklist ?? [],
      time_log: inst.timeLog ?? [],
      required_skills: inst.requiredSkills ?? [],
      customer_name: inst.customerName ?? "",
      address_text: inst.address ?? "",
      // access_instructions skrives IKKE laengere her. Kolonnen staar tom med vilje:
      // den sendes med i ethvert svar til medarbejderen, og saa kunne adgangskoden
      // laeses uden om det loggede opslag. Teksten gemmes i instance_access nedenfor.
      needs_key_pickup: !!inst.needsKeyPickup,
      delivers_products: !!inst.deliversProducts,
      contract_type: inst.contractType ?? "privat",
      pricing_type: inst.pricingType || "hourly",
      fixed_price: inst.fixedPrice ?? null,
      invoice_ready: inst.invoiceReady ?? false,
      dinero_exported: inst.dineroExported ?? false,
      start_date: inst.startDate || null,
      expiry_date: inst.expiryDate || null,
      block_group_id: inst.blockGroupId || null,
      dinero_synced: inst.dineroSynced ?? false,
      include_in_auto: inst.includeInAuto ?? false,
      off_schedule: inst.offSchedule ?? false,
      on_schedule: inst.onSchedule ?? false,
      completed_by: inst.completedBy ?? null,
      completed_at: inst.completedAt ?? null,
      // Skal med i skrivningen, ellers ville planlaeggerens egne rettelser paa en
      // opgave nulstille medarbejderens nexus-kvittering til null.
      nexus_confirmed: inst.nexusConfirmed ?? null,
      scheduled_time: inst.scheduledTime || null,
      checklist_template_ids: inst.checklistTemplateIds || [],
      extra_items: inst.extraItems || [],
    }, { onConflict: "id" });
    if (error) {
      // 23505 på uniq_instance_slot betyder at en anden session (fx en anden
      // browserfane eller enhed) allerede har oprettet præcis denne opgave
      // (samme skabelon/uge/dag) i mellemtiden — det er en kapløbssituation,
      // ikke en reel fejl. Den rigtige version af opgaven kommer ind via
      // Realtime-abonnementet, så vi skal ikke skræmme brugeren med en fejl
      // eller forsøge at gemme vores egen (nu overflødige) kopi igen.
      if (error.code === "23505" && String(error.message || "").includes("uniq_instance_slot")) {
        console.warn("syncInstance: opgaven findes allerede (kapløb), ignorerer", inst.id);
        return;
      }
      console.error("syncInstance error:", error.message, error.details, inst.id);
      // Uden dette forsvandt en fejlet gemning helt stille — opgaven virkede
      // oprettet i UI'et (optimistisk lokal state), men blev aldrig faktisk
      // gemt i databasen, og var så væk igen ved næste genindlæsning uden at
      // brugeren nogensinde fik besked om at noget gik galt.
      notify(`Kunne ikke gemme "${inst.title || "opgaven"}" — prøv igen (${error.message})`);
      return;
    }
    // Adgangsteksten gemmes for sig, i den beskyttede tabel. Kun administratorer maa
    // skrive der, saa der spoerges ikke naar man ikke er det — ellers ville politikken
    // afvise kaldet og brugeren faa en fejl for noget hun ikke havde bedt om.
    if (isAdminRef.current) {
      const tekst = (inst.accessInstructions || "").trim();
      if (tekst) {
        const { error: accErr } = await supabase.from("instance_access")
          .upsert({ instance_id: inst.id, adgangstekst: tekst, updated_at: new Date().toISOString() }, { onConflict: "instance_id" });
        if (accErr) notify("Opgaven er gemt, men adgangsoplysningen kunne ikke gemmes: " + accErr.message);
        else instAccessRef.current = { ...instAccessRef.current, [inst.id]: tekst };
      } else if (instAccessRef.current[inst.id]) {
        // Teksten er fjernet i brugerfladen — saa skal raekken ogsaa vaek.
        await supabase.from("instance_access").delete().eq("instance_id", inst.id);
        const kopi = { ...instAccessRef.current };
        delete kopi[inst.id];
        instAccessRef.current = kopi;
      }
    }
  }, []);

  const removeInstance = useCallback(async (id) => {
    const { error: delInstErr } = await supabase.from("instances").delete().eq("id", id);
    if (dbFail(delInstErr, "slette opgaven")) return;
  }, []);

  // Persisterer kunde-/kontraktfelter direkte på en "Fast interval"-skabelon, så
  // ændringer også slår igennem på de instanser der først materialiseres i fremtiden
  // (uden dette ville nye ugers opgaver blive genskabt med tomme kundefelter igen).
  const syncTemplateFields = useCallback(async (tplId, fields) => {
    if (!tplId) return;
    const payload = {};
    if ("customerName" in fields) payload.customer_name = fields.customerName ?? "";
    if ("address" in fields) payload.address_text = fields.address ?? "";
    // Aftalen ligger i service_templates, som medarbejdere slet ikke kan laese, saa
    // adgangsteksten kan blive staaende her. Det er kopien paa opgaven der var problemet.
    if ("accessInstructions" in fields) payload.access_instructions = fields.accessInstructions ?? "";
    if ("needsKeyPickup" in fields) payload.needs_key_pickup = !!fields.needsKeyPickup;
    if ("deliversProducts" in fields) payload.delivers_products = !!fields.deliversProducts;
    if ("dayTimes" in fields) payload.day_times = fields.dayTimes || {};
    if ("contractType" in fields) payload.contract_type = fields.contractType ?? "privat";
    if ("dineroSynced" in fields) payload.dinero_synced = !!fields.dineroSynced;
    if ("dineroContactGuid" in fields) payload.dinero_contact_guid = fields.dineroContactGuid || null;
    if ("preferredEmployeeId" in fields) payload.preferred_employee_id = fields.preferredEmployeeId || null;
    if (Object.keys(payload).length === 0) return;
    const { error } = await supabase.from("service_templates").update(payload).eq("id", tplId);
    if (error) console.error("syncTemplateFields error:", error.message);
  }, []);

  const syncChecklistTemplate = useCallback(async (cl) => {
    const { error: clErr } = await supabase.from("checklist_templates").upsert({ id: cl.id, name: cl.name }, { onConflict: "id" });
    if (dbFail(clErr, "gemme tjeklisten")) return;
    const rows = (cl.items || []).map((it, i) => ({
      sort_order: i, text: it.text,
      description: it.description || "", video_url: it.videoUrl || "",
    }));
    // Transaktionel udskiftning - se kommentaren ved replace_employee_skills.
    const { error: itemsErr } = await supabase.rpc("replace_checklist_template_items", {
      p_template_id: cl.id, p_rows: rows,
    });
    if (dbFail(itemsErr, "gemme tjeklistens punkter")) return;
  }, []);

  const removeChecklistTemplate = useCallback(async (id) => {
    const { error: delClErr } = await supabase.from("checklist_templates").delete().eq("id", id);
    if (dbFail(delClErr, "slette tjeklisten")) return;
  }, []);

  // Sammenligner "før" og "efter" en ensureWeekInstances-materialisering, og
  // gemmer enhver instans hvis assignees blev ændret af "slutkontrol"-tjekket i
  // scheduleWeek (fx en opgave der blev frigivet fra en medarbejder, som i
  // mellemtiden har fået en sygdom/ferie-blokering den dag). Uden dette ville
  // rettelsen kun leve i det lokale state og blive gentaget/tabt ved næste reload.
  function syncHealedAssignments(before, after) {
    const beforeById = new Map(before.map((t) => [t.id, t]));
    after.forEach((t) => {
      const prev = beforeById.get(t.id);
      if (!prev) return;
      const assigneesChanged = JSON.stringify(prev.assignees || []) !== JSON.stringify(t.assignees || []);
      const fieldsChanged = ["customerName","address","poNumber","accessInstructions","contractType","videoUrl"]
        .some((k) => (prev[k] ?? "") !== (t[k] ?? ""));
      if (assigneesChanged || fieldsChanged) {
        syncInstance(t);
      }
    });
  }

  function changeWeek(delta) {
    // Flyt ankerdatoen 7 rigtige kalenderdage ad gangen — det ruller helt naturligt
    // om ved årsskifte (uge 52/53 -> uge 1 i næste år) uden nogensinde at kunne
    // give et ugyldigt ugenummer som "uge 67".
    const nextAnchor = new Date(weekAnchor);
    nextAnchor.setDate(nextAnchor.getDate() + delta * 7);
    const { week: nextWeek, year: nextYear } = isoWeekInfo(nextAnchor);
    setInstances((cur) => {
      const next = ensureWeekInstances(nextWeek, nextYear, cur, templates, employees, areas, employeeAreas, travelSettings);
      syncHealedAssignments(cur, next);
      return next;
    });
    setWeekAnchor(nextAnchor);
  }

  function runAuto() {
    setInstances((prev) => {
      const thisWeek = prev.filter((t) => t.week === weekOffset && t.year === weekYear);

      // Forsinkede opgaver: ikke-tildelte opgaver fra en TIDLIGERE uge end den
      // man kigger på, som er markeret til auto-planlægning. De nåede ikke at
      // blive udført i deres egen uge, så i stedet for at ignorere dem (deres
      // aftalte dag er jo allerede passeret), tages de med i denne kørsel og
      // søges placeret i den viste uge — fra i dag og frem — og markeres
      // "uden for aftale", da det afviger fra den normale kadence.
      const isPastWeek = (t) => t.year < weekYear || (t.year === weekYear && t.week < weekOffset);
      const overdueCandidates = prev.filter((t) =>
        isPastWeek(t) && t.includeInAuto && !(t.assignees && t.assignees.length) && !BLOCK_TYPES.includes(t.type)
      );
      const overdueIds = new Set(overdueCandidates.map((t) => t.id));
      const forceWindowKeys = ALL_DAYS.slice(earliestAllowedDayIndex(weekOffset, weekYear)).map((d) => d.key);
      const overdueForRun = overdueCandidates.map((t) => ({ ...t, _forceWindow: forceWindowKeys }));

      const others = prev.filter((t) => !(t.week === weekOffset && t.year === weekYear) && !overdueIds.has(t.id));

      const before = [...thisWeek, ...overdueForRun].filter((t) => !(t.assignees && t.assignees.length)).length;
      const scheduledBatch = scheduleWeek([...thisWeek, ...overdueForRun], employees, true, areas, employeeAreas, null, travelSettings); // kun markerede
      const still = scheduledBatch.filter((t) => !(t.assignees && t.assignees.length)).length;

      const after = scheduledBatch.map((t) => {
        const { _forceWindow, ...rest } = t;
        if (overdueIds.has(t.id) && rest.assignees && rest.assignees.length) {
          // Lykkedes det at finde plads til den forsinkede opgave i den viste
          // uge, flyttes den officielt hertil (så den ikke længere optræder
          // som hjemmehørende i sin gamle, allerede overståede uge).
          return { ...rest, week: weekOffset, year: weekYear };
        }
        return rest;
      });
      after.filter((t) => overdueIds.has(t.id) && t.assignees && t.assignees.length).forEach(syncInstance);

      notify(before - still > 0 ? `${before - still} opgave(r) planlagt automatisk` : "Ingen markerede opgaver til planlægning");
      return [...others, ...after];
    });
  }

  // "Planlæg"-knappen i ugeplanen: forsøg at placere ALLE uplanlagte opgaver i
  // den viste uge (uanset "inkludér i auto"-flaget) med den samme
  // kompetence/kapacitet/dag-bevidste motor (scheduleWeek) som bruges alle
  // andre steder, og gem korrekt via syncInstance — så feltet "day" (som den
  // tidligere simple version glemte at gemme, hvorfor opgaven forsvandt fra
  // gridet efter planlægning) også bliver persisteret.
  function runScheduleWeek() {
    setInstances((prev) => {
      const thisWeek = prev.filter((t) => t.week === weekOffset && t.year === weekYear);
      const others = prev.filter((t) => !(t.week === weekOffset && t.year === weekYear));
      const unassignedIds = new Set(
        thisWeek.filter((t) => !(t.assignees && t.assignees.length) && !BLOCK_TYPES.includes(t.type)).map((t) => t.id)
      );
      if (unassignedIds.size === 0) {
        notify("Ingen uplanlagte opgaver denne uge");
        return prev;
      }
      const after = scheduleWeek(thisWeek, employees, false, areas, employeeAreas, unassignedIds, travelSettings);
      const newlyAssigned = after.filter((t) => unassignedIds.has(t.id) && t.assignees && t.assignees.length);
      newlyAssigned.forEach(syncInstance);
      newlyAssigned.forEach((t) => {
        const emp = employees.find((e) => e.id === t.assignees[0]);
        if (emp?.email) notifyEmployeeOfChanges(emp.email, emp.name, t.title || "Opgave", "Planlagt");
      });
      const names = Array.from(new Set(newlyAssigned.map((t) => employees.find((e) => e.id === t.assignees[0])?.name).filter(Boolean)));
      notify(newlyAssigned.length > 0 ? `${newlyAssigned.length} opgave(r) planlagt til: ${names.join(", ")}` : "Ingen ledige medarbejdere med rette kompetencer fundet lige nu");
      return [...others, ...after];
    });
  }

  // Samme automatiske planlægning som runAuto, men kørt for ALLE uger på tværs af
  // hele systemet i stedet for kun den uge man aktuelt kigger på — nyttigt når en
  // medarbejders kompetencer/område lige er blevet opdateret, og der ligger
  // "ikke tildelt"-opgaver markeret til auto-planlægning i andre uger end den viste.
  function runAutoAllWeeks() {
    setInstances((prev) => {
      const weekKeys = new Set(prev.map((t) => `${t.week}|${t.year}`));
      let result = [...prev];
      let totalBefore = 0;
      let totalStill = 0;
      weekKeys.forEach((key) => {
        const [wk, wy] = key.split("|").map(Number);
        const thisWeek = result.filter((t) => t.week === wk && t.year === wy);
        const others = result.filter((t) => !(t.week === wk && t.year === wy));
        const before = thisWeek.filter((t) => !(t.assignees && t.assignees.length)).length;
        const after = scheduleWeek(thisWeek, employees, true, areas, employeeAreas, null, travelSettings);
        const still = after.filter((t) => !(t.assignees && t.assignees.length)).length;
        totalBefore += before;
        totalStill += still;
        result = [...others, ...after];
      });
      notify(totalBefore - totalStill > 0 ? `${totalBefore - totalStill} opgave(r) planlagt automatisk på tværs af alle uger` : "Ingen markerede opgaver til planlægning");
      return result;
    });
  }

  // Placerer EEN opgave med det samme. Kan opgaven ikke placeres i sin egen uge -
  // typisk fordi fristen allerede er passeret - rulles den videre til de foelgende
  // uger og soeges placeret inden for den samme aftalte deadline-ugedag. Det svarer
  // til det man ellers skulle goere i haanden: gaa en uge frem og trykke Planlaeg.
  function planTaskNow(task, allInstances) {
    const weekList = allInstances.filter(
      (t) => t.week === task.week && t.year === task.year && t.id !== task.id
    );
    const result = scheduleWeek(
      [...weekList, task], employees, false, areas, employeeAreas, new Set([task.id]), travelSettings
    );
    return result.find((t) => t.id === task.id) || { ...task, warning: "no_slot" };
  }

  // Opdaterer en eksisterende aftale. Bruges kun paa kladder, hvor der endnu ikke
  // findes opgaver — derfor kan alle felter aendres frit uden at roere ved historik.
  //
  // Er saveAsDraft sand, gemmes den bare videre som kladde. Er den falsk, er det en
  // godkendelse: status saettes til aktiv, og opgaverne dannes fra startdatoen.
  async function updateTemplate(payload, tplId) {
    const checklistItemsCombined = [
      ...payload.checklistTemplateIds.flatMap((id) => checklistTemplates.find((c) => c.id === id)?.items || []),
      ...payload.extraItems,
    ];
    const nyStatus = payload.saveAsDraft ? "kladde" : "aktiv";
    const fastPris = payload.pricingType === "fixed" ? (Number(payload.fixedPrice) || 0) : null;

    const { error: updErr } = await supabase.from("service_templates").update({
      title: payload.title,
      duration: payload.duration,
      days: payload.days,
      day_times: payload.dayTimes || {},
      day_durations: payload.dayDurations || {},
      video_url: payload.videoUrl || "",
      po_number: payload.poNumber || "",
      customer_name: payload.customerName || "",
      address_text: payload.address || "",
      access_instructions: payload.accessInstructions || "",
      needs_key_pickup: !!payload.needsKeyPickup,
      delivers_products: !!payload.deliversProducts,
      contract_type: payload.contractType || "privat",
      pricing_type: payload.pricingType || "hourly",
      fixed_price: fastPris,
      plan_interval: payload.planInterval || "uge",
      dinero_synced: payload.dineroSynced || false,
      checklist_template_ids: payload.checklistTemplateIds || [],
      extra_items: payload.extraItems || [],
      start_date: payload.startDate || null,
      expiry_date: payload.expiryDate || null,
      preferred_employee_id: payload.assigned_employee_id || null,
      dinero_contact_guid: payload.dineroContactGuid || null,
      status: nyStatus,
    }).eq("id", tplId);
    if (dbFail(updErr, "gemme aftalen")) return;

    // Kompetencekravene ligger i en separat tabel og udskiftes helt i stedet for at
    // blive flettet — ellers ville et krav man har fjernet i kladden blive staaende.
    const { data: skillsDb } = await supabase.from("skills").select("id,name");
    const { error: delSkillErr } = await supabase.from("service_template_skills").delete().eq("template_id", tplId);
    if (dbFail(delSkillErr, "opdatere kompetencekravene")) return;

    const skillRows = (payload.requiredSkills || []).map((r) => {
      const sk = skillsDb?.find((s) => s.name === r.skill);
      return sk ? { template_id: tplId, skill_id: sk.id, min_level: r.minLevel } : null;
    }).filter(Boolean);
    if (skillRows.length) {
      const { error: insSkillErr } = await supabase.from("service_template_skills").insert(skillRows);
      if (insSkillErr) dbFail(insSkillErr, "gemme kompetencekravene");
    }

    const opdateret = {
      id: tplId,
      title: payload.title,
      requiredSkills: payload.requiredSkills,
      duration: payload.duration,
      days: payload.days,
      dayTimes: payload.dayTimes || {},
      dayDurations: payload.dayDurations || {},
      checklistTemplateIds: payload.checklistTemplateIds || [],
      extraItems: payload.extraItems || [],
      checklistItems: checklistItemsCombined,
      videoUrl: payload.videoUrl,
      customerName: payload.customerName,
      address: payload.address,
      poNumber: payload.poNumber,
      accessInstructions: payload.accessInstructions,
      needsKeyPickup: !!payload.needsKeyPickup,
      deliversProducts: !!payload.deliversProducts,
      contractType: payload.contractType,
      expiryDate: payload.expiryDate,
      pricingType: payload.pricingType || "hourly",
      fixedPrice: fastPris,
      planInterval: payload.planInterval || "uge",
      startDate: payload.startDate || null,
      dineroSynced: payload.dineroSynced || false,
      preferredEmployeeId: payload.assigned_employee_id || "",
      dineroContactGuid: payload.dineroContactGuid || "",
      status: nyStatus,
    };

    setTemplates((prevT) => {
      const nextT = prevT.map((t) => (t.id === tplId ? opdateret : t));
      // En kladde materialiseres ikke. Opgaverne dannes foerst ved godkendelsen.
      if (payload.saveAsDraft) return nextT;

      setInstances((cur) => {
        let next = [...cur];
        ugerFraStartTilUdloeb(payload.startDate, payload.expiryDate).forEach(({ week: wk, year: wy }) => {
          const before = next;
          const expanded = ensureWeekInstances(wk, wy, next, nextT, employees, areas, employeeAreas, travelSettings);
          const newOnes = expanded.filter((i) => !next.find((c) => c.id === i.id));
          newOnes.forEach((inst) => syncInstance({
            ...inst,
            contractType: payload.contractType,
            expiryDate: payload.expiryDate,
            pricingType: opdateret.pricingType,
            fixedPrice: opdateret.fixedPrice,
          }));
          syncHealedAssignments(before, expanded);
          next = expanded;
        });
        return next;
      });
      return nextT;
    });

    notify(payload.saveAsDraft ? "Kladden er gemt" : "Aftalen er godkendt og opgaverne er oprettet");
  }

  async function addTask(payload) {
    const checklistItemsCombined = [
      ...payload.checklistTemplateIds.flatMap((id) => checklistTemplates.find((c) => c.id === id)?.items || []),
      ...payload.extraItems,
    ];

    // Alle {week, year}-par fra startDate til expiryDate — itererer i rigtige
    // 7-dages spring over kalenderen, så årsskifter håndteres korrekt (i stedet for
    // den tidligere "år*53+uge"-regnestykke, der kunne give ugyldige ugenumre).
    function weeksUntilExpiry(expiryDateStr, startDateStr) {
      const startMonday = mondayOf(startDateStr ? new Date(startDateStr) : new Date());
      if (!expiryDateStr) return [isoWeekInfo(startMonday)];

      const expiryMonday = mondayOf(new Date(expiryDateStr));
      const weeks = [];
      let cursor = new Date(startMonday);
      while (cursor <= expiryMonday && weeks.length < 104) {
        weeks.push(isoWeekInfo(cursor));
        cursor.setDate(cursor.getDate() + 7);
      }
      return weeks.length ? weeks : [isoWeekInfo(startMonday)];
    }

    if (payload.type === "fixed") {
      const tplId = uid("tpl");
      const tpl = {
        id: tplId, title: payload.title, requiredSkills: payload.requiredSkills,
        duration: payload.duration, days: payload.days, dayTimes: payload.dayTimes || {},
        dayDurations: payload.dayDurations || {},
        checklistTemplateIds: payload.checklistTemplateIds || [], extraItems: payload.extraItems || [],
        checklistItems: checklistItemsCombined,
        videoUrl: payload.videoUrl, customerName: payload.customerName, address: payload.address,
        poNumber: payload.poNumber, accessInstructions: payload.accessInstructions,
        needsKeyPickup: !!payload.needsKeyPickup,
        deliversProducts: !!payload.deliversProducts,
        contractType: payload.contractType, expiryDate: payload.expiryDate,
        pricingType: payload.pricingType || "hourly", fixedPrice: payload.pricingType === "fixed" ? (Number(payload.fixedPrice) || 0) : null,
        planInterval: payload.planInterval || "uge",
        startDate: payload.startDate || null, dineroSynced: payload.dineroSynced || false,
        preferredEmployeeId: payload.assigned_employee_id || "",
        dineroContactGuid: payload.dineroContactGuid || "", status: payload.saveAsDraft ? "kladde" : "aktiv",
      };
      const { error: tplErr } = await supabase.from("service_templates").insert({
        id: tplId, title: tpl.title, duration: tpl.duration, days: tpl.days, day_times: tpl.dayTimes || {},
        day_durations: tpl.dayDurations || {},
        video_url: tpl.videoUrl || "", po_number: tpl.poNumber || "",
        customer_name: tpl.customerName || "", address_text: tpl.address || "",
        access_instructions: tpl.accessInstructions || "", needs_key_pickup: !!tpl.needsKeyPickup,
        delivers_products: !!tpl.deliversProducts,
        contract_type: tpl.contractType || "privat",
        pricing_type: tpl.pricingType || "hourly", fixed_price: tpl.fixedPrice,
        plan_interval: tpl.planInterval || "uge",
        dinero_synced: tpl.dineroSynced,
        checklist_template_ids: tpl.checklistTemplateIds || [],
        extra_items: tpl.extraItems || [],
        start_date: payload.startDate || null,
        expiry_date: payload.expiryDate || null,
        preferred_employee_id: tpl.preferredEmployeeId || null,
        dinero_contact_guid: tpl.dineroContactGuid || null, status: payload.saveAsDraft ? "kladde" : "aktiv",
      });
      if (dbFail(tplErr, "oprette den faste aftale")) return;
      const { data: skillsDb } = await supabase.from("skills").select("id,name");
      const skillRows = (payload.requiredSkills || []).map((r) => {
        const sk = skillsDb?.find((s) => s.name === r.skill);
        return sk ? { template_id: tplId, skill_id: sk.id, min_level: r.minLevel } : null;
      }).filter(Boolean);
      if (skillRows.length) {
        const { error: tplSkillErr } = await supabase.from("service_template_skills").insert(skillRows);
        if (tplSkillErr) dbFail(tplSkillErr, "gemme opgavens kompetencekrav");
      }

      setTemplates((prevT) => {
        const nextT = [...prevT, tpl]; /* En kladde materialiseres ikke. Opgaverne dannes foerst naar aftalen godkendes under Aftaler. */ if (payload.saveAsDraft) return nextT;
        setInstances((cur) => {
          const weeks = weeksUntilExpiry(payload.expiryDate, payload.startDate);
          let next = [...cur];
          weeks.forEach(({ week: wk, year: wy }) => {
            const before = next;
            const expanded = ensureWeekInstances(wk, wy, next, nextT, employees, areas, employeeAreas, travelSettings);
            const newOnes = expanded.filter((i) => !next.find((c) => c.id === i.id));
            newOnes.forEach((inst) => syncInstance({ ...inst, contractType: payload.contractType, expiryDate: payload.expiryDate, pricingType: tpl.pricingType, fixedPrice: tpl.fixedPrice }));
            syncHealedAssignments(before, expanded);
            next = expanded;
          });
          return next;
        });
        return nextT;
      });
    } else {
      // "adhoc" (vist som "Fleksibel" i UI'et) — den eneste anden opgavetype
      // man kan oprette. Oprettelsesugen sættes altid til dags dato-ugen.
      // Hvis planlæggeren har valgt en medarbejder + dato, placeres opgaven direkte.
      // Ellers lander den i "Ikke tildelt", klar til manuel eller markeret auto-planlægning.
      const hasEmployeeAndDate = payload.assigned_employee_id && payload.adhocDate;
      
      // Konvertér konkret dato til ugedag når medarbejder er valgt
      let dayForPlacement = null;
      let deadlineDay = payload.deadline || "Fri";
      let adhocWeek, adhocYear;
      
      if (hasEmployeeAndDate) {
        const dateObj = new Date(payload.adhocDate);
        dayForPlacement = weekdayKeyFor(dateObj);
        // Sæt deadline til samme dag som den ønskede placering
        deadlineDay = dayForPlacement;
        // Ugen/året skal følge den valgte dato, ikke dags dato
        ({ week: adhocWeek, year: adhocYear } = isoWeekInfo(dateObj));
      } else {
        ({ week: adhocWeek, year: adhocYear } = isoWeekInfo(new Date()));
      }
      
      const newInstance = {
        id: uid("i"), title: payload.title, requiredSkills: payload.requiredSkills,
        duration: payload.duration, 
        assignees: hasEmployeeAndDate ? [payload.assigned_employee_id] : [], 
        status: "unscheduled", timeLog: [],
        week: adhocWeek, year: adhocYear, checklist: instantiateChecklist(checklistItemsCombined),
        checklistTemplateIds: payload.checklistTemplateIds || [], extraItems: payload.extraItems || [],
        videoUrl: payload.videoUrl, customerName: payload.customerName,
        address: payload.address, poNumber: payload.poNumber, accessInstructions: payload.accessInstructions,
        needsKeyPickup: !!payload.needsKeyPickup,
        deliversProducts: !!payload.deliversProducts,
        contractType: payload.contractType, dineroSynced: payload.dineroSynced || false,
        pricingType: payload.pricingType || "hourly",
        fixedPrice: payload.pricingType === "fixed" ? (Number(payload.fixedPrice) || 0) : null,
        type: "adhoc", day: dayForPlacement, deadline: deadlineDay,
        scheduledTime: payload.preferredTime || null,
        // Nye fleksible opgaver er med i auto-planlaegning som standard. Foer skulle
        // fluebenet saettes manuelt bagefter, og indtil da sprang Planlaeg-knappen
        // opgaven over uden nogen form for besked.
        includeInAuto: true,
      };
      if (hasEmployeeAndDate) {
        setInstances((prev) => [...prev, newInstance]);
        syncInstance(newInstance);
      } else {
        // "Gem og planlaeg" skal rent faktisk planlaegge. Opgaven placeres med det samme
        // hvis betingelserne kan opfyldes - ellers lander den i "Ikke tildelt" med en
        // forklarende advarsel i stedet for bare at blive liggende uden begrundelse.
        setInstances((prev) => {
          const placed = planTaskNow(newInstance, prev);
          if (placed.assignees && placed.assignees.length) {
            const emp = employees.find((e) => e.id === placed.assignees[0]);
            const dayLabel = ALL_DAYS.find((x) => x.key === placed.day)?.label || placed.day;
            notify(`Planlagt til ${emp?.name || "medarbejder"} ${String(dayLabel).toLowerCase()}`);
          } else {
            notify(placed.warning === "no_skill"
              ? "Ingen medarbejder har de krævede kompetencer i området — opgaven ligger i Ikke tildelt"
              : "Ingen ledig dag inden fristen — opgaven ligger i Ikke tildelt");
          }
          syncInstance(placed);
          return [...prev, placed];
        });
      }
    }
    setShowAddTask(false);
  }

  function updateInstance(taskId, updater) {
    setInstances((prev) => {
      const newInstances = prev.map((t) => {
        if (t.id !== taskId) return t;
        
        const oldTask = t;
        const updated = updater(t);
        
        // Check if today is affected
        const today = new Date();
        const todayDayNum = (today.getDay() + 6) % 7;
        
        const oldDayNum = typeof oldTask.day === 'string' ? DAY_STRING_TO_NUM[oldTask.day] : oldTask.day;
        const newDayNum = typeof updated.day === 'string' ? DAY_STRING_TO_NUM[updated.day] : updated.day;
        
        const isOldTaskToday = oldDayNum === todayDayNum;
        const isNewTaskToday = newDayNum === todayDayNum;
        
        // Send email ONLY if today's tasks are affected
        if (isOldTaskToday || isNewTaskToday) {
          // Task added to today
          if (!isOldTaskToday && isNewTaskToday && updated.assignees?.length > 0) {
            const emp = employees.find(e => e.id === updated.assignees[0]);
            if (emp?.app_email?.trim()) {
              notifyEmployeeOfChanges(emp.app_email.trim(), emp.name, updated.title, '✅ Ny opgave på din dagsplan').catch(e => console.error("Notify error:", e));
            }
          }
          
          // Task removed from today
          if (isOldTaskToday && !isNewTaskToday) {
            const emp = employees.find(e => e.id === oldTask.assignees?.[0]);
            if (emp?.app_email?.trim()) {
              notifyEmployeeOfChanges(emp.app_email.trim(), emp.name, oldTask.title, '❌ Opgave fjernet fra din dagsplan').catch(e => console.error("Notify error:", e));
            }
          }
          
          // Task on today is modified (title, duration, assignee, etc.)
          if (isOldTaskToday && isNewTaskToday && updated.assignees?.length > 0) {
            if (oldTask.title !== updated.title || oldTask.duration !== updated.duration || JSON.stringify(oldTask.assignees) !== JSON.stringify(updated.assignees)) {
              const emp = employees.find(e => e.id === updated.assignees[0]);
              if (emp?.app_email?.trim()) {
                notifyEmployeeOfChanges(emp.app_email.trim(), emp.name, updated.title, '📝 Opgaven på din dagsplan er ændret').catch(e => console.error("Notify error:", e));
              }
            }
          }
        }
        
        // If title changed, sync to all instances of same task
        if (oldTask.title !== updated.title) {
          return prev.map(inst => {
            if (inst.title === oldTask.title) {
              return { ...inst, title: updated.title };
            }
            return inst;
          });
        }
        
        return updated;
      }).flat();
      
      // Sync the main updated instance
      const updated = newInstances.find(t => t.id === taskId);
      if (updated) syncInstance(updated);
      
      return newInstances;
    });
  }

  // Opdaterer kontrakttype for hele aftalen (alle forekomster af samme skabelon),
  // ikke kun den enkelte opgave — så det afspejles korrekt i Aftaler-oversigten.
  // Matcher primært via templateId, men falder tilbage til titel-match for ældre
  // data hvor koblingen mellem opgave og skabelon mangler.
  function updateContractType(taskId, newType) {
    const task = instances.find((t) => t.id === taskId);
    if (!task) return;
    const tplId = task.templateId || null;
    const matchTitle = task.title;
    let skippedInvoiced = false;

    setInstances((prev) => prev.map((t) => {
      const sameTemplate = tplId && t.templateId === tplId;
      // Fanger "løsrevne" instanser af samme titel, der mangler template_id —
      // på begge sider af sammenligningen (både hvis MÅL-opgaven mangler den,
      // og hvis den redigerede KILDE-opgave selv mangler den). Uden det sidste
      // opdateres kun den ene retning: orphan -> skabelon, men ikke skabelon ->
      // orphan når det er en orphan-instans man sidder og redigerer.
      const sameTitleFixed = t.type === "fixed" && task.type === "fixed" && t.title === matchTitle && (!tplId || !t.templateId);
      if (t.id === taskId || sameTemplate || sameTitleFixed) {
        // Opgaver der allerede er overført til Dinero er faktureret, og må ikke
        // ændres bagefter — data skal matche det der reelt blev sendt til Dinero.
        if (t.dineroExported) { skippedInvoiced = true; return t; }
        const updated = { ...t, contractType: newType };
        syncInstance(updated);
        return updated;
      }
      return t;
    }));
    if (skippedInvoiced) notify("Bemærk: opgaver allerede sendt til Dinero blev ikke ændret (faktureret)");

    // Opdater også skabelonen — både lokalt (så Aftaler-oversigten straks
    // afspejler ændringen) og i databasen, så fremtidige uger der materialiseres
    // fra skabelonen arver den nye kontrakttype i stedet for at falde tilbage til
    // "privat".
    setTemplates((prev) => prev.map((tpl) => {
      if (tpl.id === tplId || tpl.title === matchTitle) {
        if (tpl.id) syncTemplateFields(tpl.id, { contractType: newType });
        return { ...tpl, contractType: newType };
      }
      return tpl;
    }));
  }

  // Retter opgavens navn (opgaveoverskriften). Aendringen slaar igennem paa alle
  // ikke-afsluttede forekomster af samme skabelon (samme strategi som
  // updateContractType/updateCustomerInfo ovenfor) - ikke kun den enkelte opgave,
  // saa en stavefejl kan rettes et sted og gaelder fremover. Den viste opgave rettes
  // altid, uanset status. Kun administratorer maa kalde denne (haandhaeves i UI'en).
  function renameTask(taskId, newTitle) {
    const trimmed = (newTitle || "").trim();
    if (!trimmed) return;
    const task = instances.find((t) => t.id === taskId);
    if (!task) return;
    const tplId = task.templateId || null;

    setInstances((prev) => prev.map((t) => {
      const sameTemplate = tplId && t.templateId === tplId;
      const sameOrphanTitle = !tplId && !t.templateId && t.title === task.title;
      const isMatch = t.id === taskId || ((sameTemplate || sameOrphanTitle) && t.status !== "udført");
      if (isMatch) {
        const updated = { ...t, title: trimmed };
        syncInstance(updated);
        return updated;
      }
      return t;
    }));
  }

  // Opdaterer kundeoplysninger for hele aftalen (alle forekomster af samme skabelon),
  // så en rettelse af fx kundenavn slår igennem på alle relaterede opgaver — ikke kun
  // den enkelte opgave man sidder og redigerer. Matcher primært via templateId, men
  // falder tilbage til titel-match for ældre data hvor koblingen mangler (samme
  // strategi som updateContractType ovenfor).
  function updateCustomerInfo(taskId, fields) {
    const task = instances.find((t) => t.id === taskId);
    if (!task) return;
    const tplId = task.templateId || null;
    const matchTitle = task.title;

    let skippedInvoiced = false;
    setInstances((prev) => prev.map((t) => {
      const sameTemplate = tplId && t.templateId === tplId;
      // Fanger "løsrevne" instanser af samme titel, der mangler template_id —
      // på begge sider af sammenligningen (både hvis MÅL-opgaven mangler den,
      // og hvis den redigerede KILDE-opgave selv mangler den). Uden det sidste
      // opdateres kun den ene retning: orphan -> skabelon, men ikke skabelon ->
      // orphan når det er en orphan-instans man sidder og redigerer.
      const sameTitleFixed = t.type === "fixed" && task.type === "fixed" && t.title === matchTitle && (!tplId || !t.templateId);
      if (t.id === taskId || sameTemplate || sameTitleFixed) {
        // Opgaver der allerede er overført til Dinero er faktureret, og må ikke
        // ændres bagefter — data skal matche det der reelt blev sendt til Dinero.
        if (t.dineroExported) { skippedInvoiced = true; return t; }
        const updated = { ...t, ...fields };
        syncInstance(updated);
        return updated;
      }
      return t;
    }));
    if (skippedInvoiced) notify("Bemærk: opgaver allerede sendt til Dinero blev ikke ændret (faktureret)");

    // Persistér også på selve "Fast interval"-skabelonen, så fremtidige uger,
    // der endnu ikke er materialiseret, arver de opdaterede kundeoplysninger i
    // stedet for at blive genskabt med tomme felter (den oprindelige årsag til at
    // kundenavn kunne forsvinde på nyoprettede uger).
    if (task.type === "fixed") {
      if (tplId) {
        syncTemplateFields(tplId, fields);
      } else {
        const tplByTitle = templates.find((tpl) => tpl.title === matchTitle);
        if (tplByTitle) syncTemplateFields(tplByTitle.id, fields);
      }
      setTemplates((prev) => prev.map((tpl) => (
        tpl.id === tplId || tpl.title === matchTitle ? { ...tpl, ...fields } : tpl
      )));
    }
  }

  function manualPlace(taskId, day, empId) {
    const task = instances.find((t) => t.id === taskId);
    if (!task) return;

    // Sygdom/ferie-blokeringer må ikke trækkes rundt eller "tildeles" en anden
    // medarbejder — de fjernes/afsluttes i stedet via serviceordre-dialogen.
    if (BLOCK_TYPES.includes(task.type)) return;

    // Forhindr placering af en medarbejder på en dag hvor de har en aktiv
    // sygdom/ferie-blokering — uanset hvilken uge/år opgaven i øvrigt ligger i,
    // blokeringen gælder den uge/år man aktivt placerer opgaven i.
    const targetWeek = (task.assignees && task.assignees.length) ? task.week : weekOffset;
    const targetYear = (task.assignees && task.assignees.length) ? task.year : weekYear;
    const blockHit = instances.find((t) => BLOCK_TYPES.includes(t.type) && t.week === targetWeek && t.year === targetYear && t.day === day && (t.assignees || []).includes(empId));
    if (blockHit) {
      const emp = employees.find((e) => e.id === empId);
      window.alert(`${emp?.name || "Medarbejderen"} har ${TYPE_META[blockHit.type]?.label.toLowerCase() || "en blokering"} denne dag og kan ikke planlægges.`);
      return;
    }

    // Check if day is an agreed day for fixed tasks
    const agreedDays = task.templateDays || task.days || [];
    const isOffSchedule = task.type === "fixed" && agreedDays.length > 0 && !agreedDays.includes(day);

    if (isOffSchedule) {
      const dayLabel = ALL_DAYS.find((d) => d.key === day)?.label || day;
      const agreedLabels = agreedDays.map((k) => ALL_DAYS.find((d) => d.key === k)?.label || k).join(", ");
      const confirmed = window.confirm(
        `Denne faste opgave er aftalt til: ${agreedLabels}.\n\nEr du sikker på at du vil planlægge den på ${dayLabel} — uden for aftalen?`
      );
      if (!confirmed) return;
    }

    const wasUnassigned = !(task.assignees && task.assignees.length);
    updateInstance(taskId, (t) => {
      const nextAssignees = (t.assignees || []).includes(empId) ? t.assignees : [...(t.assignees || []), empId];
      return {
        ...t, day, assignees: nextAssignees,
        // Flyt kun opgaven til den uge man kigger på lige nu, hvis den var
        // ikke-tildelt før dette kald — dvs. man aktivt placerer en opgave fra
        // "Ikke tildelt" (evt. fra en anden uge) ind i den viste uge. Har opgaven
        // allerede én eller flere medarbejdere, og man blot tilføjer endnu en,
        // skal den IKKE flyttes til en anden uge end den allerede ligger i.
        week: wasUnassigned ? weekOffset : t.week,
        year: wasUnassigned ? weekYear : t.year,
        status: t.status === "unscheduled" ? "planlagt" : t.status,
        warning: null,
        offSchedule: isOffSchedule ? true : (t.offSchedule || false),
        onSchedule: !isOffSchedule,
      };
    });
  }
  function removeAssignee(taskId, empId) {
    updateInstance(taskId, (t) => {
      const nextAssignees = (t.assignees || []).filter((id) => id !== empId);
      return nextAssignees.length === 0
        ? { ...t, assignees: [], day: (t.type === "flexible" || t.type === "adhoc") ? null : t.day, status: "unscheduled" }
        : { ...t, assignees: nextAssignees };
    });
  }
  // Goer en medarbejder fast paa aftalen. Valget gemmes paa skabelonen, saa alle
  // fremtidige opgaver foedes med vedkommende, og alle kommende ikke-udfoerte
  // opgaver paa aftalen ombyttes med det samme. Udfoerte opgaver roeres aldrig.
  function setPreferredEmployee(templateId, empId) {
    if (!templateId || !empId) return;
    const emp = employees.find((e) => e.id === empId);
    const nowInfo = isoWeekInfo(new Date());
    const isFromNowOn = (inst) =>
      inst.year > nowInfo.year || (inst.year === nowInfo.year && inst.week >= nowInfo.week);
    const targets = instances.filter((inst) =>
      inst.templateId === templateId &&
      inst.status !== "udført" &&
      isFromNowOn(inst) &&
      !((inst.assignees || []).length === 1 && inst.assignees[0] === empId));
    setTemplates((prev) => prev.map((tp) => (tp.id === templateId ? { ...tp, preferredEmployeeId: empId } : tp)));
    syncTemplateFields(templateId, { preferredEmployeeId: empId });
    const targetIds = new Set(targets.map((t) => t.id));
    setInstances((prev) => prev.map((inst) => {
      if (!targetIds.has(inst.id)) return inst;
      const updated = { ...inst, assignees: [empId], status: inst.day ? "planlagt" : inst.status };
      syncInstance(updated);
      return updated;
    }));
    notify(`${emp ? emp.name : "Medarbejderen"} er nu fast på aftalen — ${targets.length} kommende opgave${targets.length === 1 ? "" : "r"} opdateret`);
  }
  // Markerer en aftale som udgaaet. Databasefunktionen goer det hele i én
  // transaktion: saetter status og aarsag paa aftalen og slettemarkerer alle
  // ikke-udfoerte opgaver efter ophoersdatoen. Udfoerte opgaver roeres aldrig,
  // saa de kan stadig faktureres og indgaa i regnskabet.
  async function cancelTemplate(templateId, reason, effectiveDate) {
    const { data, error } = await supabase.rpc("cancel_service_template", {
      p_template_id: templateId,
      p_reason: reason,
      p_effective_date: effectiveDate,
    });
    if (error) {
      notify("Kunne ikke markere aftalen som udgået — " + error.message);
      return false;
    }
    const slettet = (data && data.slettet) || 0;
    setTemplates((prev) => prev.map((tp) => (tp.id === templateId
      ? { ...tp, status: "udgaaet", cancelReason: reason, cancelledEffectiveDate: effectiveDate, cancelledAt: new Date().toISOString() }
      : tp)));
    const stop = String(effectiveDate).slice(0, 10);
    setInstances((prev) => prev.filter((t) => {
      if (t.templateId !== templateId) return true;
      if (t.status === "udført") return true;
      const ds = instanceDateString(t);
      return !ds || ds <= stop;
    }));
    notify("Aftalen er markeret som udgået — " + slettet + " kommende opgave" + (slettet === 1 ? "" : "r") + " er fjernet");
    return true;
  }
  // Forgaeves besoeg: medarbejderen kom ikke ind, saa der er ingen registreret tid,
  // og fakturagrundlaget ville derfor vaere nul. Kontoret afgoer om kunden skal betale
  // alligevel — og goer det ved at registrere tiden og saette opgaven til udfoert,
  // praecis som ved enhver anden opgave. Reglen om at der kun faktureres for
  // registreret tid staar dermed uroert; det er kontoret der registrerer tiden.
  async function fakturerForgaeves(onske, minutter) {
    const t = instances.find((x) => x.id === onske.instance_id);
    if (!t) { notify("Opgaven findes ikke længere"); return; }
    const m = Number(minutter);
    if (!m || m <= 0) { notify("Angiv hvor mange minutter der skal faktureres"); return; }
    // empId "planner" bruges allerede i faktureringen til at skelne kontorets egne
    // registreringer fra medarbejdernes. Noten forklarer hvorfor der er tid paa en
    // opgave ingen har udfoert — ellers ville det ligne en fejl om et halvt aar.
    const nyLog = [...(t.timeLog || t.time_log || []), {
      minutes: m, empId: "planner",
      note: "Forgæves besøg — fakturérbart efter kontorets beslutning",
    }];
    const opdateret = { ...t, timeLog: nyLog, time_log: nyLog, status: "udført", completedAt: new Date().toISOString() };
    setInstances((prev) => prev.map((x) => (x.id === t.id ? opdateret : x)));
    syncInstance(opdateret);
    const { error } = await supabase.from("reschedule_requests")
      .update({ status: "udfoert", decided_at: new Date().toISOString() }).eq("id", onske.id);
    if (error) { notify("Opgaven er sat til udført, men meldingen kunne ikke lukkes: " + error.message); return; }
    setNyTidOnsker((prev) => prev.filter((r) => r.id !== onske.id));
    notify(`${t.title || "Opgaven"} er sat til udført med ${fmtMin(m)} — den kommer med på fakturaen`);
  }

  // Kunden skal ikke betale. Opgaven bliver staaende uden registreret tid og falder
  // dermed af sig selv ud af fakturagrundlaget. Meldingen lukkes, saa banneret toemmes.
  async function henlaegForgaeves(onske, note) {
    const { error } = await supabase.from("reschedule_requests")
      .update({ status: "afvist", planner_note: note || "Ikke faktureret", decided_at: new Date().toISOString() })
      .eq("id", onske.id);
    if (error) { notify("Kunne ikke lukke meldingen: " + error.message); return; }
    setNyTidOnsker((prev) => prev.filter((r) => r.id !== onske.id));
    notify("Meldingen er lukket — opgaven faktureres ikke");
  }

  // Godkend: opgaven flyttes til det tidspunkt medarbejderen har aftalt med kunden.
  // Medarbejderen bliver paa opgaven — det er hende der har lavet aftalen. Passer
  // det nye tidspunkt ikke i hendes dag, dukker det op som en tidskonflikt i ugeplanen,
  // og saa kan planlaeggeren flytte videre derfra.
  async function godkendNyTid(onske) {
    const t = instances.find((x) => x.id === onske.instance_id);
    if (!t) { notify("Opgaven findes ikke længere"); return; }
    const dato = new Date(onske.requested_date);
    const { week, year } = isoWeekInfo(dato);
    const opdateret = {
      ...t, week, year, day: weekdayKeyFor(dato),
      scheduledTime: onske.requested_time ? String(onske.requested_time).slice(0, 5) : t.scheduledTime,
      warning: null,
    };
    setInstances((prev) => prev.map((x) => (x.id === t.id ? opdateret : x)));
    syncInstance(opdateret);
    const { error } = await supabase.from("reschedule_requests")
      .update({ status: "godkendt", decided_at: new Date().toISOString() }).eq("id", onske.id);
    if (error) { notify("Opgaven er flyttet, men ønsket kunne ikke lukkes: " + error.message); return; }
    setNyTidOnsker((prev) => prev.filter((r) => r.id !== onske.id));
    notify(`Flyttet til ${onske.requested_date}${onske.requested_time ? " kl. " + String(onske.requested_time).slice(0,5) : ""}`);
  }
  // Afvis: medarbejderen skal vide det, for hun har givet kunden et loefte.
  async function afvisNyTid(onske, note) {
    const { error } = await supabase.from("reschedule_requests")
      .update({ status: "afvist", planner_note: note || null, decided_at: new Date().toISOString() })
      .eq("id", onske.id);
    if (error) { notify("Kunne ikke afvise ønsket: " + error.message); return; }
    setNyTidOnsker((prev) => prev.filter((r) => r.id !== onske.id));
    const emp = employees.find((e) => e.id === onske.employee_id);
    const opgave = instances.find((x) => x.id === onske.instance_id);
    const { data: rk } = await supabase.from("employees").select("app_email").eq("id", onske.employee_id).maybeSingle();
    if (rk?.app_email) {
      await supabase.functions.invoke("send-email", { body: {
        email: rk.app_email, name: emp?.name || "",
        subject: "Din ønskede tid kunne ikke lade sig gøre",
        html: `<p>Kontoret har set på dit ønske om at flytte <b>${opgave?.title || "opgaven"}</b>` +
              `${opgave?.customerName ? " hos " + opgave.customerName : ""}, men det kunne ikke lade sig gøre.</p>` +
              `<p><b>Besked fra kontoret:</b><br/>${note || "Ingen begrundelse angivet."}</p>` +
              `<p>Opgaven står stadig som planlagt. Kontakt kunden og aftal en ny tid.</p>`,
      }});
    }
    notify("Ønsket er afvist" + (rk?.app_email ? " og medarbejderen har fået besked" : ""));
  }
  function unplace(taskId) {
    updateInstance(taskId, (t) => ({
      ...t,
      day: (t.type === "flexible" || t.type === "adhoc") ? null : t.day,
      assignees: [],
      status: "unscheduled",
      offSchedule: false,
      onSchedule: false,
      outsideArea: false,
      warning: null,
    }));
  }
  function deleteTask(taskId) {
    const task = instances.find((t) => t.id === taskId);
    if (!task) return;
    
    // Hvis det er en kontrakt-opgave (har templateId), marker dagen som udeladet i stedet
    if (task.templateId) {
      const dayDate = new Date(mondayOfWeek(task.week, task.year));
      dayDate.setDate(dayDate.getDate() + task.day);
      
      const year = dayDate.getFullYear();
      const month = String(dayDate.getMonth() + 1).padStart(2, "0");
      const dateNum = String(dayDate.getDate()).padStart(2, "0");
      const dayDateString = `${year}-${month}-${dateNum}`;
      
      const template = templates.find((t) => t.id === task.templateId);
      if (template) {
        const excludedDays = template.excludedDays ? [...template.excludedDays] : [];
        if (!excludedDays.includes(dayDateString)) {
          excludedDays.push(dayDateString);
        }
        
        // Opdater template lokalt
        setTemplates((prev) => prev.map((t) => 
          t.id === template.id ? { ...t, excludedDays } : t
        ));
        
        // Gem til database
        supabase.from("service_templates")
          .update({ excluded_days: JSON.stringify(excludedDays) })
          .eq("id", task.templateId)
          .then(({ error }) => {
            if (error) console.error("Failed to mark day as excluded:", error);
          });
      }
    }
    
    // Fjern fra state
    setInstances((prev) => prev.filter((t) => t.id !== taskId));
    
    // Slet fra database
    removeInstance(taskId);
  }

  // Opretter en sygdom/ferie-blokering på en medarbejder for hver hverdag i den
  // valgte periode. Blokeringen oprettes som en almindelig opgave-instans (samme
  // maskineri som fast interval/ad hoc/fleksibel), så den automatisk indgår i
  // belægning/kapacitetsberegning — men fjernes eksplicit fra fakturagrundlag og
  // rapportering via BLOCK_TYPES-tjek de relevante steder. Alle dage i samme
  // oprettelse deler et blockGroupId, så perioden kan afsluttes tidligt samlet.
  const DAY_KEYS_BY_DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  function addBlock(employeeId, blockType, startDateStr, endDateStr) {
    const start = new Date(startDateStr);
    const end = new Date(endDateStr);
    if (!(start instanceof Date) || isNaN(start) || isNaN(end) || end < start) {
      notify("Ugyldig periode – tjek start- og slutdato");
      return;
    }
    const blockGroupId = uid("blkgrp");
    const emp = employees.find((e) => e.id === employeeId);

    setInstances((prev) => {
      let list = [...prev];
      const toSync = [];
      const cursor = new Date(start);
      while (cursor <= end) {
        const dow = cursor.getDay();
        // Sygdom/ferie skal ogsaa blokere i weekenden - der kan ligge loerdags- og
        // soendagsopgaver, og en fravaerende medarbejder skal fjernes fra dem alle.
        {
          const { week, year } = isoWeekInfo(cursor);
          const dayKey = DAY_KEYS_BY_DOW[dow];
          // Sørg for at ugen er materialiseret (faste opgaver oprettet), så vi kan
          // fjerne medarbejderen fra evt. opgaver den allerede har den dag.
          list = ensureWeekInstances(week, year, list, templates, employees, areas, employeeAreas, travelSettings);
          list = list.map((t) => {
            if (BLOCK_TYPES.includes(t.type)) return t;
            if (t.week !== week || t.year !== year || t.day !== dayKey) return t;
            if (!(t.assignees || []).includes(employeeId)) return t;
            const nextAssignees = t.assignees.filter((id) => id !== employeeId);
            const updated = nextAssignees.length === 0
              ? { ...t, assignees: [], day: (t.type === "flexible" || t.type === "adhoc") ? null : t.day, status: "unscheduled" }
              : { ...t, assignees: nextAssignees };
            toSync.push(updated);
            return updated;
          });
          const blockInst = {
            id: uid("blk"), type: blockType, title: TYPE_META[blockType]?.label || blockType,
            day: dayKey, week, year, assignees: [employeeId], status: "planlagt",
            duration: emp?.capacity?.[dayKey] ?? 480, requiredSkills: [], checklist: [], timeLog: [],
            blockGroupId, warning: null, address: "", customerName: "", accessInstructions: "",
            poNumber: "", contractType: "privat", invoiceReady: false, dineroExported: false,
          };
          list.push(blockInst);
          toSync.push(blockInst);
        }
        cursor.setDate(cursor.getDate() + 1);
      }
      toSync.forEach(syncInstance);
      return list;
    });
    notify(`${TYPE_META[blockType]?.label || blockType} registreret for ${emp?.name || "medarbejderen"}`);
  }

  function addActivity(payload) {
    const { employeeId, customerName, address, date, time, duration, description } = payload;
    const emp = employees.find((e) => e.id === employeeId);
    if (!emp || !date) { notify("Vælg medarbejder og dato"); return; }
    const d = new Date(date);
    if (isNaN(d)) { notify("Ugyldig dato"); return; }
    const { week, year } = isoWeekInfo(d);
    const dayKey = weekdayKeyFor(d);
    const activityInst = {
      id: uid("act"), type: "aktivitet", title: customerName || "Anden aktivitet",
      day: dayKey, week, year, assignees: [employeeId], status: "planlagt",
      duration: Number(duration) || 60, scheduledTime: time || null,
      requiredSkills: [], checklist: [], timeLog: [],
      warning: null, address: address || "", customerName: customerName || "",
      accessInstructions: description || "",
      poNumber: "", contractType: "privat", invoiceReady: false, dineroExported: false,
    };
    setInstances((prev) => [...prev, activityInst]);
    syncInstance(activityInst);
    notify(`Aktivitet oprettet for ${emp.name || "medarbejderen"}`);
  }

  function dateOfBlockInstance(t) {
    const monday = mondayOfWeek(t.week, t.year);
    const dayIdx = ALL_DAYS.findIndex((d) => d.key === t.day);
    const d = new Date(monday);
    d.setDate(d.getDate() + (dayIdx >= 0 ? dayIdx : 0));
    return d;
  }
  // Afslutter en igangværende/fremtidig blokering fra og med i dag (rask melding,
  // eller ferie der forkortes) — sletter kun de dage i serien der ligger fremad,
  // allerede passerede dage i blokeringen rører vi ikke ved.
  function endBlockEarly(blockGroupId) {
    const cutoff = new Date(); cutoff.setHours(0, 0, 0, 0);
    const toRemove = instances.filter((t) => t.blockGroupId === blockGroupId && dateOfBlockInstance(t) >= cutoff).map((t) => t.id);
    if (toRemove.length === 0) { notify("Ingen kommende dage at afslutte i denne blokering"); return; }
    setInstances((prev) => prev.filter((t) => !toRemove.includes(t.id)));
    toRemove.forEach(removeInstance);
    notify(`Blokering afsluttet – ${toRemove.length} dag(e) frigivet`);
  }
  // Opretter/opdaterer et budget-tal for et område (kontrakttype) i en given måned/år.
  // Kun administrator må kalde dette fra UI'et (håndhæves i ReportsView).
  async function saveBudget(contractType, year, month, amount) {
    const id = `${contractType}_${year}_${month}`;
    const row = { id, contract_type: contractType, year, month, amount: Number(amount) || 0 };
    setBudgets((prev) => {
      const exists = prev.some((b) => b.id === id);
      return exists ? prev.map((b) => (b.id === id ? row : b)) : [...prev, row];
    });
    const { error: budErr } = await supabase.from("budgets").upsert(row, { onConflict: "id" });
    if (dbFail(budErr, "gemme budgettet")) return;
  }
  // Når planlæggeren selv sætter en opgave til udført, markeres den med
  // "planner" — så kan man i planen se at det ikke er medarbejderen der har
  // afsluttet den ude hos kunden. Felterne ryddes igen hvis opgaven genåbnes.
  function withCompletion(t, status) {
    const done = status === "udført";
    return {
      ...t,
      status,
      completedBy: done ? (t.status === "udført" ? t.completedBy ?? "planner" : "planner") : null,
      completedAt: done ? (t.status === "udført" ? t.completedAt ?? new Date().toISOString() : new Date().toISOString()) : null,
    };
  }
  function bumpStatus(taskId) {
    updateInstance(taskId, (t) => withCompletion(t, cycleStatus(t.status)));
  }
  function setTaskStatus(taskId, status) {
    updateInstance(taskId, (t) => withCompletion(t, status));
  }
  function toggleChecklistItem(taskId, itemId) {
    updateInstance(taskId, (t) => ({
      ...t, checklist: (t.checklist || []).map((i) => (i.id === itemId ? { ...i, done: !i.done } : i)),
    }));
  }
  function saveChecklistTemplate(tpl) {
    // Genopbyg tjeklisten paa alle skabeloner og paa alle IKKE-udfoerte opgaver der
    // bruger den, saa en redigering slaar igennem med det samme - uden at nulstille
    // punkter der allerede er afkrydset paa opgaver i gang. Udfoerte opgaver
    // undtages, saa historikken over hvad der blev gjort staar fast.
    const exists = checklistTemplates.some((c) => c.id === tpl.id);
    const nextLib = exists ? checklistTemplates.map((c) => (c.id === tpl.id ? tpl : c)) : [...checklistTemplates, tpl];
    setChecklistTemplates(nextLib);
    setTemplates((prev) => prev.map((t) => {
      if (!(t.checklistTemplateIds || []).includes(tpl.id)) return t;
      return { ...t, checklistItems: buildChecklistItems(t.checklistTemplateIds, t.extraItems, nextLib, t.checklistItems) };
    }));
    setInstances((prev) => prev.map((inst) => {
      if (!(inst.checklistTemplateIds || []).includes(tpl.id)) return inst;
      // Udfoerte opgaver roeres ikke. Deres tjekliste er dokumentation for hvad der
      // faktisk blev gjort ude hos kunden, og den maa ikke aendre sig bagudrettet.
      if (inst.status === "udført") return inst;
      const updated = { ...inst, checklist: buildChecklistItems(inst.checklistTemplateIds, inst.extraItems, nextLib, inst.checklist) };
      syncInstance(updated);
      return updated;
    }));
    syncChecklistTemplate(tpl);
  }
  function deleteChecklistTemplate(id) {
    setChecklistTemplates((prev) => prev.filter((c) => c.id !== id));
    removeChecklistTemplate(id);
  }

  function saveEmployee(emp) {
    setEmployees((prev) => {
      const exists = prev.some((e) => e.id === emp.id);
      const next = exists ? prev.map((e) => (e.id === emp.id ? { ...e, ...emp } : e)) : [...prev, emp];
      // Ingen automatisk omfordeling ved ændring af medarbejder.
      // Sorteres igen, saa en ny eller omdoebt medarbejder lander rigtigt med det samme
      // i stedet for at havne nederst indtil naeste genindlaesning.
      return sortEmployeesByName(next);
    });
    syncEmployee(emp);
    notify(`Medarbejder ${emp.name} gemt`);
    setShowAddEmp(false); setEditEmp(null);
  }
  function deleteEmployee(id) {
    setEmployees((prev) => prev.filter((e) => e.id !== id));
    removeEmployee(id);
    setInstances((prev) => prev.map((t) => {
      if (!(t.assignees || []).includes(id)) return t;
      const nextAssignees = t.assignees.filter((a) => a !== id);
      const updated = nextAssignees.length === 0 ? { ...t, assignees: [], status: "unscheduled" } : { ...t, assignees: nextAssignees };
      syncInstance(updated);
      return updated;
    }));
  }

  function logMinutes(taskId, empId, minutes) {
    updateInstance(taskId, (t) => ({ ...t, timeLog: [...(t.timeLog || []), { minutes, empId }] }));
  }

  function exportCSV(filteredInstances, label) {
    const toExport = (filteredInstances || instances.filter((t) => t.assignees && t.assignees.length)).filter((t) => t.invoiceReady);
    const rows = [["Uge", "Dag", "Opgave", "Kunde", "Adresse", "Fakturabeskrivelse", "Type", "Kontrakttype", "Medarbejdere", "Status", "Planlagt (min)", "Planlagt (timer)", "Registreret (min)", "Registreret (timer)"]];
    toExport.forEach((t) => {
      const names = (t.assignees || []).map((id) => employees.find((e) => e.id === id)?.name).filter(Boolean);
      const tl = t.timeLog || t.time_log || [];
      const logged = tl.reduce((s, l) => s + (l.minutes || 0), 0);
      rows.push([
        `Uge ${t.week}`,
        ALL_DAYS.find((d) => d.key === t.day)?.label || "—",
        t.title,
        t.customerName || "",
        t.address || "",
        t.poNumber || "",
        TYPE_META[t.type]?.label || t.type,
        contractLabel(t.contractType),
        names.length ? names.join(" + ") : "Ikke tildelt",
        statusLabel(t.status),
        t.duration,
        (t.duration / 60).toFixed(2),
        logged.toFixed(0),
        (logged / 60).toFixed(2),
      ]);
    });
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `ugeplan-${label || weekOffset}-eksport.csv`; a.click();
    URL.revokeObjectURL(url);
    notify("Eksport downloadet");
  }

  // Kundeprodukter brugt på en given opgave, formateret som Dinero-fakturalinjer.
  // Kun produktlinjer der endnu ikke er sendt til Dinero — så en opgave der allerede
  // er faktureret for timer/fastpris godt kan få nye produktlinjer med senere,
  // uden at timerne bliver sendt igen.
  function pendingProductTxForTask(taskId) {
    return productUsage.filter((tx) => tx.instance_id === taskId && tx.invoice_ready !== false && !tx.dinero_exported);
  }
  function productLinesForTask(taskId) {
    return pendingProductTxForTask(taskId).map((tx) => {
      const item = tx.inventory_items || {};
      const qty = Math.abs(Number(tx.quantity) || 0);
      const numberPart = item.item_number ? `${item.item_number} — ` : "";
      return {
        description: `${numberPart}${item.name || "Produkt"}`,
        quantity: qty,
        unitPrice: Number(item.price) || 0,
        unit: item.unit || "stk",
      };
    });
  }

  async function exportToDinero(filteredInstances, label) {
    // En opgave er klar til Dinero hvis selve opgaven (timer/fastpris) endnu ikke er
    // sendt, ELLER hvis den har nye produktlinjer der endnu ikke er sendt — sådan kan
    // produkter brugt EFTER opgaven allerede er faktureret stadig komme med senere,
    // uden at timerne/fastprisen bliver faktureret to gange.
    const base = (filteredInstances || instances.filter((t) => t.assignees && t.assignees.length))
      .filter((t) => t.invoiceReady);
    const toExport = base.filter((t) => !t.dineroExported || pendingProductTxForTask(t.id).length > 0);
    if (toExport.length === 0) {
      notify("Ingen nye opgaver klar til Dinero (allerede sendt eller intet fakturagrundlag)");
      return;
    }

    const missingCustomer = toExport.filter((t) => !t.customerName || !t.customerName.trim());
    // Opgaver uden registreret tid faktureres ikke for arbejdet - vis det tydeligt
    // i bekraeftelsen, saa planlaeggeren kan naa at rette op inden kladden dannes.
    const noTimeLogged = toExport.filter((t) => !t.dineroExported &&
      ((t.timeLog || t.time_log || []).reduce((s, l) => s + (l.minutes || 0), 0) <= 0));
    const withCustomer = toExport.filter((t) => t.customerName && t.customerName.trim());

    const groups = {};
    withCustomer.forEach((t) => {
      const key = t.customerName.trim();
      if (!groups[key]) groups[key] = [];
      groups[key].push(t);
    });

    const customerNames = Object.keys(groups);
    if (customerNames.length === 0) {
      notify("Ingen opgaver med kundenavn at fakturere");
      return;
    }

    const confirmMsg =
      `Opret ${customerNames.length} fakturakladde(r) i Dinero for ${label}?\n\n` +
      `Kunder: ${customerNames.join(", ")}` +
      (missingCustomer.length ? `\n\n⚠️ ${missingCustomer.length} opgave(r) uden kundenavn springes over (fx "${missingCustomer[0].title}").` : "") +
      (noTimeLogged.length ? `\n\n⚠️ ${noTimeLogged.length} opgave(r) har ingen registreret tid og faktureres derfor ikke for selve arbejdet (fx "${noTimeLogged[0].title}"). Evt. forbrugte produkter kommer stadig med.` : "");

    if (!window.confirm(confirmMsg)) return;

    const dayLabelOf = (t) => ALL_DAYS.find((d) => d.key === t.day)?.label || t.day || "—";
    const today = new Date().toISOString().slice(0, 10);

    const results = { success: [], notFound: [], ambiguous: [], error: [] };

    for (const customerName of customerNames) {
      const tasks = groups[customerName];
      const groupProductTxIds = [];
      const lines = tasks.flatMap((t) => {
        const pendingProductTx = pendingProductTxForTask(t.id);
        pendingProductTx.forEach((tx) => groupProductTxIds.push(tx.id));
        const productLines = pendingProductTx.map((tx) => {
          const item = tx.inventory_items || {};
          const qty = Math.abs(Number(tx.quantity) || 0);
          const numberPart = item.item_number ? `${item.item_number} — ` : "";
          return {
            description: `${numberPart}${item.name || "Produkt"}`,
            quantity: qty,
            unitPrice: Number(item.price) || 0,
            unit: item.unit || "stk",
          };
        });
        // Timer/fastpris springes over hvis opgaven allerede er sendt til Dinero —
        // kun de nye produktlinjer skal så med.
        if (t.dineroExported) return productLines;
        // Er der ikke registreret tid paa opgaven, er arbejdet ikke udfoert - og saa maa
        // der ikke faktureres for det. Tidligere faldt beregningen tilbage til den
        // PLANLAGTE varighed, saa en opgave der aldrig blev udfoert endte paa fakturaen
        // med det planlagte beloeb, mens skaermen viste 0 kr under "Registreret kr.".
        const loggedMinutes = (t.timeLog || t.time_log || []).reduce((s, l) => s + (l.minutes || 0), 0);
        if (loggedMinutes <= 0) return productLines;
        const serviceLine = t.pricingType === "fixed"
          ? {
              description: `${t.title} (Uge ${t.week}, ${dayLabelOf(t)}) — Fastpris`,
          // Fakturabeskrivelsen staar i linjens kommentarfelt i Dinero, ikke i selve
          // beskrivelsen. Teksten sendes som den er skrevet — feltet kan indeholde et
          // PO-nummer, en attention-person eller noget helt tredje, saa vi maa ikke
          // saette "PO:" foran af os selv.
          comments: t.poNumber || "",
              quantity: 1,
              unitPrice: Number(t.fixedPrice) || 0,
              unit: "fixed",
            }
          : (() => {
              const hours = Math.round((loggedMinutes / 60) * 100) / 100;
              const rate = pricing[t.contractType || "privat"] || 0;
              return {
                description: `${t.title} (Uge ${t.week}, ${dayLabelOf(t)})`,
            comments: t.poNumber || "",
                quantity: hours,
                unitPrice: rate,
                unit: "hours",
              };
            })();
        // Én ekstra fakturalinje pr. kundeprodukt der er registreret brugt på opgaven.
        return [serviceLine, ...productLines];
      });

      try {
        const { data, error } = await supabase.functions.invoke("dinero", {
          body: {
            action: "createInvoiceDraft",
            customerName,
            date: today,
            invoiceDescription: `Faktura ${label}`,
          // Kundens unikke id i Dinero. Uden det maa funktionen slaa op paa navnet,
          // og det fejler naar flere kontakter hedder det samme.
          contactGuid: (tasks.find((t) => t.dineroContactGuid) || {}).dineroContactGuid || null,
            lines,
          },
        });
        if (error) {
          results.error.push({ customerName, message: error.message || String(error) });
          continue;
        }
        if (data?.error === "not_found") {
          results.notFound.push({ customerName, message: data.message });
        } else if (data?.error === "ambiguous") {
          results.ambiguous.push({ customerName, matches: data.matches || [], message: data.message });
        } else if (data?.error) {
          results.error.push({ customerName, message: data.message || data.error });
        } else if (data?.Guid) {
          results.success.push({ customerName, guid: data.Guid });
          // Markér alle opgaver i denne gruppe som sendt til Dinero, så de ikke kan eksporteres igen.
          tasks.forEach((t) => updateInstance(t.id, (old) => ({ ...old, dineroExported: true })));
          // Markér de medsendte produktlinjer som sendt til Dinero.
          markProductLinesDineroExported(groupProductTxIds);
        } else {
          results.error.push({ customerName, message: "Uventet svar fra Dinero" });
        }
      } catch (err) {
        results.error.push({ customerName, message: err.message || String(err) });
      }
    }

    const parts = [];
    if (results.success.length) parts.push(`✅ ${results.success.length} fakturakladde(r) oprettet: ${results.success.map((r) => r.customerName).join(", ")}`);
    if (results.notFound.length) parts.push(`❌ ${results.notFound.map((r) => r.message || `Kunde ikke fundet i Dinero: ${r.customerName}`).join(" ")}`);
    // Dineros egen forklaring er mere praecis end en generisk tekst — den fortaeller
          // ogsaa hvad planlaeggeren skal goere ved det.
          if (results.ambiguous.length) parts.push(`⚠️ ${results.ambiguous.map((r) => r.message || `Flere kunder i Dinero hedder "${r.customerName}"`).join(" ")}`);
    if (results.error.length) parts.push(`⚠️ Fejl: ${results.error.map((r) => `${r.customerName}: ${r.message}`).join("; ")}`);

    notify(results.success.length ? "Fakturakladder oprettet i Dinero" : "Eksport til Dinero afsluttet med fejl");
    if (parts.length) window.alert(parts.join("\n\n"));
  }

  // Hvem er den indloggede? Vi matcher primært på auth_user_id, fordi det er
  // NØJAGTIG samme grundlag som databasens RLS-politikker bruger. Matchede vi kun
  // på e-mail, kunne brugerfladen og databasen nå to forskellige konklusioner om
  // samme bruger. app_email bruges kun som reserve for ældre opsætninger.
  const currentEmployeeForAuth = employees.find(
    (e) => e.auth_user_id && session?.user?.id && e.auth_user_id === session.user.id
  ) || employees.find(
    (e) => e.app_email && session?.user?.email && e.app_email.toLowerCase() === session.user.email.toLowerCase()
  );
  // Adgang kræver et POSITIVT ja. Tidligere gav et login uden tilknyttet
  // medarbejder automatisk administratorrettigheder i brugerfladen — den slags
  // skal fejle lukket, ikke åbent.
  const isAdminUser = !!currentEmployeeForAuth?.isAdmin;
  // syncEmployee er en useCallback med tomme deps og bliver defineret laenge foer
  // isAdminUser findes. Den kan derfor ikke laese variablen direkte — en closure med
  // tomme deps ville fastholde vaerdien fra foerste render, hvor medarbejderen endnu
  // ikke er hentet og svaret altid er "nej". Derfor en ref der opdateres hver render.
  isAdminRef.current = isAdminUser;

  const currentIsoWeek = isoWeekInfo(new Date());
  const weekInstancesList = instances.filter((t) => t.week === weekOffset && t.year === weekYear);
  // Ikke-tildelte opgaver skal være tilgængelige uanset hvilken uge man kigger på —
  // ikke kun i den uge de oprindeligt hørte til. Så en opgave man har taget ud kan
  // ses og placeres i en hvilken som helst uge, fx hvis den skal rykkes til næste uge.
  const unplaced = instances
    .filter((t) => !(t.assignees && t.assignees.length))
    .sort((a, b) => {
      if (a.week !== b.week) return a.week - b.week;
      const aDay = a.day ? ALL_DAYS.findIndex((d) => d.key === a.day) : 99;
      const bDay = b.day ? ALL_DAYS.findIndex((d) => d.key === b.day) : 99;
      return aDay - bDay;
    });
  const totalLogged = useMemo(() => instances.reduce((s, t) => {
    const tl = t.timeLog || t.time_log || [];
    return s + tl.reduce((s2, l) => s2 + (l.minutes || 0), 0);
  }, 0), [instances]);
  const wk = weekMeta(weekOffset, weekYear);

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100svh", fontFamily: "system-ui, sans-serif", color: "#9C1B5D", fontSize: 15 }}>
        Indlæser data…
      </div>
    );
  }

  // Adgangskontrol ved indgangen. Uden den kunne enhver med et login åbne
  // planlæggeren og få en næsten tom tavle (fordi RLS kun udleverer deres egne
  // opgaver) — teknisk sikkert, men umuligt at forstå. Her får de i stedet en
  // klar besked og en vej videre til medarbejder-appen.
  if (!isAdminUser) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100svh",
        fontFamily: "system-ui, sans-serif", padding: 24, background: "#F8FAFC" }}>
        <div style={{ background: "#fff", borderRadius: 14, padding: "28px 26px", maxWidth: 460,
          boxShadow: "0 2px 12px rgba(0,0,0,0.08)", textAlign: "center" }}>
          <div style={{ fontSize: 34, marginBottom: 10 }}>🔒</div>
          <div style={{ fontWeight: 700, fontSize: 18, color: "#111111", marginBottom: 8 }}>
            Du har ikke adgang til planlægningen
          </div>
          <div style={{ fontSize: 14, color: "#475569", lineHeight: 1.5, marginBottom: 18 }}>
            {currentEmployeeForAuth
              ? <>Din bruger <strong>{currentEmployeeForAuth.name}</strong> er ikke markeret som planlægger. Brug medarbejder-appen til dine egne opgaver, eller bed en planlægger om at give dig adgang.</>
              : <>Dit login er ikke knyttet til en medarbejder. Kontakt en planlægger for at få det sat op.</>}
          </div>
          <a href="https://medarbejderapp.netlify.app/" style={{ display: "block", background: "#D6247A", color: "#fff",
            borderRadius: 10, padding: "11px 16px", fontWeight: 700, fontSize: 14, textDecoration: "none", marginBottom: 10 }}>
            Åbn medarbejder-appen
          </a>
          <button onClick={onSignOut} style={{ width: "100%", background: "#fff", color: "#475569",
            border: "1px solid #CBD5E1", borderRadius: 10, padding: "10px 16px", fontWeight: 600, fontSize: 14, cursor: "pointer" }}>
            Log ud
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.app}>
      <style>{globalCss}</style>
      <header style={styles.header}>
        <div style={styles.brand}>
          <img src="/app-icon.png" alt="Worklist" style={{ width: 36, height: 36, minWidth: 36, borderRadius: 10, objectFit: "contain", display: "block" }} />
          <div>
            <div style={styles.brandTitle}>Rengøringsplan</div>
            <div style={styles.brandSub}>{L.sub}</div>
          </div>
        </div>
        <nav style={styles.nav}>
          {[["uge", L.schedule], ["employees", L.employees], ["checklists", L.checklists], ["time", L.time], ["inventory", L.inventory], ["contracts", L.contracts], ["reports", L.reports], ["medExport", L.medExport]].map(([k, l]) => (
            <button key={k} onClick={() => setView(k)} style={view === k ? styles.navBtnActive : styles.navBtn}>{l}</button>
          ))}
          {/* Sprogvalg og Google Translate fjernet - planlaegningsappen bruges kun paa dansk. */}
          <button onClick={onSignOut} style={{ ...styles.navBtn, marginLeft: 4, color: "#E8AFC9", borderLeft: "1px solid #333", paddingLeft:12 }}>{L.signOut}</button>
        </nav>
      </header>

      {toast && <div style={styles.toast}>{toast}</div>}

      {/* Modulhjælp: knappen ligger i selve modulet og aabner hjaelp for netop det view man staar i. */}
      {MODULE_HELP[view] && <HelpButton onClick={() => setShowHelp(true)} />}
      {showHelp && <ModuleHelp view={view} onClose={() => setShowHelp(false)} />}
      {sletMedarbejder && (
        <DeleteEmployeeModal
          emp={employees.find((e) => e.id === sletMedarbejder)}
          instances={instances}
          onClose={() => setSletMedarbejder(null)}
          onConfirm={deleteEmployee}
        />
      )}

      {cancelTarget && (
        <CancelTemplateModal
          template={templates.find((tp) => tp.id === cancelTarget)}
          onClose={() => setCancelTarget(null)}
          onConfirm={cancelTemplate}
        />
      )}

      {/* Oensker om ny tid fra medarbejderne. Ligger oeverst i ugeplanen, saa de
          ikke kan overses — en medarbejder har givet kunden et loefte og venter paa svar. */}
      {view === "uge" && nyTidOnsker.length > 0 && (() => {
        const antalForgaeves = nyTidOnsker.filter((o) => o.kind === "forgaeves").length;
        const antalNyTid = nyTidOnsker.length - antalForgaeves;
        const overskrift = [
          antalForgaeves > 0 ? `${antalForgaeves} forgæves besøg` : null,
          antalNyTid > 0 ? `${antalNyTid} ønske${antalNyTid === 1 ? "" : "r"} om ny tid` : null,
        ].filter(Boolean).join(" · ");
        // Et forgaeves besoeg er dyrere at overse end et oenske om ny tid, saa
        // banneret farves roedt saa snart der er mindst ét af dem.
        const roedt = antalForgaeves > 0;
        return (
        <div style={{ margin: "0 0 12px", border: `1px solid ${roedt ? "#FCA5A5" : "#FCD34D"}`, background: roedt ? "#FEF2F2" : "#FFFBEB", borderRadius: 12, overflow: "hidden" }}>
          <div style={{ padding: "10px 14px", fontWeight: 800, color: roedt ? "#991B1B" : "#92400E", fontSize: 14, borderBottom: `1px solid ${roedt ? "#FECACA" : "#FDE68A"}` }}>
            {overskrift}
          </div>
          {nyTidOnsker.map((o) => {
            const opgave = instances.find((x) => x.id === o.instance_id);
            const medarb = employees.find((e) => e.id === o.employee_id);
            const forgaeves = o.kind === "forgaeves";
            const nyTid = o.requested_date
              ? o.requested_date + (o.requested_time ? " kl. " + String(o.requested_time).slice(0, 5) : "")
              : "";
            const gammelDag = (ALL_DAYS.find((x) => x.key === o.old_day) || {}).label || o.old_day || "";
            const gammel = o.old_week ? `uge ${o.old_week}, ${gammelDag}` : "";
            // Kun noten der hoerer til meldingen. Opgavens oevrige kommentarer staar
            // paa opgaven selv og ville goere banneret uoverskueligt.
            const meldingensNoter = (opgaveNoter[o.instance_id] || []).filter((n) => n.id === o.note_id);
            return (
              <div key={o.id} style={{ padding: "12px 14px", borderBottom: `1px solid ${forgaeves ? "#FEE2E2" : "#FEF3C7"}` }}>
                <div style={{ fontSize: 13, color: forgaeves ? "#7F1D1D" : "#78350F" }}>
                  {forgaeves ? (
                    <>
                      <b>{medarb ? medarb.name : "Medarbejder"}</b> kunne ikke komme ind hos{" "}
                      <b>{opgave && opgave.customerName ? opgave.customerName : "kunden"}</b>
                      {opgave ? ` — ${opgave.title}` : ""}
                      {gammel ? ` (${gammel})` : ""}. Opgaven blev ikke udført.
                      {nyTid ? <> Foreslået ny tid: <b>{nyTid}</b>.</> : null}
                    </>
                  ) : (
                    <>
                      <b>{medarb ? medarb.name : "Medarbejder"}</b> ønsker <b>{opgave ? opgave.title : "opgaven"}</b>
                      {opgave && opgave.customerName ? ` hos ${opgave.customerName}` : ""}
                      {gammel ? ` flyttet fra ${gammel}` : " flyttet"} til <b>{nyTid}</b>
                    </>
                  )}
                </div>
                <div style={{ fontSize: 13, color: forgaeves ? "#991B1B" : "#92400E", margin: "6px 0 10px", fontStyle: "italic" }}>„{o.reason}"</div>
                {meldingensNoter.length > 0 && (
                  <div style={{ marginBottom: 10 }}>
                    <OpgaveNoter noter={meldingensNoter} employees={employees} />
                  </div>
                )}
                {afvisId === o.id ? (
                  <div>
                    <textarea rows={2} value={afvisNote} onChange={(e) => setAfvisNote(e.target.value)}
                      placeholder={forgaeves
                        ? "Notat til dig selv om hvorfor der ikke faktureres. Gemmes på meldingen."
                        : "Hvorfor kan det ikke lade sig gøre? Medarbejderen får beskeden på mail."}
                      style={{ width: "100%", padding: "8px 10px", fontSize: 13, borderRadius: 8, border: "1px solid #FCD34D", fontFamily: "inherit" }} />
                    <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                      <button style={styles.secondaryBtn} onClick={() => { setAfvisId(null); setAfvisNote(""); }}>Fortryd</button>
                      <button disabled={!afvisNote.trim()}
                        style={{ ...styles.secondaryBtn, color: "#B91C1C", borderColor: "#FCA5A5", opacity: afvisNote.trim() ? 1 : 0.5 }}
                        onClick={async () => {
                          if (forgaeves) await henlaegForgaeves(o, afvisNote.trim());
                          else await afvisNyTid(o, afvisNote.trim());
                          setAfvisId(null); setAfvisNote("");
                        }}>
                        {forgaeves ? "Luk uden fakturering" : "Send afvisning"}
                      </button>
                    </div>
                  </div>
                ) : forgaeves ? (
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    {/* Minutterne staar aabent frem for at vaere gemt bag en dialog.
                        Kontoret skal kunne se hvad de fakturerer, foer de trykker. */}
                    <label style={{ fontSize: 12, fontWeight: 700, color: "#7F1D1D" }}>Fakturér</label>
                    <input
                      type="number" min="0" step="5"
                      value={forgaevesMin[o.id] ?? (opgave ? opgave.duration : 0)}
                      onChange={(e) => setForgaevesMin((prev) => ({ ...prev, [o.id]: e.target.value }))}
                      style={{ width: 80, padding: "7px 9px", fontSize: 13, borderRadius: 8, border: "1px solid #FCA5A5" }} />
                    <span style={{ fontSize: 12, color: "#7F1D1D" }}>min.</span>
                    <button style={{ ...styles.primaryBtn, background: "#16A34A" }}
                      onClick={() => fakturerForgaeves(o, forgaevesMin[o.id] ?? (opgave ? opgave.duration : 0))}>
                      Sæt til udført og fakturér
                    </button>
                    {o.requested_date && (
                      <button style={styles.secondaryBtn} onClick={() => godkendNyTid(o)}>Flyt til {o.requested_date}</button>
                    )}
                    <button style={{ ...styles.secondaryBtn, color: "#B91C1C", borderColor: "#FCA5A5" }}
                      onClick={() => { setAfvisId(o.id); setAfvisNote(""); }}>
                      Fakturér ikke
                    </button>
                  </div>
                ) : (
                  <div style={{ display: "flex", gap: 8 }}>
                    <button style={{ ...styles.primaryBtn, background: "#16A34A" }} onClick={() => godkendNyTid(o)}>Godkend og flyt</button>
                    <button style={{ ...styles.secondaryBtn, color: "#B91C1C", borderColor: "#FCA5A5" }} onClick={() => { setAfvisId(o.id); setAfvisNote(""); }}>Afvis</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        );
      })()}

      {view === "uge" && (
        <WeekView
          employees={employees} instances={weekInstancesList} unplaced={unplaced} opgaveNoter={opgaveNoter}
          onAdd={() => setShowAddTask(true)} onAuto={runAuto} onScheduleWeek={runScheduleWeek} onAutoAllWeeks={runAutoAllWeeks}
          onPlace={manualPlace} onUnplace={unplace} onRemoveAssignee={removeAssignee} onDelete={deleteTask}
          onToggleInclude={(taskId) => updateInstance(taskId, (t) => ({ ...t, includeInAuto: !t.includeInAuto }))}
          onEditEmp={(emp) => { setEditEmp(emp); setShowAddEmp(true); }}
          areas={areas}
          employeeAreas={employeeAreas}
          onOpenTask={setOpenTaskId}
          dragId={dragId} setDragId={setDragId}
          weekLabel={wk.label} weekNo={wk.weekNo} weekOffset={weekOffset} weekYear={weekYear}
          onPrevWeek={() => changeWeek(-1)} onNextWeek={() => changeWeek(1)} onTodayWeek={() => setWeekAnchor(mondayOf(new Date()))}
          currentIsoWeek={currentIsoWeek}
          travelSettings={travelSettings} onOpenTravelSettings={() => setShowTravelSettings(true)}
          onOpenAddBlock={() => setShowAddBlock(true)}
          onOpenAddActivity={() => setShowAddActivity(true)}
        />
      )}
      {view === "employees" && (
        <EmployeesView employees={employees}
          onAdd={() => { setEditEmp(null); setShowAddEmp(true); }}
          onEdit={(e) => { setEditEmp(e); setShowAddEmp(true); }}
          onDelete={(id) => setSletMedarbejder(id)}
          supabase={supabase}
          skills={skills}
          onSkillsChange={setSkills}
          areas={areas}
          employeeAreas={employeeAreas}
          onAreasChange={setAreas}
          onEmployeeAreasChange={setEmployeeAreas} />
      )}
      {view === "checklists" && (
        <ChecklistsView checklistTemplates={checklistTemplates} onSave={saveChecklistTemplate} onDelete={deleteChecklistTemplate} />
      )}
      {view === "time" && (
        <TimeView instances={instances} employees={employees} opgaveNoter={opgaveNoter}
          onExportToDinero={exportToDinero} totalLogged={totalLogged} weekLabel={wk.label}
          isAdminUser={isAdminUser} productUsage={productUsage} onToggleProductInvoice={toggleProductInvoiceReady} onToggleProductDinero={toggleProductDineroExported}
          pricing={pricing} onPricingChange={async (newPricing) => {
            setPricing(newPricing);
            for (const [type, rate] of Object.entries(newPricing)) {
              const { error: priceErr } = await supabase.from("pricing").upsert({ id: `price_${type}`, contract_type: type, hourly_rate: rate }, { onConflict: "id" });
              if (dbFail(priceErr, "gemme timeprisen")) return;
            }
          }}
          onUpdateInstance={(taskId, fields) => updateInstance(taskId, (t) => ({ ...t, ...fields }))}
          onOpenTask={setOpenTaskId} />
      )}

      {view === "contracts" && (
        <ContractsView templates={templates} instances={instances} pricing={pricing} employees={employees} onEditDraft={(tpl) => { setCopyPayload({ ...tpl, type: "fixed", templateDays: tpl.days }); setEditTplId(tpl.id); setShowAddTask(true); }}
            isAdminUser={isAdminUser} onCancelTemplate={(tplId) => setCancelTarget(tplId)} />
      )}

      {view === "reports" && (
        <ReportsView instances={instances} pricing={pricing} budgets={budgets} onSaveBudget={saveBudget} isAdminUser={isAdminUser} />
      )}

      {view === "medExport" && (<EmployeeExportView instances={instances} employees={employees} />)}
      {view === "inventory" && (
        <InventoryView supabase={supabase} employees={employees} currentUserName={currentEmployeeForAuth?.name || null} onInventoryChanged={loadProductUsage} />
      )}

      {view === "skills" && (
        <SkillsView supabase={supabase} skills={skills} onSkillsChange={setSkills} />
      )}

      {showAddTask && <TaskModal onClose={() => { setShowAddTask(false); setCopyPayload(null); setEditTplId(null); }} onSave={(p, editId) => (editId ? updateTemplate(p, editId) : addTask(p))} editId={editTplId} checklistTemplates={checklistTemplates} skills={skills} copyFrom={copyPayload} employees={employees} />}
      {showAddEmp && <EmployeeModal emp={editEmp} onClose={() => { setShowAddEmp(false); setEditEmp(null); }} onSave={saveEmployee} skills={skills} />}
      {showAddBlock && <BlockModal employees={employees} onClose={() => setShowAddBlock(false)} onSave={addBlock} />}
      {showAddActivity && <ActivityModal employees={employees} onClose={() => setShowAddActivity(false)} onSave={addActivity} />}
      {showTravelSettings && (
        <TravelSettingsModal
          settings={travelSettings}
          onClose={() => setShowTravelSettings(false)}
          // Flettes ind i det nuvaerende, ikke sat i stedet: modalen kender ikke
          // hjemOverrides, saa en ren erstatning ville smide hjemmebenenes rutetider
          // vaek hver gang nogen aabnede og gemte transportindstillingerne.
          onSave={(s) => { setTravelSettings((prev) => ({ ...prev, ...s })); setShowTravelSettings(false); }}
        />
      )}
      {openTaskId && (
        <TaskDetailModal
          templates={templates}
          onSetPreferredEmployee={setPreferredEmployee}
          onCancelTemplate={(tplId) => setCancelTarget(tplId)}
          task={instances.find((t) => t.id === openTaskId)}
          employees={employees}
          checklistTemplates={checklistTemplates}
          skills={skills}
          isAdminUser={isAdminUser}
          areas={areas}
          employeeAreas={employeeAreas}
          onClose={() => setOpenTaskId(null)}
          onSetStatus={setTaskStatus}
          onToggleChecklistItem={toggleChecklistItem}
          onAddChecklistItem={(taskId, text) => updateInstance(taskId, (t) => ({
            ...t,
            checklist: [...(t.checklist || []), { id: uid("ck"), text, description: "", videoUrl: "", done: false }],
            extraItems: [...(t.extraItems || []), text],
          }))}
          onAddChecklistTemplate={(taskId, cl) => updateInstance(taskId, (t) => {
            const existingTexts = new Set((t.checklist || []).map((i) => i.text));
            const newItems = (cl.items || [])
              .filter((it) => !existingTexts.has(it.text || it))
              .map((it) => ({ id: uid("ck"), text: it.text || it, description: it.description || "", videoUrl: it.videoUrl || "", done: false }));
            const nextTemplateIds = (t.checklistTemplateIds || []).includes(cl.id) ? (t.checklistTemplateIds || []) : [...(t.checklistTemplateIds || []), cl.id];
            return { ...t, checklist: [...(t.checklist || []), ...newItems], checklistTemplateIds: nextTemplateIds };
          })}
          onUpdateCustomer={(taskId, fields) => updateInstance(taskId, (t) => ({ ...t, ...fields }))}
          onUpdateCustomerInfo={updateCustomerInfo}
          // To veje med vilje: hele aftalen bruger samme funktion som de oevrige
          // kundefelter og skriver ogsaa paa skabelonen, saa kommende uger arver det.
          // Kun denne opgave roerer én raekke og lader aftalen staa.
          onUpdateKeyPickup={(taskId, vaerdi, heleAftalen) => {
            if (heleAftalen) updateCustomerInfo(taskId, { needsKeyPickup: vaerdi });
            else updateInstance(taskId, (t) => ({ ...t, needsKeyPickup: vaerdi }));
          }}
          // Tidspunktet paa en fast aftale. Kun opgaven: én raekke rettes, og naeste uge
          // faar aftalens hidtidige tid igen. Hele aftalen: tiden gemmes i aftalens
          // ugedagstider, og de kommende opgaver paa samme ugedag rettes med — ellers
          // ville aftalen og de allerede dannede uger sige to forskellige ting.
          onUpdateScheduledTime={(taskId, tid, heleAftalen) => {
            const opgave = instances.find((x) => x.id === taskId);
            if (!opgave) return;
            if (!heleAftalen || !opgave.templateId) {
              updateInstance(taskId, (x) => ({ ...x, scheduledTime: tid }));
              return;
            }
            const tpl = templates.find((x) => x.id === opgave.templateId);
            const nyeDagstider = { ...(tpl?.dayTimes || {}), [opgave.day]: tid || null };
            setTemplates((prev) => prev.map((x) => (x.id === opgave.templateId ? { ...x, dayTimes: nyeDagstider } : x)));
            syncTemplateFields(opgave.templateId, { dayTimes: nyeDagstider });
            // Kun opgaver der ikke er udfoert. Historikken skal matche det der faktisk
            // blev leveret, saa en aendret aftale maa ikke skrive bagud.
            setInstances((prev) => prev.map((x) => {
              if (x.templateId !== opgave.templateId || x.day !== opgave.day) return x;
              if (x.status === "udført" || x.dineroExported) return x;
              const opdateret = { ...x, scheduledTime: tid };
              syncInstance(opdateret);
              return opdateret;
            }));
            notify(tid ? `Tidspunktet er sat til kl. ${tid} på alle kommende ${(ALL_DAYS.find((d) => d.key === opgave.day)?.label || "").toLowerCase()}e` : "Det faste tidspunkt er fjernet");
          }}
          onUpdateDeliversProducts={(taskId, vaerdi, heleAftalen) => {
            if (heleAftalen) updateCustomerInfo(taskId, { deliversProducts: vaerdi });
            else updateInstance(taskId, (t) => ({ ...t, deliversProducts: vaerdi }));
          }}
          onUpdateContractType={updateContractType}
          onRenameTask={renameTask}
          onUpdateSkills={(taskId, newSkills) => updateInstance(taskId, (t) => ({ ...t, requiredSkills: newSkills }))}
          onUpdateSchedule={(taskId, dateStr, timeStr) => {
            setInstances((prev) => {
              const current = prev.find((x) => x.id === taskId);
              if (!current) return prev;
              const dateObj = new Date(dateStr);
              const wi = isoWeekInfo(dateObj);
              // Ny frist: placeringen nulstilles og opgaven soeges placeret paa ny.
              // Den gamle dag kan ligge efter den nye frist, saa den maa ikke beholdes.
              const reset = {
                ...current,
                week: wi.week, year: wi.year,
                deadline: weekdayKeyFor(dateObj),
                scheduledTime: timeStr,
                day: null, assignees: [], status: "unscheduled", warning: null,
              };
              const others = prev.filter((x) => x.id !== taskId);
              const placed = planTaskNow(reset, others);
              if (placed.assignees && placed.assignees.length) {
                const emp = employees.find((e) => e.id === placed.assignees[0]);
                const dayLabel = ALL_DAYS.find((x) => x.key === placed.day)?.label || placed.day;
                notify(`Flyttet og planlagt til ${emp?.name || "medarbejder"} ${String(dayLabel).toLowerCase()} i uge ${placed.week}`);
              } else {
                notify(placed.warning === "no_skill"
                  ? "Ingen medarbejder har de krævede kompetencer — opgaven ligger i Ikke tildelt"
                  : "Ingen ledig dag inden den nye frist — opgaven ligger i Ikke tildelt");
              }
              syncInstance(placed);
              return [...others, placed];
            });
          }}
          onAddAssignee={(taskId, empId) => { const t = instances.find((x) => x.id === taskId); if (t?.day) manualPlace(taskId, t.day, empId); }}
          onRemoveAssignee={removeAssignee}
          onUnplace={(taskId) => { unplace(taskId); setOpenTaskId(null); }}
          onDelete={(taskId) => { deleteTask(taskId); setOpenTaskId(null); }}
          onEndBlockEarly={endBlockEarly}
          onCopy={(task) => {
            setShowAddTask(true);
            setOpenTaskId(null);
            setCopyPayload(task);
          }}
        />
      )}
    </div>
  );
}

// ---------- Employee-facing app (mobil) ----------
function todayKeyGuess() {
  const map = { 1: "Mon", 2: "Tue", 3: "Wed", 4: "Thu", 5: "Fri" };
  return map[new Date().getDay()] || "Mon";
}

function EmployeeAppView({ employees, instances, onLogMinutes, onSetStatus, onToggleChecklistItem, weekLabel, travelSettings }) {
  const [empId, setEmpId] = useState(employees[0]?.id || "");
  const [day, setDay] = useState(todayKeyGuess());
  const [openTaskId, setOpenTaskId] = useState(null);
  const emp = employees.find((e) => e.id === empId);

  const myTasks = instances.filter((t) => t.assignees.includes(empId) && t.day === day);
  const schedule = computeDaySchedule(myTasks, travelSettings, emp);

  return (
    <div style={styles.page}>
      <div style={styles.phoneWrap}>
        <div style={styles.phoneScreen}>
          <div style={styles.phoneHeader}>
            <LogIn size={14} />
            <select style={styles.phoneEmpSelect} value={empId} onChange={(e) => setEmpId(e.target.value)}>
              {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </div>
          <div style={styles.phoneSub}>{weekLabel}</div>

          <div style={styles.phoneDayRow}>
            {ALL_DAYS.map((d) => (
              <button key={d.key} style={d.key === day ? styles.phoneDayBtnActive : styles.phoneDayBtn} onClick={() => setDay(d.key)}>{d.label.slice(0, 3)}</button>
            ))}
          </div>

          <div style={styles.phoneList}>
            {myTasks.length === 0 && <div style={styles.emptyCol}>{emp ? `${emp.name} har ingen opgaver ${ALL_DAYS.find((d) => d.key === day)?.label.toLowerCase()}` : "Vælg medarbejder"}</div>}
            {schedule.map((seg) => {
              if (seg.type === "transport") {
                return (
                  <div key={seg.key} style={styles.phoneTransportCard}>
                    <Car size={13} /> {fmtClock(seg.start)} · Transport til næste opgave · {fmtMin(seg.minutes)}
                  </div>
                );
              }
              const t = seg.task;
              const myLogged = t.timeLog.filter((l) => l.empId === empId).reduce((s, l) => s + l.minutes, 0);
              const shared = (t.assignees || []).length > 1;
              const open = openTaskId === t.id;
              const done = t.status === "udført";
              return (
                <div key={t.id} style={{ ...styles.phoneCard, opacity: done ? 0.6 : 1 }}>
                  <div style={styles.phoneCardTop} onClick={() => setOpenTaskId(open ? null : t.id)}>
                    <TypeBadge type={t.type} mini />
                    <div style={{ flex: 1 }}>
                      <div style={styles.cardTitle}>{fmtClock(seg.start)} · {t.title}</div>
                      <div style={styles.cardMeta}>{skillLabel(t)} · {fmtMin(t.duration)}</div>
                    </div>
                    {done && <CheckCircle2 size={18} color="#111111" />}
                  </div>

                  {(t.customerName || t.address) && (
                    <div style={styles.phoneAddressRow} onClick={(e) => e.stopPropagation()}>
                      <Building2 size={13} color="#9C1B5D" style={{ flexShrink: 0, marginTop: 1 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        {t.customerName && <div style={styles.phoneCustomerName}>{t.customerName}</div>}
                        {t.address && <div style={styles.cardMeta}>{t.address}</div>}
                      </div>
                      {t.address && (
                        <a href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(t.address)}`} target="_blank" rel="noreferrer" style={styles.navigateBtn}>
                          <Navigation size={12} /> Naviger
                        </a>
                      )}
                    </div>
                  )}
                  {shared && <div style={{ ...styles.cardMeta, padding: "0 2px 4px" }}>Sammen med: {(t.assignees || []).filter((id) => id !== empId).map((id) => employees.find((e) => e.id === id)?.name).filter(Boolean).join(", ")}</div>}

                  {open && (
                    <div style={styles.phoneCardBody}>
                      {t.needsKeyPickup && (
                        <div style={{ background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 8, padding: "7px 10px", marginBottom: 8, fontSize: 12.5, fontWeight: 600, color: "#92400E" }}>
                          🔑 Nøgle/adgangskort hentes på kontoret først
                        </div>
                      )}
                      {t.accessInstructions && (
                        <div style={styles.accessBox}>
                          <div style={styles.accessTitle}><Lock size={13} /> Adgang</div>
                          <div style={styles.checklistItemDescription}>{t.accessInstructions}</div>
                        </div>
                      )}
                      {t.checklist && t.checklist.length > 0 && (
                        <div style={styles.instructionsBox}>
                          <div style={styles.instructionsTitle}><ListChecks size={13} /> Tasks ({checklistProgress(t).done}/{checklistProgress(t).total})</div>
                          {t.checklist.map((item) => (
                            <div key={item.id} style={styles.checklistItemBlock}>
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); onToggleChecklistItem(t.id, item.id); }}
                                style={styles.checklistItemRow}
                              >
                                <span style={item.done ? styles.checkboxDone : styles.checkboxEmpty}>{item.done && <Check size={11} color="#fff" />}</span>
                                <span style={{ ...styles.checklistItemText, textDecoration: item.done ? "line-through" : "none", color: item.done ? "#94A3B8" : "#111111" }}>{item.text}</span>
                              </button>
                              {(item.description || item.videoUrl) && (
                                <div style={styles.checklistItemExtra}>
                                  {item.description && <div style={styles.checklistItemDescription}>{item.description}</div>}
                                  {item.videoUrl && (
                                    <a href={item.videoUrl} target="_blank" rel="noreferrer" style={styles.videoBtnSmall} onClick={(e) => e.stopPropagation()}>
                                      <Video size={11} /> Se video til denne task
                                    </a>
                                  )}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                      {t.videoUrl && (
                        <a href={t.videoUrl} target="_blank" rel="noreferrer" style={styles.videoBtn}>
                          <Video size={14} /> Se instruktionsvideo
                        </a>
                      )}
                      {(!t.checklist || t.checklist.length === 0) && !t.videoUrl && (
                        <div style={styles.cardMeta}><ClipboardList size={13} style={{ verticalAlign: "-2px", marginRight: 4 }} />Ingen tasks tilføjet til denne serviceorder</div>
                      )}
                    </div>
                  )}

                  <div style={styles.phoneCardFooter}>
                    <span style={styles.phoneTimeLogged}><Clock size={12} /> Registreret: {fmtMin(myLogged)} / {fmtMin(t.duration)}</span>
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <input
                        type="number" min={1} step={5} placeholder="min"
                        style={{ width: 60, padding: "5px 6px", borderRadius: 7, border: "1px solid #E2E8F0", fontSize: 12.5, textAlign: "center", color: "#111111", background: "#fff" }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && Number(e.target.value) > 0) {
                            onLogMinutes(t.id, empId, Number(e.target.value));
                            e.target.value = "";
                          }
                        }}
                      />
                      <button style={styles.timerBtn} onClick={(e) => {
                        const inp = e.currentTarget.previousSibling;
                        const val = Number(inp.value);
                        if (val > 0) { onLogMinutes(t.id, empId, val); inp.value = ""; }
                      }}><Clock size={12} /> Gem</button>
                      <button style={done ? styles.doneBtnActive : styles.doneBtn} onClick={() => onSetStatus(t.id, done ? "planlagt" : "udført")}>
                        <CheckCircle2 size={12} /> {done ? "Udført ✓" : "Marker udført"}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------- Week view ----------
// Send email notification to employee about day changes
function scheduleWeekSimple(instances, employees, weekOffset, weekYear) {
  const thisWeek = instances.filter(t => t.week === weekOffset && t.year === weekYear);
  const unassigned = thisWeek.filter(t => !t.assignees || !t.assignees.length);
  
  if (unassigned.length === 0) return { count: 0, employees: [] };
  
  const assignedEmployees = new Set();
  const updates = [];
  
  unassigned.forEach((task, idx) => {
    const emp = employees[idx % employees.length];
    if (emp) {
      assignedEmployees.add(emp.name);
      updates.push({ id: task.id, assignees: [emp.id], status: "planlagt" });
    }
  });
  
  return { count: updates.length, employees: Array.from(assignedEmployees), updates };
}

function WeekView({ employees, instances, unplaced, onAdd, onAuto, onScheduleWeek, onAutoAllWeeks, onPlace, onUnplace, onRemoveAssignee, onDelete, onOpenTask, onToggleInclude, onEditEmp, dragId, setDragId, weekLabel, weekNo, weekOffset, weekYear, onPrevWeek, onNextWeek, onTodayWeek, travelSettings, onOpenTravelSettings, currentIsoWeek, areas, employeeAreas, onOpenAddBlock, onOpenAddActivity, opgaveNoter }) {
  const [addMenuTaskId, setAddMenuTaskId] = useState(null);
  const [showWeekend, setShowWeekend] = useState(false);
  const [selectedAreaId, setSelectedAreaId] = useState("all"); // "all" eller area.id
  const [printEmployeeId, setPrintEmployeeId] = useState("all");
  const [unassignedFilter, setUnassignedFilter] = useState("current"); // "current" eller "all"
  // Weekendkolonnerne vises automatisk saa snart der ligger en opgave der - ellers
  // ville en loerdagsopgave vaere usynlig indtil man selv slog weekend til.
  const hasWeekendTasks = instances.some((t) => t.day === "Sat" || t.day === "Sun");
  const weekendTaskCount = instances.filter((t) => t.day === "Sat" || t.day === "Sun").length;

  // Aabner man en uge hvor der ligger opgaver i weekenden, slaas kolonnerne til af
  // sig selv. Derefter bestemmer knappen alene.
  //
  // showWeekend staar med vilje IKKE i deps: ellers ville et fravalg blive slaaet
  // til igen ved naeste render, og knappen ville vaere lige saa uvirksom som den var
  // foer — den skiftede kun sin egen tekst uden at flytte en eneste kolonne.
  useEffect(() => {
    setShowWeekend(hasWeekendTasks);
  }, [weekOffset, weekYear, hasWeekendTasks]);
  const visibleDays = showWeekend ? ALL_DAYS : DAYS;

  // Filtrer medarbejdere baseret på valgt område
  const areaFilteredEmployees = selectedAreaId === "all"
    ? employees
    : employees.filter((e) => employeeAreas.some((ea) => ea.employee_id === e.id && ea.area_id === selectedAreaId));
  const visibleEmployees = printEmployeeId === "all" ? areaFilteredEmployees : areaFilteredEmployees.filter((e) => e.id === printEmployeeId);

  // Filtrer ikke-tildelt opgaver baseret på uge
  const filteredUnplaced = unassignedFilter === "current"
    ? unplaced.filter(t => t.week === weekOffset && t.year === weekYear)
    : unplaced;

  return (
    <div style={styles.page}>
      <div style={styles.toolbar}>
        <button style={styles.primaryBtn} onClick={onAdd}><Plus size={16} /> Ny opgave</button>
        <button style={styles.secondaryBtn} onClick={onScheduleWeek}><Wand2 size={16} /> Planlæg</button>
        <button style={styles.secondaryBtn} onClick={onOpenTravelSettings}><Car size={16} /> Transporttid</button>
        <button style={{ ...styles.secondaryBtn, color: "#B91C1C", borderColor: "#FECACA" }} onClick={onOpenAddBlock}><Thermometer size={16} /> Sygdom/Ferie</button>
        <button style={{ ...styles.secondaryBtn, color: "#7C3AED", borderColor: "#DDD6FE" }} onClick={onOpenAddActivity}><Building2 size={16} /> Anden aktivitet</button>
        <button
          style={{ ...styles.secondaryBtn, ...(showWeekend ? { background: "#FCE4EF", color: "#D6247A", borderColor: "#D6247A" } : {}) }}
          onClick={() => setShowWeekend((v) => !v)}
          title="Vis/skjul weekend">
          {showWeekend ? "Man–Søn ✓" : "Man–Fre"}
        </button>
        {!showWeekend && weekendTaskCount > 0 && (<span style={{ ...styles.warnChip, marginLeft: 2 }} title="Slå Man–Søn til for at se dem">⚠️ {weekendTaskCount} opgave{weekendTaskCount === 1 ? "" : "r"} i weekenden er skjult</span>)}{areas && areas.length > 0 && (
          <select
            style={{ ...styles.inputSm, fontSize: 13, color: selectedAreaId !== "all" ? "#4F46E5" : "#111111", borderColor: selectedAreaId !== "all" ? "#4F46E5" : "#E2E8F0", background: selectedAreaId !== "all" ? "#EEF2FF" : "#fff", fontWeight: selectedAreaId !== "all" ? 700 : 400 }}
            value={selectedAreaId}
            onChange={(e) => setSelectedAreaId(e.target.value)}>
            <option value="all">📍 Alle medarbejdere</option>
            {areas.map((a) => <option key={a.id} value={a.id}>📍 {a.name}</option>)}
          </select>
        )}
        <select
          style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #E2E8F0", background: printEmployeeId !== "all" ? "#EEF2FF" : "#fff", fontWeight: printEmployeeId !== "all" ? 700 : 400 }}
          value={printEmployeeId}
          onChange={(e) => setPrintEmployeeId(e.target.value)}>
          <option value="all">🖨️ Alle medarbejdere</option>
          {employees.map((e) => <option key={e.id} value={e.id}>🖨️ {e.name}</option>)}
        </select>
        <button style={styles.secondaryBtn} onClick={() => window.print()}>🖨️ Print ugeplan</button>
        <div style={styles.toolbarSpacer} />
        <div style={styles.weekNav}>
          <button style={styles.weekNavBtn} onClick={onPrevWeek}><ChevronLeft size={16} /></button>
          <div style={styles.weekNavLabel}>
            <span style={styles.weekNavStrong}>Uge {weekNo} · {weekYear}</span> · {weekLabel}
            {weekOffset === currentIsoWeek.week && weekYear === currentIsoWeek.year && <span style={styles.weekNowTag}>Denne uge</span>}
          </div>
          <button style={styles.weekNavBtn} onClick={onNextWeek}><ChevronRight size={16} /></button>
          {!(weekOffset === currentIsoWeek.week && weekYear === currentIsoWeek.year) && <button style={styles.secondaryBtn} onClick={onTodayWeek}>I dag</button>}
        </div>
      </div>

      <div style={styles.legendRow}>
        {Object.entries(TYPE_META).filter(([k]) => k !== "flexible").map(([k, m]) => (
          <span key={k} style={{ ...styles.typeChip, color: m.color, background: m.bg, marginRight: 6 }}>{m.label}</span>
        ))}
        <span style={styles.hint}>Træk en opgave tilbage til "Ikke tildelt" for at frigive den, eller klik + på en opgave for at sætte flere medarbejdere på.</span>
      </div>

      <div style={styles.weekLayout}>
        <div
          style={styles.backlog}
          onDragOver={(e) => e.preventDefault()}
          onDrop={() => { if (dragId) onUnplace(dragId); setDragId(null); }}
        >
          <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%'}}>
            <div style={styles.backlogTitle}>Ikke tildelt ({filteredUnplaced.length})</div>
            <select 
              value={unassignedFilter}
              onChange={(e) => setUnassignedFilter(e.target.value)}
              style={{padding: '4px 8px', fontSize: '12px', border: '1px solid #CBD5E1', borderRadius: '4px', background: '#fff', cursor: 'pointer'}}
            >
              <option value="current">Denne uge</option>
              <option value="all">Alle uger</option>
            </select>
          </div>
          {filteredUnplaced.length === 0 && <div style={styles.emptyCol}>Alt er planlagt 🎉</div>}
          <div style={styles.backlogList}>
            {filteredUnplaced.map((t) => {
              // Kompetence-/områdetjekket genberegnes live her (i stedet for kun at
              // stole på det gemte t.warning-felt), så advarslen straks forsvinder
              // hvis man lige har rettet en medarbejders kompetence eller område —
              // uden at skulle vente på næste automatiske planlægningskørsel.
              const liveNoSkill = candidatesFor(t, employees, areas, employeeAreas).candidates.length === 0;
              return (
              <div key={t.id} draggable onDragStart={() => setDragId(t.id)} style={styles.backlogCard} onClick={() => onOpenTask(t.id)} title="Klik for at åbne serviceordren">
                <TypeBadge type={t.type} />
                <div style={styles.cardTitle}>{t.title}</div>
                {t.customerName && <div style={styles.taskChipCustomer}>{t.customerName}</div>}
                {t.address && <div style={styles.taskChipAddress}>📍 {t.address}</div>}
                <div style={styles.cardMeta}>Uge {t.week}{t.day ? ` · ${ALL_DAYS.find((d) => d.key === t.day)?.label}` : ""} · {skillLabel(t)} · {fmtMin(t.duration)}{t.deadline ? ` · senest ${ALL_DAYS.find((d) => d.key === t.deadline)?.label}` : ""}{t.scheduledTime ? ` · ønsket kl. ${t.scheduledTime}` : ""}</div>
                {liveNoSkill && <span style={styles.errorChip}><AlertTriangle size={12} /> Ingen har alle krævede kompetencer</span>}
                {!liveNoSkill && t.warning === "no_slot" && <span style={styles.warnChip}><AlertTriangle size={12} /> Ingen ledig dag inden fristen</span>}
              {!liveNoSkill && t.warning === "overloaded" && <span style={styles.warnChip}><AlertTriangle size={12} /> Ingen ledig kapacitet</span>}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 6 }} onClick={(e) => e.stopPropagation()}>
                  <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: t.includeInAuto ? "#D6247A" : "#94A3B8", cursor: "pointer", fontWeight: t.includeInAuto ? 700 : 400 }}
                    onClick={(e) => { e.stopPropagation(); onToggleInclude(t.id); }}>
                    <span style={{ width: 14, height: 14, borderRadius: 4, border: t.includeInAuto ? "2px solid #D6247A" : "2px solid #CBD5E1", background: t.includeInAuto ? "#D6247A" : "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      {t.includeInAuto && <Check size={9} color="#fff" strokeWidth={3} />}
                    </span>
                    Auto-planlæg
                  </label>
                  <button style={styles.iconBtnGhost} onClick={(e) => { e.stopPropagation(); onDelete(t.id); }}><Trash2 size={13} /></button>
                </div>
              </div>
              );
            })}
          </div>
        </div>

        <div style={styles.gridWrap}>
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${visibleDays.length}, minmax(0, 1fr))`, gap: 8 }}>
            {visibleDays.map((d, i) => (
              <div key={d.key} style={{ ...styles.gridHeaderCell, borderRight: i < visibleDays.length - 1 ? "1px solid #CBD5E1" : "none", ...(["Sat","Sun"].includes(d.key) ? { background: "#F8FAFC", color: "#94A3B8" } : {}) }}>{d.label}</div>
            ))}

            {visibleEmployees.map((emp) => (
              <React.Fragment key={emp.id}>
                <div
                  style={{ gridColumn: `1 / span ${visibleDays.length}`, display: "flex", alignItems: "center", gap: 8, cursor: "pointer", padding: "10px 2px 6px", marginTop: 6, borderTop: "2px solid #E2E8F0" }}
                  onClick={() => onEditEmp && onEditEmp(emp)}
                  title={`Rediger ${emp.name}`}
                >
                  <span style={{ ...styles.avatar, background: emp.color }}>{initials(emp.name)}</span>
                  <span style={{ fontSize: 14, fontWeight: 700, color: "#111111", textDecoration: "underline dotted", textUnderlineOffset: 3 }}>{emp.name}</span>
                </div>
                {visibleDays.map((d, i) => {
                  const dayTasks = instances.filter((t) => (t.assignees || []).includes(emp.id) && t.day === d.key);
                  // Tidslinjen i cellen. Transportsegmenterne tegnes for alle, ogsaa dem
                  // uden ordningen — planlaeggeren skal kunne se hvor koerslen ligger,
                  // selv om den ikke optager kapacitet for dem.
                  const schedule = computeDaySchedule(dayTasks, travelSettings, emp);
                  // Belaegningen regnes derimod som planlaeggeren gør. Foer taltes
                  // transporten med for ALLE, mens planlaegningen kun taeller den for dem
                  // paa ordningen — saa en dag kunne staa roed "overbooket" samtidig med
                  // at systemet mente der var plads og blev ved med at laegge opgaver paa.
                  const used = belastning([emp], instances, emp.id, d.key, travelSettings);
                  const weekendCell = isWeekendDay(d.key);
                  const weekendAllowed = weekendCell && !!emp.weekendOk;
                  const cap = emp.capacity[d.key] || 0;
                  // Weekend har intet kapacitetsloft - procent og "ledig tid" giver
                  // ingen mening der, saa baren fyldes ikke og teksten viser aftalen.
                  const pct = weekendCell ? 0 : (cap ? Math.min((used / cap) * 100, 100) : 0);
                  const over = weekendCell ? false : used > cap;
                  return (
                    <div key={d.key} style={{ ...styles.gridCell, borderRight: i < visibleDays.length - 1 ? "1px solid #CBD5E1" : "none", ...(["Sat","Sun"].includes(d.key) ? { background: "#FAFAFA" } : {}),
                      // Overbookede dage markeres tydeligt: en dag med mere arbejde end
                      // kapacitet skubber de sidste opgaver ned under det synlige område,
                      // hvor de reelt bliver usynlige for planlæggeren.
                      ...(over ? { background: "#FEF2F2", boxShadow: "inset 3px 0 0 #DC2626" } : {}) }}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={() => {
                        if (dragId) {
                          // Den trukne opgave kan stamme fra en anden uge (nu hvor "Ikke
                          // tildelt" viser opgaver på tværs af uger), så slå også op i
                          // unplaced-listen hvis den ikke findes i denne uges instanser.
                          const dragged = instances.find((t) => t.id === dragId) || unplaced.find((t) => t.id === dragId);
                          if (dragged) {
                            const agreedDays = dragged.templateDays || dragged.days || [];
                            const isOff = dragged.type === "fixed" && agreedDays.length > 0 && !agreedDays.includes(d.key);
                            if (isOff) {
                              const dayLabel = ALL_DAYS.find((x) => x.key === d.key)?.label || d.key;
                              const agreedLabels = agreedDays.map((k) => ALL_DAYS.find((x) => x.key === k)?.label || k).join(", ");
                              const ok = window.confirm(`Denne faste opgave er aftalt til: ${agreedLabels}.\n\nEr du sikker på at du vil planlægge den på ${dayLabel} — uden for aftalen?`);
                              if (!ok) { setDragId(null); return; }
                            }
                          }
                          onPlace(dragId, d.key, emp.id);
                        }
                        setDragId(null);
                      }}>
                      {over && (
                        <div style={styles.overBanner}
                          title={`${dayTasks.length} opgaver er planlagt på denne dag — ${fmtMin(used - cap)} mere end kapaciteten. Rul ned i kolonnen for at se dem alle.`}>
                          <span>⚠️ Overbooket · {fmtMin(used - cap)} over</span>
                          <span style={styles.overBannerCount}>{dayTasks.length} opgaver</span>
                        </div>
                      )}
                      <div style={styles.capBarTrack}>
                        <div style={{ ...styles.capBarFill, width: `${pct}%`, background: over ? "#DC2626" : pct > 80 ? "#D97706" : "#D6247A" }} />
                      </div>
                      <div style={{ fontSize: 10, margin: "3px 0 6px", display: "flex", gap: 6, flexWrap: "wrap" }}>
                        <span style={{ color: over ? "#DC2626" : pct > 80 ? "#D97706" : "#64748B", fontWeight: 600 }}>
                          {weekendCell
                            ? (weekendAllowed ? "Weekendaftale" : "Ingen weekendaftale")
                            : `${Math.round(pct)}% belægt`}
                        </span>
                        <span style={{ color: over ? "#DC2626" : "#16A34A", fontWeight: 600 }}>
                          {weekendCell ? (used > 0 ? fmtMin(used) : "—") : (over ? `${fmtMin(used - cap)} over` : `${fmtMin(cap - used)} ledig`)}
                        </span>
                      </div>
                      {schedule.map((seg) => {
                        if (seg.type === "transport") {
                          return (
                            <div key={seg.key} style={styles.transportChip} title="Estimeret transporttid mellem opgaver">
                              <Car size={11} /> {fmtClock(seg.start)} · Transport {fmtMin(seg.minutes)}
                            </div>
                          );
                        }
                        const t = seg.task;
                        const prog = checklistProgress(t);
                        const assignedEmps = (t.assignees || []).map((id) => employees.find((e) => e.id === id)).filter(Boolean);
                        const menuOpen = addMenuTaskId === t.id;
                        const addable = employees.filter((e) => !(t.assignees || []).includes(e.id));
                        const done = t.status === "udført";
                        const completion = completionInfo(t, employees);
                        return (
                          <div key={t.id} draggable onDragStart={() => setDragId(t.id)}
                            style={{ ...styles.taskChip, ...(t.offSchedule ? { borderLeft: "3px solid #F59E0B" } : t.onSchedule ? { borderLeft: "3px solid #22C55E" } : {}), ...(t.outsideArea ? { borderTop: "2px solid #7C3AED" } : {}),
                              // Udførte opgaver tones grønne, så man kan se med det samme
                              // hvad der er afsluttet — den gamle 6px prik var reelt usynlig.
                              ...(done ? { background: "#F0FDF4", borderColor: "#BBF7D0" } : {}) }}
                            onClick={() => onOpenTask(t.id)} title="Klik for at åbne serviceordren">
                            <div style={styles.chipTopRow}>
                              <TypeBadge type={t.type} mini />
                              <span style={styles.taskChipTitle}>{seg.start != null ? `${fmtClock(seg.start)} · ` : ""}{t.title}</span>
                              {t.scheduledTime && (seg.start == null || fmtClock(seg.start) !== t.scheduledTime) && <span title={`Ønsket kl. ${t.scheduledTime}`} style={{ fontSize: 11, marginLeft: 2, color: "#D97706" }}>🎯{t.scheduledTime}</span>}
                              
                          {t.offSchedule && <span title="Planlagt uden for aftale" style={{ fontSize: 12, marginLeft: 2 }}>⚠️</span>}
                              {t.onSchedule && !t.offSchedule && <span title="Planlagt på aftalt dag" style={{ fontSize: 12, marginLeft: 2 }}>✓</span>}
                              {t.outsideArea && <span title="Planlagt uden for medarbejderens område" style={{ fontSize: 12, marginLeft: 2 }}>📍⚠️</span>}
                              {/* Markering af at medarbejderen har skrevet eller fotograferet noget.
                                  Uden den ville dokumentationen kun blive opdaget af den der tilfaeldigvis
                                  aabnede opgaven — og saa var der ingen grund til at tage billedet. */}
                              {/* Nexus-opgave afsluttet uden kvittering. Kommunen betaler efter
                                  det der staar i Nexus, saa den mangler skal opdages samme dag
                                  — ikke foerst naar der faktureres om tre uger. */}
                              {t.nexusConfirmed === false && (
                                <span title="Afsluttet uden kvittering i KMD Nexus — følg op med medarbejderen"
                                  style={{ fontSize: 10, fontWeight: 800, color: "#fff", background: "#4F46E5", borderRadius: 4, padding: "1px 4px", marginLeft: 2 }}>
                                  Nexus!
                                </span>
                              )}
                              {(opgaveNoter?.[t.id]?.length > 0) && (
                                <span
                                  title={opgaveNoter[t.id].some((n) => (n.photos || []).length > 0)
                                    ? "Medarbejderen har skrevet en kommentar og vedhæftet billeder"
                                    : "Medarbejderen har skrevet en kommentar"}
                                  style={{ fontSize: 12, marginLeft: 2 }}>
                                  {opgaveNoter[t.id].some((n) => (n.photos || []).length > 0) ? "📷" : "💬"}
                                </span>
                              )}
                              {done
                                ? <span style={styles.doneCheck} title={completion?.label}>✓</span>
                                : <span style={{ ...styles.statusDot, background: statusColor(t.status) }} />}
                              <button style={styles.chipXBtn} title="Fjern fra board" onClick={(e) => { e.stopPropagation(); onUnplace(t.id); }}><X size={11} /></button>
                            </div>
                            <div style={styles.chipSubRow}>
                              {t.customerName && <span style={styles.taskChipCustomer}>{t.customerName}</span>}
                              {prog.total > 0 && <span style={styles.taskChipDur}>{prog.done}/{prog.total}</span>}
                              <span style={styles.taskChipDur}>{fmtMin(t.duration)}</span>
                              {/* Forsinkelsen staar i anden raekke. I oeverste raekke var titlen det eneste
                                  element der maatte skrumpe, saa den blev klemt helt vaek i smalle
                                  dagkolonner — og saa var opgaven umulig at faa oeje paa i ugeplanen. */}
                              {(seg.lateBy || 0) > 0 && (
                                <span
                                  title={"Konflikt: aftalt kl. " + (t.scheduledTime || "?") + ", men kan først begynde " + fmtMin(seg.lateBy) + " senere. Flyt en af dagens opgaver."}
                                  style={{ fontSize: 11, fontWeight: 800, color: "#fff", background: "#DC2626", borderRadius: 4, padding: "1px 5px" }}>
                                  {"⏱ " + fmtMin(seg.lateBy) + " for sent"}
                                </span>
                              )}
                            </div>
                            {t.address && <div style={styles.taskChipAddress}>📍 {t.address}</div>}
                            {completion && (
                              <div style={{ ...styles.doneNote, ...(completion.byEmployee ? {} : { color: "#92400E", background: "#FFFBEB" }) }}
                                title={completion.byEmployee
                                  ? "Medarbejderen har markeret opgaven som udført"
                                  : "Sat til udført af planlæggeren — ikke afsluttet af medarbejderen"}>
                                ✓ {completion.label}{completion.when ? ` · ${completion.when}` : ""}
                              </div>
                            )}
                            <div style={styles.chipAssigneeRow} onClick={(e) => e.stopPropagation()}>
                              {assignedEmps.map((a) => (
                                <button key={a.id} type="button" style={{ ...styles.chipAvatar, background: a.color }} title={`Fjern ${a.name}`}
                                  onClick={() => onRemoveAssignee(t.id, a.id)}>
                                  {initials(a.name)}
                                </button>
                              ))}
                              {addable.length > 0 && (
                                <button type="button" style={styles.chipAddBtn} onClick={() => setAddMenuTaskId(menuOpen ? null : t.id)}><Plus size={10} /></button>
                              )}
                              {menuOpen && (
                                <div style={styles.chipAddMenu}>
                                  {addable.map((e) => (
                                    <button key={e.id} type="button" style={styles.chipAddMenuItem} onClick={() => { onPlace(t.id, d.key, e.id); setAddMenuTaskId(null); }}>
                                      <span style={{ ...styles.chipAvatar, background: e.color }}>{initials(e.name)}</span> {e.name}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </React.Fragment>
            ))}
          </div>
        </div>
      </div>

      {/* Ugesammenfatning — kun i detail view */}
      {(
        <div style={{ marginTop: 12, background: "#F8FAFC", borderRadius: 10, padding: "10px 14px" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#475569", marginBottom: 8 }}>📊 Ugebelægning{selectedAreaId !== "all" && areas ? ` — ${areas.find((a) => a.id === selectedAreaId)?.name}` : " — alle medarbejdere"}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {visibleEmployees.map((emp) => {
              // Samme regnestykke som dagcellerne og som planlaeggeren. Foer lagde
              // totalen kun varigheder sammen, saa ugebjaelken kunne staa paa 80 % mens
              // flere af de dage den opsummerer var roede af overbelastning.
              const totalUsed = visibleDays.reduce(
                (s, d) => s + belastning([emp], instances, emp.id, d.key, travelSettings), 0);
              // Weekend indgaar ikke i kapacitetstotalen - der er intet loft at maale imod.
  const totalCap = visibleDays.reduce((s, d) => s + (isWeekendDay(d.key) ? 0 : (emp.capacity[d.key] || 0)), 0);
              const pct = totalCap ? Math.round((totalUsed / totalCap) * 100) : 0;
              const over = totalUsed > totalCap;
              return (
                <div key={emp.id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ ...styles.avatar, background: emp.color, width: 24, height: 24, fontSize: 11, flexShrink: 0 }}>{initials(emp.name)}</span>
                  <span style={{ fontSize: 12, color: "#111111", minWidth: 120, fontWeight: 500 }}>{emp.name}</span>
                  <div style={{ flex: 1, height: 6, background: "#E2E8F0", borderRadius: 99, overflow: "hidden" }}>
                    <div style={{ height: "100%", borderRadius: 99, background: over ? "#DC2626" : pct > 80 ? "#D97706" : "#D6247A", width: `${Math.min(100, pct)}%`, transition: "width 0.3s" }} />
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 700, color: over ? "#DC2626" : "#64748B", minWidth: 38, textAlign: "right" }}>{pct}%</span>
                  <span style={{ fontSize: 11, color: over ? "#DC2626" : "#16A34A", fontWeight: 600, minWidth: 80, textAlign: "right" }}>
                    {over ? `+${fmtMin(totalUsed - totalCap)} over` : `${fmtMin(totalCap - totalUsed)} ledig`}
                  </span>
                  <span style={{ fontSize: 11, color: "#94A3B8", minWidth: 80, textAlign: "right" }}>
                    {fmtMin(totalUsed)} / {fmtMin(totalCap)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div id="print-week-plan" style={{ display: "none" }}>
        <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 12 }}>
          Ugeplan – Uge {weekNo} · {weekYear} ({weekLabel}){printEmployeeId !== "all" && employees.find((e) => e.id === printEmployeeId) ? ` – ${employees.find((e) => e.id === printEmployeeId).name}` : ""}
        </div>
        {visibleEmployees.map((emp) => {
          const empDays = visibleDays.filter((d) => instances.some((t) => (t.assignees || []).includes(emp.id) && t.day === d.key));
          if (empDays.length === 0) return null;
          return (
            <div key={emp.id} style={{ marginBottom: 28, pageBreakAfter: "always" }}>
              <div style={{ fontSize: 17, fontWeight: 700, borderBottom: "2px solid #111111", paddingBottom: 4, marginBottom: 10 }}>{emp.name}</div>
              {empDays.map((d) => {
                const dayTasks = instances.filter((t) => (t.assignees || []).includes(emp.id) && t.day === d.key);
                const schedule = computeDaySchedule(dayTasks, travelSettings, emp).filter((s) => s.type === "task");
                return (
                  <div key={d.key} style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "#D6247A", marginBottom: 6 }}>{d.label}</div>
                    {schedule.map((seg) => {
                      const t = seg.task;
                      return (
                        <div key={t.id} style={{ border: "1px solid #CBD5E1", borderRadius: 8, padding: 10, marginBottom: 8, breakInside: "avoid" }}>
                          <div style={{ fontWeight: 700, fontSize: 14 }}>{fmtClock(seg.start)} · {t.title} ({t.duration} min)</div>
                          {t.customerName ? <div style={{ fontSize: 13 }}>Kunde: {t.customerName}</div> : null}
                          {t.address ? <div style={{ fontSize: 13 }}>Adresse: {t.address}</div> : null}
                          {t.needsKeyPickup ? <div style={{ fontSize: 13, fontWeight: 700 }}>🔑 Nøgle/adgangskort hentes på kontoret</div> : null}
                          {t.accessInstructions ? <div style={{ fontSize: 13 }}>Adgang: {t.accessInstructions}</div> : null}
                          {(t.checklist || []).length > 0 ? (
                            <ul style={{ margin: "6px 0 0", paddingLeft: 18, fontSize: 13 }}>
                              {(t.checklist || []).map((c, i) => <li key={i}>☐ {c.text || c}</li>)}
                            </ul>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TypeBadge({ type, mini }) {
  const m = TYPE_META[type];
  const Icon = m.icon;
  return (
    <span style={{ ...styles.typeChip, color: m.color, background: m.bg, padding: mini ? "1px 5px" : "2px 8px", fontSize: mini ? 10 : 11 }}>
      <Icon size={mini ? 10 : 11} style={{ marginRight: 3 }} />{mini ? "" : m.label}
    </span>
  );
}

// ---------- Employees ----------
// instances og travelSettings er bevidst ikke props laengere: siden er stamdata og
// skal ikke afhaenge af hvilken uge man staar i. Belaegningen laeses i ugeplanen.
function EmployeesView({ employees, onAdd, onEdit, onDelete, supabase, skills, onSkillsChange, areas, employeeAreas, onAreasChange, onEmployeeAreasChange }) {
  const [sog, setSog] = useState("");
  const [sortering, setSortering] = useState("ledig");
  const [omraadeFilter, setOmraadeFilter] = useState("alle");
  // Hvilke raekker er foldet ud. Et Set frem for et id, saa flere kan vaere aabne ad
  // gangen — man sammenligner to medarbejdere naar man skal flytte en opgave.
  const [udfoldet, setUdfoldet] = useState(new Set());
  function skiftUdfoldet(id) {
    setUdfoldet((prev) => {
      const naeste = new Set(prev);
      if (naeste.has(id)) naeste.delete(id); else naeste.add(id);
      return naeste;
    });
  }

  // Alt det raekken skal vise, regnet ét sted. Belastningen bruger samme funktion som
  // planlaegningen, saa bjaelken og systemets egen beslutning altid er enige.
  // Medarbejdersiden er stamdata: hvem de er, hvad de kan, hvor mange timer de har,
  // og hvem der har adgang til appen. Belaegning hoerer hjemme i ugeplanen, hvor man
  // faktisk planlaegger — den er ugeafhaengig og hoerer ikke til paa et stamkort.
  // Her staar derfor kun det aftalte timetal, ikke hvor meget der er lagt paa.
  const beregnede = useMemo(() => (employees || []).map((emp) => ({
    emp,
    ugeTimer: DAYS.reduce((s, d) => s + ((emp.capacity || {})[d.key] || 0), 0),
    kompetenceListe: Object.keys(emp.skills || {}),
  })), [employees]);

  const sogLille = sog.trim().toLowerCase();
  const synligeMedarbejdere = useMemo(() => beregnede
    .filter((r) => {
      if (!sogLille) return true;
      // Soeger i baade navn og kompetencer, saa "vindue" finder dem der kan det.
      return (r.emp.name || "").toLowerCase().includes(sogLille)
        || r.kompetenceListe.some((k) => k.toLowerCase().includes(sogLille));
    })
    .filter((r) => {
      if (omraadeFilter === "alle") return true;
      return (employeeAreas || []).some((ea) => ea.employee_id === r.emp.id && ea.area_id === omraadeFilter);
    })
    .sort((a, b) => {
      if (sortering === "timer") return b.ugeTimer - a.ugeTimer;
      // De der mangler adgang til medarbejder-appen er dem man skal handle paa,
      // saa de kan hentes frem uden at lede gennem hele listen.
      if (sortering === "udenadgang") {
        const forskel = (a.emp.auth_user_id ? 1 : 0) - (b.emp.auth_user_id ? 1 : 0);
        if (forskel !== 0) return forskel;
      }
      return (a.emp.name || "").localeCompare(b.emp.name || "", "da");
    }), [beregnede, sogLille, omraadeFilter, sortering, employeeAreas]);
  const [showSkillsPanel, setShowSkillsPanel] = useState(false);
  const [showAreasPanel, setShowAreasPanel] = useState(false);
  const [inviteEmail, setInviteEmail] = useState({});
  const [inviteStatus, setInviteStatus] = useState({});
  const [orderPanel, setOrderPanel] = useState(null); // emp.id
  const [empOrders, setEmpOrders] = useState({}); // { empId: [transactions] }

  // Arbejdstoej bestilles i medarbejder-appen og godkendes under Lager. Her vises kun
  // historikken. Der laa tidligere en komplet bestillingsfunktion her — produktliste,
  // antalsfelter og fradrag i lageret — men den havde ingen indgang i brugerfladen og
  // blev aldrig kaldt. Den er fjernet, saa der ikke er to veje til det samme.
  async function openOrderPanel(emp) {
    setOrderPanel(emp.id);
    // Hent historik for denne medarbejder
    const { data } = await supabase
      .from("inventory_transactions")
      .select("*, inventory_items(name, unit, inventory_categories(type))")
      .eq("employee_id", emp.id)
      .eq("type", "out")
      .order("id", { ascending: false })
      .limit(20);
    // Filtrer kun medarbejderprodukter
    setEmpOrders((prev) => ({ ...prev, [emp.id]: (data || []).filter((tx) => tx.inventory_items?.inventory_categories?.type === "medarbejder") }));
  }



  async function inviteUser(emp) {
    const email = inviteEmail[emp.id]?.trim();
    if (!email) return;
    setInviteStatus((prev) => ({ ...prev, [emp.id]: "sending" }));

    // signUp sender bekræftelses-mail — brugeren sætter selv adgangskode via linket
    const { data, error } = await supabase.auth.signUp({
      email,
      password: crypto.randomUUID().replace(/-/g, "") + "Aa1!",
      options: { emailRedirectTo: window.location.origin }
    });

    if (error) {
      setInviteStatus((prev) => ({ ...prev, [emp.id]: "error: " + error.message }));
      return;
    }

    // Kobl auth_user_id hvis vi fik et id tilbage
    const userId = data?.user?.id;
    if (userId) {
      const { error: linkErr } = await supabase.from("employees").update({ auth_user_id: userId, app_email: email }).eq("id", emp.id);
      if (dbFail(linkErr, "knytte login til medarbejderen")) return;
      emp.auth_user_id = userId;
      emp.app_email = email;
    }

    setInviteStatus((prev) => ({ ...prev, [emp.id]: "sent" }));
    setInviteEmail((prev) => ({ ...prev, [emp.id]: "" }));
  }

  async function deactivateUser(emp) {
    if (!window.confirm(`Luk adgang for ${emp.name}? De kan ikke længere logge ind på medarbejder-appen.`)) return;
    setInviteStatus((prev) => ({ ...prev, [emp.id]: "deactivating" }));
    const { error: unlinkErr } = await supabase.from("employees").update({ auth_user_id: null }).eq("id", emp.id);
    if (dbFail(unlinkErr, "fjerne login fra medarbejderen")) return;
    // Opdatér local state så kortet opdateres med det samme
    emp.auth_user_id = null;
    setInviteStatus((prev) => ({ ...prev, [emp.id]: "deactivated" }));
  }

  return (
    <div style={styles.page}>
      <div style={styles.toolbar}>
        <button style={styles.primaryBtn} onClick={onAdd}><Plus size={16} /> Ny medarbejder</button>
        <button
          style={{ ...styles.secondaryBtn, ...(showSkillsPanel ? { background: "#FCE4EF", color: "#D6247A", borderColor: "#D6247A" } : {}) }}
          onClick={() => { setShowSkillsPanel((v) => !v); setShowAreasPanel(false); }}>
          ⭐ Kompetencer
        </button>
        <button
          style={{ ...styles.secondaryBtn, ...(showAreasPanel ? { background: "#EEF2FF", color: "#4F46E5", borderColor: "#4F46E5" } : {}) }}
          onClick={() => { setShowAreasPanel((v) => !v); setShowSkillsPanel(false); }}>
          📍 Områder
        </button>
      </div>

      {showSkillsPanel && (
        <div style={{ background: "#fff", borderRadius: 12, padding: 16, marginBottom: 16, boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
          <SkillsView supabase={supabase} skills={skills} onSkillsChange={onSkillsChange} />
        </div>
      )}

      {showAreasPanel && (
        <AreasView supabase={supabase} areas={areas} employees={employees} employeeAreas={employeeAreas}
          onAreasChange={onAreasChange} onEmployeeAreasChange={onEmployeeAreasChange} />
      )}
      {/* Vaerktoejslinje. Fandtes ikke foer: "hvem kan vinduespolering og har tid" betoed
          at laese tyve kort igennem. */}
      <div style={styles.empVaerktoej}>
        <input style={{ ...styles.inputSm, flex: 1, minWidth: 150 }} value={sog}
          onChange={(ev) => setSog(ev.target.value)} placeholder="Søg navn eller kompetence" />
        <select style={styles.inputSm} value={sortering} onChange={(ev) => setSortering(ev.target.value)}>
          <option value="navn">Navn</option>
          <option value="timer">Flest timer om ugen</option>
          <option value="udenadgang">Mangler app-adgang først</option>
        </select>
        <select style={styles.inputSm} value={omraadeFilter} onChange={(ev) => setOmraadeFilter(ev.target.value)}>
          <option value="alle">Alle områder</option>
          {(areas || []).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <button style={styles.secondaryBtn}
          onClick={() => setUdfoldet((prev) => prev.size ? new Set() : new Set(synligeMedarbejdere.map((r) => r.emp.id)))}>
          {udfoldet.size ? "Fold alle sammen" : "Fold alle ud"}
        </button>
      </div>

      <div style={styles.empListe}>
        {synligeMedarbejdere.map(({ emp: e, ugeTimer, kompetenceListe }) => {
          const status = inviteStatus[e.id];
          const hasUser = !!e.auth_user_id;
          return (
            <div key={e.id} style={{ borderBottom: "1px solid #F1F5F9" }}>
              {/* Sammenklappet raekke. Foer var alt udfoldet paa alle 20 kort samtidig:
                  kompetencer, kapacitet pr. dag, app-adgang med mailfelt og
                  udleveringshistorik. Spoergsmaalet "hvem har plads torsdag" kraevede
                  at man scrollede forbi det hele. */}
              {/* role og tabIndex fordi raekken er en div og ikke en knap: den skal kunne
                  naas med tastatur, ligesom de knapper den erstattede. */}
              <div style={styles.empRaekke} onClick={() => skiftUdfoldet(e.id)}
                role="button" tabIndex={0} aria-expanded={udfoldet.has(e.id)}
                onKeyDown={(ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); skiftUdfoldet(e.id); } }}>
                <span style={{ ...styles.avatar, background: e.color, width: 34, height: 34, fontSize: 13, flexShrink: 0 }}>{initials(e.name)}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={styles.empName}>{e.name}</div>
                  {/* Stamdata, ikke belaegning: det aftalte timetal og om weekend er med.
                      Hvor meget der er lagt paa i en given uge, staar i ugeplanen. */}
                  <div style={styles.empUnderNavn}>
                    {ugeTimer > 0
                      ? `${(ugeTimer / 60).toLocaleString("da-DK", { maximumFractionDigits: 1 })} timer om ugen`
                      : "Ingen timer sat"}
                    {e.weekendOk && " · weekend"}
                    {e.startTime && ` · møder ${e.startTime}`}
                  </div>
                </div>
                <div style={styles.empMaerker}>
                  {!hasUser && <span style={styles.empMaerkeRoed}>Ingen app-adgang</span>}
                  {e.travelInWorktime && <span style={styles.empMaerkeLilla} title="Kørsel tæller i kapaciteten">Kørsel</span>}
                  {e.isAdmin && <span style={styles.empMaerkeGraa}>Administrator</span>}
                  {kompetenceListe.slice(0, 2).map((s) => (
                    <span key={s} style={styles.empMaerkeRosa}>{s}</span>
                  ))}
                  {kompetenceListe.length > 2 && <span style={styles.empMaerkeGraa}>+{kompetenceListe.length - 2}</span>}
                  {kompetenceListe.length === 0 && <span style={styles.empMaerkeGraa}>Ingen kompetencer</span>}
                </div>
                {udfoldet.has(e.id)
                  ? <ChevronUp size={18} color="#94A3B8" style={{ flexShrink: 0 }} />
                  : <ChevronDown size={18} color="#94A3B8" style={{ flexShrink: 0 }} />}
              </div>

              {udfoldet.has(e.id) && (
              <div style={styles.empDetaljer}>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
                <button style={styles.secondaryBtn} onClick={() => onEdit(e)}><Pencil size={14} /> Redigér</button>
                <button style={{ ...styles.secondaryBtn, color: "#B91C1C", borderColor: "#FCA5A5", marginLeft: "auto" }}
                  onClick={() => onDelete(e.id)}><Trash2 size={14} /> Slet</button>
              </div>
              <div style={styles.empSkills}>
                {Object.entries(e.skills || {}).map(([s, lvl]) => (
                  <span key={s} style={styles.skillLevelTag}>{s} <StarLevel level={lvl} /></span>
                ))}
                {Object.keys(e.skills || {}).length === 0 && <span style={styles.cardMeta}>Ingen kompetencer angivet</span>}
                {/* Omraaderne stod slet ikke paa kortet foer, selvom de er med til at
                    afgoere hvem der overhovedet kan planlaegges hvor. */}
                {(areas || [])
                  .filter((a) => (employeeAreas || []).some((ea) => ea.employee_id === e.id && ea.area_id === a.id))
                  .map((a) => (
                    <span key={a.id} style={{ ...styles.skillLevelTag, background: "#EEF2FF", color: "#4F46E5" }}>📍 {a.name}</span>
                  ))}
              </div>
              <div style={styles.capRow}>
                {/* Det aftalte timetal pr. dag. Hvor meget der ligger paa dagen i en
                    bestemt uge, hoerer i ugeplanen — ikke paa stamkortet. */}
                {DAYS.map((d) => (
                  <div key={d.key} style={styles.capDayBox}>
                    <div style={styles.capDayLabel}>{d.label.slice(0, 3)}</div>
                    <div style={styles.capDayValue}>{(((e.capacity || {})[d.key] || 0) / 60).toFixed(1)}t</div>
                  </div>
                ))}
                <div style={styles.capDayBox}>
                  <div style={styles.capDayLabel}>WEEKEND</div>
                  <div style={{ ...styles.capDayValue, color: e.weekendOk ? "#16A34A" : "#CBD5E1" }}>
                    {e.weekendOk ? "Ja" : "Nej"}
                  </div>
                </div>
              </div>

              {/* Brugeradgang */}
              <div style={{ borderTop: "1px solid #F1F5F9", marginTop: 10, paddingTop: 10 }}>
                {/* Status + mail + luk-knap på én linje */}
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: hasUser ? "#16A34A" : "#94A3B8", whiteSpace: "nowrap" }}>
                    {hasUser ? "✓ App-adgang" : "○ Ingen adgang"}
                  </span>
                  {hasUser && e.app_email && (
                    <span style={{ fontSize: 11, color: "#64748B", background: "#F1F5F9", padding: "2px 8px", borderRadius: 6, overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%", display: "block" }}>
                      {e.app_email}
                    </span>
                  )}
                  {hasUser && (
                    <button
                      style={{ fontSize: 11, padding: "3px 8px", borderRadius: 6, border: "1px solid #FCA5A5", background: "#FEF2F2", color: "#DC2626", cursor: "pointer", whiteSpace: "nowrap", marginLeft: "auto" }}
                      onClick={() => deactivateUser(e)}>
                      {status === "deactivating" ? "Lukker…" : "Luk adgang"}
                    </button>
                  )}
                </div>

                {/* Email-felt og Opret-knap */}
                <div style={{ display: "flex", gap: 6 }}>
                  <input
                    type="email"
                    placeholder={hasUser ? "Ny e-mail (skift bruger)" : "E-mail til medarbejder"}
                    style={{ ...styles.inputSm, flex: 1, fontSize: 12, color: "#111111", background: "#fff", minWidth: 0 }}
                    value={inviteEmail[e.id] || ""}
                    onChange={(ev) => setInviteEmail((prev) => ({ ...prev, [e.id]: ev.target.value }))}
                    onKeyDown={(ev) => { if (ev.key === "Enter") inviteUser(e); }}
                  />
                  <button
                    style={{ ...styles.primaryBtn, fontSize: 12, padding: "6px 10px", whiteSpace: "nowrap" }}
                    disabled={!inviteEmail[e.id]?.trim() || status === "sending"}
                    onClick={() => inviteUser(e)}>
                    {status === "sending" ? "Sender…" : "Opret"}
                  </button>
                </div>

                {status === "sent" && <div style={{ fontSize: 12, color: "#16A34A", marginTop: 4 }}>✓ Bekræftelses-mail sendt</div>}
                {status === "deactivated" && <div style={{ fontSize: 12, color: "#DC2626", marginTop: 4 }}>Adgang lukket</div>}
                {status?.startsWith("error") && <div style={{ fontSize: 12, color: "#DC2626", marginTop: 4 }}>{status}</div>}
              </div>

              {/* Medarbejderprodukter — kun historik */}
              <div style={{ borderTop: "1px solid #F1F5F9", marginTop: 10, paddingTop: 10 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: orderPanel === e.id ? 10 : 0 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "#475569" }}>👕 Udleveringshistorik</span>
                  <button
                    style={{ fontSize: 11, padding: "3px 10px", borderRadius: 6, border: "1px solid #E2E8F0", background: orderPanel === e.id ? "#FCE4EF" : "#fff", color: orderPanel === e.id ? "#D6247A" : "#475569", cursor: "pointer" }}
                    onClick={() => orderPanel === e.id ? setOrderPanel(null) : openOrderPanel(e)}>
                    {orderPanel === e.id ? "Luk" : "Se historik"}
                  </button>
                </div>

                {orderPanel === e.id && (
                  <div>
                    {empOrders[e.id]?.length > 0 ? (
                      empOrders[e.id].map((tx) => (
                        <div key={tx.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12, padding: "5px 0", borderBottom: "1px solid #F8FAFC", color: "#475569", gap: 8 }}>
                          <span style={{ flex: 1 }}>{tx.inventory_items?.name}</span>
                          <span style={{ fontWeight: 600, color: "#111111" }}>{Math.abs(tx.quantity)} {tx.inventory_items?.unit}</span>
                          {tx.created_at && <span style={{ color: "#94A3B8", fontSize: 11, flexShrink: 0 }}>{new Date(tx.created_at).toLocaleDateString("da-DK", { day: "numeric", month: "short" })}</span>}
                        </div>
                      ))
                    ) : (
                      <div style={{ fontSize: 12, color: "#94A3B8", textAlign: "center", padding: "8px 0" }}>Ingen udleveringer endnu</div>
                    )}
                  </div>
                )}
              </div>
              </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StarLevel({ level }) {
  return (
    <span style={{ display: "inline-flex", gap: 1, marginLeft: 3 }}>
      {[1, 2, 3].map((i) => <Star key={i} size={10} fill={i <= level ? "#D97706" : "none"} color={i <= level ? "#D97706" : "#CBD5E1"} />)}
    </span>
  );
}

// ---------- Checklists (tasklist templates) ----------
function ChecklistsView({ checklistTemplates, onSave, onDelete }) {
  const [editing, setEditing] = useState(null);
  const [showModal, setShowModal] = useState(false);
  return (
    <div style={styles.page}>
      <div style={styles.toolbar}>
        <button style={styles.primaryBtn} onClick={() => { setEditing(null); setShowModal(true); }}><Plus size={16} /> Ny tjekliste</button>
      </div>
      <div style={styles.empGrid}>
        {checklistTemplates.map((c) => (
          <div key={c.id} style={styles.empCard}>
            <div style={styles.empCardTop}>
              <span style={{ ...styles.avatar, background: "#D6247A", width: 34, height: 34 }}><ListChecks size={16} /></span>
              <div style={{ flex: 1 }}>
                <div style={styles.empName}>{c.name}</div>
                <div style={styles.empLoad}>{c.items.length} tasks</div>
              </div>
              <button style={styles.iconBtnGhostInline} onClick={() => { setEditing(c); setShowModal(true); }}><Pencil size={14} /></button>
              <button style={styles.iconBtnGhostInline} onClick={() => onDelete(c.id)}><Trash2 size={14} /></button>
            </div>
            <ol style={styles.checklistPreviewList}>
              {c.items.map((it, i) => (
                <li key={i} style={styles.checklistPreviewItem}>
                  {it.text}
                  {it.description && <span style={styles.itemFlagTag}><ClipboardList size={10} /></span>}
                  {it.videoUrl && <span style={styles.itemFlagTag}><Video size={10} /></span>}
                </li>
              ))}
            </ol>
          </div>
        ))}
      </div>
      {showModal && (
        <ChecklistModal
          checklist={editing}
          onClose={() => { setShowModal(false); setEditing(null); }}
          onSave={(c) => { onSave(c); setShowModal(false); setEditing(null); }}
        />
      )}
    </div>
  );
}

function ChecklistModal({ checklist, onClose, onSave }) {
  const [name, setName] = useState(checklist?.name || "");
  const [items, setItems] = useState(checklist?.items || []);
  const [draftText, setDraftText] = useState("");
  const [draftDescription, setDraftDescription] = useState("");
  const [draftVideoUrl, setDraftVideoUrl] = useState("");
  const [editIndex, setEditIndex] = useState(null);

  function resetDraft() { setDraftText(""); setDraftDescription(""); setDraftVideoUrl(""); setEditIndex(null); }
  function startEdit(i) {
    const it = items[i];
    setDraftText(it.text); setDraftDescription(it.description || ""); setDraftVideoUrl(it.videoUrl || "");
    setEditIndex(i);
  }
  function saveDraft() {
    if (!draftText.trim()) return;
    const newItem = { text: draftText.trim(), description: draftDescription.trim(), videoUrl: draftVideoUrl.trim() };
    if (editIndex !== null) setItems((prev) => prev.map((it, idx) => (idx === editIndex ? newItem : it)));
    else setItems((prev) => [...prev, newItem]);
    resetDraft();
  }
  function removeItem(i) { setItems((prev) => prev.filter((_, idx) => idx !== i)); if (editIndex === i) resetDraft(); }
  // Flytter et tjekliste-punkt op (dir=-1) eller ned (dir=1), så man kan indsætte
  // et nyt punkt et bestemt sted (fx som nr. 2) i stedet for kun nederst.
  function moveItem(i, dir) {
    setItems((prev) => {
      const j = i + dir;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
    if (editIndex === i) setEditIndex(i + dir);
    else if (editIndex === i + dir) setEditIndex(i);
  }

  return (
    <Modal onClose={onClose} title={checklist ? "Rediger tjekliste" : "Ny tjekliste"} persistent>
      <label style={styles.label}>Navn</label>
      <input style={styles.input} value={name} onChange={(e) => setName(e.target.value)} placeholder="F.eks. Gulvvask – standard" />

      <label style={styles.label}>Tasks ({items.length})</label>
      {items.map((it, i) => (
        <div key={i} style={i === editIndex ? { ...styles.checklistEditRow, background: "#FCE4EF", borderLeft: "3px solid #D6247A", borderRadius: 4, paddingLeft: 6 } : styles.checklistEditRow}>
          <div style={{ flex: 1 }}>
            <div style={styles.previewItemText}>{i + 1}. {it.text}</div>
            <div style={styles.itemFlags}>
              {it.description && <span style={styles.itemFlagTag}><ClipboardList size={10} /> Beskrivelse</span>}
              {it.videoUrl && <span style={styles.itemFlagTag}><Video size={10} /> Video</span>}
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <button type="button" disabled={i === 0} style={{ ...styles.iconBtnGhostInline, padding: 2, opacity: i === 0 ? 0.3 : 1, cursor: i === 0 ? "default" : "pointer" }} onClick={() => moveItem(i, -1)} title="Flyt op"><ChevronUp size={13} /></button>
            <button type="button" disabled={i === items.length - 1} style={{ ...styles.iconBtnGhostInline, padding: 2, opacity: i === items.length - 1 ? 0.3 : 1, cursor: i === items.length - 1 ? "default" : "pointer" }} onClick={() => moveItem(i, 1)} title="Flyt ned"><ChevronDown size={13} /></button>
          </div>
          <button type="button" style={styles.iconBtnGhostInline} onClick={() => startEdit(i)}><Pencil size={13} /></button>
          <button type="button" style={styles.iconBtnGhostInline} onClick={() => removeItem(i)}><X size={13} /></button>
        </div>
      ))}

      <div style={styles.itemDraftBox}>
        <div style={styles.itemDraftTitle}>{editIndex !== null ? "Rediger task" : "Ny task"}</div>
        <input style={styles.input} value={draftText} onChange={(e) => setDraftText(e.target.value)} placeholder="Task-tekst, f.eks. 'Sæt vådt-gulv skilt'" />
        <textarea style={styles.textarea} rows={2} value={draftDescription} onChange={(e) => setDraftDescription(e.target.value)} placeholder="Uddybende beskrivelse (valgfrit)" />
        <input style={styles.input} value={draftVideoUrl} onChange={(e) => setDraftVideoUrl(e.target.value)} placeholder="Link til video for denne task (valgfrit)" />
        <div style={styles.itemDraftActions}>
          {editIndex !== null && <button type="button" style={styles.secondaryBtn} onClick={resetDraft}>Annuller redigering</button>}
          <button type="button" style={styles.addSkillBtn} onClick={saveDraft}><Plus size={13} /> {editIndex !== null ? "Gem task" : "Tilføj task"}</button>
        </div>
      </div>

      <div style={styles.modalActions}>
        <button style={styles.secondaryBtn} onClick={onClose}>Annuller</button>
        <button style={styles.primaryBtn} disabled={!name.trim() || items.length === 0} onClick={() => onSave({ id: checklist?.id || uid("cl"), name: name.trim(), items })}>Gem tjekliste</button>
      </div>
    </Modal>
  );
}

// ---------- Time & Export ----------
function TimeView({ instances, employees, totalLogged, onExportToDinero, weekLabel, onUpdateInstance, pricing: pricingProp, onPricingChange, isAdminUser, onOpenTask, productUsage, onToggleProductInvoice, onToggleProductDinero, opgaveNoter }) {
  const productLinesByTask = useMemo(() => {
    const map = {};
    (productUsage || []).forEach((tx) => {
      if (!map[tx.instance_id]) map[tx.instance_id] = [];
      const item = tx.inventory_items || {};
      map[tx.instance_id].push({
        id: tx.id,
        label: item.item_number ? `${item.item_number} — ${item.name}` : (item.name || "Produkt"),
        qty: Math.abs(Number(tx.quantity) || 0),
        unit: item.unit || "stk",
        amount: Math.abs(Number(tx.quantity) || 0) * (Number(item.price) || 0),
        invoiceReady: tx.invoice_ready !== false,
        dineroExported: !!tx.dinero_exported,
      });
    });
    return map;
  }, [productUsage]);
  const now = new Date();
  const [filterMonth, setFilterMonth] = useState(now.getMonth());
  const [filterYear, setFilterYear] = useState(now.getFullYear());
  const [invoiceOnly, setInvoiceOnly] = useState(false);
  const [showDineroExported, setShowDineroExported] = useState(false);
  // Status-filter: gør det muligt at skelne mellem opgaver der er udført (og dermed
  // reelt klar til fakturering) og dem der blot er planlagt/i gang.
  const [statusFilter, setStatusFilter] = useState("all");
  const [editMinutes, setEditMinutes] = useState({});
  const [showPricing, setShowPricing] = useState(false);
  const [exportingToDinero, setExportingToDinero] = useState(false);
  const [localPricing, setLocalPricing] = useState(pricingProp || { privat: 450, erhverv: 550, nexus: 380, aeldrelov: 410 });

  useEffect(() => { if (pricingProp) setLocalPricing(pricingProp); }, [JSON.stringify(pricingProp)]);

  const [kmData, setKmData] = useState(null);
  const [kmLoading, setKmLoading] = useState(false);
  const [kmError, setKmError] = useState(null);

  async function computeKmForMonth() {
    setKmLoading(true);
    setKmError(null);
    try {
      const monthInstances = instances
        .filter((t) => !BLOCK_TYPES.includes(t.type))
        .filter((t) => {
          const { month, year } = instanceMonthYear(t, filterYear);
          return month === filterMonth && year === filterYear;
        });
      const byEmpDay = {};
      monthInstances.forEach((t) => {
        (t.assignees || []).forEach((empId) => {
          const key = empId + "|" + t.year + "|" + t.week + "|" + t.day;
          if (!byEmpDay[key]) byEmpDay[key] = [];
          byEmpDay[key].push(t);
        });
      });
      const allPairs = [];
      Object.entries(byEmpDay).forEach(([key, tasks]) => {
        const empId = key.split("|")[0];
        const emp = employees.find((e) => e.id === empId);
        if (!emp) return;
        const addrs = tasks.map((t) => t.address || "").filter(Boolean);
        for (let i = 0; i < addrs.length - 1; i++) {
          const a = addrs[i], b = addrs[i + 1];
          if (!a || !b || a === b) continue;
          allPairs.push({ a, b, empId });
        }
      });
      if (allPairs.length === 0) { setKmData({}); setKmLoading(false); return; }
      const { data, error } = await supabase.functions.invoke("travel-distance", {
        body: { pairs: allPairs.map((p) => ({ a: p.a, b: p.b })) },
      });
      if (error) { setKmError("Kunne ikke beregne km: " + error.message); setKmLoading(false); return; }
      const results = (data && data.results) || [];
      const totals = {};
      allPairs.forEach((p, i) => {
        const r = results[i];
        const km = r && typeof r.km === "number" ? r.km : 0;
        totals[p.empId] = (totals[p.empId] || 0) + km;
      });
      setKmData(totals);
    } catch (e) {
      setKmError("Kunne ikke beregne km: " + (e && e.message ? e.message : String(e)));
    }
    setKmLoading(false);
  }

  const placed = instances
    .filter((t) => !BLOCK_TYPES.includes(t.type))
    .filter((t) => {
      // Filtrér på opgavens faktiske dato (mandag i ugen + evt. ugedag), ikke
      // blot ugenummeret - så en uge der strækker sig over et månedsskift
      // (fx uge 31: 27. jul - 2. aug) altid lander i præcis den rigtige måned.
      const { month, year } = instanceMonthYear(t, filterYear);
      return month === filterMonth && year === filterYear;
    })
    .filter((t) => statusFilter === "all" || t.status === statusFilter)
    .filter((t) => !invoiceOnly || t.invoiceReady)
    .filter((t) => !invoiceOnly || showDineroExported || !t.dineroExported)
    .sort((a, b) => {
      if (a.week !== b.week) return a.week - b.week;
      const aEmp = (a.assignees || []).map((id) => employees.find((e) => e.id === id)?.name || "").sort().join(", ") || "\uffff";
      const bEmp = (b.assignees || []).map((id) => employees.find((e) => e.id === id)?.name || "").sort().join(", ") || "\uffff";
      if (aEmp !== bEmp) return aEmp.localeCompare(bEmp, "da");
      const aDay = a.day ? ALL_DAYS.findIndex((d) => d.key === a.day) : 99;
      const bDay = b.day ? ALL_DAYS.findIndex((d) => d.key === b.day) : 99;
      if (aDay !== bDay) return aDay - bDay;
      const aCust = a.customerName || "";
      const bCust = b.customerName || "";
      if (aCust !== bCust) return aCust.localeCompare(bCust, "da");
      return (a.title || "").localeCompare(b.title || "", "da");
    });

  const totalPlanned = placed.reduce((s, t) => s + t.duration, 0);
  const totalRegistered = placed.reduce((s, t) => s + (t.timeLog || t.time_log || []).reduce((s2, l) => s2 + (l.minutes || 0), 0), 0);

  // Forventet omsætning baseret på registreret tid og timepriser
  const expectedRevenue = placed.reduce((s, t) => {
    if (t.pricingType === "fixed") {
      const hasLog = (t.timeLog || t.time_log || []).length > 0 || t.status === "udført";
      return s + (hasLog ? (Number(t.fixedPrice) || 0) : 0);
    }
    const logged = (t.timeLog || t.time_log || []).reduce((s2, l) => s2 + (l.minutes || 0), 0);
    const rate = localPricing[t.contractType || "privat"] || 0;
    return s + (logged / 60) * rate;
  }, 0);

  const MONTHS = ["Januar","Februar","Marts","April","Maj","Juni","Juli","August","September","Oktober","November","December"];
  const years = [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1];

  function saveMinutes(t, newMin) {
    const m = Number(newMin);
    if (isNaN(m) || m < 0) return;
    const newLog = [{ minutes: m, empId: "planner", ts: Date.now(), note: "Justeret af planlægger" }];
    onUpdateInstance(t.id, { timeLog: newLog, time_log: newLog });
    setEditMinutes((prev) => { const n = { ...prev }; delete n[t.id]; return n; });
  }

  return (
    <div style={styles.page}>
      <div style={styles.toolbar}>
        {(() => {
          const plannedRev = placed.reduce((s, t) => s + (t.pricingType === "fixed" ? (Number(t.fixedPrice) || 0) : (t.duration / 60) * (localPricing[t.contractType || "privat"] || 0)), 0);
          const regRev = expectedRevenue;
          const diff = Math.round(regRev - plannedRev);
          return (
            <>
              <div style={{ ...styles.statBlock, borderLeft: "3px solid #64748B" }}>
                <div><div style={{ ...styles.statValue, color: "#64748B" }}>{Math.round(plannedRev).toLocaleString("da-DK")} kr.</div><div style={styles.statLabel}>Planlagt omsætning</div></div>
              </div>
              <div style={{ ...styles.statBlock, borderLeft: "3px solid #16A34A" }}>
                <div><div style={{ ...styles.statValue, color: "#16A34A" }}>{Math.round(regRev).toLocaleString("da-DK")} kr.</div><div style={styles.statLabel}>Registreret omsætning</div></div>
              </div>
              <div style={{ ...styles.statBlock, borderLeft: `3px solid ${diff >= 0 ? "#16A34A" : "#DC2626"}` }}>
                <div><div style={{ ...styles.statValue, color: diff >= 0 ? "#16A34A" : "#DC2626" }}>{diff > 0 ? "+" : ""}{diff.toLocaleString("da-DK")} kr.</div><div style={styles.statLabel}>Difference</div></div>
              </div>
            </>
          );
        })()}
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <select style={{ ...styles.inputSm, fontSize: 13, fontWeight: 600 }} value={filterMonth} onChange={(e) => setFilterMonth(Number(e.target.value))}>
            {MONTHS.map((m, i) => <option key={i} value={i}>{m}</option>)}
          </select>
          <select style={{ ...styles.inputSm, fontSize: 13, fontWeight: 600 }} value={filterYear} onChange={(e) => setFilterYear(Number(e.target.value))}>
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          <select
            style={{ ...styles.inputSm, fontSize: 13, fontWeight: 600, color: statusFilter !== "all" ? "#9C1B5D" : "#111111", borderColor: statusFilter !== "all" ? "#D6247A" : "#E2E8F0", background: statusFilter !== "all" ? "#FCE4EF" : "#fff" }}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            title="Vis kun opgaver med denne status — brug 'Udført' for at se det reelle fakturagrundlag">
            <option value="all">📋 Alle statusser</option>
            <option value="unscheduled">🚫 Ikke planlagt</option>
            <option value="planlagt">🗓️ Planlagt</option>
            <option value="udført">✅ Udført</option>
          </select>
        </div>
        <div style={styles.toolbarSpacer} />
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: invoiceOnly ? 700 : 400, color: invoiceOnly ? "#16A34A" : "#475569", cursor: "pointer" }}
          onClick={() => setInvoiceOnly((v) => !v)}>
          <span style={{ width: 18, height: 18, borderRadius: 5, border: invoiceOnly ? "2px solid #16A34A" : "2px solid #CBD5E1", background: invoiceOnly ? "#16A34A" : "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
            {invoiceOnly && <Check size={11} color="#fff" strokeWidth={3} />}
          </span>
          Kun fakturagrundlag
        </label>
        {invoiceOnly && (
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: showDineroExported ? 700 : 400, color: showDineroExported ? "#4F46E5" : "#475569", cursor: "pointer" }}
            onClick={() => setShowDineroExported((v) => !v)}>
            <span style={{ width: 18, height: 18, borderRadius: 5, border: showDineroExported ? "2px solid #4F46E5" : "2px solid #CBD5E1", background: showDineroExported ? "#4F46E5" : "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
              {showDineroExported && <Check size={11} color="#fff" strokeWidth={3} />}
            </span>
            Vis sendt til Dinero
          </label>
        )}
        <button
          style={{ ...styles.secondaryBtn, ...(showPricing ? { background: "#ECFDF5", color: "#16A34A", borderColor: "#22C55E" } : {}) }}
          onClick={() => setShowPricing((v) => !v)}>
          💰 Timepriser
        </button>
        <button style={styles.primaryBtn} disabled={exportingToDinero} onClick={async () => {
          setExportingToDinero(true);
          try { await onExportToDinero(placed, `${MONTHS[filterMonth]}-${filterYear}`); } finally { setExportingToDinero(false); }
        }}><Download size={16} /> {exportingToDinero ? "Eksporterer…" : "Eksporter til Dinero"}</button>
      </div>

      {/* Timepris-panel */}
      {showPricing && (
        <div style={{ background: "#fff", borderRadius: 12, padding: 16, marginBottom: 12, boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: "#111111", marginBottom: 12 }}>💰 Timepriser pr. kontrakttype</div>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 12 }}>
            {CONTRACT_TYPES.map((c) => [c.key, c.icon + " " + c.label]).map(([type, label]) => (
              <div key={type} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <label style={styles.label}>{label}</label>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <input
                    type="number" min={0} step={10}
                    style={{ ...styles.inputSm, width: 90, textAlign: "right" }}
                    value={localPricing[type] || 0}
                    onChange={(e) => setLocalPricing((prev) => ({ ...prev, [type]: Number(e.target.value) }))}
                  />
                  <span style={{ fontSize: 13, color: "#64748B" }}>kr/t</span>
                </div>
              </div>
            ))}
          </div>
          <button style={styles.primaryBtn} onClick={async () => { if (onPricingChange) { await onPricingChange(localPricing); setShowPricing(false); } }}>
            Gem timepriser
          </button>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "50px 140px 120px 160px 1fr 70px 80px 100px 100px 100px 90px 70px 28px", gap: 0, background: "#F8FAFC", borderRadius: "10px 10px 0 0", padding: "8px 14px", fontSize: 10, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.04em", marginTop: 8 }}>
        <span>Uge</span><span>Medarbejder</span><span>Kunde</span><span>Adresse</span><span>Opgave</span><span>Dag</span>
        {/* Tid og kroner parvis, som i Medarbejder-eksport: planlagt tid ved siden af
            planlagt beloeb, registreret tid ved siden af registreret beloeb. */}
        <span style={{ textAlign: "right" }}>Planlagt</span>
        <span style={{ textAlign: "right" }}>Planlagt kr.</span>
        <span style={{ textAlign: "right" }}>Registreret</span>
        <span style={{ textAlign: "right" }}>Registreret kr.</span>
        <span style={{ textAlign: "right" }}>Difference</span>
        <span style={{ textAlign: "center" }}>Dinero</span>
        <span style={{ textAlign: "center" }}>📄</span>
      </div>

      <div style={{ background: "#fff", borderRadius: "0 0 10px 10px", boxShadow: "0 1px 3px rgba(0,0,0,0.06)", overflow: "hidden" }}>
        {placed.map((t, idx) => {
          const emps = (t.assignees || []).map((id) => employees.find((e) => e.id === id)).filter(Boolean);
          const logged = (t.timeLog || t.time_log || []).reduce((s, l) => s + (l.minutes || 0), 0);
          const dayLabel = ALL_DAYS.find((d) => d.key === t.day)?.label || t.day || "—";
          const isLow = logged > 0 && logged < t.duration * 0.5;
          const isEditing = editMinutes[t.id] !== undefined;
          // Begrundelser medarbejderne har angivet ved overskridelse af planlagt tid.
          // Planlæggerens egne justeringer (empId "planner") er ikke overskridelses-
          // begrundelser og skal ikke give en advarsel her.
          const overrunNotes = (t.timeLog || t.time_log || [])
            .filter((l) => l.note && String(l.note).trim() && l.empId !== "planner")
            .map((l) => {
              const who = employees.find((e) => e.id === l.empId)?.name || "Medarbejder";
              return `${who} (${fmtMin(l.minutes || 0)}): ${l.note}`;
            });
          const rate = localPricing[t.contractType || "privat"] || 0;
          const isFixedPrice = t.pricingType === "fixed";
          const plannedKr = isFixedPrice ? Math.round(Number(t.fixedPrice) || 0) : Math.round((t.duration / 60) * rate);
          const registeredKr = isFixedPrice ? (logged > 0 ? plannedKr : 0) : Math.round((logged / 60) * rate);
          const diffKr = registeredKr - plannedKr;

          const taskProductLines = productLinesByTask[t.id] || [];
          // Medarbejderens dokumentation staar direkte under linjen. Det er her
          // beslutningen om beloebet traeffes, og et billede af et beskidt koekken
          // er praecis det argument man skal bruge over for kunden bagefter.
          const taskNoter = (opgaveNoter || {})[t.id] || [];
          return (
            <React.Fragment key={t.id}>
            <div style={{ display: "grid", gridTemplateColumns: "50px 140px 120px 160px 1fr 70px 80px 100px 100px 100px 90px 70px 28px", gap: 0, padding: "10px 14px", borderBottom: (idx < placed.length - 1 || taskProductLines.length > 0) ? "1px solid #F1F5F9" : "none", alignItems: "center", background: t.dineroExported ? "#EEF2FF" : t.invoiceReady ? "#F0FDF4" : "transparent" }}>
              <div style={{ fontSize: 12, color: "#94A3B8", fontWeight: 600 }}>{t.week}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                {emps.length === 0 ? (
                  <span style={{ fontSize: 11, color: "#94A3B8", fontStyle: "italic" }}>Ikke tildelt</span>
                ) : (
                  <>
                    {emps.slice(0, 2).map((emp) => <span key={emp.id} style={{ ...styles.avatar, background: emp.color, width: 22, height: 22, fontSize: 10 }}>{initials(emp.name)}</span>)}
                    <span style={{ fontSize: 11, color: "#475569", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{emps.map((e) => e.name).join(", ")}</span>
                  </>
                )}
              </div>
              <div style={{ fontSize: 12, color: "#64748B", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.customerName || "—"}</div>
              <div style={{ fontSize: 12, color: "#94A3B8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.address || "—"}</div>
              <div
                style={{
                  fontSize: 13, fontWeight: 600, color: isAdminUser ? "#9C1B5D" : "#111111",
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  cursor: isAdminUser ? "pointer" : "default",
                  textDecoration: isAdminUser ? "underline" : "none", textDecorationStyle: "dotted",
                }}
                title={isAdminUser ? "Klik for at åbne og redigere opgaven" : t.title}
                onClick={() => { if (isAdminUser && onOpenTask) onOpenTask(t.id); }}>
                {t.title}
              </div>
              <div style={{ fontSize: 12, color: "#64748B" }}>{dayLabel}</div>
              <div style={{ fontSize: 13, fontWeight: 500, color: "#111111", textAlign: "right" }}>{fmtMin(t.duration)}</div>
              {/* Beløb planlagt */}
              <div style={{ fontSize: 13, fontWeight: 500, color: "#64748B", textAlign: "right" }}>
                {(isFixedPrice || rate > 0) ? `${isFixedPrice ? "💰 " : ""}${plannedKr.toLocaleString("da-DK")} kr` : "—"}
              </div>
              <div style={{ textAlign: "right" }}>
                {isEditing ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 4, justifyContent: "flex-end" }}>
                    <input
                      type="number" min={0} step={5}
                      style={{ width: 60, padding: "3px 6px", borderRadius: 6, border: "1.5px solid #D6247A", fontSize: 13, textAlign: "right", color: "#111111" }}
                      value={editMinutes[t.id]}
                      onChange={(e) => setEditMinutes((prev) => ({ ...prev, [t.id]: e.target.value }))}
                      onKeyDown={(e) => { if (e.key === "Enter") saveMinutes(t, editMinutes[t.id]); if (e.key === "Escape") setEditMinutes((prev) => { const n = {...prev}; delete n[t.id]; return n; }); }}
                      autoFocus
                    />
                    <button style={{ ...styles.primaryBtn, fontSize: 11, padding: "3px 8px" }} onClick={() => saveMinutes(t, editMinutes[t.id])}>✓</button>
                  </div>
                ) : (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4, justifyContent: "flex-end" }}>
                    {overrunNotes.length > 0 && (
                      <span
                        style={{ fontSize: 12, cursor: "help" }}
                        title={`Begrundelse for overskredet tid:\n\n${overrunNotes.join("\n")}`}>
                        ⚠️
                      </span>
                    )}
                    <span
                      style={{ fontSize: 13, fontWeight: 700, color: logged === 0 ? "#94A3B8" : isLow ? "#D97706" : "#16A34A", cursor: "pointer", borderBottom: "1px dashed currentColor" }}
                      title="Klik for at justere timer"
                      onClick={() => setEditMinutes((prev) => ({ ...prev, [t.id]: String(logged) }))}>
                      {fmtMin(logged)}
                    </span>
                  </span>
                )}
              </div>
              {/* Beløb registreret */}
              <div style={{ fontSize: 13, fontWeight: 600, color: logged > 0 ? "#16A34A" : "#94A3B8", textAlign: "right" }}>
                {(isFixedPrice || rate > 0) && logged > 0 ? `${isFixedPrice ? "💰 " : ""}${registeredKr.toLocaleString("da-DK")} kr` : "—"}
              </div>
              {/* Difference */}
              <div style={{ fontSize: 13, fontWeight: 700, color: diffKr > 0 ? "#16A34A" : diffKr < 0 ? "#DC2626" : "#94A3B8", textAlign: "right" }}>
                {rate > 0 && logged > 0 ? `${diffKr > 0 ? "+" : ""}${diffKr.toLocaleString("da-DK")} kr` : "—"}
              </div>
              {/* Dinero-status – kun administrator må ændre denne, for at undgå dobbelt-eksport */}
              <div style={{ display: "flex", justifyContent: "center" }}>
                <span
                  style={{
                    width: 18, height: 18, borderRadius: 5,
                    border: t.dineroExported ? "2px solid #4F46E5" : "2px solid #CBD5E1",
                    background: t.dineroExported ? "#4F46E5" : "#fff",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    cursor: isAdminUser ? "pointer" : "not-allowed",
                    opacity: isAdminUser ? 1 : 0.5,
                  }}
                  title={
                    isAdminUser
                      ? (t.dineroExported ? "Fjern markering som sendt til Dinero" : "Markér som sendt til Dinero")
                      : "Kun administrator kan ændre denne markering"
                  }
                  onClick={() => { if (isAdminUser) onUpdateInstance(t.id, { dineroExported: !t.dineroExported }); }}>
                  {t.dineroExported && <Check size={11} color="#fff" strokeWidth={3} />}
                </span>
              </div>
              {/* Fakturagrundlag toggle */}
              <div style={{ display: "flex", justifyContent: "center" }}>
                <span
                  style={{ width: 18, height: 18, borderRadius: 5, border: t.invoiceReady ? "2px solid #16A34A" : "2px solid #CBD5E1", background: t.invoiceReady ? "#16A34A" : "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
                  title={t.invoiceReady ? "Fjern fra fakturagrundlag" : "Marker som fakturagrundlag"}
                  onClick={() => onUpdateInstance(t.id, { invoiceReady: !t.invoiceReady })}>
                  {t.invoiceReady && <Check size={11} color="#fff" strokeWidth={3} />}
                </span>
              </div>
            </div>
            {(taskNoter.length > 0 || t.nexusConfirmed === false) && (
              <div style={{ padding: "6px 14px 7px 34px", background: "#FCFCFD", borderBottom: "1px solid #F1F5F9", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                {t.nexusConfirmed === false && (
                  <span title="Medarbejderen afsluttede uden at kvittere i KMD Nexus. Kommunen betaler efter Nexus, så tjek det før du fakturerer."
                    style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 600, color: "#312E81", background: "#EEF2FF", border: "1px solid #C7D2FE", borderRadius: 999, padding: "3px 10px", cursor: "help" }}>
                    Ikke kvitteret i Nexus
                  </span>
                )}
                <OpgaveNoter noter={taskNoter} employees={employees} kompakt />
              </div>
            )}
            {taskProductLines.map((pl, plIdx) => (
              <div key={pl.id} style={{ display: "grid", gridTemplateColumns: "50px 140px 120px 160px 1fr 70px 80px 100px 100px 100px 90px 70px 28px", gap: 0, padding: "4px 14px", alignItems: "center", background: pl.dineroExported ? "#EEF2FF" : pl.invoiceReady ? "#FFFBEB" : "#F8F8F8", borderBottom: (idx < placed.length - 1 || plIdx < taskProductLines.length - 1) ? "1px solid #F1F5F9" : "none" }}>
                <div style={{ gridColumn: "5", display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: pl.invoiceReady ? "#92600A" : "#B0B0B0", textDecoration: pl.invoiceReady ? "none" : "line-through", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", paddingLeft: 20 }}>
                  📦 {pl.label}
                  {pl.dineroExported && <span style={{ textDecoration: "none", fontSize: 9, fontWeight: 700, color: "#4F46E5", background: "#E0E7FF", borderRadius: 4, padding: "1px 5px", flexShrink: 0 }}>Sendt til Dinero</span>}
                </div>
                {/* Kolonnenumrene skal foelge overskrifterne. Da beloebskolonnerne
                    flyttede ind mellem tiderne, rykkede "Registreret" fra 8 til 9 —
                    antallet ville ellers staa under "Planlagt kr.". */}
                <div style={{ gridColumn: "9", textAlign: "right", fontSize: 11, color: pl.invoiceReady ? "#B45309" : "#B0B0B0" }}>{pl.qty} {pl.unit}</div>
                <div style={{ gridColumn: "10", textAlign: "right", fontSize: 11, fontWeight: 600, color: pl.invoiceReady ? "#92600A" : "#B0B0B0" }}>{Math.round(pl.amount)} kr</div>
                <div style={{ gridColumn: "12", display: "flex", justifyContent: "center" }}>
                  {isAdminUser && (
                    <span
                      title={pl.dineroExported ? "Fjern markering: sendt til Dinero" : "Markér manuelt som sendt til Dinero"}
                      style={{ width: 18, height: 18, borderRadius: 5, border: pl.dineroExported ? "2px solid #4F46E5" : "2px solid #CBD5E1", background: pl.dineroExported ? "#4F46E5" : "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
                      onClick={() => onToggleProductDinero(pl.id, !pl.dineroExported)}>
                      {pl.dineroExported && <Check size={11} color="#fff" strokeWidth={3} />}
                    </span>
                  )}
                </div>
                <div style={{ gridColumn: "13", display: "flex", justifyContent: "center" }}>
                  <span
                    title={!t.invoiceReady
                      ? "Opgaven er ikke markeret som fakturagrundlag — produktet faktureres derfor ikke. Markér opgaven først."
                      : (pl.invoiceReady ? "Fjern produktlinjen fra fakturagrundlag" : "Medtag produktlinjen i fakturagrundlag")}
                    style={{ width: 18, height: 18, borderRadius: 5, border: pl.invoiceReady ? "2px solid #16A34A" : "2px solid #CBD5E1", background: pl.invoiceReady ? "#16A34A" : "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", opacity: t.invoiceReady ? 1 : 0.35 }}
                    onClick={() => onToggleProductInvoice(pl.id, !pl.invoiceReady)}>
                    {pl.invoiceReady && <Check size={11} color="#fff" strokeWidth={3} />}
                  </span>
                </div>
              </div>
            ))}
            </React.Fragment>
          );
        })}
        {placed.length === 0 && <div style={{ ...styles.emptyCol, padding: 40 }}>Ingen planlagte opgaver denne uge</div>}
      </div>

      {placed.length > 0 && (() => {
        const totalPlannedKr = placed.reduce((s, t) => {
          if (t.pricingType === "fixed") return s + Math.round(Number(t.fixedPrice) || 0);
          const rate = localPricing[t.contractType || "privat"] || 0;
          return s + Math.round((t.duration / 60) * rate);
        }, 0);
        const totalRegisteredKr = Math.round(expectedRevenue);
        const totalDiff = totalRegisteredKr - totalPlannedKr;
        return (
          <div style={{ display: "grid", gridTemplateColumns: "50px 140px 120px 160px 1fr 70px 80px 100px 100px 100px 90px 70px 28px", gap: 0, padding: "10px 14px", background: "#FCE4EF", borderRadius: 10, marginTop: 8, fontWeight: 700, fontSize: 13 }}>
            <span /><span style={{ color: "#9C1B5D" }}>I alt</span>
            <span /><span /><span /><span />
            <span style={{ textAlign: "right", color: "#111111" }}>{fmtMin(totalPlanned)}</span>
            <span style={{ textAlign: "right", color: "#D6247A" }}>{fmtMin(totalRegistered)}</span>
            <span style={{ textAlign: "right", color: "#64748B" }}>{totalPlannedKr.toLocaleString("da-DK")} kr</span>
            <span style={{ textAlign: "right", color: "#16A34A" }}>{totalRegisteredKr.toLocaleString("da-DK")} kr</span>
            <span style={{ textAlign: "right", color: totalDiff >= 0 ? "#16A34A" : "#DC2626" }}>{totalDiff > 0 ? "+" : ""}{totalDiff.toLocaleString("da-DK")} kr</span>
            <span />
            <span />
          </div>
        );
      })()}

      <div style={{ marginTop: 24, padding: 16, background: "#F8FAFC", borderRadius: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
          <strong>Kørsel (km) denne måned</strong>
          <button style={styles.secondaryBtn} onClick={computeKmForMonth} disabled={kmLoading}>
            {kmLoading ? "Beregner..." : "Beregn km"}
          </button>
        </div>
        {kmError && <div style={{ color: "#DC2626", fontSize: 13, marginBottom: 8 }}>{kmError}</div>}
        {kmData && (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", padding: 6 }}>Medarbejder</th>
                <th style={{ textAlign: "right", padding: 6 }}>Km i alt</th>
              </tr>
            </thead>
            <tbody>
              {employees.filter((e) => kmData[e.id] != null).map((e) => (
                <tr key={e.id}>
                  <td style={{ padding: 6 }}>{e.name}</td>
                  <td style={{ padding: 6, textAlign: "right" }}>{kmData[e.id].toFixed(1)} km</td>
                </tr>
              ))}
              {Object.keys(kmData).length === 0 && (
                <tr><td colSpan={2} style={{ padding: 6, color: "#94A3B8" }}>Ingen kørsel fundet - tjek at medarbejdere har hjemmeadresse udfyldt.</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function EmployeeExportView({ instances, employees }) {
  const now = new Date();
  const [filterMonth, setFilterMonth] = useState(now.getMonth());
  const [filterYear, setFilterYear] = useState(now.getFullYear());
  const [exportTab, setExportTab] = useState("hours");

  const MONTHS = ["Januar","Februar","Marts","April","Maj","Juni","Juli","August","September","Oktober","November","December"];
  const years = [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1];

  // En raekke pr. medarbejder pr. opgave - en opgave med flere medarbejdere
  // giver en linje for hver af dem, med deres egne registrerede minutter og
  // egen eventuel afvigelsesbegrundelse (samme mønster som overrunNotes i
  // TimeView, men opdelt pr. medarbejder i stedet for samlet pr. opgave).
  const rows = [];
  instances
    .filter((t) => !BLOCK_TYPES.includes(t.type))
    .filter((t) => (t.assignees || []).length > 0)
    .forEach((t) => {
      const { month, year } = instanceMonthYear(t, filterYear);
      if (month !== filterMonth || year !== filterYear) return;
      const tl = t.timeLog || t.time_log || [];
      (t.assignees || []).forEach((empId) => {
        const emp = employees.find((e) => e.id === empId);
        if (!emp) return;
        const myLogs = tl.filter((l) => l.empId === empId);
        const registered = myLogs.reduce((s, l) => s + (l.minutes || 0), 0);
        // Satsen tages fra medarbejderen, ikke fra en fast sats: to personer paa
        // samme opgave kan koste hver sit. Er satsen ikke laest ind (man er ikke
        // administrator), regnes der ikke — der vises en streg i stedet.
        const wage = emp.hourlyWage;
        const deviationText = myLogs
          .filter((l) => l.note && String(l.note).trim() && l.empId !== "planner")
          .map((l) => l.note.trim())
          .join(" / ");
        rows.push({
          empName: emp.name,
          week: t.week,
          day: t.day,
          dayLabel: ALL_DAYS.find((d) => d.key === t.day)?.label || t.day || "—",
          isWeekend: isWeekendDay(t.day),
          title: t.title,
          planned: t.duration,
          registered,
          hourlyWage: wage,
          plannedWage: wage == null ? null : (t.duration / 60) * wage,
          registeredWage: wage == null ? null : (registered / 60) * wage,
          deviationText,
        });
      });
    });

  rows.sort((a, b) => {
    if (a.empName !== b.empName) return a.empName.localeCompare(b.empName, "da");
    if (a.week !== b.week) return a.week - b.week;
    const aDay = a.day ? ALL_DAYS.findIndex((d) => d.key === a.day) : 99;
    const bDay = b.day ? ALL_DAYS.findIndex((d) => d.key === b.day) : 99;
    if (aDay !== bDay) return aDay - bDay;
    return (a.title || "").localeCompare(b.title || "", "da");
  });

  const totalPlanned = rows.reduce((s, r) => s + r.planned, 0);
  const totalRegistered = rows.reduce((s, r) => s + r.registered, 0);
  // Weekendtimer opgoeres saerskilt, fordi de udloeser tillaeg.
  const totalWeekend = rows.reduce((s, r) => s + (r.isWeekend ? r.registered : 0), 0);

  // Loensummerne. Kun tilgaengelige for administratorer — for alle andre er
  // hourlyWage null hele vejen igennem, og saa vises summerne slet ikke.
  const harLoen = rows.some((r) => r.hourlyWage != null);
  const totalPlannedWage = rows.reduce((s, r) => s + (r.plannedWage || 0), 0);
  const totalRegisteredWage = rows.reduce((s, r) => s + (r.registeredWage || 0), 0);
  const kr = (v) => Math.round(v).toLocaleString("da-DK") + " kr";
  // Ét sted for kolonnebredderne. Overskriften og raekkerne er to selvstaendige
  // gitre, saa hvis de ikke faar praecis samme definition, staar tallene forskudt
  // for deres egen overskrift — og det opdager man foerst naar nogen brokker sig.
  const kolonner = harLoen
    ? "150px 50px 80px 1fr 90px 105px 95px 115px 1fr"
    : "160px 60px 90px 1fr 100px 100px 1fr";

  function exportRowsCSV() {
    // Loenkolonnerne kommer kun med naar satserne faktisk kunne laeses. Ellers ville
    // filen have tomme loenkolonner, og nogen ville tro at loennen var nul.
    // Samme parvise raekkefoelge som paa skaermen: timeloen, saa planlagt tid og
    // planlagt loen, saa registreret tid og registreret loen.
    const header = ["Medarbejder", "Uge", "Dag", "Opgave",
      ...(harLoen ? ["Timeløn"] : []),
      "Planlagt (min)", "Planlagt (timer)", ...(harLoen ? ["Planlagt løn"] : []),
      "Registreret (min)", "Registreret (timer)", ...(harLoen ? ["Registreret løn"] : []),
      "Weekend", "Weekendtimer", "Afvigelse"];
    const data = rows.map((r) => [
      r.empName, `Uge ${r.week}`, r.dayLabel, r.title,
      ...(harLoen ? [r.hourlyWage ?? ""] : []),
      r.planned, (r.planned / 60).toFixed(2),
      ...(harLoen ? [r.plannedWage == null ? "" : r.plannedWage.toFixed(2)] : []),
      r.registered, (r.registered / 60).toFixed(2),
      ...(harLoen ? [r.registeredWage == null ? "" : r.registeredWage.toFixed(2)] : []),
      r.isWeekend ? "Ja" : "", r.isWeekend ? (r.registered / 60).toFixed(2) : "",
      r.deviationText || "",
    ]);
    // Sumlinje nederst, saa den der modtager filen ikke skal regne selv.
    if (rows.length > 0) {
      data.push(["I alt", "", "", "",
        ...(harLoen ? [""] : []),
        totalPlanned, (totalPlanned / 60).toFixed(2),
        ...(harLoen ? [totalPlannedWage.toFixed(2)] : []),
        totalRegistered, (totalRegistered / 60).toFixed(2),
        ...(harLoen ? [totalRegisteredWage.toFixed(2)] : []),
        "", (totalWeekend / 60).toFixed(2), ""]);
    }
    const csv = [header, ...data].map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `medarbejder-eksport-${MONTHS[filterMonth]}-${filterYear}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div style={styles.page}>
      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        <button onClick={() => setExportTab("hours")} style={{ padding: "8px 16px", borderRadius: 8, border: "none", fontWeight: 600, fontSize: 13, cursor: "pointer", background: exportTab === "hours" ? "#111111" : "#E5E7EB", color: exportTab === "hours" ? "#fff" : "#374151" }}>Timeopgørelse</button>
        <button onClick={() => setExportTab("km")} style={{ padding: "8px 16px", borderRadius: 8, border: "none", fontWeight: 600, fontSize: 13, cursor: "pointer", background: exportTab === "km" ? "#111111" : "#E5E7EB", color: exportTab === "km" ? "#fff" : "#374151" }}>KM-opgørelse</button>
      </div>
      {exportTab === "km" ? (
        <KmExportSection employees={employees} filterMonth={filterMonth} filterYear={filterYear} setFilterMonth={setFilterMonth} setFilterYear={setFilterYear} years={years} MONTHS={MONTHS} />
      ) : (
      <>
      <div style={styles.toolbar}>
        <div style={{ ...styles.statBlock, borderLeft: "3px solid #64748B" }}>
          <div><div style={{ ...styles.statValue, color: "#64748B" }}>{fmtMin(totalPlanned)}</div><div style={styles.statLabel}>Planlagt i alt</div></div>
        </div>
        <div style={{ ...styles.statBlock, borderLeft: "3px solid #16A34A" }}>
          <div><div style={{ ...styles.statValue, color: "#16A34A" }}>{fmtMin(totalRegistered)}</div><div style={styles.statLabel}>Registreret i alt</div></div>
          <div style={styles.statBox}><div style={{ ...styles.statValue, color: "#B45309" }}>{fmtMin(totalWeekend)}</div><div style={styles.statLabel}>Heraf weekend (tillæg)</div></div>
        </div>
        {harLoen && (
          <div style={{ ...styles.statBlock, borderLeft: "3px solid #4F46E5" }}>
            <div><div style={{ ...styles.statValue, color: "#64748B" }}>{kr(totalPlannedWage)}</div><div style={styles.statLabel}>Planlagt lønsum</div></div>
            <div style={styles.statBox}><div style={{ ...styles.statValue, color: "#4F46E5" }}>{kr(totalRegisteredWage)}</div><div style={styles.statLabel}>Registreret lønsum</div></div>
          </div>
        )}
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <select style={{ ...styles.inputSm, fontSize: 13, fontWeight: 600 }} value={filterMonth} onChange={(e) => setFilterMonth(Number(e.target.value))}>
            {MONTHS.map((m, i) => <option key={i} value={i}>{m}</option>)}
          </select>
          <select style={{ ...styles.inputSm, fontSize: 13, fontWeight: 600 }} value={filterYear} onChange={(e) => setFilterYear(Number(e.target.value))}>
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <div style={styles.toolbarSpacer} />
        <button style={styles.primaryBtn} onClick={exportRowsCSV}><Download size={16} /> Eksporter CSV</button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: kolonner, gap: 0, background: "#F8FAFC", borderRadius: "10px 10px 0 0", padding: "8px 14px", fontSize: 10, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.04em" }}>
        <span>Medarbejder</span><span>Uge</span><span>Dag</span><span>Opgave</span>
        {/* Timer og kroner staar parvis: planlagt tid ved siden af planlagt loen,
            registreret tid ved siden af registreret loen. Med alle fire tal i
            raekkefoelgen tid-tid-kr-kr skulle oejet hoppe frem og tilbage for at
            sammenholde det der hoerer sammen. */}
        <span style={{ textAlign: "right" }}>Planlagt</span>
        {harLoen && <span style={{ textAlign: "right" }}>Planlagt løn</span>}
        <span style={{ textAlign: "right" }}>Registreret</span>
        {harLoen && <span style={{ textAlign: "right" }}>Registreret løn</span>}
        <span>Afvigelse</span>
      </div>
      <div style={{ background: "#fff", borderRadius: "0 0 10px 10px", boxShadow: "0 1px 3px rgba(0,0,0,0.06)", overflow: "hidden" }}>
        {rows.map((r, idx) => (
          <div key={idx} style={{ display: "grid", gridTemplateColumns: kolonner, gap: 0, padding: "10px 14px", borderBottom: idx < rows.length - 1 ? "1px solid #F1F5F9" : "none", alignItems: "center" }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "#111111" }}>{r.empName}</span>
            <span style={{ fontSize: 12, color: "#94A3B8" }}>{r.week}</span>
            <span style={{ fontSize: 12, color: "#64748B" }}>{r.dayLabel}</span>
            <span style={{ fontSize: 13, color: "#111111", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.title}</span>
            <span style={{ fontSize: 13, fontWeight: 500, color: "#111111", textAlign: "right" }}>{fmtMin(r.planned)}</span>
            {harLoen && (
              <span style={{ fontSize: 13, color: "#64748B", textAlign: "right" }} title={r.hourlyWage != null ? `${r.hourlyWage} kr/time` : ""}>
                {r.plannedWage == null ? "—" : kr(r.plannedWage)}
              </span>
            )}
            <span style={{ fontSize: 13, fontWeight: 700, color: r.registered === 0 ? "#94A3B8" : "#16A34A", textAlign: "right" }}>{fmtMin(r.registered)}</span>
            {harLoen && (
              <span style={{ fontSize: 13, fontWeight: 600, color: r.registered === 0 ? "#94A3B8" : "#4F46E5", textAlign: "right" }}>
                {r.registeredWage == null ? "—" : kr(r.registeredWage)}
              </span>
            )}
            <span style={{ fontSize: 12, color: r.deviationText ? "#D97706" : "#CBD5E1" }}>{r.deviationText || "—"}</span>
          </div>
        ))}
        {rows.length === 0 && <div style={{ ...styles.emptyCol, padding: 40 }}>Ingen registreringer for denne maaned</div>}
      </div>
      </>
      )}
    </div>
  );
}

function KmExportSection({ employees, filterMonth, filterYear, setFilterMonth, setFilterYear, years, MONTHS }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [recomputing, setRecomputing] = useState(false);
  const [recomputeProgress, setRecomputeProgress] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      const startDate = `${filterYear}-${String(filterMonth + 1).padStart(2, "0")}-01`;
      const endMonth = filterMonth === 11 ? 0 : filterMonth + 1;
      const endYear = filterMonth === 11 ? filterYear + 1 : filterYear;
      const endDate = `${endYear}-${String(endMonth + 1).padStart(2, "0")}-01`;
      const { data, error } = await supabase
        .from("km_log")
        .select("employee_id, work_date, leg_order, from_address, to_address, km, minutes")
        .gte("work_date", startDate)
        .lt("work_date", endDate)
        .order("employee_id", { ascending: true })
        .order("work_date", { ascending: true })
        .order("leg_order", { ascending: true });
      if (cancelled) return;
      if (error) { setError("Kunne ikke hente km-data: " + error.message); setLoading(false); return; }
      setRows(data || []);
      setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [filterMonth, filterYear, refreshKey]);

  const empName = (id) => (employees.find((e) => e.id === id) || {}).name || id;

  const totalsByEmp = {};
  rows.forEach((r) => {
    totalsByEmp[r.employee_id] = (totalsByEmp[r.employee_id] || 0) + (Number(r.km) || 0);
  });
  const grandTotal = Object.values(totalsByEmp).reduce((s, v) => s + v, 0);

  async function recomputeMonth() {
    const monthLabel = `${MONTHS[filterMonth]} ${filterYear}`;
    if (!window.confirm(`Genberegn km for alle dage i ${monthLabel}? Dette genberegner ogsaa dage med fejlede adresser/urealistisk lange ruter. Kan tage et minut.`)) return;
    setRecomputing(true);
    const numDays = new Date(filterYear, filterMonth + 1, 0).getDate();
    const todayStr = new Date().toISOString().slice(0, 10);
    const dates = [];
    for (let d = 1; d <= numDays; d++) {
      const dateStr = `${filterYear}-${String(filterMonth + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      if (dateStr >= todayStr) break;
      dates.push(dateStr);
    }
    setRecomputeProgress({ done: 0, total: dates.length, legs: 0, failed: 0 });
    let totalLegs = 0;
    let failedDays = 0;
    for (const dateStr of dates) {
      try {
        const { data, error: fnError } = await supabase.functions.invoke("compute-daily-km", { body: { date: dateStr } });
        if (fnError) {
          failedDays++;
        } else if (data && typeof data.legs === "number") {
          totalLegs += data.legs;
        }
      } catch (e) {
        failedDays++;
      }
      setRecomputeProgress((p) => ({ ...(p || {}), done: (p ? p.done : 0) + 1, total: dates.length, legs: totalLegs, failed: failedDays }));
    }
    setRecomputing(false);
    setRefreshKey((k) => k + 1);
    window.alert(`Faerdig!\n${dates.length} dage behandlet\n${totalLegs} koersler beregnet${failedDays ? `\n${failedDays} dage fejlede (proev igen)` : ""}`);
  }

  function exportCSV() {
    const header = ["Medarbejder", "Dato", "Fra", "Til", "Km", "Minutter"];
    const data = rows.map((r) => [empName(r.employee_id), r.work_date, r.from_address, r.to_address, r.km ?? "", r.minutes ?? ""]);
    const csv = [header, ...data].map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `km-opgorelse-${MONTHS[filterMonth]}-${filterYear}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <div style={styles.toolbar}>
        <div style={{ ...styles.statBlock, borderLeft: "3px solid #4F46E5" }}>
          <div><div style={{ ...styles.statValue, color: "#4F46E5" }}>{grandTotal.toFixed(1)} km</div><div style={styles.statLabel}>Kørsel i alt</div></div>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <select style={{ ...styles.inputSm, fontSize: 13, fontWeight: 600 }} value={filterMonth} onChange={(e) => setFilterMonth(Number(e.target.value))}>
            {MONTHS.map((m, i) => <option key={i} value={i}>{m}</option>)}
          </select>
          <select style={{ ...styles.inputSm, fontSize: 13, fontWeight: 600 }} value={filterYear} onChange={(e) => setFilterYear(Number(e.target.value))}>
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <div style={styles.toolbarSpacer} />
        <button style={{ ...styles.secondaryBtn, opacity: recomputing ? 0.7 : 1 }} onClick={recomputeMonth} disabled={recomputing} title="Genberegn km for alle dage i den valgte maaned - retter ogsaa adresser der tidligere fejlede eller fik urealistisk lang rute">
          <Repeat size={16} /> {recomputing ? `Genberegner (${recomputeProgress ? recomputeProgress.done : 0}/${recomputeProgress ? recomputeProgress.total : 0})` : "Genberegn måned"}
        </button>
        <button style={styles.primaryBtn} onClick={exportCSV}><Download size={16} /> Eksporter CSV</button>
      </div>

      {loading && <div style={{ padding: 30, textAlign: "center", color: "#64748B" }}>Indlæser...</div>}
      {error && <div style={{ padding: 30, textAlign: "center", color: "#DC2626" }}>{error}</div>}

      {!loading && !error && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "160px 100px 1fr 1fr 80px 80px", gap: 0, background: "#F8FAFC", borderRadius: "10px 10px 0 0", padding: "8px 14px", fontSize: 10, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.04em" }}>
            <span>Medarbejder</span><span>Dato</span><span>Fra</span><span>Til</span>
            <span style={{ textAlign: "right" }}>Km</span>
            <span style={{ textAlign: "right" }}>Min</span>
          </div>
          <div style={{ background: "#fff", borderRadius: "0 0 10px 10px", boxShadow: "0 1px 3px rgba(0,0,0,0.06)", overflow: "hidden" }}>
            {rows.map((r, idx) => (
              <div key={r.employee_id + r.work_date + r.leg_order} style={{ display: "grid", gridTemplateColumns: "160px 100px 1fr 1fr 80px 80px", gap: 0, padding: "10px 14px", borderBottom: idx < rows.length - 1 ? "1px solid #F1F5F9" : "none", alignItems: "center" }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: "#111111" }}>{empName(r.employee_id)}</span>
                <span style={{ fontSize: 12, color: "#64748B" }}>{r.work_date}</span>
                <span style={{ fontSize: 12, color: "#374151", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.from_address}</span>
                <span style={{ fontSize: 12, color: "#374151", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.to_address}</span>
                <span style={{ fontSize: 13, textAlign: "right" }}>{r.km != null ? Number(r.km).toFixed(1) : "—"}</span>
                <span style={{ fontSize: 12, color: "#94A3B8", textAlign: "right" }}>{r.minutes ?? "—"}</span>
              </div>
            ))}
            {rows.length === 0 && <div style={{ ...styles.emptyCol, padding: 40 }}>Ingen kørsel registreret for denne måned</div>}
          </div>
        </>
      )}
    </div>
  );
}

// ── Reports View (Rapportering: budget vs. omsætning pr. område) ──────────────
const REPORT_AREAS = CONTRACT_TYPES.map((c) => [c.key, c.icon + " " + c.label]);
const REPORT_MONTHS = ["Januar","Februar","Marts","April","Maj","Juni","Juli","August","September","Oktober","November","December"];

const REPORT_AREA_COLORS = { ...Object.fromEntries(CONTRACT_TYPES.map((c) => [c.key, c.chart])), alle: "#334155" };
const REPORT_TABS = [...REPORT_AREAS, ["alle", "🌐 Alle"]];

function ReportsView({ instances, pricing, budgets, onSaveBudget, isAdminUser }) {
  const now = new Date();
  const [selectedArea, setSelectedArea] = useState("privat");
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [draftAmounts, setDraftAmounts] = useState({});
  const [editingBudgets, setEditingBudgets] = useState(false);
  const years = [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1];

  useEffect(() => { setDraftAmounts({}); setEditingBudgets(false); }, [selectedArea, selectedYear]);

  function budgetFor(month) {
    if (draftAmounts[month] !== undefined) return draftAmounts[month];
    const row = budgets.find((b) => b.contract_type === selectedArea && Number(b.year) === selectedYear && Number(b.month) === month);
    return row ? row.amount : "";
  }

  function commitBudget(month, value) {
    setDraftAmounts((prev) => ({ ...prev, [month]: value }));
    if (isAdminUser) onSaveBudget(selectedArea, selectedYear, month, value);
  }

  const isAllAreas = selectedArea === "alle";

  const monthRows = useMemo(() => {
    const areasToSum = isAllAreas ? REPORT_AREAS.map(([k]) => k) : [selectedArea];
    return REPORT_MONTHS.map((label, idx) => {
      const month = idx + 1;
      let plannedKr = 0;
      let registeredKr = 0;
      let budgetKr = 0;
      areasToSum.forEach((area) => {
        const rate = pricing[area] || 0;
        // Filtrér på opgavens faktiske dato, ikke blot ugenummeret - så en uge
        // der strækker sig over et månedsskift altid tælles i den rigtige måned.
        const tasksInMonth = instances.filter((t) => {
          if (BLOCK_TYPES.includes(t.type) || t.type === "aktivitet") return false;
          if (!(t.assignees && t.assignees.length)) return false;
          if ((t.contractType || "privat") !== area) return false;
          const my = instanceMonthYear(t, selectedYear);
          return my.month === idx && my.year === selectedYear;
        });
        plannedKr += tasksInMonth.reduce((s, t) => s + (t.pricingType === "fixed" ? (Number(t.fixedPrice) || 0) : (t.duration / 60) * rate), 0);
        registeredKr += tasksInMonth.reduce((s, t) => {
          if (t.pricingType === "fixed") {
            const hasLog = (t.timeLog || t.time_log || []).length > 0 || t.status === "udført";
            return s + (hasLog ? (Number(t.fixedPrice) || 0) : 0);
          }
          const logged = (t.timeLog || t.time_log || []).reduce((s2, l) => s2 + (l.minutes || 0), 0);
          return s + (logged / 60) * rate;
        }, 0);
        if (isAllAreas) {
          const row = budgets.find((b) => b.contract_type === area && Number(b.year) === selectedYear && Number(b.month) === month);
          budgetKr += row ? Number(row.amount) || 0 : 0;
        }
      });
      const budgetRaw = isAllAreas ? budgetKr : budgetFor(month);
      if (!isAllAreas) budgetKr = Number(budgetRaw) || 0;
      const diffKr = registeredKr - budgetKr;
      const diffPlannedKr = plannedKr - budgetKr;
      const pct = budgetKr > 0 ? Math.round((registeredKr / budgetKr) * 100) : null;
      const isPast = selectedYear < now.getFullYear() || (selectedYear === now.getFullYear() && month < now.getMonth() + 1);
      const actualOrForecastKr = isPast ? registeredKr : plannedKr;
      const actualOrForecastLabel = isPast ? "Realiseret" : "Forecast";
      return { month, label, budgetRaw, budgetKr, plannedKr, registeredKr, diffKr, diffPlannedKr, pct, isPast, actualOrForecastKr, actualOrForecastLabel };
    });
  }, [instances, pricing, selectedArea, selectedYear, budgets, draftAmounts, isAllAreas]);

  const yearTotals = monthRows.reduce(
    (acc, r) => ({
      budget: acc.budget + r.budgetKr,
      planned: acc.planned + r.plannedKr,
      registered: acc.registered + r.registeredKr,
    }),
    { budget: 0, planned: 0, registered: 0 }
  );
  const yearDiff = yearTotals.registered - yearTotals.budget;
  const areaColor = REPORT_AREA_COLORS[selectedArea] || "#D6247A";
  const chartMax = Math.max(1, ...monthRows.map((r) => Math.max(r.budgetKr, r.actualOrForecastKr)));
  const CHART_H = 160;

  return (
    <div style={styles.page}>
      <div style={styles.toolbar}>
        <div style={styles.statBlock}>
          <div><div style={{ ...styles.statValue, color: "#64748B" }}>{Math.round(yearTotals.budget).toLocaleString("da-DK")} kr.</div><div style={styles.statLabel}>Budget {selectedYear}</div></div>
        </div>
        <div style={styles.statBlock}>
          <div><div style={{ ...styles.statValue, color: "#64748B" }}>{Math.round(yearTotals.planned).toLocaleString("da-DK")} kr.</div><div style={styles.statLabel}>Planlagt omsætning</div></div>
        </div>
        <div style={styles.statBlock}>
          <div><div style={{ ...styles.statValue, color: "#16A34A" }}>{Math.round(yearTotals.registered).toLocaleString("da-DK")} kr.</div><div style={styles.statLabel}>Registreret omsætning</div></div>
        </div>
        <div style={{ ...styles.statBlock, borderLeft: `3px solid ${yearDiff >= 0 ? "#16A34A" : "#DC2626"}` }}>
          <div><div style={{ ...styles.statValue, color: yearDiff >= 0 ? "#16A34A" : "#DC2626" }}>{yearDiff > 0 ? "+" : ""}{Math.round(yearDiff).toLocaleString("da-DK")} kr.</div><div style={styles.statLabel}>Difference vs. budget</div></div>
        </div>
        <div style={styles.toolbarSpacer} />
        <select style={{ ...styles.inputSm, fontSize: 13, fontWeight: 600, flex: "none", width: 100 }} value={selectedYear} onChange={(e) => setSelectedYear(Number(e.target.value))}>
          {years.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 14, alignItems: "center" }}>
        {REPORT_TABS.map(([key, label]) => (
          <button
            key={key}
            onClick={() => setSelectedArea(key)}
            style={selectedArea === key
              ? { ...styles.secondaryBtn, background: "#FCE4EF", color: "#9C1B5D", borderColor: "#D6247A", fontWeight: 700 }
              : styles.secondaryBtn}
          >
            {label}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        {isAdminUser && !isAllAreas && (
          <button
            style={editingBudgets ? { ...styles.primaryBtn } : styles.secondaryBtn}
            onClick={() => setEditingBudgets((v) => !v)}
          >
            {editingBudgets ? "✅ Færdig med redigering" : "✏️ Rediger budget"}
          </button>
        )}
      </div>

      {isAllAreas && (
        <div style={{ fontSize: 12.5, color: "#94A3B8", marginBottom: 10 }}>
          Samlet oversigt for alle områder. Budget redigeres under det enkelte område (Privat, Nexus, Ældrelov).
        </div>
      )}
      {!isAllAreas && !isAdminUser && (
        <div style={{ fontSize: 12.5, color: "#94A3B8", marginBottom: 10 }}>
          Kun administrator kan oprette og redigere budgettal. Du kan se rapporten.
        </div>
      )}

      {/* Søjlediagram: budget vs. realiseret/forecast pr. måned */}
      <div style={{ background: "#fff", borderRadius: 12, padding: "18px 16px 12px", marginBottom: 16, boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 14 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: "#111111" }}>Budget vs. omsætning — {REPORT_TABS.find(([k]) => k === selectedArea)?.[1]}</div>
          <div style={{ flex: 1 }} />
          <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11.5, color: "#64748B" }}>
            <span style={{ width: 12, height: 12, borderRadius: 3, background: "#CBD5E1", display: "inline-block" }} /> Budget
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11.5, color: "#64748B" }}>
            <span style={{ width: 12, height: 12, borderRadius: 3, background: areaColor, display: "inline-block" }} /> Realiseret
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11.5, color: "#64748B" }}>
            <span style={{ width: 12, height: 12, borderRadius: 3, background: areaColor, opacity: 0.4, border: `1px dashed ${areaColor}`, display: "inline-block" }} /> Forecast
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 10, height: CHART_H + 10, overflowX: "auto", paddingBottom: 4 }}>
          {monthRows.map((r) => {
            const budgetPx = Math.round((r.budgetKr / chartMax) * CHART_H);
            const actualPx = Math.round((r.actualOrForecastKr / chartMax) * CHART_H);
            return (
              <div key={r.month} style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: "1 0 46px", minWidth: 46 }}>
                <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: CHART_H }}>
                  <div title={`Budget: ${Math.round(r.budgetKr).toLocaleString("da-DK")} kr`} style={{ width: 14, height: Math.max(2, budgetPx), background: "#CBD5E1", borderRadius: "3px 3px 0 0" }} />
                  <div
                    title={`${r.actualOrForecastLabel}: ${Math.round(r.actualOrForecastKr).toLocaleString("da-DK")} kr`}
                    style={{
                      width: 14, height: Math.max(2, actualPx),
                      background: r.isPast ? areaColor : `${areaColor}66`,
                      border: r.isPast ? "none" : `1px dashed ${areaColor}`,
                      borderRadius: "3px 3px 0 0",
                    }}
                  />
                </div>
                <div style={{ fontSize: 10.5, fontWeight: 600, marginTop: 6, color: "#475569" }}>{r.label.slice(0, 3)}</div>
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 110px 110px 110px 110px 110px 80px", gap: 0, background: "#F8FAFC", borderRadius: "10px 10px 0 0", padding: "8px 14px", fontSize: 10, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.04em" }}>
        <span>Måned</span>
        <span style={{ textAlign: "right" }}>Budget</span>
        <span style={{ textAlign: "right" }}>Planlagt</span>
        <span style={{ textAlign: "right" }}>Diff. budget/planlagt</span>
        <span style={{ textAlign: "right" }}>Registreret</span>
        <span style={{ textAlign: "right" }}>Diff. vs. budget</span>
        <span style={{ textAlign: "right" }}>% opnået</span>
      </div>
      <div style={{ background: "#fff", borderRadius: "0 0 10px 10px", boxShadow: "0 1px 3px rgba(0,0,0,0.06)", overflow: "hidden" }}>
        {monthRows.map((r, idx) => (
          <div key={r.month} style={{ display: "grid", gridTemplateColumns: "1fr 110px 110px 110px 110px 110px 80px", gap: 0, padding: "9px 14px", borderBottom: idx < monthRows.length - 1 ? "1px solid #F1F5F9" : "none", alignItems: "center" }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#111111" }}>{r.label}</div>
            <div style={{ textAlign: "right" }}>
              {editingBudgets && isAdminUser && !isAllAreas ? (
                <input
                  type="number" min={0} step={1000}
                  style={{ ...styles.inputSm, width: 100, textAlign: "right", marginLeft: "auto" }}
                  value={r.budgetRaw}
                  placeholder="0"
                  autoFocus={idx === 0}
                  onChange={(e) => setDraftAmounts((prev) => ({ ...prev, [r.month]: e.target.value }))}
                  onBlur={(e) => commitBudget(r.month, e.target.value)}
                />
              ) : (
                <span style={{ fontSize: 13, fontWeight: 600, color: r.budgetKr > 0 ? "#334155" : "#94A3B8" }}>
                  {r.budgetKr > 0 ? `${Math.round(r.budgetKr).toLocaleString("da-DK")} kr` : "—"}
                </span>
              )}
            </div>
            <div style={{ fontSize: 13, color: "#64748B", textAlign: "right" }}>{Math.round(r.plannedKr).toLocaleString("da-DK")} kr</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: r.budgetKr === 0 ? "#94A3B8" : r.diffPlannedKr >= 0 ? "#16A34A" : "#DC2626", textAlign: "right" }}>
              {r.budgetKr === 0 ? "—" : `${r.diffPlannedKr > 0 ? "+" : ""}${Math.round(r.diffPlannedKr).toLocaleString("da-DK")} kr`}
            </div>
            <div style={{ fontSize: 13, fontWeight: 600, color: r.registeredKr > 0 ? "#16A34A" : "#94A3B8", textAlign: "right" }}>{r.registeredKr > 0 ? `${Math.round(r.registeredKr).toLocaleString("da-DK")} kr` : "—"}</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: r.budgetKr === 0 ? "#94A3B8" : r.diffKr >= 0 ? "#16A34A" : "#DC2626", textAlign: "right" }}>
              {r.budgetKr === 0 ? "—" : `${r.diffKr > 0 ? "+" : ""}${Math.round(r.diffKr).toLocaleString("da-DK")} kr`}
            </div>
            <div style={{ fontSize: 13, fontWeight: 600, color: r.pct === null ? "#94A3B8" : r.pct >= 100 ? "#16A34A" : r.pct >= 70 ? "#D97706" : "#DC2626", textAlign: "right" }}>
              {r.pct === null ? "—" : `${r.pct}%`}
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 110px 110px 110px 110px 110px 80px", gap: 0, padding: "10px 14px", background: "#FCE4EF", borderRadius: 10, marginTop: 8, fontWeight: 700, fontSize: 13 }}>
        <span style={{ color: "#9C1B5D" }}>I alt {selectedYear}</span>
        <span style={{ textAlign: "right", color: "#111111" }}>{Math.round(yearTotals.budget).toLocaleString("da-DK")} kr</span>
        <span style={{ textAlign: "right", color: "#64748B" }}>{Math.round(yearTotals.planned).toLocaleString("da-DK")} kr</span>
        <span style={{ textAlign: "right", color: (yearTotals.planned - yearTotals.budget) >= 0 ? "#16A34A" : "#DC2626" }}>{(yearTotals.planned - yearTotals.budget) > 0 ? "+" : ""}{Math.round(yearTotals.planned - yearTotals.budget).toLocaleString("da-DK")} kr</span>
        <span style={{ textAlign: "right", color: "#16A34A" }}>{Math.round(yearTotals.registered).toLocaleString("da-DK")} kr</span>
        <span style={{ textAlign: "right", color: yearDiff >= 0 ? "#16A34A" : "#DC2626" }}>{yearDiff > 0 ? "+" : ""}{Math.round(yearDiff).toLocaleString("da-DK")} kr</span>
        <span />
      </div>
    </div>
  );
}

// ---------- Modals ----------
function TaskModal({ onClose, onSave, checklistTemplates, skills, copyFrom, employees, editId }) {
  // Kopiering af en ældre "flexible"-type opgave (nu nedlagt) skal falde
  // tilbage til "adhoc" ("Fleksibel"), da den type ikke længere findes i
  // CREATABLE_TYPES og derfor ikke kan vælges via knapperne nedenfor. En helt
  // ny opgave (uden copyFrom) starter stadig som "fixed" som hidtil.
  const [type, setType] = useState(() => {
    if (!copyFrom) return "fixed";
    return CREATABLE_TYPES.includes(copyFrom.type) ? copyFrom.type : "adhoc";
  });
  const [contractType, setContractType] = useState(copyFrom?.contractType || "privat");
  const [pricingType, setPricingType] = useState(copyFrom?.pricingType || "hourly");
  const [fixedPrice, setFixedPrice] = useState(copyFrom?.fixedPrice ?? "");
  const [planInterval, setPlanInterval] = useState(copyFrom?.planInterval || "uge");
  const [title, setTitle] = useState(copyFrom ? (editId ? copyFrom.title : `Kopi af ${copyFrom.title}`) : "");
  const [duration, setDuration] = useState(copyFrom?.duration || 60);
  const [requiredSkills, setRequiredSkills] = useState(copyFrom?.requiredSkills || [{ skill: skills[0] ?? "", minLevel: 1 }]);
  const [days, setDays] = useState(copyFrom?.templateDays || copyFrom?.days || ["Mon"]);
  const [dayTimes, setDayTimes] = useState(copyFrom?.dayTimes || {});
  const [dayDurations, setDayDurations] = useState(copyFrom?.dayDurations || {});
  const [preferredTime, setPreferredTime] = useState(copyFrom?.preferredTime || "");
  const [day, setDay] = useState("Mon");
  const [adhocDate, setAdhocDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [deadline, setDeadline] = useState("Fri");
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [expiryDate, setExpiryDate] = useState(() => {
    const d = new Date(); d.setFullYear(d.getFullYear() + 1);
    return d.toISOString().slice(0, 10);
  });
  // En kopi skal have præcis samme indhold som originalen: de samme tjekliste-
  // skabeloner, og de samme ekstra punkter. Tidligere blev hele tjeklisten fladet
  // ud til løse punkter, saa skabelonerne blev koblet fra og punkterne laa dobbelt.
  const [checklistTemplateIds, setChecklistTemplateIds] = useState(copyFrom?.checklistTemplateIds || []);
  const [extraItems, setExtraItems] = useState(
    (copyFrom?.extraItems && copyFrom.extraItems.length)
      ? copyFrom.extraItems.map((i) => (typeof i === "string" ? i : i.text)).filter(Boolean)
      : (copyFrom && !(copyFrom.checklistTemplateIds || []).length
          ? (copyFrom.checklist || []).map((i) => i.text || i).filter(Boolean)
          : [])
  );
  const [newItemText, setNewItemText] = useState("");
  const [videoUrl, setVideoUrl] = useState(copyFrom?.videoUrl || "");
  const [customerName, setCustomerName] = useState(copyFrom?.customerName || "");
  const [dineroResults, setDineroResults] = useState([]);
  const [dineroSearching, setDineroSearching] = useState(false);
  const [showDineroCreate, setShowDineroCreate] = useState(false);
  // Sand når kunden er en kendt/valgt kunde (fra Dinero-søgning eller kopieret fra en
  // eksisterende opgave) — forhindrer at "Opret i Dinero"-knappen dukker op lige
  // efter man har valgt en eksisterende kunde fra søgeresultaterne.
  const [customerSelected, setCustomerSelected] = useState(!!copyFrom?.customerName);
  // Sand når kunden vides at være en rigtig Dinero-kontakt (valgt fra søgeresultater
  // eller netop oprettet der) — bruges til at undlade at foreslå "Send til Dinero"
  // for en kunde der allerede findes derinde.
  const [customerDineroSynced, setCustomerDineroSynced] = useState(!!copyFrom?.dineroSynced);
  // Kundens unikke id i Dinero — saettes naar kunden vaelges i soegningen.
  const [dineroContactGuid, setDineroContactGuid] = useState(copyFrom?.dineroContactGuid || "");
  // En kopieret opgave henter medarbejderen fra den opgave der kopieres
  // (assignees), eller fra aftalens faste medarbejder hvis kopien kommer derfra.
  const [assignedEmployeeId, setAssignedEmployeeId] = useState(
    copyFrom?.assigned_employee_id
    || (copyFrom?.assignees && copyFrom.assignees[0])
    || copyFrom?.preferredEmployeeId
    || ""
  );

  const [dineroAvailable, setDineroAvailable] = useState(true);

  async function searchDinero(q) {
    setCustomerName(q);
    if (q.length < 2) { setDineroResults([]); return; }
    setDineroSearching(true);
    try {
      const { data, error } = await supabase.functions.invoke("dinero", {
        body: { action: "search", query: q },
      });
      if (!error && data?.Collection) {
        // Virker opslaget, retter appen sig selv i stedet for at blive ved med at
        // paastaa at Dinero er utilgaengelig.
        setDineroAvailable(true);
        setDineroResults(data.Collection);
      } else {
        setDineroResults([]);
        if (error) setDineroAvailable(false); // Slå Dinero fra ved fejl
      }
    } catch {
      setDineroResults([]);
      setDineroAvailable(false);
    }
    setDineroSearching(false);
  }

  function selectDineroCustomer(c) {
    setCustomerName(c.Name);
    setDineroContactGuid(c.ContactGuid || "");
    // Adressen her er Dineros fakturaadresse for virksomheden — IKKE adressen hvor
    // rengøringen skal udføres, så den skal ikke overskrive "Adresse for udførsel".
    setCustomerSelected(true);
    setCustomerDineroSynced(true);
    setDineroResults([]);
  }

  async function createDineroCustomer() {
    setDineroSearching(true);
    const parts = address.split(",").map((s) => s.trim());
    let created = false;

    // Forsøg Dinero først
    if (dineroAvailable) {
      try {
        const { data, error } = await supabase.functions.invoke("dinero", {
          body: { action: "create", contact: { name: customerName, address: parts[0] || "", zipCode: parts[1] || "", city: parts[2] || "" } },
        });
        if (!error && (data?.Name || data?.ContactGuid)) {
          if (data?.Name) setCustomerName(data.Name);
          created = true;
          setCustomerDineroSynced(true);
        } else {
          setDineroAvailable(false);
        }
      } catch {
        setDineroAvailable(false);
      }
    }

    // Fallback: gem direkte i Supabase customers-tabel (dette er IKKE en Dinero-
    // kontakt, så customerDineroSynced skal forblive false, ellers vil "Send til
    // Dinero" fejlagtigt aldrig blive tilbudt for denne kunde senere).
    if (!created) {
      const newId = uid("cust");
      const { error: dbErr } = await supabase.from("customers").insert({
        id: newId,
        name: customerName,
        address: address,
        access_instructions: "",
      });
      if (!dbErr) {
        created = true;
        // Opdatér lokal customers state
        const newCustomer = { id: newId, name: customerName, address, access_instructions: "" };
        // customers state er ikke tilgængelig her, men vi gemmer i DB — det hentes ved næste load
      }
    }

    setDineroSearching(false);
    setShowDineroCreate(false);
  }
  const [address, setAddress] = useState(copyFrom?.address || "");
  const [poNumber, setPoNumber] = useState(copyFrom?.poNumber || "");
  const [accessInstructions, setAccessInstructions] = useState(copyFrom?.accessInstructions || "");
  const [needsKeyPickup, setNeedsKeyPickup] = useState(copyFrom?.needsKeyPickup ?? false);
  const [deliversProducts, setDeliversProducts] = useState(copyFrom?.deliversProducts ?? false);

  function toggleTemplate(id) { setChecklistTemplateIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])); }
  function addExtraItem() { if (!newItemText.trim()) return; setExtraItems((prev) => [...prev, newItemText.trim()]); setNewItemText(""); }
  function removeExtraItem(i) { setExtraItems((prev) => prev.filter((_, idx) => idx !== i)); }

  const previewItems = [
    ...checklistTemplateIds.flatMap((id) => checklistTemplates.find((c) => c.id === id)?.items || []),
    ...extraItems,
  ];

  function toggleDay(d) { setDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d])); }
  function addSkillRow() {
    const unused = skills.find((s) => !requiredSkills.some((r) => r.skill === s)) || skills[0];
    setRequiredSkills((prev) => [...prev, { skill: unused, minLevel: 1 }]);
  }
  function updateSkillRow(i, field, value) {
    setRequiredSkills((prev) => prev.map((r, idx) => (idx === i ? { ...r, [field]: field === "minLevel" ? Number(value) : value } : r)));
  }
  function removeSkillRow(i) { setRequiredSkills((prev) => prev.filter((_, idx) => idx !== i)); }

  // Begge gemme-knapper bygger nyttelasten her. De adskiller sig kun ved saveAsDraft,
  // saa de to veje aldrig kan naa at gemme forskellige felter — havde hver knap sin
  // egen feltliste, ville de foer eller siden komme ud af trit.
  const buildPayload = (saveAsDraft) => ({
    type,
    contractType,
    pricingType,
    fixedPrice: pricingType === "fixed" ? (Number(fixedPrice) || 0) : null,
    planInterval,
    title: title.trim(),
    requiredSkills,
    duration,
    days,
    dayTimes,
    dayDurations,
    day,
    adhocDate,
    deadline,
    preferredTime,
    startDate,
    expiryDate,
    checklistTemplateIds,
    extraItems,
    videoUrl: videoUrl.trim(),
    customerName: customerName.trim(),
    address: address.trim(),
    poNumber: poNumber.trim(),
    accessInstructions: accessInstructions.trim(),
    needsKeyPickup,
    deliversProducts,
    dineroSynced: customerDineroSynced,
    dineroContactGuid,
    assigned_employee_id: assignedEmployeeId,
    saveAsDraft,
  });

  return (
    <Modal
      onClose={onClose}
      title={editId ? `Rediger kladde: ${copyFrom?.title || ""}` : (copyFrom ? `Kopiér: ${copyFrom.title}` : "Ny opgave")}
      persistent
      fullscreen>
      {/* Modalen er fullscreen, saa uden denne kolonne bliver hvert felt over 1500 px
          bredt paa en almindelig skaerm. De tre farvede afsnit betyder det samme her
          og i serviceordren: rosa = kunden, groen = opgaven, blaa = tid. */}
      <div style={styles.formCol}>
      <div style={styles.formSection}>
        <div style={{ ...styles.formSectionHead, background: "#FCE4EF" }}>
          <div style={{ ...styles.formSectionTitle, color: "#9C1B5D" }}>Aftale og kunde</div>
          <div style={{ ...styles.formSectionHint, color: "#B4436F" }}>Hvem der faktureres, hvad aftalen hedder, og hvor der arbejdes</div>
        </div>
        <div style={styles.formSectionBody}>
      {/* Kontrakttype */}
      <label style={styles.label}>Kontrakttype</label>
      <div style={styles.typePicker}>
        {CONTRACT_TYPES.map((c) => [c.key, c.icon + " " + c.label]).map(([k,l]) => (
          <button key={k} type="button" onClick={() => setContractType(k)}
            style={contractType === k ? { ...styles.typePickBtn, borderColor:"#D6247A", color:"#D6247A", background:"#FCE4EF" } : styles.typePickBtn}>
            {l}
          </button>
        ))}
      </div>

      

      <label style={styles.label}>Prismodel</label>
      <div style={styles.typePicker}>
        {[["hourly","⏱️ Timebaseret"],["fixed","💰 Fastpris"]].map(([k,l]) => (
          <button key={k} type="button" onClick={() => setPricingType(k)}
            style={pricingType === k ? { ...styles.typePickBtn, borderColor:"#16A34A", color:"#16A34A", background:"#DCFCE7" } : styles.typePickBtn}>
            {l}
          </button>
        ))}
      </div>
      {pricingType === "fixed" && (
        <>
          <label style={styles.label}>Fastpris (kr. pr. opgave)</label>
          <input style={styles.input} type="number" min="0" value={fixedPrice} onChange={(e) => setFixedPrice(e.target.value)} placeholder="f.eks. 1200" />
        </>
      )}

      <label style={styles.label}>Titel</label>
      <input style={styles.input} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="F.eks. Gulvvask kontor 2. sal" />

      <label style={styles.label}>
        Fakturakunde
        {dineroAvailable
          ? <span style={{ fontSize: 11, color: "#94A3B8", marginLeft: 6 }}>— søger i Dinero</span>
          : <span style={{ fontSize: 11, color: "#D97706", marginLeft: 6 }}>— Dinero ikke tilgængelig, indtast manuelt</span>
        }
      </label>
      <div style={{ position: "relative" }}>
        <input
          style={styles.input}
          value={customerName}
          onChange={(e) => { setCustomerSelected(false); setCustomerDineroSynced(false); searchDinero(e.target.value); }}
          placeholder={dineroAvailable ? "Skriv kundenavn for at søge i Dinero…" : "Kundenavn…"}
        />
        {dineroSearching && <span style={{ position: "absolute", right: 10, top: 10, fontSize: 11, color: "#94A3B8" }}>Søger…</span>}
        {dineroResults.length > 0 && (
          <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: "#fff", border: "1px solid #E2E8F0", borderRadius: 10, boxShadow: "0 4px 16px rgba(0,0,0,0.10)", zIndex: 100, maxHeight: 220, overflowY: "auto" }}>
            {dineroResults.map((c) => (
              <div key={c.ContactGuid}
                style={{ padding: "10px 14px", cursor: "pointer", borderBottom: "1px solid #F1F5F9", fontSize: 13 }}
                onMouseDown={() => selectDineroCustomer(c)}>
                <div style={{ fontWeight: 600, color: "#111111" }}>{c.Name}</div>
                {(c.Street || c.City) && <div style={{ color: "#64748B", fontSize: 12 }}>{[c.Street, c.ZipCode, c.City].filter(Boolean).join(", ")}</div>}
                {/* CVR og EAN skiller kontakter med samme navn ad — fx tre afdelinger
                    i den samme kommune, som ellers ser fuldstaendig ens ud i listen. */}
                {(c.VatNumber || c.EanNumber) && (
                  <div style={{ color: "#94A3B8", fontSize: 11, marginTop: 1 }}>
                    {[c.VatNumber ? "CVR " + c.VatNumber : null, c.EanNumber ? "EAN " + c.EanNumber : null].filter(Boolean).join(" · ")}
                  </div>
                )}
              </div>
            ))}
            <div
              style={{ padding: "10px 14px", cursor: "pointer", fontSize: 13, color: "#D6247A", fontWeight: 600, background: "#FFF6FA" }}
              onMouseDown={() => { setDineroResults([]); setShowDineroCreate(true); }}>
              + Opret "{customerName}" som ny kunde
            </div>
          </div>
        )}
        {/* Vis opret-knap når ingen resultater og tekst er indtastet */}
        {!dineroSearching && !customerSelected && customerName.length >= 2 && dineroResults.length === 0 && !showDineroCreate && (
          <div style={{ marginTop: 4 }}>
            <button type="button"
              style={{ ...styles.addSkillBtn, fontSize: 12 }}
              onClick={() => setShowDineroCreate(true)}>
              + Opret "{customerName}" som ny kunde {dineroAvailable ? "i Dinero" : "i systemet"}
            </button>
          </div>
        )}
      </div>
      {showDineroCreate && (
        <div style={{ background: "#FFF6FA", borderRadius: 10, padding: 10, marginTop: 6 }}>
          <div style={{ fontSize: 12, color: "#9C1B5D", marginBottom: 6 }}>
            {dineroAvailable
              ? "Kunden oprettes i Dinero og i systemet med navn og adresse nedenfor"
              : "Dinero er ikke tilgængelig — kunden oprettes direkte i systemets kundedatabase"}
          </div>
          <button style={{ ...styles.primaryBtn, fontSize: 12 }} onClick={createDineroCustomer} disabled={dineroSearching}>
            {dineroSearching ? "Opretter…" : `Opret "${customerName}" ${dineroAvailable ? "i Dinero" : "i systemet"}`}
          </button>
          <button style={{ ...styles.secondaryBtn, fontSize: 12, marginLeft: 8 }} onClick={() => setShowDineroCreate(false)}>Annuller</button>
        </div>
      )}

      <div style={{ marginBottom: 12 }}>
        <div>
          <label style={styles.label}>Adresse for udførsel</label>
          <input style={styles.input} value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Vejnavn 1, 9000 Aalborg" />
        </div>
        <div>
          <label style={styles.label}>Fakturabeskrivelse (PO, navn m.v.)</label>
          <input style={styles.input} value={poNumber} onChange={(e) => setPoNumber(e.target.value)} placeholder="F.eks. PO-2026-0311 eller Att. Hanne Nielsen" />
        </div>
      </div>

      <label style={styles.label}>Adgang (nøgleboks, koder, kontaktperson m.v.)</label>
      <textarea style={styles.textarea} rows={2} value={accessInstructions} onChange={(e) => setAccessInstructions(e.target.value)} placeholder="F.eks. Nøgleboks ved hovedindgang, kode 4471" />
      <div style={styles.hint}>
        Teksten er skjult i medarbejder-appen. Hun skal trykke for at se den, og hver åbning registreres.
      </div>

      {/* Noeglen skal hentes paa kontoret. Vises paa opgavekortet i medarbejder-appen,
          ikke inde i opgaven — hun skal se det inden hun koerer, ikke naar hun staar der. */}
      <button type="button"
        style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left",
                 padding: "11px 12px", borderRadius: 10, cursor: "pointer", marginTop: 10,
                 border: needsKeyPickup ? "2px solid #B45309" : "1.5px solid #E2E8F0",
                 background: needsKeyPickup ? "#FFFBEB" : "#fff" }}
        onClick={() => setNeedsKeyPickup((v) => !v)}>
        <span style={{ width: 20, height: 20, borderRadius: 5, flexShrink: 0,
                       border: needsKeyPickup ? "2px solid #B45309" : "2px solid #CBD5E1",
                       background: needsKeyPickup ? "#B45309" : "#fff",
                       display: "flex", alignItems: "center", justifyContent: "center" }}>
          {needsKeyPickup && <Check size={12} color="#fff" strokeWidth={3} />}
        </span>
        <span style={{ fontSize: 14, color: "#111111" }}>🔑 Nøgle/adgangskort skal hentes på kontoret først</span>
      </button>

      </div></div><div style={styles.formSection}><div style={{ ...styles.formSectionHead, background: "#F0FDFA" }}><div style={{ ...styles.formSectionTitle, color: "#0F766E" }}>Opgaven</div><div style={{ ...styles.formSectionHint, color: "#149285" }}>Hvem der tager den, hvad der kræves, og hvad der skal udføres</div></div><div style={styles.formSectionBody}><label style={styles.label}>Ansvarlig Medarbejder (valgfrit)</label>
      <select style={styles.input} value={assignedEmployeeId} onChange={(e) => setAssignedEmployeeId(e.target.value)}>
        <option value="">- Ingen (auto-matching) -</option>
        {employees?.map(emp => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
      </select>

      {type === "fixed" && (
        <div style={styles.hint}>Vælges her, følger medarbejderen aftalen resten af perioden og sættes automatisk på alle kommende opgaver.</div>
      )}

      {/* Styrer om medarbejderen bliver spurgt om produktforbrug naar hun afslutter.
          Uden fluebenet springes trinnet helt over — det har vaeret vist paa hver
          eneste opgave uden at der nogensinde er registreret en udlevering. */}
      <button type="button"
        style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left",
                 padding: "11px 12px", borderRadius: 10, cursor: "pointer", marginTop: 12,
                 border: deliversProducts ? "2px solid #0F766E" : "1.5px solid #E2E8F0",
                 background: deliversProducts ? "#F0FDFA" : "#fff" }}
        onClick={() => setDeliversProducts((v) => !v)}>
        <span style={{ width: 20, height: 20, borderRadius: 5, flexShrink: 0,
                       border: deliversProducts ? "2px solid #0F766E" : "2px solid #CBD5E1",
                       background: deliversProducts ? "#0F766E" : "#fff",
                       display: "flex", alignItems: "center", justifyContent: "center" }}>
          {deliversProducts && <Check size={12} color="#fff" strokeWidth={3} />}
        </span>
        <span style={{ fontSize: 14, color: "#111111" }}>📦 Der udleveres produkter til kunden</span>
      </button>
      <div style={styles.hint}>
        Med fluebenet bliver medarbejderen spurgt om produktforbrug når hun afslutter opgaven,
        og forbruget trækkes fra lageret og kommer med på fakturaen. Uden det springes spørgsmålet over.
      </div>

      {type === "adhoc" && assignedEmployeeId && (
        <>
          <label style={styles.label}>Ønsket dato (når medarbejder er valgt)</label>
          <input type="date" style={styles.input} value={adhocDate} onChange={(e) => setAdhocDate(e.target.value)} />
          <div style={styles.hint}>Opgaven placeres på denne konkrete dato for den valgte medarbejder.</div>
        </>
      )}

      <label style={styles.label}>Krævede kompetencer (minimumsniveau)</label>
      {requiredSkills.map((r, i) => (
        <div key={i} style={styles.skillReqRow}>
          <select style={styles.inputSm} value={r.skill} onChange={(e) => updateSkillRow(i, "skill", e.target.value)}>
            {skills.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select style={styles.inputSm} value={r.minLevel} onChange={(e) => updateSkillRow(i, "minLevel", e.target.value)}>
            {LEVELS.map((l) => <option key={l.v} value={l.v}>≥ {l.label}</option>)}
          </select>
          {requiredSkills.length > 1 && <button type="button" style={styles.iconBtnGhostInline} onClick={() => removeSkillRow(i)}><X size={13} /></button>}
        </div>
      ))}
      <button type="button" style={styles.addSkillBtn} onClick={addSkillRow}><Plus size={13} /> Tilføj kompetencekrav</button>

      <label style={styles.label}>Varighed (minutter)</label>
      <input type="number" min={5} step={5} style={styles.input} value={duration} onChange={(e) => setDuration(Number(e.target.value))} /><label style={styles.label}>Tjeklister (tasks der skal udføres)</label>
      <div style={styles.skillPicker}>
        {checklistTemplates.map((c) => (
          <button key={c.id} type="button" onClick={() => toggleTemplate(c.id)} style={checklistTemplateIds.includes(c.id) ? styles.skillPickBtnActive : styles.skillPickBtn}>
            <ListChecks size={11} style={{ marginRight: 4, verticalAlign: "-2px" }} />{c.name} ({c.items.length})
          </button>
        ))}
      </div>

      <div style={styles.extraItemRow}>
        <input style={styles.inputSm} value={newItemText} onChange={(e) => setNewItemText(e.target.value)} placeholder="Tilføj enkelt task…" onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addExtraItem(); } }} />
        <button type="button" style={styles.addSkillBtn} onClick={addExtraItem}><Plus size={13} /> Tilføj</button>
      </div>

      {previewItems.length > 0 && (
        <div style={styles.previewBox}>
          <div style={styles.instructionsTitle}><ListChecks size={13} /> Tasks på serviceordren ({previewItems.length})</div>
          {previewItems.map((it, i) => (
            <div key={i} style={styles.previewItemRow}>
              <span style={styles.previewItemText}>{i + 1}. {itemText(it)}</span>
              {i >= previewItems.length - extraItems.length && (
                <button type="button" style={styles.iconBtnGhostInline} onClick={() => removeExtraItem(i - (previewItems.length - extraItems.length))}><X size={12} /></button>
              )}
            </div>
          ))}
        </div>
      )}

      <label style={styles.label}>Link til instruktionsvideo (valgfrit)</label>
      <input style={styles.input} value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} placeholder="https://…" /></div></div><div style={styles.formSection}><div style={{ ...styles.formSectionHead, background: "#EEF2FF" }}><div style={{ ...styles.formSectionTitle, color: "#4F46E5" }}>Planlægning</div><div style={{ ...styles.formSectionHint, color: "#6B63EA" }}>Hvornår og hvor ofte opgaven gentages</div></div><div style={styles.formSectionBody}><label style={styles.label}>Type</label>
      <div style={styles.typePicker}>
        {CREATABLE_TYPES.map((k) => {
          const m = TYPE_META[k];
          return (
            <button key={k} type="button" onClick={() => setType(k)} style={type === k ? { ...styles.typePickBtn, borderColor: m.color, color: m.color, background: m.bg } : styles.typePickBtn}>{m.label}</button>
          );
        })}
      </div>
      {type === "fixed" && <div style={styles.hint}>Faste opgaver gentages automatisk hver uge på de valgte dage — frem til udløbsdatoen.</div>}
      {type === "adhoc" && <div style={styles.hint}>Oprettes med dags dato og lander i "Ikke tildelt", klar til at blive planlagt.</div>}

      {type === "fixed" && (
        <>
          <label style={styles.label}>Startdato (første gang opgaven udføres)</label>
          <input type="date" min={todayIso()} style={styles.input} value={startDate} onChange={(e) => setStartDate(e.target.value)} />{startDate && startDate < todayIso() && (<div style={{ ...styles.hint, color: "#B91C1C" }}>Startdatoen kan ikke ligge i fortiden — vælg dags dato eller senere.</div>)}
          <label style={styles.label}>Udløbsdato (aftalen gælder til og med)</label>
          <input type="date" style={styles.input} value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} />
          <label style={styles.label}>Plan parametre</label>
          <div style={styles.typePicker}>
            {[["uge","Uge"],["14_dage","14 dage"],["maaned","Måned"],["3_maaned","3 måned"]].map(([k,l]) => (
              <button key={k} type="button" onClick={() => setPlanInterval(k)}
                style={planInterval === k ? { ...styles.typePickBtn, borderColor:"#D6247A", color:"#D6247A", background:"#FCE4EF" } : styles.typePickBtn}>
                {l}
              </button>
            ))}
          </div>
          <label style={styles.label}>Ugedage (gentages hver uge)</label>
          <div style={styles.skillPicker}>
            {ALL_DAYS.map((d) => <button key={d.key} type="button" onClick={() => toggleDay(d.key)} style={days.includes(d.key) ? styles.skillPickBtnActive : styles.skillPickBtn}>{d.label}</button>)}
          </div>
          {days.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 4 }}>
              {ALL_DAYS.filter((d) => days.includes(d.key)).map((d) => (
                <div key={d.key} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ width: 70, fontSize: 13, color: "#5B5B60" }}>{d.label}</span>
                  <input type="time" style={{ ...styles.input, width: 130 }} value={dayTimes[d.key] || ""} onChange={(e) => setDayTimes((prev) => ({ ...prev, [d.key]: e.target.value }))} />
                  {/* Varighed kun for denne dag. Er feltet tomt, gaelder aftalens
                      normale varighed — pladsholderen viser hvad den er. */}
                  <input type="number" min="5" step="5" style={{ ...styles.input, width: 110 }}
                    placeholder={`${duration} min`}
                    value={dayDurations[d.key] ?? ""}
                    onChange={(e) => setDayDurations((prev) => {
                      const next = { ...prev };
                      const v = Number(e.target.value);
                      if (!e.target.value || !v) delete next[d.key];
                      else next[d.key] = v;
                      return next;
                    })} />
                  <span style={{ fontSize: 12, color: "#94A3B8" }}>min</span>
                </div>
              ))}
              <div style={styles.hint}>Sæt et klokkeslæt hvis opgaven skal starte på et bestemt tidspunkt den dag. Er intet sat, placeres opgaven på ledig tid i planen.</div>
              <div style={styles.hint}>Kræver en bestemt dag mere tid — fx hovedrengøring om onsdagen — så skriv minutter i det sidste felt. Står det tomt, bruges aftalens normale varighed.</div>
            </div>
          )}
        </>
      )}

      {type === "adhoc" && (
        <>
          <label style={styles.label}>Senest udført dato</label>
          <input type="date" style={styles.input} value={adhocDate} onChange={(e) => {
            setAdhocDate(e.target.value);
            const d = new Date(e.target.value);
            setDeadline(weekdayKeyFor(d));
          }} />
          {(() => { const dow = new Date(adhocDate).getDay(); return (dow === 0 || dow === 6) ? (
            <div style={styles.hint}>Valgt dato er i weekenden — opgaven placeres på lørdag/søndag. Husk at slå "Alle dage" til i ugeplanen for at se den.</div>
          ) : null; })()}
          <div style={styles.hint}>Bruges af den automatiske planlægning til at finde en ledig plads senest denne dag — opgaven oprettes stadig med dags dato og lander i "Ikke tildelt".</div>
          <label style={styles.label}>Ønsket starttidspunkt (valgfrit)</label>
          <input type="time" style={styles.input} value={preferredTime} onChange={(e) => setPreferredTime(e.target.value)} />
        </>
      )}

      </div></div></div>

      <div style={{ ...styles.modalActions, position: "sticky", bottom: 0, zIndex: 5, background: "#F8FAFC", borderTop: "1px solid #E2E8F0", padding: "12px 84px 12px 18px", margin: "0 -18px -16px" }}>
        <button style={styles.secondaryBtn} onClick={onClose}>Annuller</button>
        <button
          style={styles.primaryBtn}
          disabled={!title.trim() || (type === "fixed" && days.length === 0) || requiredSkills.length === 0 || (type === "fixed" && !!startDate && startDate < todayIso())}
          onClick={() => onSave(buildPayload(false), editId)}>
          {editId ? "Godkend og planlæg" : "Gem og planlæg"}
        </button>
        {/* Kladde giver kun mening paa en fast aftale. En fleksibel opgave er en
            enkeltstaaende opgave, ikke en aftale, og har intet at vaere kladde for. */}
        {type === "fixed" && (
          <button
            style={{ ...styles.secondaryBtn, color: "#9C1B5D", borderColor: "#F4C0D1" }}
            disabled={!title.trim() || (!!startDate && startDate < todayIso())}
            title="Gemmer aftalen uden at oprette opgaver. Du kan rette alle felter bagefter og godkende den under Aftaler."
            onClick={() => onSave(buildPayload(true), editId)}>
            {editId ? "Gem kladde" : "Gem som kladde"}
          </button>
        )}
      </div>
    </Modal>
  );
}

// ── Skills View ───────────────────────────────────────────────────────────────
// ── Contracts View ────────────────────────────────────────────────────────────
const DAY_ABBR = { Mon: "Man", Tue: "Tirs", Wed: "Ons", Thu: "Tors", Fri: "Fre", Sat: "Lør", Sun: "Søn" };

function DayPills({ days }) {
  if (!days?.length) return null;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
      📅
      {days.map((d) => (
        <span key={d} style={{ background: "#D6247A", color: "#fff", fontWeight: 700, fontSize: 11, borderRadius: 5, padding: "1px 6px" }}>
          {DAY_ABBR[d] || d}
        </span>
      ))}
    </span>
  );
}

// Dialogen der markerer en aftale som udgaaet. Kraever baade en aarsag, en
// sidste gyldig dag og en udtrykkelig bekraeftelse, fordi handlingen ikke kan
// fortrydes i appen.
// Bekraeftelse foer en medarbejder slettes. Foer skete det ved ét klik: hun forsvandt,
// og alle hendes opgaver blev sat tilbage til "ikke tildelt" uden at nogen fik besked.
// Bemaerk at "Luk adgang" i forvejen spurgte — sletningen var det farligste og det
// eneste sted uden spoergsmaal.
function DeleteEmployeeModal({ emp, instances, onClose, onConfirm }) {
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!emp) return null;
  // Hvor meget rammer det? Tal frem for en advarsel i almindelighed — planlaeggeren
  // skal kunne se om det er to opgaver eller halvfems der bliver hjemloese.
  const paavirkede = (instances || []).filter((t) => (t.assignees || []).includes(emp.id));
  const kommende = paavirkede.filter((t) => t.status !== "udført");
  const udfoerte = paavirkede.length - kommende.length;
  const blocked = !accepted || busy;
  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.modalTitle}>Slet {emp.name}?</div>
        <div style={styles.hint}>
          {kommende.length > 0
            ? `${kommende.length} kommende opgave${kommende.length === 1 ? "" : "r"} mister hende og går tilbage til "Ikke tildelt". Du skal selv planlægge dem på ny.`
            : "Hun står ikke på nogen kommende opgaver."}
        </div>
        {udfoerte > 0 && (
          <div style={styles.hint}>
            {udfoerte} udført{udfoerte === 1 ? " opgave" : "e opgaver"} beholder hendes navn og
            tidsregistrering, så historik og fakturagrundlag ikke ændrer sig.
          </div>
        )}
        <div style={{ ...styles.hint, color: "#B91C1C" }}>
          Hendes login til medarbejder-appen fjernes ikke af dette. Brug «Luk adgang» først,
          hvis hun ikke længere skal kunne logge ind.
        </div>
        <label style={{ display: "flex", gap: 8, alignItems: "flex-start", marginTop: 12, fontSize: 13, cursor: "pointer" }}>
          <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} />
          <span>Jeg er klar over at det <b>ikke kan fortrydes</b> i appen.</span>
        </label>
        <div style={{ display: "flex", gap: 8, marginTop: 18, justifyContent: "flex-end" }}>
          <button type="button" style={styles.secondaryBtn} onClick={onClose}>Annullér</button>
          <button type="button" disabled={blocked}
            style={{ ...styles.primaryBtn, background: blocked ? "#CBD5E1" : "#B91C1C", cursor: blocked ? "not-allowed" : "pointer" }}
            onClick={() => { setBusy(true); onConfirm(emp.id); onClose(); }}>
            Slet medarbejderen
          </button>
        </div>
      </div>
    </div>
  );
}

function CancelTemplateModal({ template, onClose, onConfirm }) {
  const now = new Date();
  const iso = now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0") + "-" + String(now.getDate()).padStart(2, "0");
  const [reason, setReason] = useState("kunde");
  const [date, setDate] = useState(iso);
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!template) return null;
  const blocked = !accepted || !date || busy;
  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.modalTitle}>Markér aftalen som udgået</div>
        <div style={styles.cardMeta}>{template.customerName || template.title}</div>
        <label style={styles.label}>Årsag</label>
        <select style={styles.input} value={reason} onChange={(e) => setReason(e.target.value)}>
          {CANCEL_REASONS.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
        </select>
        <label style={styles.label}>Sidste dag aftalen gælder</label>
        <input type="date" style={styles.input} value={date} onChange={(e) => setDate(e.target.value)} />
        <div style={styles.hint}>
          Opgaver til og med denne dato bliver stående og skal stadig køres og faktureres.
          Alt efter datoen fjernes fra ugeplan, fakturering, rapportering og medarbejdernes app.
          Udførte opgaver røres aldrig.
        </div>
        <label style={{ display: "flex", gap: 8, alignItems: "flex-start", marginTop: 12, fontSize: 13, cursor: "pointer" }}>
          <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} />
          <span>Jeg er klar over at det <b>ikke kan fortrydes</b> i appen.</span>
        </label>
        <div style={{ display: "flex", gap: 8, marginTop: 18, justifyContent: "flex-end" }}>
          <button type="button" style={styles.secondaryBtn} onClick={onClose}>Annullér</button>
          <button type="button" disabled={blocked}
            style={{ ...styles.primaryBtn, background: blocked ? "#CBD5E1" : "#B91C1C", cursor: blocked ? "not-allowed" : "pointer" }}
            onClick={async () => {
              setBusy(true);
              const ok = await onConfirm(template.id, reason, date);
              setBusy(false);
              if (ok) onClose();
            }}>
            {busy ? "Markerer…" : "Markér som udgået"}
          </button>
        </div>
      </div>
    </div>
  );
}
function ContractsView({ templates: alleTemplates, instances, pricing, employees, isAdminUser, onCancelTemplate, onEditDraft }) {
  const [statusFilter, setStatusFilter] = useState("alle");
  const [typeFilter, setTypeFilter] = useState("all");

  // Der filtreres foer listen deles op i aftaler med og uden udloebsdato, saa begge
  // dele foelger samme valg. En kladde uden udloebsdato havner i den anden liste, og
  // skal kunne findes af filteret praecis som de oevrige.
  const templates = alleTemplates
    .filter((t) => (statusFilter === "alle" ? true : (t.status || "aktiv") === statusFilter))
    .filter((t) => (typeFilter === "all" ? true : effectiveContractType(t) === typeFilter));
  // Find den reelle, aktuelle kontrakttype for en skabelon: den seneste værdi sat på
  // en tilknyttet opgave slår den statiske skabelonværdi, så redigering i ugeplanen
  // altid afspejles korrekt her.
  function effectiveContractType(tpl) {
    const linked = instances.filter((i) => i.templateId === tpl.id && i.contractType);
    if (linked.length) return linked[linked.length - 1].contractType;
    return tpl.contractType || "privat";
  }

  // Realiseret tid: summen af al registreret tid (time_log) på tværs af samtlige
  // instanser der er materialiseret fra denne skabelon, uanset uge — dvs. for hele
  // aftalens levetid, ikke kun den uge man tilfældigvis kigger på lige nu.
  function realizedMinutes(tplId) {
    return instances
      .filter((i) => i.templateId === tplId)
      .reduce((s, i) => s + (i.timeLog || i.time_log || []).reduce((s2, l) => s2 + (l.minutes || 0), 0), 0);
  }

  // Planlagte timer/uge for en skabelon: varighed pr. besøg × antal ugedage den
  // gentages på.
  function weeklyPlannedMinutes(tpl) {
    return (tpl.duration || 0) * ((tpl.days || []).length || 0);
  }

  // Kontraktsum for hele aftaleperioden: planlagte timer/uge × antal uger fra
  // startdato til udløbsdato × timeprisen for kontrakttypen. Uden en startdato kan
  // "hele perioden" ikke opgøres præcist, så vi falder tilbage til en enkelt uges
  // værdi og markerer det tydeligt i UI'et.
  function contractSumInfo(tpl, contractType, start, expiry) {
    const rate = pricing[contractType || "privat"] || 0;
    const weeklyMin = weeklyPlannedMinutes(tpl);
    const weeklyValue = tpl.pricingType === "fixed"
      ? (Number(tpl.fixedPrice) || 0) * ((tpl.days || []).length || 0)
      : (weeklyMin / 60) * rate;
    if (start && expiry) {
      const weeks = Math.max(1, Math.round((expiry - start) / (1000 * 60 * 60 * 24 * 7)));
      return { sum: weeklyValue * weeks, weeks, wholePeriod: true };
    }
    return { sum: weeklyValue, weeks: 1, wholePeriod: false };
  }

  // Hent alle faste kontrakter med udløbsdato — sortér efter nærmest udløbende
  const contracts = templates
    .filter((t) => t.expiryDate)
    .map((t) => {
      const expiry = new Date(t.expiryDate);
      const start = t.startDate ? new Date(t.startDate) : null;
      const daysLeft = Math.ceil((expiry - new Date()) / (1000 * 60 * 60 * 24));
      const contractType = effectiveContractType(t);
      const rate = pricing[contractType || "privat"] || 0;
      const realizedMin = realizedMinutes(t.id);
      const { sum: plannedSum, wholePeriod } = contractSumInfo(t, contractType, start, expiry);
      return {
        ...t, contractType, expiry, start, daysLeft,
        plannedSum, wholePeriod,
        realizedMin, realizedSum: (realizedMin / 60) * rate,
      };
    })
    .sort((a, b) => a.expiry - b.expiry);

  const noExpiry = templates
    .filter((t) => !t.expiryDate)
    .map((t) => {
      const contractType = effectiveContractType(t);
      const rate = pricing[contractType || "privat"] || 0;
      const realizedMin = realizedMinutes(t.id);
      const weeklyMin = weeklyPlannedMinutes(t);
      return {
        ...t, contractType,
        weeklyPlannedSum: (weeklyMin / 60) * rate,
        realizedMin, realizedSum: (realizedMin / 60) * rate,
      };
    });

  // Samlet overblik: kun aftaler med både start- og udløbsdato indgår i "samlet
  // kontraktsum for hele perioden" og "realiseret", da de øvrige (uden startdato,
  // eller løbende uden udløb) ikke har en veldefineret periode at summere over.
  const totalPlannedSum = contracts.filter((c) => c.wholePeriod).reduce((s, c) => s + c.plannedSum, 0);
  const totalRealizedSum = contracts.reduce((s, c) => s + c.realizedSum, 0) + noExpiry.reduce((s, c) => s + c.realizedSum, 0);
  const totalRealizedMin = contracts.reduce((s, c) => s + c.realizedMin, 0) + noExpiry.reduce((s, c) => s + c.realizedMin, 0);
  const missingStartCount = contracts.filter((c) => !c.wholePeriod).length;

  function urgencyColor(days) {
    if (days < 0) return "#DC2626";   // Udløbet
    if (days <= 30) return "#D97706"; // Udløber snart
    if (days <= 90) return "#D6247A"; // Opmærksomhed
    return "#16A34A";                 // OK
  }

  function urgencyLabel(days) {
    if (days < 0) return `Udløbet for ${Math.abs(days)} dage siden`;
    if (days === 0) return "Udløber i dag";
    if (days === 1) return "Udløber i morgen";
    return `${days} dage tilbage`;
  }

  return (
    <div style={styles.page}>
      <div style={{ fontWeight: 700, fontSize: 18, color: "#111111", marginBottom: 4 }}>Aftaler</div>
      <div style={{ fontSize: 13, color: "#64748B", marginBottom: 20 }}>Faste opgaver sorteret efter udløbsdato — nærmest udløbende øverst</div>

      {/* To uafhaengige raekker filtre: status og kontrakttype. De virker sammen, saa
          man kan f.eks. se kun kladder af typen hovedrengoering. Antallet staar kun
          paa kladde-knappen — det er den eneste bunke der skal tommes. */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
        {[["alle", "Alle"], ["kladde", "Under udarbejdelse"], ["aktiv", "Aktive"], ["udgaaet", "Udgåede"]].map(([k, l]) => (
          <button
            key={k}
            type="button"
            onClick={() => setStatusFilter(k)}
            style={statusFilter === k
              ? { ...styles.typePickBtn, flex: "none", borderColor: "#D6247A", color: "#D6247A", background: "#FCE4EF" }
              : { ...styles.typePickBtn, flex: "none" }}>
            {l}
            {k === "kladde" && alleTemplates.filter((t) => t.status === "kladde").length > 0
              ? ` (${alleTemplates.filter((t) => t.status === "kladde").length})`
              : ""}
          </button>
        ))}
      </div>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 20 }}>
        <button
          type="button"
          onClick={() => setTypeFilter("all")}
          style={typeFilter === "all"
            ? { ...styles.typePickBtn, flex: "none", borderColor: "#4F46E5", color: "#4F46E5", background: "#EEF2FF" }
            : { ...styles.typePickBtn, flex: "none" }}>
          Alle kontrakttyper
        </button>
        {CONTRACT_TYPES.map((ct) => (
          <button
            key={ct.key}
            type="button"
            onClick={() => setTypeFilter(ct.key)}
            style={typeFilter === ct.key
              ? { ...styles.typePickBtn, flex: "none", borderColor: ct.color, color: ct.color, background: ct.bg }
              : { ...styles.typePickBtn, flex: "none" }}>
            {ct.icon} {ct.label}
          </button>
        ))}
      </div>

      {(contracts.length > 0 || noExpiry.length > 0) && (
        <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
          <div style={{ ...styles.statBlock, borderLeft: "3px solid #64748B" }}>
            <div>
              <div style={{ ...styles.statValue, color: "#64748B" }}>{Math.round(totalPlannedSum).toLocaleString("da-DK")} kr.</div>
              <div style={styles.statLabel}>Kontraktsum, planlagte timer{missingStartCount > 0 ? ` (${missingStartCount} mangler startdato)` : ""}</div>
            </div>
          </div>
          <div style={{ ...styles.statBlock, borderLeft: "3px solid #16A34A" }}>
            <div>
              <div style={{ ...styles.statValue, color: "#16A34A" }}>{Math.round(totalRealizedSum).toLocaleString("da-DK")} kr.</div>
              <div style={styles.statLabel}>Realiseret ({fmtMin(totalRealizedMin)})</div>
            </div>
          </div>
        </div>
      )}

      {contracts.length === 0 && noExpiry.length === 0 && (
        <div style={{ textAlign: "center", padding: 60, color: "#94A3B8" }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>📋</div>
          <div style={{ fontWeight: 600 }}>Ingen faste aftaler endnu</div>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {contracts.map((t) => {
          const color = urgencyColor(t.daysLeft);
          return (
            <div key={t.id} style={{ background: "#fff", borderRadius: 12, padding: "14px 16px", boxShadow: "0 1px 3px rgba(0,0,0,0.06)", borderLeft: `4px solid ${color}`, display: "flex", alignItems: "center", gap: 16 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 15, color: "#111111", marginBottom: 3 }}>
                  {t.title}
                  {t.status === "kladde" && (
                    <span style={{ marginLeft: 8, padding: "2px 9px", borderRadius: 999, background: "#FEF3C7", color: "#B45309", fontSize: 11, fontWeight: 700 }}>
                      Under udarbejdelse
                    </span>
                  )}
                </div>
                {/* Genvej direkte fra listen. Ellers skulle man vide at en kladde
                    aabnes via Rediger, og det er ikke til at gaette. */}
                {t.status === "kladde" && onEditDraft && (
                  <div style={{ marginBottom: 6 }}>
                    <button
                      type="button"
                      onClick={() => onEditDraft(t)}
                      style={{ ...styles.primaryBtn, fontSize: 12, padding: "5px 10px" }}>
                      Åbn og godkend
                    </button>
                  </div>
                )}
                <div style={{ fontSize: 12, color: "#64748B", display: "flex", gap: 12, flexWrap: "wrap" }}>
                  {t.customerName && <span>👤 {t.customerName}</span>}
                    {t.status === "udgaaet" ? (
                      <span style={{ color: "#B91C1C", fontWeight: 800 }}>
                        UDGÅET · {cancelReasonLabel(t.cancelReason)}
                        {t.cancelledEffectiveDate ? " · sidste dag " + String(t.cancelledEffectiveDate).slice(0, 10) : ""}
                      </span>
                    ) : isAdminUser && onCancelTemplate ? (
                      <button type="button" onClick={() => onCancelTemplate(t.id)}
                        style={{ padding: "2px 9px", borderRadius: 999, border: "1px solid #FCA5A5",
                          background: "#FEF2F2", color: "#B91C1C", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                        Markér som udgået
                      </button>
                    ) : null}
                    {t.preferredEmployeeId && (
                      <span style={{ color: "#9C1B5D", fontWeight: 700 }}>
                        Fast: {((employees || []).find((e) => e.id === t.preferredEmployeeId) || {}).name || "ukendt"}
                      </span>
                    )}
                  <DayPills days={t.days} />
                  {t.start && <span>Fra {t.start.toLocaleDateString("da-DK", { day: "numeric", month: "short", year: "numeric" })}</span>}
                  <span>Til {t.expiry.toLocaleDateString("da-DK", { day: "numeric", month: "short", year: "numeric" })}</span>
                  <span style={{ fontWeight: 600, color: "#9C1B5D" }}>{contractIconLabel(t.contractType)}</span>
                </div>
                <div style={{ fontSize: 12, color: "#64748B", display: "flex", gap: 14, flexWrap: "wrap", marginTop: 5 }}>
                  <span title={t.wholePeriod ? "Planlagte timer/uge × antal uger i aftaleperioden × timepris" : "Ingen startdato — viser kun én uges værdi"}>
                    💰 Kontraktsum: <strong style={{ color: "#111111" }}>{Math.round(t.plannedSum).toLocaleString("da-DK")} kr.</strong>{!t.wholePeriod && <span style={{ color: "#D97706" }}> (mangler startdato, kun pr. uge)</span>}
                  </span>
                  <span title="Al registreret tid på denne aftales opgaver × timepris">
                    ✅ Realiseret: <strong style={{ color: "#16A34A" }}>{Math.round(t.realizedSum).toLocaleString("da-DK")} kr.</strong> ({fmtMin(t.realizedMin)})
                  </span>
                </div>
              </div>
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color }}>{urgencyLabel(t.daysLeft)}</div>
                <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 2 }}>{fmtMin(t.duration)} pr. besøg</div>
              </div>
            </div>
          );
        })}

        {noExpiry.length > 0 && (
          <>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.05em", marginTop: 12, marginBottom: 4 }}>Uden udløbsdato</div>
            {noExpiry.map((t) => (
              <div key={t.id} style={{ background: "#fff", borderRadius: 12, padding: "14px 16px", boxShadow: "0 1px 3px rgba(0,0,0,0.06)", borderLeft: "4px solid #CBD5E1", display: "flex", alignItems: "center", gap: 16 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 15, color: "#111111", marginBottom: 3 }}>
                    {t.title}
                    {t.status === "kladde" && (
                      <span style={{ marginLeft: 8, padding: "2px 9px", borderRadius: 999, background: "#FEF3C7", color: "#B45309", fontSize: 11, fontWeight: 700 }}>
                        Under udarbejdelse
                      </span>
                    )}
                  </div>
                  {/* Samme genvej som i listen ovenfor. Aftaler uden udloebsdato staar
                      i deres egen liste, saa markeringen skal findes to steder. */}
                  {t.status === "kladde" && onEditDraft && (
                    <div style={{ marginBottom: 6 }}>
                      <button
                        type="button"
                        onClick={() => onEditDraft(t)}
                        style={{ ...styles.primaryBtn, fontSize: 12, padding: "5px 10px" }}>
                        Åbn og godkend
                      </button>
                    </div>
                  )}
                  <div style={{ fontSize: 12, color: "#64748B", display: "flex", gap: 12, flexWrap: "wrap" }}>
                    {t.customerName && <span>👤 {t.customerName}</span>}
                    {t.status === "udgaaet" ? (
                      <span style={{ color: "#B91C1C", fontWeight: 800 }}>
                        UDGÅET · {cancelReasonLabel(t.cancelReason)}
                        {t.cancelledEffectiveDate ? " · sidste dag " + String(t.cancelledEffectiveDate).slice(0, 10) : ""}
                      </span>
                    ) : isAdminUser && onCancelTemplate ? (
                      <button type="button" onClick={() => onCancelTemplate(t.id)}
                        style={{ padding: "2px 9px", borderRadius: 999, border: "1px solid #FCA5A5",
                          background: "#FEF2F2", color: "#B91C1C", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                        Markér som udgået
                      </button>
                    ) : null}
                    {t.preferredEmployeeId && (
                      <span style={{ color: "#9C1B5D", fontWeight: 700 }}>
                        Fast: {((employees || []).find((e) => e.id === t.preferredEmployeeId) || {}).name || "ukendt"}
                      </span>
                    )}
                    <DayPills days={t.days} />
                    <span style={{ fontWeight: 600, color: "#9C1B5D" }}>{contractIconLabel(t.contractType)}</span>
                  </div>
                  <div style={{ fontSize: 12, color: "#64748B", display: "flex", gap: 14, flexWrap: "wrap", marginTop: 5 }}>
                    <span title="Ingen udløbsdato — viser kontraktsum pr. uge">💰 Pr. uge: <strong style={{ color: "#111111" }}>{Math.round(t.weeklyPlannedSum).toLocaleString("da-DK")} kr.</strong></span>
                    <span title="Al registreret tid på denne aftales opgaver × timepris">✅ Realiseret: <strong style={{ color: "#16A34A" }}>{Math.round(t.realizedSum).toLocaleString("da-DK")} kr.</strong> ({fmtMin(t.realizedMin)})</span>
                  </div>
                </div>
                <div style={{ fontSize: 12, color: "#94A3B8" }}>Løbende</div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

// ── Areas View ────────────────────────────────────────────────────────────────
function AreasView({ supabase, areas, employees, employeeAreas, onAreasChange, onEmployeeAreasChange }) {
  const [showAdd, setShowAdd] = useState(false);
  const [editArea, setEditArea] = useState(null);
  const [areaName, setAreaName] = useState("");
  const [areaZips, setAreaZips] = useState("");
  const [saving, setSaving] = useState(false);

  async function saveArea() {
    setSaving(true);
    const zips = areaZips.split(/[\s,]+/).map((z) => z.trim()).filter((z) => /^\d{4}$/.test(z));
    if (editArea) {
      const { error: areaUpdErr } = await supabase.from("areas").update({ name: areaName.trim(), zip_codes: zips }).eq("id", editArea.id);
      if (dbFail(areaUpdErr, "gemme området")) return;
      onAreasChange((prev) => prev.map((a) => a.id === editArea.id ? { ...a, name: areaName.trim(), zip_codes: zips } : a));
    } else {
      const { data } = await supabase.from("areas").insert({ name: areaName.trim(), zip_codes: zips }).select().single();
      if (data) onAreasChange((prev) => [...prev, data]);
    }
    setSaving(false); setShowAdd(false); setEditArea(null); setAreaName(""); setAreaZips("");
  }

  async function deleteArea(area) {
    if (!window.confirm(`Slet området "${area.name}"?`)) return;
    const { error: areaDelErr } = await supabase.from("areas").delete().eq("id", area.id);
    if (dbFail(areaDelErr, "slette området")) return;
    onAreasChange((prev) => prev.filter((a) => a.id !== area.id));
    onEmployeeAreasChange((prev) => prev.filter((ea) => ea.area_id !== area.id));
  }

  async function toggleEmpArea(empId, areaId) {
    const exists = employeeAreas.some((ea) => ea.employee_id === empId && ea.area_id === areaId);
    if (exists) {
      const { error: delAreaErr } = await supabase.from("employee_areas").delete().match({ employee_id: empId, area_id: areaId });
      if (delAreaErr) { dbFail(delAreaErr, "fjerne omraadet fra medarbejderen"); return; }
      onEmployeeAreasChange((prev) => prev.filter((ea) => !(ea.employee_id === empId && ea.area_id === areaId)));
    } else {
      const { error: insAreaErr } = await supabase.from("employee_areas").insert({ employee_id: empId, area_id: areaId });
      if (insAreaErr) { dbFail(insAreaErr, "tilfoeje omraadet til medarbejderen"); return; }
      onEmployeeAreasChange((prev) => [...prev, { employee_id: empId, area_id: areaId }]);
    }
  }

  return (
    <div style={styles.page}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 18, color: "#111111" }}>Områder</div>
          <div style={{ fontSize: 13, color: "#64748B", marginTop: 2 }}>Tilknyt medarbejdere til postnummerområder — bruges ved automatisk planlægning</div>
        </div>
        <button style={styles.primaryBtn} onClick={() => { setShowAdd(true); setEditArea(null); setAreaName(""); setAreaZips(""); }}>
          <Plus size={14} /> Nyt område
        </button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {areas.map((area) => (
          <div key={area.id} style={{ background: "#fff", borderRadius: 12, padding: 16, boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 12 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 16, color: "#111111" }}>{area.name}</div>
                <div style={{ fontSize: 12, color: "#64748B", marginTop: 2 }}>
                  📍 {(area.zip_codes || []).slice(0, 8).join(", ")}{(area.zip_codes || []).length > 8 ? ` +${(area.zip_codes || []).length - 8} mere` : ""}
                </div>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <button style={styles.iconBtnGhostInline} onClick={() => { setEditArea(area); setAreaName(area.name); setAreaZips((area.zip_codes || []).join(", ")); setShowAdd(true); }}><Pencil size={14} /></button>
                <button style={{ ...styles.iconBtnGhostInline, color: "#DC2626" }} onClick={() => deleteArea(area)}><Trash2 size={14} /></button>
              </div>
            </div>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#475569", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>Medarbejdere</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {employees.map((emp) => {
                const assigned = employeeAreas.some((ea) => ea.employee_id === emp.id && ea.area_id === area.id);
                return (
                  <button key={emp.id}
                    style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 99, border: assigned ? "2px solid #D6247A" : "1.5px solid #E2E8F0", background: assigned ? "#FCE4EF" : "#fff", color: assigned ? "#D6247A" : "#64748B", fontWeight: assigned ? 700 : 500, fontSize: 13, cursor: "pointer" }}
                    onClick={() => toggleEmpArea(emp.id, area.id)}>
                    <span style={{ ...styles.avatar, background: emp.color, width: 20, height: 20, fontSize: 9 }}>{initials(emp.name)}</span>
                    {emp.name}{assigned && <Check size={12} />}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
        {areas.length === 0 && (
          <div style={{ textAlign: "center", padding: 60, color: "#94A3B8" }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>📍</div>
            <div style={{ fontWeight: 600 }}>Ingen områder endnu</div>
            <div style={{ fontSize: 13, marginTop: 4 }}>Opret et område og tilknyt medarbejdere og postnumre</div>
          </div>
        )}
      </div>

      {showAdd && (
        <Modal onClose={() => { setShowAdd(false); setEditArea(null); }} title={editArea ? `Rediger: ${editArea.name}` : "Nyt område"} persistent>
          <label style={styles.label}>Områdenavn</label>
          <input style={styles.input} value={areaName} onChange={(e) => setAreaName(e.target.value)} placeholder="Fx Nordjylland, Blokhus-området…" autoFocus />
          <label style={styles.label}>Postnumre (komma- eller mellemrumsadskilt)</label>
          <textarea style={{ ...styles.input, minHeight: 80, fontFamily: "monospace" }}
            value={areaZips} onChange={(e) => setAreaZips(e.target.value)}
            placeholder="9000, 9200, 9210, 9300, 9440…" />
          <div style={{ fontSize: 12, color: "#64748B", marginTop: -8, marginBottom: 12 }}>
            {areaZips.split(/[\s,]+/).filter((z) => /^\d{4}$/.test(z.trim())).length} gyldige postnumre
          </div>
          <div style={styles.modalActions}>
            <button style={styles.secondaryBtn} onClick={() => { setShowAdd(false); setEditArea(null); }}>Annuller</button>
            <button style={styles.primaryBtn} disabled={saving || !areaName.trim()} onClick={saveArea}>
              {saving ? "Gemmer…" : editArea ? "Gem ændringer" : "Opret område"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function SkillsView({ supabase, skills: skillNames, onSkillsChange }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);
  const [editId, setEditId] = useState(null);
  const [editName, setEditName] = useState("");

  useEffect(() => {
    async function load() {
      setLoading(true);
      const { data } = await supabase.from("skills").select("*").order("name");
      setItems(data || []);
      setLoading(false);
    }
    load();
  }, []);

  async function addSkill() {
    if (!newName.trim()) return;
    setSaving(true);
    const id = newName.trim().toLowerCase()
      .replace(/æ/g,"ae").replace(/ø/g,"oe").replace(/å/g,"aa")
      .replace(/\s+/g,"_").replace(/[^a-z0-9_]/g,"");
    const { data, error } = await supabase.from("skills")
      .insert({ id: id + "_" + Date.now(), name: newName.trim() })
      .select().single();
    if (!error && data) {
      setItems((prev) => [...prev, data].sort((a,b) => a.name.localeCompare(b.name)));
      onSkillsChange((prev) => [...prev, data.name]);
      setNewName("");
    }
    setSaving(false);
  }

  async function saveEdit(item) {
    if (!editName.trim() || editName === item.name) { setEditId(null); return; }
    const { error } = await supabase.from("skills").update({ name: editName.trim() }).eq("id", item.id);
    if (!error) {
      setItems((prev) => prev.map((s) => s.id === item.id ? { ...s, name: editName.trim() } : s));
      onSkillsChange((prev) => prev.map((n) => n === item.name ? editName.trim() : n));
    }
    setEditId(null);
  }

  async function deleteSkill(item) {
    if (!window.confirm(`Slet kompetencen "${item.name}"? Dette fjerner den fra alle medarbejdere og opgaver.`)) return;
    const { error: delSkillErr } = await supabase.from("skills").delete().eq("id", item.id);
    if (delSkillErr) { dbFail(delSkillErr, "slette kompetencen"); return; }
    setItems((prev) => prev.filter((s) => s.id !== item.id));
    onSkillsChange((prev) => prev.filter((n) => n !== item.name));
  }

  if (loading) return <div style={{ padding: 40, textAlign: "center", color: "#9C1B5D" }}>Indlæser kompetencer…</div>;

  return (
    <div style={styles.page}>
      <div style={{ maxWidth: 600 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 18, color: "#111111" }}>Kompetencer</div>
            <div style={{ fontSize: 13, color: "#64748B", marginTop: 2 }}>Bruges til at matche medarbejdere med opgaver</div>
          </div>
        </div>

        {/* Add new */}
        <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
          <input
            style={{ ...styles.input, flex: 1 }}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") addSkill(); }}
            placeholder="Ny kompetence, fx Højtryksspuling…"
            autoFocus
          />
          <button style={styles.primaryBtn} onClick={addSkill} disabled={saving || !newName.trim()}>
            <Plus size={14} /> Tilføj
          </button>
        </div>

        {/* List */}
        <div style={{ background: "#fff", borderRadius: 12, boxShadow: "0 1px 3px rgba(0,0,0,0.06)", overflow: "hidden" }}>
          {items.length === 0 && (
            <div style={{ padding: 24, textAlign: "center", color: "#94A3B8", fontSize: 14 }}>
              Ingen kompetencer endnu — tilføj den første ovenfor
            </div>
          )}
          {items.map((item, idx) => (
            <div key={item.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", borderBottom: idx < items.length - 1 ? "1px solid #F1F5F9" : "none" }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#D6247A", flexShrink: 0 }} />
              {editId === item.id ? (
                <input
                  style={{ ...styles.input, flex: 1, margin: 0 }}
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") saveEdit(item); if (e.key === "Escape") setEditId(null); }}
                  autoFocus
                />
              ) : (
                <span style={{ flex: 1, fontSize: 14, fontWeight: 500, color: "#111111" }}>{item.name}</span>
              )}
              {editId === item.id ? (
                <div style={{ display: "flex", gap: 6 }}>
                  <button style={styles.primaryBtn} onClick={() => saveEdit(item)}>Gem</button>
                  <button style={styles.secondaryBtn} onClick={() => setEditId(null)}>Annuller</button>
                </div>
              ) : (
                <div style={{ display: "flex", gap: 4 }}>
                  <button style={styles.iconBtnGhostInline} onClick={() => { setEditId(item.id); setEditName(item.name); }} title="Rediger"><Pencil size={14} /></button>
                  <button style={styles.iconBtnGhostInline} onClick={() => deleteSkill(item)} title="Slet"><Trash2 size={14} /></button>
                </div>
              )}
            </div>
          ))}
        </div>

        <div style={{ marginTop: 12, fontSize: 12, color: "#94A3B8" }}>
          {items.length} kompetencer · Ændringer træder i kraft straks i "Ny opgave" og "Rediger medarbejder"
        </div>
      </div>
    </div>
  );
}

// ── Inventory View ────────────────────────────────────────────────────────────
function InventoryView({ supabase, employees, currentUserName, onInventoryChanged }) {
  const [categories, setCategories] = useState([]);
  const [items, setItems] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [pendingOrders, setPendingOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddItem, setShowAddItem] = useState(false);
  const [showAdjust, setShowAdjust] = useState(null);
  const [showEditItem, setShowEditItem] = useState(null);
  const [editItemName, setEditItemName] = useState("");
  const [editItemNumber, setEditItemNumber] = useState("");
  const [editItemUnit, setEditItemUnit] = useState("");
  const [editItemMin, setEditItemMin] = useState(0);
  const [editItemCat, setEditItemCat] = useState("");
  const [editItemPrice, setEditItemPrice] = useState(0);
  const [adjustQty, setAdjustQty] = useState("");
  const [adjustReason, setAdjustReason] = useState("");
  const [adjustType, setAdjustType] = useState("in");
  const [filterCat, setFilterCat] = useState("all");

  // New item form
  const [newName, setNewName] = useState("");
  const [newItemNumber, setNewItemNumber] = useState("");
  const [newCat, setNewCat] = useState("");
  const [newUnit, setNewUnit] = useState("stk");
  const [newStock, setNewStock] = useState(0);
  const [newMin, setNewMin] = useState(0);
  const [newPrice, setNewPrice] = useState(0);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const [{ data: cats }, { data: itms }, { data: txns }, { data: pending }] = await Promise.all([
        supabase.from("inventory_categories").select("*").order("type"),
        supabase.from("inventory_items").select("*, inventory_categories(name,type,icon)").order("name"),
        supabase.from("inventory_transactions").select("*, inventory_items(name), employees(name)").order("created_at", { ascending: false }).limit(50),
        supabase.from("inventory_transactions").select("*, inventory_items(name,unit), employees(name)").eq("status", "pending").order("created_at", { ascending: true }),
      ]);
      setCategories(cats || []);
      setItems(itms || []);
      setTransactions(txns || []);
      setPendingOrders(pending || []);
      setLoading(false);
      if (cats?.length) setNewCat(cats[0].id);
    }
    load();
  }, []);

  async function addItem() {
    if (!newName.trim() || !newCat) return;
    const { data } = await supabase.from("inventory_items").insert({
      name: newName.trim(), category_id: newCat, unit: newUnit,
      stock: Number(newStock), min_stock: Number(newMin),
      item_number: newItemNumber.trim() || null, price: Number(newPrice) || 0,
    }).select("*, inventory_categories(name,type,icon)").single();
    if (data) { setItems((prev) => [...prev, data]); setShowAddItem(false); setNewName(""); setNewItemNumber(""); setNewStock(0); setNewMin(0); setNewPrice(0); }
  }

  async function saveEditItem() {
    if (!showEditItem || !editItemName.trim()) return;
    // Hent varen med opdateret kategori-join tilbage fra serveren, så ikon/navn/type
    // for en evt. ny kategori vises korrekt med det samme — ikke først efter reload.
    const { data, error } = await supabase.from("inventory_items").update({
      name: editItemName.trim(),
      item_number: editItemNumber.trim() || null,
      unit: editItemUnit,
      min_stock: Number(editItemMin),
      category_id: editItemCat,
      price: Number(editItemPrice) || 0,
    }).eq("id", showEditItem.id).select("*, inventory_categories(name,type,icon)").single();
    if (!error && data) {
      setItems((prev) => prev.map((i) => (i.id === showEditItem.id ? data : i)));
      setShowEditItem(null);
      // Sørg for at prisen/varenummeret også opdateres i fakturerings-overblikket med det samme.
      onInventoryChanged?.();
    }
  }

  async function deleteItem(item) {
    if (!window.confirm(`Slet "${item.name}"? Dette kan ikke fortrydes.`)) return;
    const { error: delItemErr } = await supabase.from("inventory_items").delete().eq("id", item.id);
    if (dbFail(delItemErr, "slette lagervaren")) return;
    setItems((prev) => prev.filter((i) => i.id !== item.id));
  }

  // Godkender en bestilling af medarbejderprodukter: nedskriver lageret (først nu!)
  // og markerer alle linjer i bestillingen som godkendt.
  async function approveOrderGroup(groupId) {
    const rows = pendingOrders.filter((o) => (o.order_group_id || o.id) === groupId);
    for (const row of rows) {
      const { error: consumeErr } = await supabase.rpc("consume_stock", { p_item_id: row.item_id, p_amount: Math.abs(row.quantity) });
      if (consumeErr) { alert(`Kunne ikke opdatere lageret for "${row.inventory_items?.name || row.item_id}" — prøv igen.`); return; }
      // Lageret er allerede traukket via consume_stock. Fejler statusopdateringen her,
      // ville bestillingen blive staaende som afventende og kunne godkendes igen -
      // og dermed traekke lageret to gange. Derfor stoppes der med det samme.
      const { error: apprErr } = await supabase.from("inventory_transactions").update({
        status: "approved", approved_by: currentUserName || null, approved_at: new Date().toISOString(),
      }).eq("id", row.id);
      if (apprErr) { alert("Lageret blev opdateret, men bestillingen kunne ikke markeres som godkendt — genindlaes siden og tjek status."); return; }
    }
    setPendingOrders((prev) => prev.filter((o) => (o.order_group_id || o.id) !== groupId));
    setItems((prev) => prev.map((it) => {
      const consumed = rows.filter((r) => r.item_id === it.id).reduce((s, r) => s + Math.abs(r.quantity), 0);
      return consumed ? { ...it, stock: Math.max(0, it.stock - consumed) } : it;
    }));
  }

  async function rejectOrderGroup(groupId) {
    if (!window.confirm("Afvis denne bestilling? Lageret ændres ikke.")) return;
    const rows = pendingOrders.filter((o) => (o.order_group_id || o.id) === groupId);
    for (const row of rows) {
      const { error: rejErr } = await supabase.from("inventory_transactions").update({
        status: "rejected", approved_by: currentUserName || null, approved_at: new Date().toISOString(),
      }).eq("id", row.id);
      if (rejErr) { alert("Bestillingen kunne ikke afvises — proev igen."); return; }
    }
    setPendingOrders((prev) => prev.filter((o) => (o.order_group_id || o.id) !== groupId));
  }

  const orderGroups = Object.values(
    pendingOrders.reduce((acc, o) => {
      const key = o.order_group_id || o.id;
      if (!acc[key]) acc[key] = { key, employeeName: o.employees?.name || "?", createdAt: o.created_at, rows: [] };
      acc[key].rows.push(o);
      return acc;
    }, {})
  );

  async function adjust() {
    if (!showAdjust || !adjustQty) return;
    const qty = adjustType === "out" ? -Math.abs(Number(adjustQty)) : Math.abs(Number(adjustQty));
    const newStock = showAdjust.stock + qty;
    const { error: txErr } = await supabase.from("inventory_transactions").insert({
      item_id: showAdjust.id, quantity: qty, type: adjustType, reason: adjustReason,
    });
    if (dbFail(txErr, "registrere lagerreguleringen")) return;
    // Atomart: negativt p_amount lægger til, positivt trækker fra.
    const { data: serverStock, error: stockErr } = await supabase.rpc("consume_stock", { p_item_id: showAdjust.id, p_amount: -qty });
    if (dbFail(stockErr, "opdatere lagerbeholdningen")) return;
    setItems((prev) => prev.map((i) => i.id === showAdjust.id ? { ...i, stock: serverStock ?? newStock } : i));
    setShowAdjust(null); setAdjustQty(""); setAdjustReason("");
  }

  const filtered = items.filter((i) => {
    if (filterCat !== "all" && i.category_id !== filterCat) return false;
    return true;
  });

  if (loading) return <div style={{ padding: 40, textAlign: "center", color: "#9C1B5D" }}>Indlæser lager…</div>;

  return (
    <div style={styles.page}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
        {/* Kategorifilter som knapper: Alle plus en pr. kategori. Erstatter de to
            dropdowns - med kun fire kategorier er et klik hurtigere end at folde ud,
            og man kan se hvad der er valgt uden at aabne noget. */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {[{ id: "all", icon: "", name: "Alle" }, ...categories].map((c) => {
            const active = filterCat === c.id;
            return (
              <button key={c.id} onClick={() => setFilterCat(c.id)}
                style={{
                  padding: "7px 14px", borderRadius: 999, fontSize: 13, fontWeight: 700, cursor: "pointer",
                  border: active ? "1px solid #9C1B5D" : "1px solid #E2E8F0",
                  background: active ? "#9C1B5D" : "#fff",
                  color: active ? "#fff" : "#5B5B60",
                }}>
                {c.icon ? c.icon + " " : ""}{c.name}
              </button>
            );
          })}
        </div>
        <button style={styles.primaryBtn} onClick={() => setShowAddItem(true)}><Plus size={14} /> Nyt produkt</button>
      </div>

      {/* Summary cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px,1fr))", gap: 8, marginBottom: 20 }}>
        {[
          { label: "Produkter i alt", value: items.length, color: "#111111" },
          { label: "Under minimumbeholdning", value: items.filter((i) => i.stock <= i.min_stock).length, color: "#DC2626" },
          { label: "Kundeprodukter", value: items.filter((i) => i.inventory_categories?.type === "kunde").length, color: "#9C1B5D" },
          { label: "Medarbejderprodukter", value: items.filter((i) => i.inventory_categories?.type === "medarbejder").length, color: "#4F46E5" },
        ].map((s) => (
          <div key={s.label} style={{ background: "#fff", borderRadius: 10, padding: "12px 14px", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 12, color: "#64748B", marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {orderGroups.length > 0 && (
        <div style={{ background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 12, padding: 14, marginBottom: 16 }}>
          <div style={{ fontWeight: 800, fontSize: 14, color: "#92400E", marginBottom: 8 }}>
            📦 Afventende bestillinger ({orderGroups.length})
          </div>
          {orderGroups.map((g) => (
            <div key={g.key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, background: "#fff", borderRadius: 8, padding: "8px 12px", marginBottom: 6, flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: "#111111" }}>{g.employeeName}</div>
                <div style={{ fontSize: 12, color: "#64748B" }}>
                  {g.rows.map((r) => `${Math.abs(r.quantity)} × ${r.inventory_items?.name || r.item_id}`).join(", ")}
                </div>
                {g.createdAt && <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 2 }}>{new Date(g.createdAt).toLocaleString("da-DK")}</div>}
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <button style={{ border: "none", background: "#16A34A", color: "#fff", borderRadius: 8, padding: "6px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer" }} onClick={() => approveOrderGroup(g.key)}>Godkend</button>
                <button style={{ border: "none", background: "#F1F5F9", color: "#475569", borderRadius: 8, padding: "6px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer" }} onClick={() => rejectOrderGroup(g.key)}>Afvis</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Product list */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px,1fr))", gap: 10 }}>
        {filtered.map((item) => {
          const low = item.stock <= item.min_stock;
          const cat = item.inventory_categories;
          return (
            <div key={item.id} style={{ background: "#fff", borderRadius: 12, padding: 14, boxShadow: "0 1px 3px rgba(0,0,0,0.06)", borderLeft: `4px solid ${low ? "#DC2626" : cat?.type === "medarbejder" ? "#4F46E5" : "#D6247A"}` }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 8 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14, color: "#111111" }}>{item.name}{item.item_number ? ` (${item.item_number})` : ""}</div>
                  <div style={{ fontSize: 12, color: "#64748B" }}>{cat?.icon} {cat?.name}{cat?.type === "kunde" ? ` · ${Number(item.price || 0).toFixed(2)} kr/${item.unit}` : ""}</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <button style={{ ...styles.addSkillBtn, fontSize: 12 }} onClick={() => { setShowAdjust(item); setAdjustType("in"); }}>
                    Justér
                  </button>
                  <button style={styles.iconBtnGhostInline} onClick={() => { setShowEditItem(item); setEditItemName(item.name); setEditItemNumber(item.item_number || ""); setEditItemUnit(item.unit); setEditItemMin(item.min_stock); setEditItemCat(item.category_id); setEditItemPrice(item.price || 0); }} title="Rediger"><Pencil size={13} /></button>
                  <button style={{ ...styles.iconBtnGhostInline, color: "#DC2626" }} onClick={() => deleteItem(item)} title="Slet"><Trash2 size={13} /></button>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ height: 6, background: "#F1F5F9", borderRadius: 99, overflow: "hidden" }}>
                    <div style={{ height: "100%", background: low ? "#DC2626" : "#D6247A", borderRadius: 99, width: `${Math.min(100, item.min_stock > 0 ? (item.stock / (item.min_stock * 3)) * 100 : 100)}%` }} />
                  </div>
                </div>
                <div style={{ fontSize: 15, fontWeight: 800, color: low ? "#DC2626" : "#111111", minWidth: 60, textAlign: "right" }}>
                  {item.stock} {item.unit}
                </div>
              </div>
              {low && <div style={{ fontSize: 11, color: "#DC2626", marginTop: 4, fontWeight: 600 }}>⚠ Under minimumbeholdning ({item.min_stock} {item.unit})</div>}
            </div>
          );
        })}
      </div>

      {/* Recent transactions */}
      {transactions.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: "#111111", marginBottom: 10 }}>Seneste bevægelser</div>
          <div style={{ background: "#fff", borderRadius: 12, overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
            {transactions.slice(0, 15).map((tx) => (
              <div key={tx.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", borderBottom: "1px solid #F1F5F9" }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#111111" }}>{tx.inventory_items?.name}</div>
                  <div style={{ fontSize: 11, color: "#64748B" }}>{tx.reason || (tx.type === "in" ? "Tilgang" : "Afgang")} {tx.employees?.name ? `· ${tx.employees.name}` : ""}</div>
                </div>
                <div style={{ fontSize: 15, fontWeight: 700, color: tx.quantity > 0 ? "#16A34A" : "#DC2626" }}>
                  {tx.quantity > 0 ? "+" : ""}{tx.quantity} {tx.inventory_items?.unit || "stk"}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add item modal */}
      {showAddItem && (
        <Modal onClose={() => setShowAddItem(false)} title="Nyt produkt" persistent>
          <label style={styles.label}>Navn</label>
          <input style={styles.input} value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Fx Toiletruller" autoFocus />
          <label style={styles.label}>Varenummer</label>
          <input style={styles.input} value={newItemNumber} onChange={(e) => setNewItemNumber(e.target.value)} placeholder="Fx 1024" />
          <label style={styles.label}>Kategori</label>
          <select style={styles.input} value={newCat} onChange={(e) => setNewCat(e.target.value)}>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.icon} {c.name} ({c.type === "kunde" ? "Kundeprodukt" : "Medarbejderprodukt"})</option>)}
          </select>
          <label style={styles.label}>Enhed</label>
          <select style={styles.input} value={newUnit} onChange={(e) => setNewUnit(e.target.value)}>
            {["stk","rulle","par","dunk","liter","kg","pose","æske","sæt"].map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
          <label style={styles.label}>Pris pr. enhed (kr., ekskl. moms)</label>
          <input type="number" style={styles.input} value={newPrice} onChange={(e) => setNewPrice(e.target.value)} min={0} step="0.01" placeholder="Bruges til fakturering" />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <label style={styles.label}>Startbeholdning</label>
              <input type="number" style={styles.input} value={newStock} onChange={(e) => setNewStock(e.target.value)} min={0} />
            </div>
            <div>
              <label style={styles.label}>Minimumbeholdning</label>
              <input type="number" style={styles.input} value={newMin} onChange={(e) => setNewMin(e.target.value)} min={0} />
            </div>
          </div>
          <div style={styles.modalActions}>
            <button style={styles.secondaryBtn} onClick={() => setShowAddItem(false)}>Annuller</button>
            <button style={styles.primaryBtn} disabled={!newName.trim()} onClick={addItem}>Gem produkt</button>
          </div>
        </Modal>
      )}

      {/* Adjust modal */}
      {showEditItem && (
        <Modal onClose={() => setShowEditItem(null)} title={`Rediger: ${showEditItem.name}`} persistent>
          <label style={styles.label}>Navn</label>
          <input style={styles.input} value={editItemName} onChange={(e) => setEditItemName(e.target.value)} autoFocus />
          <label style={styles.label}>Varenummer</label>
          <input style={styles.input} value={editItemNumber} onChange={(e) => setEditItemNumber(e.target.value)} placeholder="Fx 1024" />
          <label style={styles.label}>Kategori</label>
          <select style={styles.input} value={editItemCat} onChange={(e) => setEditItemCat(e.target.value)}>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.icon} {c.name} ({c.type === "kunde" ? "Kundeprodukt" : "Medarbejderprodukt"})</option>)}
          </select>
          <label style={styles.label}>Enhed</label>
          <select style={styles.input} value={editItemUnit} onChange={(e) => setEditItemUnit(e.target.value)}>
            {["stk","rulle","par","dunk","liter","kg","pose","æske","sæt"].map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
          <label style={styles.label}>Pris pr. enhed (kr., ekskl. moms)</label>
          <input type="number" style={styles.input} value={editItemPrice} onChange={(e) => setEditItemPrice(e.target.value)} min={0} step="0.01" placeholder="Bruges til fakturering" />
          <label style={styles.label}>Minimumbeholdning</label>
          <input type="number" style={styles.input} value={editItemMin} onChange={(e) => setEditItemMin(e.target.value)} min={0} />
          <div style={styles.modalActions}>
            <button style={styles.secondaryBtn} onClick={() => setShowEditItem(null)}>Annuller</button>
            <button style={styles.primaryBtn} disabled={!editItemName.trim()} onClick={saveEditItem}>Gem ændringer</button>
          </div>
        </Modal>
      )}
      {showAdjust && (
        <Modal onClose={() => setShowAdjust(null)} title={`Justér: ${showAdjust.name}`} persistent>
          <div style={{ fontSize: 14, color: "#64748B", marginBottom: 12 }}>Nuværende beholdning: <strong>{showAdjust.stock} {showAdjust.unit}</strong></div>
          <label style={styles.label}>Type</label>
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            {[["in","Tilgang ↑"],["out","Afgang ↓"],["adjust","Manuel justering"]].map(([k,l]) => (
              <button key={k} type="button"
                style={{ flex:1, padding:"8px 0", borderRadius:8, border: adjustType===k ? "2px solid #D6247A" : "1.5px solid #E2E8F0", background: adjustType===k ? "#FCE4EF" : "#fff", color: adjustType===k ? "#D6247A" : "#475569", fontWeight:600, fontSize:13, cursor:"pointer" }}
                onClick={() => setAdjustType(k)}>{l}</button>
            ))}
          </div>
          <label style={styles.label}>Antal ({showAdjust.unit})</label>
          <input type="number" style={styles.input} value={adjustQty} onChange={(e) => setAdjustQty(e.target.value)} min={0} autoFocus placeholder="0" />
          <label style={styles.label}>Årsag (valgfrit)</label>
          <input style={styles.input} value={adjustReason} onChange={(e) => setAdjustReason(e.target.value)} placeholder="Fx modtaget fra leverandør" />
          <div style={styles.modalActions}>
            <button style={styles.secondaryBtn} onClick={() => setShowAdjust(null)}>Annuller</button>
            <button style={styles.primaryBtn} disabled={!adjustQty || Number(adjustQty) <= 0} onClick={adjust}>Gem justering</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function BlockModal({ employees, onClose, onSave }) {
  const todayStr = new Date().toISOString().slice(0, 10);
  const [employeeId, setEmployeeId] = useState(employees[0]?.id || "");
  const [blockType, setBlockType] = useState("sygdom");
  const [startDate, setStartDate] = useState(todayStr);
  const [endDate, setEndDate] = useState(todayStr);

  function submit() {
    if (!employeeId) return;
    if (!startDate || !endDate || endDate < startDate) return;
    onSave(employeeId, blockType, startDate, endDate);
    onClose();
  }

  return (
    <Modal onClose={onClose} title="Registrér sygdom/ferie">
      <div style={styles.hint}>
        Opretter en blokering for medarbejderen i perioden. Eksisterende opgaver i perioden flyttes automatisk til
        "Ikke tildelt", og medarbejderen kan ikke auto- eller manuelt planlægges disse dage.
      </div>

      <label style={styles.label}>Medarbejder</label>
      <select style={styles.input} value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
        {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
      </select>

      <label style={styles.label}>Type</label>
      <div style={{ display: "flex", gap: 8 }}>
        {BLOCK_TYPES.map((bt) => (
          <button
            key={bt}
            type="button"
            style={{
              ...styles.secondaryBtn,
              flex: 1,
              ...(blockType === bt ? { background: TYPE_META[bt].bg, color: TYPE_META[bt].color, borderColor: TYPE_META[bt].color } : {}),
            }}
            onClick={() => setBlockType(bt)}
          >
            {TYPE_META[bt].label}
          </button>
        ))}
      </div>

      <label style={styles.label}>Startdato</label>
      <input type="date" style={styles.input} value={startDate} onChange={(e) => setStartDate(e.target.value)} />

      <label style={styles.label}>Slutdato</label>
      <input type="date" style={styles.input} value={endDate} min={startDate} onChange={(e) => setEndDate(e.target.value)} />

      <div style={styles.modalActions}>
        <button style={styles.secondaryBtn} onClick={onClose}>Annuller</button>
        <button style={styles.primaryBtn} onClick={submit} disabled={!employeeId}>Registrér</button>
      </div>
    </Modal>
  );
}


function ActivityModal({ employees, onClose, onSave }) {
  const todayStr = new Date().toISOString().slice(0, 10);
  const [employeeId, setEmployeeId] = useState(employees[0]?.id || "");
  const [customerName, setCustomerName] = useState("");
  const [address, setAddress] = useState("");
  const [date, setDate] = useState(todayStr);
  const [time, setTime] = useState("09:00");
  const [duration, setDuration] = useState(60);
  const [description, setDescription] = useState("");

  function submit() {
    if (!employeeId || !date) return;
    onSave({ employeeId, customerName, address, date, time, duration, description });
    onClose();
  }

  return (
    <Modal onClose={onClose} title="Anden aktivitet">
      <div style={styles.hint}>
        Opretter en enkeltstående aktivitet (fx kundebesøg) i kalenderen. Aktiviteten optager medarbejderens
        kapacitet ligesom en almindelig opgave, men indgår ikke i fakturering eller rapporter.
      </div>

      <label style={styles.label}>Kundenavn</label>
      <input style={styles.input} value={customerName} onChange={(e) => setCustomerName(e.target.value)} />

      <label style={styles.label}>Adresse</label>
      <input style={styles.input} value={address} onChange={(e) => setAddress(e.target.value)} />

      <label style={styles.label}>Medarbejder</label>
      <select style={styles.input} value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
        {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
      </select>

      <label style={styles.label}>Dato</label>
      <input type="date" style={styles.input} value={date} onChange={(e) => setDate(e.target.value)} />

      <label style={styles.label}>Tidspunkt</label>
      <input type="time" style={styles.input} value={time} onChange={(e) => setTime(e.target.value)} />

      <label style={styles.label}>Varighed (minutter)</label>
      <input type="number" min="5" step="5" style={styles.input} value={duration} onChange={(e) => setDuration(e.target.value)} />

      <label style={styles.label}>Beskrivelse</label>
      <textarea style={{ ...styles.input, minHeight: 70 }} value={description} onChange={(e) => setDescription(e.target.value)} />

      <div style={styles.modalActions}>
        <button style={styles.secondaryBtn} onClick={onClose}>Annuller</button>
        <button style={styles.primaryBtn} onClick={submit} disabled={!employeeId || !date}>Opret aktivitet</button>
      </div>
    </Modal>
  );
}

function TravelSettingsModal({ settings, onClose, onSave }) {
  const [defaultMinutes, setDefaultMinutes] = useState(settings.defaultMinutes);
  const [dayStart, setDayStart] = useState(settings.dayStart);
  const [overrides, setOverrides] = useState(settings.overrides || {});
  const [addrA, setAddrA] = useState("");
  const [addrB, setAddrB] = useState("");
  const [addrMin, setAddrMin] = useState(15);

  function addOverride() {
    if (!addrA.trim() || !addrB.trim()) return;
    setOverrides((prev) => ({ ...prev, [travelKey(addrA.trim(), addrB.trim())]: Number(addrMin) }));
    setAddrA(""); setAddrB("");
  }
  function removeOverride(key) { setOverrides((prev) => { const next = { ...prev }; delete next[key]; return next; }); }

  return (
    <Modal onClose={onClose} title="Transporttid mellem opgaver">
      <div style={styles.hint}>
        Der beregnes automatisk en "Transport"-aktivitet mellem to opgaver samme dag, hvis de har forskellig adresse.
        Da denne prototype ikke har adgang til en rutevejledningstjeneste (kræver en betalt API, f.eks. Google Distance Matrix),
        bruges et estimat i stedet for en beregnet køretid.
      </div>

      <label style={styles.label}>Standard transporttid mellem forskellige adresser (minutter)</label>
      <input type="number" min={0} step={5} style={styles.input} value={defaultMinutes} onChange={(e) => setDefaultMinutes(Number(e.target.value))} />

      <label style={styles.label}>Arbejdsdagens starttidspunkt</label>
      <input type="time" style={styles.input} value={dayStart} onChange={(e) => setDayStart(e.target.value)} />

      <label style={styles.label}>Kendte rejsetider mellem specifikke adresser (valgfrit, mere præcist)</label>
      {Object.entries(overrides).map(([key, min]) => (
        <div key={key} style={styles.previewItemRow}>
          <span style={styles.previewItemText}>{key.replace(" || ", " ↔ ")} · {min} min</span>
          <button type="button" style={styles.iconBtnGhostInline} onClick={() => removeOverride(key)}><X size={12} /></button>
        </div>
      ))}
      <div style={styles.itemDraftBox}>
        <input style={styles.input} value={addrA} onChange={(e) => setAddrA(e.target.value)} placeholder="Adresse A" />
        <input style={styles.input} value={addrB} onChange={(e) => setAddrB(e.target.value)} placeholder="Adresse B" />
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <input type="number" min={0} step={5} style={styles.inputSm} value={addrMin} onChange={(e) => setAddrMin(e.target.value)} />
          <span style={styles.cardMeta}>minutter</span>
          <button type="button" style={styles.addSkillBtn} onClick={addOverride}><Plus size={13} /> Tilføj</button>
        </div>
      </div>

      <div style={styles.modalActions}>
        <button style={styles.secondaryBtn} onClick={onClose}>Annuller</button>
        <button style={styles.primaryBtn} onClick={() => onSave({ defaultMinutes: Number(defaultMinutes), dayStart, overrides })}>Gem</button>
      </div>
    </Modal>
  );
}

function EmployeeModal({ emp, onClose, onSave, skills: skillList }) {
  const [name, setName] = useState(emp?.name || "");
  const [startTime, setStartTime] = useState(emp?.startTime || "");
  // Standardsatsen bruges paa nye medarbejdere, saa loensummen i eksporten aldrig
  // staar tom fordi nogen glemte at udfylde et felt.
  const [hourlyWage, setHourlyWage] = useState(
    emp?.hourlyWage != null ? String(emp.hourlyWage) : String(STANDARD_TIMELOEN),
  );
  const [homeAddress, setHomeAddress] = useState(emp?.homeAddress || "");
  const [travelInWorktime, setTravelInWorktime] = useState(emp?.travelInWorktime ?? false);
  const [weekendOk, setWeekendOk] = useState(emp?.weekendOk ?? false);
  const [empSkills, setEmpSkills] = useState(emp?.skills || {});
  // Et tomt objekt skal ogsaa falde tilbage: en medarbejder uden raekker i
  // employee_capacity kommer ind som {}, og saa blev hvert felt vist som "NaN".
  const [capacity, setCapacity] = useState(
    emp?.capacity && Object.keys(emp.capacity).length ? emp.capacity : defaultCapacity(),
  );
  const [isAdmin, setIsAdmin] = useState(emp?.isAdmin || false);
  // Kompetencer hun ikke har, ligger skjult. Med seks-otte kompetencer var listen
  // over "Ingen / N / OE / E" for hver af dem den laengste del af hele dialogen.
  const [visAlleKompetencer, setVisAlleKompetencer] = useState(false);
  const colorPool = ["#D6247A", "#111111", "#9C1B5D", "#5B5B60", "#C2487A", "#3A3A3E"];
  const [color] = useState(emp?.color || colorPool[Math.floor(Math.random() * colorPool.length)]);

  function setLevel(skill, level) {
    setEmpSkills((prev) => { const next = { ...prev }; if (level === 0) delete next[skill]; else next[skill] = level; return next; });
  }
  function setCap(day, hours) { setCapacity((prev) => ({ ...prev, [day]: Math.max(0, Number(hours)) * 60 })); }
  // De fleste har samme timetal alle dage. Uden denne skulle man tale fem felter ind
  // hver gang en ansaettelse aendrer sig.
  function saetAlleDage(hours) {
    const timer = Number(hours);
    if (!Number.isFinite(timer)) return;
    const min = Math.max(0, timer) * 60;
    // ...prev skal med. Uden den forsvandt Sat og Sun helt ud af objektet, og
    // syncEmployee saetter manglende dage til standardkapaciteten — saa en haevet
    // weekendkapacitet blev nulstillet lydloest hver gang man trykkede paa genvejen.
    setCapacity((prev) => ({ ...prev, ...Object.fromEntries(DAYS.map((d) => [d.key, min])) }));
  }

  const ugeTimer = DAYS.reduce((s, d) => s + (capacity[d.key] || 0), 0);
  const valgte = (skillList || []).filter((s) => (empSkills[s] || 0) > 0);
  const oevrige = (skillList || []).filter((s) => !(empSkills[s] || 0));
  const synlige = visAlleKompetencer ? (skillList || []) : valgte;

  return (
    <Modal onClose={onClose} title={emp ? `Rediger ${emp.name}` : "Ny medarbejder"} persistent>
      {/* Fire afsnit med samme farvesprog som Ny opgave: rosa er personen, groent er
          hvad hun kan, blaat er tid. Det graa med haengelaas er det som kun
          administratorer kan se — og det skal se anderledes ud af netop den grund. */}
      <div style={styles.empSection}>
        <div style={{ ...styles.empSectionHead, background: "#FCE4EF" }}>
          <div style={{ ...styles.empSectionTitle, color: "#9C1B5D" }}>Personen</div>
          <div style={{ ...styles.empSectionHint, color: "#B4436F" }}>Navn og hvornår dagen begynder</div>
        </div>
        <div style={styles.empSectionBody}>
          <label style={styles.label}>Navn</label>
          <input style={styles.input} value={name} onChange={(e) => setName(e.target.value)} placeholder="Fulde navn" />

          <label style={styles.label}>Mødetid</label>
          <input style={styles.input} type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
          <div style={styles.hint}>
            Bruges til at beregne hvornår dagens første opgave kan starte.
            {travelInWorktime && " Da kørslen er en del af hendes arbejdstid, er det tidspunktet hun tager hjemmefra."}
          </div>
        </div>
      </div>

      <div style={styles.empSection}>
        <div style={{ ...styles.empSectionHead, background: "#F0FDFA" }}>
          <div style={{ ...styles.empSectionTitle, color: "#0F766E" }}>Kan</div>
          <div style={{ ...styles.empSectionHint, color: "#149285" }}>Kompetencer og niveau — afgør hvilke opgaver hun kommer i betragtning til</div>
        </div>
        <div style={styles.empSectionBody}>
          {synlige.length === 0 && (
            <div style={styles.hint}>Ingen kompetencer valgt endnu.</div>
          )}
          <div style={styles.skillLevelGrid}>
            {synlige.map((s) => {
              const current = empSkills[s] || 0;
              return (
                <div key={s} style={styles.skillLevelRow}>
                  <span style={styles.skillLevelName}>{s}</span>
                  <div style={styles.levelSeg}>
                    <button type="button" onClick={() => setLevel(s, 0)} style={current === 0 ? styles.levelBtnActiveNone : styles.levelBtn}>Ingen</button>
                    {LEVELS.map((l) => (
                      <button key={l.v} type="button" onClick={() => setLevel(s, l.v)} style={current === l.v ? styles.levelBtnActive : styles.levelBtn}>{l.short}</button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          {oevrige.length > 0 && (
            <button type="button" style={styles.empFoldBtn} onClick={() => setVisAlleKompetencer((v) => !v)}>
              {visAlleKompetencer
                ? "Skjul de kompetencer hun ikke har"
                : `+ Tilføj kompetence — ${oevrige.length} ${oevrige.length === 1 ? "er" : "er"} skjult`}
            </button>
          )}
        </div>
      </div>

      <div style={styles.empSection}>
        <div style={{ ...styles.empSectionHead, background: "#EFF6FF" }}>
          <div style={{ ...styles.empSectionTitle, color: "#1D4ED8" }}>Tid</div>
          <div style={{ ...styles.empSectionHint, color: "#3B82F6" }}>Timer til rådighed pr. dag — det loft planlægningen regner med</div>
        </div>
        <div style={styles.empSectionBody}>
          <div style={styles.capEditRow}>
            {DAYS.map((d) => (
              <div key={d.key} style={styles.capEditBox}>
                <div style={styles.capDayLabel}>{d.label.slice(0, 3)}</div>
                <input type="number" min={0} step={0.5} style={styles.capInput} value={(capacity[d.key] / 60).toString()} onChange={(e) => setCap(d.key, e.target.value)} />
              </div>
            ))}
          </div>
          <div style={styles.empTidFod}>
            <button type="button" style={styles.empFoldBtn}
              onClick={() => saetAlleDage(capacity[DAYS[0].key] / 60)}>
              Sæt mandagens timetal på alle dage
            </button>
            <span style={{ fontSize: 13, fontWeight: 600, color: "#111111" }}>
              {(ugeTimer / 60).toLocaleString("da-DK", { maximumFractionDigits: 1 })} timer om ugen
            </span>
          </div>

          <button type="button" style={weekendOk ? styles.empTjekAktivGroen : styles.empTjek}
            onClick={() => setWeekendOk((v) => !v)}>
            <span style={weekendOk ? styles.empTjekFirkantGroen : styles.empTjekFirkant}>
              {weekendOk && <Check size={11} color="#fff" strokeWidth={3} />}
            </span>
            <span style={{ fontSize: 13, color: "#111111" }}>Må arbejde i weekenden — der er intet timeloft de dage</span>
          </button>
          <div style={styles.hint}>
            Uden fluebenet kan hun slet ikke planlægges lørdag og søndag. Weekendarbejde udløser tillæg.
          </div>
        </div>
      </div>

      <div style={styles.empSection}>
        <div style={{ ...styles.empSectionHead, background: "#F1F5F9" }}>
          <div style={{ ...styles.empSectionTitle, color: "#334155" }}>🔒 Løn og transport</div>
          <div style={{ ...styles.empSectionHint, color: "#64748B" }}>Kun administratorer kan se og rette dette</div>
        </div>
        <div style={styles.empSectionBody}>
          <label style={styles.label}>Timeløn (kr.)</label>
          <input style={{ ...styles.input, maxWidth: 160 }} type="number" min="0" step="1" value={hourlyWage}
            onChange={(e) => setHourlyWage(e.target.value)} placeholder={String(STANDARD_TIMELOEN)} />
          <div style={styles.hint}>Bruges kun til lønsummerne i Medarbejder-eksport, ikke til priser over for kunden.</div>

          <button type="button" style={travelInWorktime ? styles.empTjekAktivGroen : styles.empTjek}
            onClick={() => setTravelInWorktime((v) => !v)}>
            <span style={travelInWorktime ? styles.empTjekFirkantGroen : styles.empTjekFirkant}>
              {travelInWorktime && <Check size={11} color="#fff" strokeWidth={3} />}
            </span>
            <span style={{ fontSize: 13, color: "#111111" }}>Kørsel er en del af arbejdstiden</span>
          </button>
          <div style={styles.hint}>
            Med fluebenet tæller dagens kørsel i hendes kapacitet — hjemmefra til første opgave,
            mellem opgaverne, og fra sidste opgave hjem. Uden det afregnes kørslen med kilometerpenge.
          </div>

          {travelInWorktime && (
            <>
              <label style={styles.label}>Hjemmeadresse</label>
              <input style={styles.input} value={homeAddress} onChange={(e) => setHomeAddress(e.target.value)}
                placeholder="Vejnavn 1, 9490 Pandrup" />
              <div style={styles.hint}>
                Kan kun ses af administratorer og af hende selv. Sendes til rutetjenesten på samme måde
                som kundernes adresser.
                {!homeAddress.trim() && <strong style={{ color: "#B45309" }}> Uden adresse slår ordningen ikke til.</strong>}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Administrator staar for sig med roed ramme. Fluebenet er i mellemtiden blevet
          den kontakt der afgoer om man kan aabne planlaegningsappen overhovedet, se
          kollegernes loen, deres hjemmeadresser og kundernes noeglebokskoder — og
          markere fakturalinjer som sendt til Dinero. Det maa ikke ligne et vilkaarligt felt. */}
      <div style={styles.empAdminBoks}>
        <button type="button" style={isAdmin ? styles.empTjekAktivRoed : styles.empTjek}
          onClick={() => setIsAdmin((v) => !v)}>
          <span style={isAdmin ? styles.empTjekFirkantRoed : styles.empTjekFirkant}>
            {isAdmin && <Check size={11} color="#fff" strokeWidth={3} />}
          </span>
          <span style={{ fontSize: 13, fontWeight: 600, color: "#111111" }}>🛡️ Administrator</span>
        </button>
        <div style={styles.empAdminAdvarsel}>
          Giver adgang til hele planlægningsappen, til alle kollegers timeløn og hjemmeadresser,
          til kundernes nøglebokskoder, til budgetterne i Rapportering, og til at markere
          fakturalinjer som sendt til Dinero. Sæt det kun på kontorets folk.
        </div>
      </div>

      <div style={styles.modalActions}>
        <button style={styles.secondaryBtn} onClick={onClose}>Annuller</button>
        <button style={styles.primaryBtn} disabled={!name.trim()} onClick={() => onSave({ id: emp?.id || uid("e"), name: name.trim(), skills: empSkills, color: emp?.color || color, capacity, isAdmin, weekendOk, startTime: startTime || null, hourlyWage: hourlyWage === "" ? STANDARD_TIMELOEN : Math.max(0, Number(hourlyWage)), homeAddress: homeAddress.trim() || null, travelInWorktime })}>Gem medarbejder</button>
      </div>
    </Modal>
  );
}

// ---------- Task / service order detail ----------
function TaskDetailModal({ task, employees, templates, onSetPreferredEmployee, onCancelTemplate, checklistTemplates, skills, isAdminUser, areas, employeeAreas, onClose, onSetStatus, onToggleChecklistItem, onAddChecklistItem, onAddChecklistTemplate, onAddAssignee, onRemoveAssignee, onUnplace, onDelete, onUpdateCustomer, onUpdateCustomerInfo, onUpdateContractType, onRenameTask, onCopy, onUpdateSkills, onEndBlockEarly, onUpdateSchedule, onUpdateKeyPickup, onUpdateDeliversProducts, onUpdateScheduledTime }) {
  // Disse to laa efter det tidlige return for blokeringer (sygdom/ferie) laengere nede.
  // Hooks skal kaldes i samme raekkefoelge hver render: aabnede man en blokering og
  // derefter en almindelig opgave i samme modal, ville React se to hooks mere end sidst
  // og kaste. Det slap igennem fordi modalen i praksis afmonteres imellem — men det er
  // en faelde der venter paa den foerste, der aabner de to i traek.
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(task.title);
  const [addOpen, setAddOpen] = useState(false);
  const [newItemText, setNewItemText] = useState("");
  const [showTemplates, setShowTemplates] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(false);
  const [editingSkills, setEditingSkills] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState(false);
  const [schedDate, setSchedDate] = useState("");
  const [schedTime, setSchedTime] = useState("");
  const [custName, setCustName] = useState("");
  // Kundens unikke id i Dinero. Saettes naar planlaeggeren vaelger kunden i soegningen.
  const [custGuid, setCustGuid] = useState("");
  const [custAddress, setCustAddress] = useState("");
  const [custPo, setCustPo] = useState("");
  const [custAccess, setCustAccess] = useState("");
  const [taskSkills, setTaskSkills] = useState([]);
  const [dineroSyncing, setDineroSyncing] = useState(false);
  // Kort visuel "✓ Sendt"-bekræftelse lige efter klik — IKKE det samme som om
  // kunden varigt er kendt i Dinero (det styres af den gemte customerDineroSynced
  // nedenfor, som afgør om knappen overhovedet skal vises).
  const [justSyncedFlash, setJustSyncedFlash] = useState(false);
  const [dineroResults, setDineroResults] = useState([]);
  const [dineroSearching, setDineroSearching] = useState(false);
  const [showDineroCreate, setShowDineroCreate] = useState(false);
  const [dineroAvailable, setDineroAvailable] = useState(true);
  // Sand når kunden er en kendt/valgt kunde — se samme forklaring i TaskModal.
  // Forhindrer at "Opret i Dinero" foreslås for en kunde der allerede er tilknyttet
  // opgaven, eller lige er valgt fra Dinero-søgeresultaterne.
  const [customerSelected, setCustomerSelected] = useState(false);
  // Sand når kunden vides at være en rigtig Dinero-kontakt (gemt persistent på
  // opgaven/skabelonen) — styrer om "Send til Dinero"-knappen vises i det hele taget.
  const [customerDineroSynced, setCustomerDineroSynced] = useState(false);
  // Loggen hentes paa forespoergsel og ikke ved indlaesning: den vokser med hver
  // aabning, og de fleste opgaver aabnes uden at nogen har brug for at se sporet.
  // null = ikke hentet endnu, [] = hentet og tom.
  const [adgangLog, setAdgangLog] = useState(null);
  const [logHenter, setLogHenter] = useState(false);
  const [logFejl, setLogFejl] = useState("");
  // Skal noeglefluebenet gaelde hele aftalen eller kun denne dag? Starter paa "kun
  // denne", fordi et enkeltstaaende noejleudlaan er det almindelige tilfaelde — og
  // fordi det er den harmloese af de to, hvis man trykker forkert.
  const [keyHeleAftalen, setKeyHeleAftalen] = useState(false);
  const [produktHeleAftalen, setProduktHeleAftalen] = useState(false);
  // Skal tiden gemmes paa aftalen? Starter slaaet TIL: paa en fast aftale er et
  // klokkeslaet normalt en aftale med kunden, ikke en undtagelse for én uge.
  const [tidHeleAftalen, setTidHeleAftalen] = useState(true);

  async function hentAdgangLog() {
    if (!task) return;
    setLogHenter(true);
    setLogFejl("");
    const { data, error } = await supabase.from("access_log")
      .select("id, employee_id, opened_at")
      .eq("instance_id", task.id)
      .order("opened_at", { ascending: false })
      .limit(200);
    if (error) setLogFejl("Kunne ikke hente loggen: " + error.message);
    else setAdgangLog(data || []);
    setLogHenter(false);
  }

  useEffect(() => {
    if (task) {
      setCustName(task.customerName || "");
      setCustGuid(task.dineroContactGuid || "");
      setCustAddress(task.address || "");
      setCustPo(task.poNumber || "");
      setCustAccess(task.accessInstructions || "");
      // Nulstilles naar en anden opgave aabnes, ellers ville forrige opgaves log
      // staa og lyse paa den nye — og det er en alvorlig forveksling netop her.
      setAdgangLog(null);
      setLogFejl("");
      setKeyHeleAftalen(false);
      setProduktHeleAftalen(false);
      setTidHeleAftalen(true);
      setEditingSchedule(false);
      setTaskSkills(task.requiredSkills || []);
      setDineroResults([]);
      setShowDineroCreate(false);
      setCustomerSelected(!!task.customerName);
      setCustomerDineroSynced(!!task.dineroSynced);
    }
  }, [task?.id]);

  async function searchDineroForCustomer(q) {
    setCustName(q);
    // Skrives navnet i haanden, passer et tidligere valgt kunde-id ikke laengere.
    setCustGuid("");
    if (q.length < 2) { setDineroResults([]); return; }
    setDineroSearching(true);
    try {
      const { data, error } = await supabase.functions.invoke("dinero", {
        body: { action: "search", query: q },
      });
      if (!error && data?.Collection) {
        // Virker opslaget, retter appen sig selv i stedet for at blive ved med at
        // paastaa at Dinero er utilgaengelig.
        setDineroAvailable(true);
        setDineroResults(data.Collection);
      } else {
        setDineroResults([]);
        if (error) setDineroAvailable(false);
      }
    } catch {
      setDineroResults([]);
      setDineroAvailable(false);
    }
    setDineroSearching(false);
  }

  function selectDineroCustomerForEdit(c) {
    setCustName(c.Name);
    setCustGuid(c.ContactGuid || "");
    // Adressen her er Dineros fakturaadresse for virksomheden — IKKE adressen hvor
    // rengøringen skal udføres, så den skal ikke overskrive "Adresse for udførsel".
    setCustomerSelected(true);
    setCustomerDineroSynced(true);
    setDineroResults([]);
    setShowDineroCreate(false);
  }

  async function createDineroCustomerForEdit() {
    setDineroSearching(true);
    const parts = custAddress.split(",").map((s) => s.trim());
    let created = false;

    if (dineroAvailable) {
      try {
        const { data, error } = await supabase.functions.invoke("dinero", {
          body: { action: "create", contact: { name: custName, address: parts[0] || "", zipCode: parts[1] || "", city: parts[2] || "" } },
        });
        if (!error && (data?.Name || data?.ContactGuid)) {
          if (data?.Name) setCustName(data.Name);
          if (data?.ContactGuid) setCustGuid(data.ContactGuid);
          created = true;
          setCustomerDineroSynced(true);
        } else {
          setDineroAvailable(false);
        }
      } catch {
        setDineroAvailable(false);
      }
    }

    // Fallback direkte i Supabase customers-tabel er IKKE en Dinero-kontakt.
    if (!created) {
      const newId = uid("cust");
      const { error: dbErr } = await supabase.from("customers").insert({
        id: newId, name: custName, address: custAddress, access_instructions: "",
      });
      if (!dbErr) created = true;
    }

    setDineroSearching(false);
    setShowDineroCreate(false);
  }

  if (!task) return null;

  if (task.type === "aktivitet") {
    const emp = employees.find((e) => (task.assignees || []).includes(e.id));
    const dayLabel = ALL_DAYS.find((d) => d.key === task.day)?.label || task.day;
    return (
      <Modal title="Anden aktivitet" onClose={onClose}>
        <div style={{ padding: "4px 0 16px" }}>
          <p style={{ margin: "0 0 8px", color: "#475569" }}>
            <strong>{emp?.name || "Ukendt medarbejder"}</strong> · {dayLabel} · Uge {task.week} · {task.year}
            {task.scheduledTime ? ` · ${task.scheduledTime}` : ""}
          </p>
          {task.customerName && <p style={{ margin: "0 0 4px" }}><strong>Kunde:</strong> {task.customerName}</p>}
          {task.address && <p style={{ margin: "0 0 4px" }}><strong>Adresse:</strong> {task.address}</p>}
          {task.accessInstructions && <p style={{ margin: "0 0 4px" }}><strong>Beskrivelse:</strong> {task.accessInstructions}</p>}
          <p style={{ margin: "8px 0 16px", color: "#475569" }}><strong>Varighed:</strong> {task.duration} min</p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button style={styles.secondaryBtn} onClick={() => onDelete(task.id)}>
              <Trash2 size={14} /> Slet aktivitet
            </button>
          </div>
        </div>
      </Modal>
    );
  }

  // Sygdom/ferie er en blokering, ikke en rigtig rengøringsopgave — vis en
  // forenklet dialog i stedet for hele det almindelige opgave-UI (kunde,
  // tjekliste, kompetencer osv. giver ikke mening for en blokering).
  if (BLOCK_TYPES.includes(task.type)) {
    const emp = employees.find((e) => (task.assignees || []).includes(e.id));
    const dayLabel = ALL_DAYS.find((d) => d.key === task.day)?.label || task.day;
    const meta = TYPE_META[task.type];
    return (
      <Modal title={meta?.label || task.type} onClose={onClose}>
        <div style={{ padding: "4px 0 16px" }}>
          <p style={{ margin: "0 0 16px", color: "#475569" }}>
            <strong>{emp?.name || "Ukendt medarbejder"}</strong> · {dayLabel} · Uge {task.week} · {task.year}
          </p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button style={styles.secondaryBtn} onClick={() => onDelete(task.id)}>
              <Trash2 size={14} /> Slet kun denne dag
            </button>
            {task.blockGroupId && (
              <button style={{ ...styles.secondaryBtn, color: "#B91C1C", borderColor: "#B91C1C" }} onClick={() => { onEndBlockEarly(task.blockGroupId); onClose(); }}>
                Afslut blokering fra i dag
              </button>
            )}
          </div>
        </div>
      </Modal>
    );
  }

  const t = task;
  const isDone = t.status === "udført";
  // Administratorer må åbne og redigere en opgave, selvom den er markeret som
  // udført (fx for at rette en fejl efterfølgende) — alle andre har kun
  // læseadgang til kompetencer/kundeoplysninger/type, når opgaven er udført.
  const locked = isDone && !isAdminUser;
  const assignedEmps = (t.assignees || []).map((id) => employees.find((e) => e.id === id)).filter(Boolean);
  const addable = employees.filter((e) => !(t.assignees || []).includes(e.id));
  const prog = checklistProgress(t);
  const dayLabel = t.day ? ALL_DAYS.find((d) => d.key === t.day)?.label : "Ikke planlagt endnu";
  const totalLogged = (t.timeLog || []).reduce((s, l) => s + l.minutes, 0);
  const byEmployee = {};
  (t.timeLog || []).forEach((l) => { if (!l.empId) return; byEmployee[l.empId] = (byEmployee[l.empId] || 0) + l.minutes; });
  const existingTexts = new Set((t.checklist || []).map((i) => i.text));

  function saveCustomer() {
    onUpdateCustomerInfo(t.id, { customerName: custName, address: custAddress, poNumber: custPo, accessInstructions: custAccess, dineroSynced: customerDineroSynced, dineroContactGuid: custGuid });
    setEditingCustomer(false);
    setDineroResults([]);
    setShowDineroCreate(false);
  }

  function saveSkills() {
    if (onUpdateSkills) onUpdateSkills(t.id, taskSkills);
    setEditingSkills(false);
  }

  async function syncToDinero() {
    setDineroSyncing(true);
    try {
      const parts = custAddress.split(",").map((s) => s.trim());
      const { data, error } = await supabase.functions.invoke("dinero", {
        body: { action: "create", contact: { name: custName, address: parts[0] || "", zipCode: parts[1] || "", city: parts[2] || "" } },
      });
      if (!error && (data?.Name || data?.ContactGuid)) {
        setJustSyncedFlash(true);
        setTimeout(() => setJustSyncedFlash(false), 3000);
        // Gem varigt at kunden nu findes i Dinero, så knappen ikke dukker op igen
        // — hverken på denne opgave eller fremtidige uger af samme faste aftale.
        setCustomerDineroSynced(true);
        onUpdateCustomerInfo(t.id, { dineroSynced: true });
      }
    } catch {}
    setDineroSyncing(false);
  }

  function addItem() {
    if (!newItemText.trim()) return;
    onAddChecklistItem(t.id, newItemText.trim());
    setNewItemText("");
  }

  const mapsUrl = (custAddress || t.address)
    ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(custAddress || t.address)}`
    : null;

  const titleNode = isEditingTitle
    ? React.createElement("span", { style: { display: "flex", alignItems: "center", gap: 6 } },
        React.createElement("input", { value: titleDraft, onChange: (e) => setTitleDraft(e.target.value), autoFocus: true, style: { font: "inherit", fontWeight: 600, padding: "2px 6px", border: "1px solid #CBD5E1", borderRadius: 6 } }),
        React.createElement("button", { style: styles.iconBtnGhostInline, title: "Gem", onClick: () => { onRenameTask(t.id, titleDraft); setIsEditingTitle(false); } }, React.createElement(Check, { size: 16 })),
        React.createElement("button", { style: styles.iconBtnGhostInline, title: "Annuller", onClick: () => { setTitleDraft(t.title); setIsEditingTitle(false); } }, React.createElement(X, { size: 16 }))
            )
  : React.createElement("span", { style: { display: "flex", alignItems: "center", gap: 6 } },
      t.title,
      isAdminUser && React.createElement("button", { style: styles.iconBtnGhostInline, title: "Ret opgavens navn", onClick: () => { setTitleDraft(t.title); setIsEditingTitle(true); } }, React.createElement(Pencil, { size: 14 }))
    );
return (
    <Modal onClose={onClose} title={titleNode} persistent>
      {/* Ligger oeverst og for sig selv. Stod den nede ved medarbejderne, var den
          for let at ramme ved et uheld, naar man blot skulle tilfoeje en kollega. */}
      {t.templateId && isAdminUser && onCancelTemplate && (() => {
        const aftale = (templates || []).find((x) => x.id === t.templateId);
        if (aftale && aftale.status === "udgaaet") {
          return (
            <div style={{ ...styles.cardMeta, color: "#B91C1C", fontWeight: 700, textAlign: "center", margin: "6px 0 18px" }}>
              Aftalen er udgået · {cancelReasonLabel(aftale.cancelReason)}
            </div>
          );
        }
        return (
          // Centreret og med god luft til begge sider, saa den ikke klaeber til
          // hverken overskriften eller opgavetypen nedenunder.
          <div style={{ textAlign: "center", margin: "10px 0 20px" }}>
            <button type="button" style={{ ...styles.addSkillBtn, borderColor: "#FCA5A5", color: "#B91C1C" }}
              title="Markerer hele aftalen som udgået og fjerner alle kommende opgaver"
              onClick={() => { onCancelTemplate(t.templateId); onClose(); }}>
              Markér aftalen som udgået
            </button>
          </div>
        );
      })()}
      <div style={styles.detailMetaRow}>
        {locked ? (
          <TypeBadge type={t.type} />
        ) : (
          <select
            style={{ fontSize: 12, fontWeight: 600, padding: "3px 8px", borderRadius: 99, border: "1.5px solid #E2E8F0", cursor: "pointer", background: TYPE_META[t.type]?.bg || "#F1F5F9", color: TYPE_META[t.type]?.color || "#475569" }}
            value={t.type}
            onChange={(e) => onUpdateCustomer(t.id, { type: e.target.value })}>
            <option value="fixed">↻ Fast interval</option>
            <option value="adhoc">⚡ Fleksibel</option>
          </select>
        )}
        <span style={{ ...styles.typeChip, color: statusColor(t.status), background: "#F1EFE7" }}>{statusLabel(t.status)}</span>
        {locked ? (
          t.contractType && <span style={{ ...styles.typeChip, background: contractMeta(t.contractType).bg, color: contractMeta(t.contractType).color }}>{contractIconLabel(t.contractType)}</span>
        ) : (
          <select
            style={{ fontSize: 12, fontWeight: 600, padding: "3px 8px", borderRadius: 99, border: "1.5px solid #E2E8F0", background: contractMeta(t.contractType).bg, color: contractMeta(t.contractType).color, cursor: "pointer" }}
            value={t.contractType || "privat"}
            onChange={(e) => onUpdateContractType(t.id, e.target.value)}>
            <option value="privat">🏠 Privat</option>
            <option value="nexus">🏢 Nexus</option>
            <option value="aeldrelov">👴 Ældrelov</option>
          </select>
        )}
        {t.offSchedule && <span style={{ ...styles.typeChip, background: "#FEF9C3", color: "#B45309" }}>⚠️ Uden for aftale</span>}
        {t.onSchedule && !t.offSchedule && <span style={{ ...styles.typeChip, background: "#ECFDF5", color: "#16A34A" }}>✓ Aftalt dag</span>}
        {t.outsideArea && <span style={{ ...styles.typeChip, background: "#F5F3FF", color: "#7C3AED" }}>📍 Uden for område</span>}
      </div>
      {/* Klokkeslaettet stod ikke her foer, selvom 2.628 af 2.682 faste opgaver har et.
          Det er en aftale med kunden, saa det skal kunne laeses uden at aabne noget. */}
      <div style={styles.cardMeta}>{dayLabel}{t.scheduledTime ? ` kl. ${t.scheduledTime}` : ""} · {fmtMin(t.duration)}{t.deadline ? ` · senest ${ALL_DAYS.find((d) => d.key === t.deadline)?.label}` : ""}{t.expiryDate ? ` · udløber ${t.expiryDate}` : ""}</div>

      <div style={styles.formSection}><div style={{ ...styles.formSectionHead, background: "#F0FDFA" }}><div style={{ ...styles.formSectionTitle, color: "#0F766E" }}>Opgaven</div><div style={{ ...styles.formSectionHint, color: "#149285" }}>Hvad der skal laves, og hvornår den senest skal være udført</div></div><div style={styles.formSectionBody}>{/* Kompetencer — redigerbare */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
          <label style={styles.label}>Kompetencer</label>
          {!locked && !editingSkills && (
            <button style={{ ...styles.addSkillBtn, fontSize: 11 }} onClick={() => setEditingSkills(true)}><Pencil size={11} /> Rediger</button>
          )}
        </div>
        {editingSkills ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {taskSkills.map((r, i) => (
              <div key={i} style={styles.skillReqRow}>
                <select style={styles.inputSm} value={r.skill} onChange={(e) => setTaskSkills((prev) => prev.map((x, idx) => idx === i ? { ...x, skill: e.target.value } : x))}>
                  {(skills || []).map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                <select style={styles.inputSm} value={r.minLevel} onChange={(e) => setTaskSkills((prev) => prev.map((x, idx) => idx === i ? { ...x, minLevel: Number(e.target.value) } : x))}>
                  {LEVELS.map((l) => <option key={l.v} value={l.v}>≥ {l.label}</option>)}
                </select>
                <button type="button" style={styles.iconBtnGhostInline} onClick={() => setTaskSkills((prev) => prev.filter((_, idx) => idx !== i))}><X size={13} /></button>
              </div>
            ))}
            <button type="button" style={styles.addSkillBtn} onClick={() => setTaskSkills((prev) => [...prev, { skill: (skills || [])[0] || "", minLevel: 1 }])}><Plus size={13} /> Tilføj kompetence</button>
            <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
              <button style={styles.primaryBtn} onClick={saveSkills}>Gem</button>
              <button style={styles.secondaryBtn} onClick={() => { setEditingSkills(false); setTaskSkills(t.requiredSkills || []); }}>Annuller</button>
            </div>
          </div>
        ) : (
          <div style={styles.cardMeta}>{skillLabel(t)}</div>
        )}
      </div>

      {/* Tidspunkt paa en fast aftale. Blokken nedenfor gaelder kun fleksible opgaver,
          saa paa en fast aftale kunne klokkeslaettet hverken ses eller rettes — det
          kom fra aftalens ugedagstider og var derefter usynligt.
          Retter man det kun paa opgaven, kommer den gamle tid tilbage naar naeste uge
          dannes; derfor valget om at rette hele aftalen. */}
      {t.type === "fixed" && !isDone && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
            <label style={styles.label}>Aftalt tidspunkt</label>
            {!locked && !editingSchedule && (
              <button style={{ ...styles.addSkillBtn, fontSize: 11 }}
                onClick={() => { setSchedTime(t.scheduledTime || ""); setEditingSchedule(true); }}>Rediger</button>
            )}
          </div>
          {!editingSchedule ? (
            <div style={styles.cardMeta}>
              {t.scheduledTime ? `${dayLabel} kl. ${t.scheduledTime}` : `${dayLabel} — intet fast klokkeslæt`}
            </div>
          ) : (
            <div>
              <div style={{ maxWidth: 180 }}>
                <div style={{ fontSize: 11, color: "#94A3B8", marginBottom: 3 }}>Klokkeslæt {dayLabel.toLowerCase()}</div>
                <input type="time" style={styles.input} value={schedTime} onChange={(e) => setSchedTime(e.target.value)} />
              </div>
              <label style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 8, fontSize: 12, color: "#64748B", cursor: "pointer" }}>
                <input type="checkbox" checked={tidHeleAftalen} onChange={(e) => setTidHeleAftalen(e.target.checked)} />
                Gælder alle {dayLabel.toLowerCase()}e på aftalen, også de kommende
              </label>
              <div style={styles.hint}>
                {tidHeleAftalen
                  ? "Tiden gemmes på aftalen, så kommende uger også får den."
                  : "Kun denne ene opgave ændres. Næste uge får aftalens hidtidige tid igen."}
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                <button style={{ ...styles.secondaryBtn, padding: "7px 12px", fontSize: 12 }}
                  onClick={() => setEditingSchedule(false)}>Annullér</button>
                <button style={{ ...styles.primaryBtn, padding: "7px 12px", fontSize: 12 }}
                  onClick={() => { onUpdateScheduledTime(t.id, schedTime || null, tidHeleAftalen); setEditingSchedule(false); }}>
                  Gem tidspunkt
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Frist og tidspunkt — kan rettes paa fleksible opgaver indtil de er udfoert.
          Aendres datoen til en anden uge, flytter opgaven med, og placeringen
          nulstilles saa opgaven kan planlaegges paa ny inden for den nye frist. */}
      {t.type === "adhoc" && !isDone && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
            <label style={styles.label}>Frist og tidspunkt</label>
            {!editingSchedule && (
              <button style={{ ...styles.addSkillBtn, fontSize: 11 }} onClick={() => {
                const monday = mondayOfWeek(t.week, t.year);
                const idx = Math.max(0, ALL_DAYS.findIndex((x) => x.key === (t.deadline || "Fri")));
                const dl = new Date(monday);
                dl.setDate(dl.getDate() + idx);
                const pad = (n) => String(n).padStart(2, "0");
                setSchedDate(`${dl.getFullYear()}-${pad(dl.getMonth() + 1)}-${pad(dl.getDate())}`);
                setSchedTime(t.scheduledTime || "");
                setEditingSchedule(true);
              }}>Rediger</button>
            )}
          </div>
          {!editingSchedule ? (
            <div style={styles.cardMeta}>
              {t.deadline ? `Senest ${(ALL_DAYS.find((x) => x.key === t.deadline)?.label || t.deadline).toLowerCase()} · uge ${t.week}` : "Ingen frist"}
              {t.scheduledTime ? ` · ønsket kl. ${t.scheduledTime}` : ""}
            </div>
          ) : (
            <div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 150 }}>
                  <div style={{ fontSize: 11, color: "#94A3B8", marginBottom: 3 }}>Senest udført dato</div>
                  <input type="date" style={styles.input} value={schedDate} onChange={(e) => setSchedDate(e.target.value)} />
                </div>
                <div style={{ flex: 1, minWidth: 130 }}>
                  <div style={{ fontSize: 11, color: "#94A3B8", marginBottom: 3 }}>Ønsket starttidspunkt</div>
                  <input type="time" style={styles.input} value={schedTime} onChange={(e) => setSchedTime(e.target.value)} />
                </div>
              </div>
              <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                <button style={{ ...styles.primaryBtn, padding: "7px 12px", fontSize: 12 }} disabled={!schedDate}
                  onClick={() => { onUpdateSchedule(t.id, schedDate, schedTime || null); setEditingSchedule(false); }}>
                  Gem og planlæg igen
                </button>
                <button style={{ ...styles.secondaryBtn, padding: "7px 12px", fontSize: 12 }} onClick={() => setEditingSchedule(false)}>Annuller</button>
              </div>
              <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 6 }}>
                Opgaven forsøges placeret på ny inden for den nye frist. Kan ingen nå det, lander den i "Ikke tildelt".
              </div>
            </div>
          )}
        </div>
      )}

      </div></div><div style={styles.formSection}><div style={{ ...styles.formSectionHead, background: "#FCE4EF" }}><div style={{ ...styles.formSectionTitle, color: "#9C1B5D" }}>Kunde</div><div style={{ ...styles.formSectionHint, color: "#B4436F" }}>Hvem der faktureres, og hvor der arbejdes</div></div><div style={styles.formSectionBody}>{/* Kunde — redigerbar indtil udført */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
          <label style={styles.label}>Kundeoplysninger</label>
          {!locked && !editingCustomer && (
            <button style={{ ...styles.addSkillBtn, fontSize: 11 }} onClick={() => { setEditingCustomer(true); if (custName) searchDineroForCustomer(custName); }}><Pencil size={11} /> Rediger</button>
          )}
          {locked && <span style={{ fontSize: 11, color: "#94A3B8" }}>🔒 Låst (opgave udført)</span>}
          {isDone && isAdminUser && (
            <span style={{ fontSize: 11, color: "#9C1B5D", fontWeight: 600 }}>🔓 Admin-adgang (opgave udført)</span>
          )}
        </div>

        {editingCustomer ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div>
              <div style={{ fontSize: 11, color: dineroAvailable ? "#94A3B8" : "#D97706", marginBottom: 4 }}>
                {dineroAvailable ? "Søger i Dinero mens du skriver" : "Dinero ikke tilgængelig — indtast manuelt"}
              </div>
              <div style={{ position: "relative" }}>
                <input
                  style={styles.input}
                  value={custName}
                  onChange={(e) => { setCustomerSelected(false); setCustomerDineroSynced(false); searchDineroForCustomer(e.target.value); setShowDineroCreate(false); }}
                  placeholder={dineroAvailable ? "Skriv kundenavn for at søge i Dinero…" : "Kundenavn"}
                />
                {dineroSearching && <span style={{ position: "absolute", right: 10, top: 10, fontSize: 11, color: "#94A3B8" }}>Søger…</span>}
                {dineroResults.length > 0 && (
                  <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: "#fff", border: "1px solid #E2E8F0", borderRadius: 10, boxShadow: "0 4px 16px rgba(0,0,0,0.10)", zIndex: 100, maxHeight: 220, overflowY: "auto" }}>
                    {dineroResults.map((c) => (
                      <div key={c.ContactGuid}
                        style={{ padding: "10px 14px", cursor: "pointer", borderBottom: "1px solid #F1F5F9", fontSize: 13 }}
                        onMouseDown={() => selectDineroCustomerForEdit(c)}>
                        <div style={{ fontWeight: 600, color: "#111111" }}>{c.Name}</div>
                        {(c.Street || c.City) && <div style={{ color: "#64748B", fontSize: 12 }}>{[c.Street, c.ZipCode, c.City].filter(Boolean).join(", ")}</div>}
                {/* CVR og EAN skiller kontakter med samme navn ad — fx tre afdelinger
                    i den samme kommune, som ellers ser fuldstaendig ens ud i listen. */}
                {(c.VatNumber || c.EanNumber) && (
                  <div style={{ color: "#94A3B8", fontSize: 11, marginTop: 1 }}>
                    {[c.VatNumber ? "CVR " + c.VatNumber : null, c.EanNumber ? "EAN " + c.EanNumber : null].filter(Boolean).join(" · ")}
                  </div>
                )}
                      </div>
                    ))}
                    <div
                      style={{ padding: "10px 14px", cursor: "pointer", fontSize: 13, color: "#D6247A", fontWeight: 600, background: "#FFF6FA" }}
                      onMouseDown={() => { setDineroResults([]); setShowDineroCreate(true); }}>
                      + Opret "{custName}" som ny kunde
                    </div>
                  </div>
                )}
                {!dineroSearching && !customerSelected && custName.length >= 2 && dineroResults.length === 0 && !showDineroCreate && (
                  <div style={{ marginTop: 4 }}>
                    <button type="button"
                      style={{ ...styles.addSkillBtn, fontSize: 12 }}
                      onClick={() => setShowDineroCreate(true)}>
                      + Opret "{custName}" som ny kunde {dineroAvailable ? "i Dinero" : "i systemet"}
                    </button>
                  </div>
                )}
              </div>
              {showDineroCreate && (
                <div style={{ background: "#FFF6FA", borderRadius: 10, padding: 10, marginTop: 6 }}>
                  <div style={{ fontSize: 12, color: "#9C1B5D", marginBottom: 6 }}>
                    {dineroAvailable
                      ? "Kunden oprettes i Dinero og i systemet med navn og adresse nedenfor"
                      : "Dinero er ikke tilgængelig — kunden oprettes direkte i systemets kundedatabase"}
                  </div>
                  <button style={{ ...styles.primaryBtn, fontSize: 12 }} onClick={createDineroCustomerForEdit} disabled={dineroSearching}>
                    {dineroSearching ? "Opretter…" : `Opret "${custName}" ${dineroAvailable ? "i Dinero" : "i systemet"}`}
                  </button>
                  <button style={{ ...styles.secondaryBtn, fontSize: 12, marginLeft: 8 }} onClick={() => setShowDineroCreate(false)}>Annuller</button>
                </div>
              )}
            </div>
            <input style={styles.input} value={custAddress} onChange={(e) => setCustAddress(e.target.value)} placeholder="Adresse" />
            <input style={styles.input} value={custPo} onChange={(e) => setCustPo(e.target.value)} placeholder="Fakturabeskrivelse (PO, navn m.v.)" />
            <textarea style={{ ...styles.input, minHeight: 60 }} value={custAccess} onChange={(e) => setCustAccess(e.target.value)} placeholder="Adgangsinstruktioner" />
            <div style={{ display: "flex", gap: 8 }}>
              <button style={styles.primaryBtn} onClick={saveCustomer}>Gem</button>
              <button style={styles.secondaryBtn} onClick={() => { setEditingCustomer(false); setDineroResults([]); setShowDineroCreate(false); }}>Annuller</button>
            </div>
          </div>
        ) : (
          (custName || custAddress || custPo || custAccess) ? (
            <div style={styles.customerBox}>
              {custName && <div style={styles.customerName}>{custName}</div>}
              {custAddress && (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <div style={styles.cardMeta}>{custAddress}</div>
                  {mapsUrl && (
                    <a href={mapsUrl} target="_blank" rel="noreferrer"
                      style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, fontWeight: 700, color: "#D6247A", textDecoration: "none", flexShrink: 0 }}>
                      <Navigation size={12} /> Naviger
                    </a>
                  )}
                </div>
              )}
              {custPo && <div style={styles.cardMeta}>Faktura: {custPo}</div>}
              {/* Noeglefluebenet kan saettes her, paa den eksisterende opgave. Det laa
                  foer kun i "Ny opgave", og der kommer man ikke tilbage til naar opgaven
                  er oprettet — saa var funktionen i praksis utilgaengelig. */}
              <div style={{ marginTop: 8 }}>
                <button type="button" disabled={locked}
                  style={{ display: "flex", alignItems: "center", gap: 9, width: "100%", textAlign: "left",
                           padding: "9px 11px", borderRadius: 8, cursor: locked ? "default" : "pointer",
                           border: t.needsKeyPickup ? "2px solid #B45309" : "1.5px solid #E2E8F0",
                           background: t.needsKeyPickup ? "#FFFBEB" : "#fff", opacity: locked ? 0.6 : 1 }}
                  onClick={() => { if (!locked) onUpdateKeyPickup(t.id, !t.needsKeyPickup, keyHeleAftalen); }}>
                  <span style={{ width: 18, height: 18, borderRadius: 5, flexShrink: 0,
                                 border: t.needsKeyPickup ? "2px solid #B45309" : "2px solid #CBD5E1",
                                 background: t.needsKeyPickup ? "#B45309" : "#fff",
                                 display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {t.needsKeyPickup && <Check size={11} color="#fff" strokeWidth={3} />}
                  </span>
                  <span style={{ fontSize: 13, color: "#111111" }}>🔑 Nøgle/adgangskort hentes på kontoret først</span>
                </button>
                {!locked && t.type === "fixed" && (
                  <label style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 6, fontSize: 12, color: "#64748B", cursor: "pointer" }}>
                    <input type="checkbox" checked={keyHeleAftalen} onChange={(e) => setKeyHeleAftalen(e.target.checked)} />
                    Gælder alle opgaver på aftalen, også de kommende
                  </label>
                )}
                <div style={styles.hint}>
                  {keyHeleAftalen && t.type === "fixed"
                    ? "Ændringen slår igennem på hele aftalen."
                    : "Ændringen gælder kun denne ene opgave."}
                </div>

                {/* Samme mekanik som noeglen: styrer om medarbejderen bliver spurgt om
                    produktforbrug naar hun afslutter opgaven. */}
                <button type="button" disabled={locked}
                  style={{ display: "flex", alignItems: "center", gap: 9, width: "100%", textAlign: "left",
                           padding: "9px 11px", borderRadius: 8, cursor: locked ? "default" : "pointer", marginTop: 10,
                           border: t.deliversProducts ? "2px solid #0F766E" : "1.5px solid #E2E8F0",
                           background: t.deliversProducts ? "#F0FDFA" : "#fff", opacity: locked ? 0.6 : 1 }}
                  onClick={() => { if (!locked) onUpdateDeliversProducts(t.id, !t.deliversProducts, produktHeleAftalen); }}>
                  <span style={{ width: 18, height: 18, borderRadius: 5, flexShrink: 0,
                                 border: t.deliversProducts ? "2px solid #0F766E" : "2px solid #CBD5E1",
                                 background: t.deliversProducts ? "#0F766E" : "#fff",
                                 display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {t.deliversProducts && <Check size={11} color="#fff" strokeWidth={3} />}
                  </span>
                  <span style={{ fontSize: 13, color: "#111111" }}>📦 Der udleveres produkter til kunden</span>
                </button>
                {!locked && t.type === "fixed" && (
                  <label style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 6, fontSize: 12, color: "#64748B", cursor: "pointer" }}>
                    <input type="checkbox" checked={produktHeleAftalen} onChange={(e) => setProduktHeleAftalen(e.target.checked)} />
                    Gælder alle opgaver på aftalen, også de kommende
                  </label>
                )}
                <div style={styles.hint}>
                  Uden fluebenet bliver medarbejderen ikke spurgt om produktforbrug ved afslutning.
                  {produktHeleAftalen && t.type === "fixed"
                    ? " Ændringen slår igennem på hele aftalen."
                    : " Ændringen gælder kun denne ene opgave."}
                </div>
              </div>
              {custAccess && (
                <div style={{ ...styles.accessBox, marginTop: 8 }}>
                  <div style={styles.accessTitle}><Lock size={13} /> Adgang</div>
                  <div style={styles.checklistItemDescription}>{custAccess}</div>
                </div>
              )}

              {/* Hvem har set adgangsoplysningerne. Staar her ved siden af selve teksten,
                  saa spoergsmaalet "hvem kender koden til den her adresse" kan besvares
                  paa stedet — det er hele grunden til at der logges. */}
              <div style={{ marginTop: 8 }}>
                {adgangLog === null ? (
                  <button type="button" style={{ ...styles.addSkillBtn, fontSize: 12 }} onClick={hentAdgangLog}>
                    {logHenter ? "Henter…" : "🔍 Vis hvem der har åbnet adgangen"}
                  </button>
                ) : adgangLog.length === 0 ? (
                  <div style={styles.cardMeta}>Ingen har åbnet adgangsoplysningerne på denne opgave.</div>
                ) : (
                  <div style={{ background: "#F8FAFC", borderRadius: 8, padding: "8px 10px" }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 6 }}>
                      Adgang åbnet {adgangLog.length} {adgangLog.length === 1 ? "gang" : "gange"}
                    </div>
                    {adgangLog.map((l) => (
                      <div key={l.id} style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 12, color: "#111111", padding: "3px 0" }}>
                        <span>{employees.find((e) => e.id === l.employee_id)?.name || "Ukendt"}</span>
                        <span style={{ color: "#64748B", flexShrink: 0 }}>
                          {new Date(l.opened_at).toLocaleString("da-DK", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                {logFejl && <div style={{ ...styles.cardMeta, color: "#DC2626" }}>{logFejl}</div>}
              </div>
              {/* Dinero sync-knap — vises kun hvis kunden IKKE allerede vides at
                  findes i Dinero (valgt fra søgning, eller tidligere oprettet der).
                  Er kunden allerede kendt, vises i stedet en simpel bekræftelse. */}
              {!isDone && custName && (
                customerDineroSynced ? (
                  <div style={{ ...styles.addSkillBtn, marginTop: 8, fontSize: 12, color: "#16A34A", borderColor: "#22C55E", background: "#ECFDF5", cursor: "default" }}>
                    ✓ Kunde findes i Dinero
                  </div>
                ) : (
                  <button
                    style={{ ...styles.addSkillBtn, marginTop: 8, fontSize: 12, color: justSyncedFlash ? "#16A34A" : "#4F46E5", borderColor: justSyncedFlash ? "#22C55E" : "#C7D2FE", background: justSyncedFlash ? "#ECFDF5" : "#EEF2FF" }}
                    onClick={syncToDinero}
                    disabled={dineroSyncing}>
                    {justSyncedFlash ? "✓ Sendt til Dinero" : dineroSyncing ? "Sender…" : "🏢 Send til Dinero"}
                  </button>
                )
              )}
            </div>
          ) : (
            <div style={styles.cardMeta}>Ingen kundeoplysninger — klik Rediger for at tilføje</div>
          )
        )}
      </div>
      </div></div><div style={styles.formSection}><div style={{ ...styles.formSectionHead, background: "#EEF2FF" }}><div style={{ ...styles.formSectionTitle, color: "#4F46E5" }}>Udførelse</div><div style={{ ...styles.formSectionHint, color: "#6B63EA" }}>Status, bemanding, tasks og registreret tid</div></div><div style={styles.formSectionBody}>{candidatesFor(t, employees, areas, employeeAreas).candidates.length === 0 && <span style={styles.errorChip}><AlertTriangle size={12} /> Ingen har alle krævede kompetencer</span>}
      {candidatesFor(t, employees, areas, employeeAreas).candidates.length > 0 && t.warning === "overloaded" && <span style={styles.warnChip}><AlertTriangle size={12} /> Ingen ledig kapacitet den dag</span>}

      <label style={styles.label}>Status</label>
      <div style={styles.typePicker}>
        {["unscheduled", "planlagt", "udført"].map((s) => (
          <button key={s} type="button" onClick={() => {
            if (s === "unscheduled") { onUnplace(t.id); onClose(); }
            else onSetStatus(t.id, s);
          }}
            style={t.status === s || (s === "unscheduled" && t.status === "unscheduled") ? { ...styles.typePickBtn, borderColor: statusColor(s), color: statusColor(s), background: "#F8FAFC" } : styles.typePickBtn}>
            {s === "unscheduled" ? "Ikke planlagt" : statusLabel(s)}
          </button>
        ))}
      </div>

      <label style={styles.label}>Medarbejdere på opgaven</label>
      <div style={styles.detailAssigneeList}>
        {assignedEmps.map((e) => (
          <div key={e.id} style={styles.detailAssigneeRow}>
            <span style={{ ...styles.avatar, background: e.color }}>{initials(e.name)}</span>
            <span style={{ flex: 1, fontSize: 13 }}>{e.name}</span>
            {byEmployee[e.id] > 0 && <span style={styles.cardMeta}>{fmtMin(byEmployee[e.id])} registreret</span>}
            {assignedEmps.length > 1 && (
              (t.completedByEmployee || t.completed_by_employee || {})[e.id]
                ? <span style={{ fontSize: 11, color: "#16A34A", fontWeight: 700, whiteSpace: "nowrap" }}>✓ Udført</span>
                : <span style={{ fontSize: 11, color: "#94A3B8", whiteSpace: "nowrap" }}>Ikke afsluttet</span>
            )}
            <button type="button" style={styles.iconBtnGhostInline} onClick={() => onRemoveAssignee(t.id, e.id)} title="Fjern fra opgaven"><X size={13} /></button>
          </div>
        ))}
        {assignedEmps.length === 0 && <div style={styles.cardMeta}>Ingen tildelt endnu</div>}
        {t.templateId && assignedEmps.length === 1 && onSetPreferredEmployee && (() => {
          const aftale = (templates || []).find((x) => x.id === t.templateId);
          const erFast = aftale && aftale.preferredEmployeeId === assignedEmps[0].id;
          if (erFast) return <div style={{ ...styles.cardMeta, color: "#16A34A", marginTop: 6 }}>Fast medarbejder på aftalen</div>;
          return (
            <button type="button" style={{ ...styles.addSkillBtn, marginTop: 6 }}
              title="Gemmer medarbejderen på aftalen og ombytter på alle kommende opgaver"
              onClick={() => onSetPreferredEmployee(t.templateId, assignedEmps[0].id)}>
              Gør {assignedEmps[0].name} fast på aftalen
            </button>
          );
        })()}
        {!t.day && <div style={styles.hint}>Træk opgaven til en dag i ugeplanen for at kunne tildele medarbejdere.</div>}

        {addable.length > 0 && t.day && (
          <div style={{ position: "relative", marginTop: 6 }}>
            <button type="button" style={styles.addSkillBtn} onClick={() => setAddOpen((v) => !v)}><Plus size={13} /> Tilføj medarbejder</button>
            {addOpen && (
              <div style={styles.chipAddMenu}>
                {addable.map((e) => (
                  <button key={e.id} type="button" style={styles.chipAddMenuItem} onClick={() => { onAddAssignee(t.id, e.id); setAddOpen(false); }}>
                    <span style={{ ...styles.chipAvatar, background: e.color }}>{initials(e.name)}</span> {e.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <label style={styles.label}>{(t.checklist?.length > 0) ? "Tasks" : "Tilføj tasks"}</label>

      {/* Existing checklist items */}
      {t.checklist && t.checklist.length > 0 && (
        <div style={styles.instructionsBox}>
          {t.checklist.map((item) => (
            <div key={item.id} style={styles.checklistItemBlock}>
              <button type="button" onClick={() => onToggleChecklistItem(t.id, item.id)} style={styles.checklistItemRow}>
                <span style={item.done ? styles.checkboxDone : styles.checkboxEmpty}>{item.done && <Check size={11} color="#fff" />}</span>
                <span style={{ ...styles.checklistItemText, textDecoration: item.done ? "line-through" : "none", color: item.done ? "#94A3B8" : "#111111" }}>{item.text}</span>
              </button>
              {item.description && <div style={{ ...styles.checklistItemDescription, marginLeft: 25 }}>{item.description}</div>}
              {item.videoUrl && (
                <a href={item.videoUrl} target="_blank" rel="noreferrer" style={{ ...styles.videoBtnSmall, marginLeft: 25 }}>
                  <Video size={11} /> Se video
                </a>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Tilføj fra eksisterende tasklister */}
      {checklistTemplates && checklistTemplates.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <button type="button" style={styles.addSkillBtn} onClick={() => setShowTemplates((v) => !v)}>
            <ListChecks size={13} /> {showTemplates ? "Skjul tasklister" : "Tilføj fra taskliste"}
          </button>
          {showTemplates && (
            <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
              {checklistTemplates.map((cl) => {
                const alreadyAdded = cl.items.every((it) => existingTexts.has(it.text || it));
                return (
                  <div key={cl.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 10px", borderRadius: 8, border: "1px solid #E2E8F0", background: alreadyAdded ? "#F8FAFC" : "#fff" }}>
                    <div>
                      <span style={{ fontSize: 13, fontWeight: 600, color: "#111111" }}>{cl.name}</span>
                      <span style={{ fontSize: 12, color: "#94A3B8", marginLeft: 6 }}>({cl.items.length} tasks)</span>
                    </div>
                    <button
                      type="button"
                      disabled={alreadyAdded}
                      style={{ ...styles.addSkillBtn, opacity: alreadyAdded ? 0.4 : 1 }}
                      onClick={() => { onAddChecklistTemplate(t.id, cl); setShowTemplates(false); }}>
                      {alreadyAdded ? "Tilføjet ✓" : <><Plus size={12} /> Tilføj</>}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Enkelt task */}
      <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
        <input
          style={{ ...styles.input, flex: 1 }}
          value={newItemText}
          onChange={(e) => setNewItemText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") addItem(); }}
          placeholder="Tilføj enkelt task…"
        />
        <button style={styles.primaryBtn} onClick={addItem} disabled={!newItemText.trim()}>Tilføj</button>
      </div>

      {t.videoUrl && (
        <a href={t.videoUrl} target="_blank" rel="noreferrer" style={{ ...styles.videoBtn, marginTop: 10 }}>
          <Video size={14} /> Se instruktionsvideo
        </a>
      )}

      <label style={styles.label}>Tidsregistrering</label>
      <div style={styles.cardMeta}>{fmtMin(totalLogged)} registreret i alt af {fmtMin(t.duration)} planlagt</div></div></div>

      <div style={styles.modalActions}>
        {onCopy && <button style={{ ...styles.secondaryBtn, color: "#9C1B5D", borderColor: "#FCE4EF" }} onClick={() => onCopy(t)}><Copy size={14} /> Kopiér</button>}
        {/* Sletning findes kun paa fleksible/adhoc-opgaver. Faste opgaver kommer fra en
            aftale og skal fjernes ved at markere aftalen som udgaaet, saa planen ikke
            bare genskaber dem. Udfoerte opgaver kan ikke slettes — de kan vaere faktureret. */}
        {isAdminUser && t.type === "adhoc" && t.status !== "udført" && (
          <button style={{ ...styles.secondaryBtn, color: "#B91C1C", borderColor: "#FEE2E2" }}
            onClick={() => {
              if (window.confirm(`Slet "${t.title}" helt? Det kan ikke fortrydes.`)) onDelete(t.id);
            }}><Trash2 size={14} /> Slet</button>
        )}
        <button style={{ ...styles.primaryBtn, marginLeft: "auto" }} onClick={onClose}>Luk</button>
      </div>
    </Modal>
  );
}

function Modal({ title, children, onClose, persistent = false, fullscreen = false }) {
  return (
    <div style={fullscreen ? { ...styles.overlay, background: "rgba(0,0,0,0.1)" } : styles.overlay} onClick={persistent ? undefined : onClose}>
      <div style={fullscreen ? { ...styles.modal, width: "100%", height: "100vh", maxHeight: "100vh", borderRadius: 0, maxWidth: "100%" } : styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.modalHeader}>
          <span style={styles.modalTitle}>{title}</span>
          <button style={styles.iconBtnGhostInline} onClick={onClose}><X size={16} /></button>
        </div>
        <div style={fullscreen ? { ...styles.modalBody, height: "calc(100vh - 60px)", overflowY: "auto" } : styles.modalBody}>{children}</div>
      </div>
    </div>
  );
}

// ---------- Styles ----------
const globalCss = `
  * { box-sizing: border-box; }
  html, body, #root { margin: 0; padding: 0; width: 100%; min-height: 100vh; }
  ::-webkit-scrollbar { width: 8px; height: 8px; }
  ::-webkit-scrollbar-thumb { background: #CBD5E1; border-radius: 8px; }
  @media print {
    body * { visibility: hidden; }
    #print-week-plan, #print-week-plan * { visibility: visible; }
    #print-week-plan { display: block !important; position: absolute; left: 0; top: 0; width: 100%; padding: 20px; }
  }
`;

const styles = {
  app: { fontFamily: "'Inter', -apple-system, system-ui, sans-serif", background: "#FFF6FA", minHeight: "100vh", color: "#111111", display: "flex", flexDirection: "column" },
  header: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 24px", background: "#111111", color: "#fff", flexWrap: "wrap", gap: 12, position: "sticky", top: 0, zIndex: 100 },
  brand: { display: "flex", alignItems: "center", gap: 12 },
  brandMark: { width: 36, height: 36, borderRadius: 10, background: "#D6247A", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 14 },
  brandTitle: { fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, fontSize: 16 },
  brandSub: { fontSize: 12, color: "#E8AFC9" },
  nav: { display: "flex", gap: 6 },
  navBtn: { padding: "8px 14px", borderRadius: 8, border: "none", background: "transparent", color: "#D9A9C0", cursor: "pointer", fontSize: 13.5, fontWeight: 500 },
  navBtnActive: { padding: "8px 14px", borderRadius: 8, border: "none", background: "#D6247A", color: "#fff", cursor: "pointer", fontSize: 13.5, fontWeight: 600 },
  toast: { position: "fixed", top: 16, right: 24, background: "#111111", color: "#fff", padding: "10px 16px", borderRadius: 8, fontSize: 13.5, zIndex: 50, boxShadow: "0 8px 24px rgba(0,0,0,0.2)" },
  page: { padding: "16px 20px 40px", flex: 1 },
  toolbar: { display: "flex", alignItems: "center", gap: 10, marginBottom: 10, flexWrap: "wrap" },
  toolbarSpacer: { flex: 1 },
  primaryBtn: { display: "flex", alignItems: "center", gap: 6, padding: "9px 14px", borderRadius: 8, border: "none", background: "#D6247A", color: "#fff", fontWeight: 600, fontSize: 13.5, cursor: "pointer" },
  secondaryBtn: { display: "flex", alignItems: "center", gap: 6, padding: "9px 14px", borderRadius: 8, border: "1px solid #CBD5E1", background: "#fff", color: "#334155", fontWeight: 500, fontSize: 13.5, cursor: "pointer" },
  legendRow: { marginBottom: 14, fontSize: 12 },
  typeChip: { display: "inline-flex", alignItems: "center", borderRadius: 999, fontWeight: 600, padding: "2px 8px", fontSize: 11 },
  weekNav: { display: "flex", alignItems: "center", gap: 8, background: "#fff", padding: "6px 8px", borderRadius: 10, boxShadow: "0 1px 2px rgba(15,42,40,0.08)" },
  weekNavBtn: { border: "none", background: "#FFF6FA", color: "#111111", borderRadius: 8, padding: 6, cursor: "pointer", display: "flex" },
  weekNavLabel: { fontSize: 13, color: "#334155", minWidth: 190, textAlign: "center" },
  weekNavStrong: { fontWeight: 700, color: "#111111" },
  weekNowTag: { marginLeft: 8, fontSize: 10.5, fontWeight: 700, color: "#D6247A", background: "#FCE4EF", padding: "1px 6px", borderRadius: 999 },
  weekLayout: { display: "flex", gap: 16, alignItems: "flex-start", overflow: "hidden" },
  backlog: { background: "#FCE9F1", borderRadius: 12, padding: 12, width: 240, flexShrink: 0, position: "sticky", top: 0, maxHeight: "calc(100vh - 180px)", overflowY: "auto" },
  backlogTitle: { fontWeight: 700, fontSize: 13, marginBottom: 10, color: "#111111" },
  backlogList: { display: "flex", flexDirection: "column", gap: 8 },
  backlogCard: { background: "#fff", borderRadius: 10, padding: 10, boxShadow: "0 1px 2px rgba(15,42,40,0.08)", cursor: "grab", position: "relative" },
  cardTitle: { fontWeight: 600, fontSize: 12.5, marginTop: 6, lineHeight: 1.3 },
  cardMeta: { fontSize: 11, color: "#64748B", marginTop: 2 },
  errorChip: { display: "flex", alignItems: "center", gap: 4, color: "#B91C1C", fontSize: 11, fontWeight: 600, marginTop: 6 },
  warnChip: { display: "flex", alignItems: "center", gap: 4, color: "#B45309", fontSize: 11, fontWeight: 600, marginTop: 6 },
  gridWrap: { flex: 1, background: "#fff", borderRadius: 12, padding: 10, overflowX: "auto", overflowY: "auto", maxHeight: "calc(100vh - 180px)" },
  gridHeaderRow: { display: "grid", gap: 8, marginBottom: 6 },
  gridHeaderCell: { fontWeight: 700, fontSize: 12.5, color: "#111111", textAlign: "center", padding: "4px 0" },
  gridCornerCell: {},
  gridRow: { display: "grid", gap: 8, marginBottom: 8, alignItems: "start" },
  gridRowLabel: { display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, fontWeight: 600, padding: "8px 4px", borderRight: "1px solid #CBD5E1" },
  gridCell: { background: "#F8FAFC", borderRadius: 0, padding: 6, minHeight: 90, borderTop: "1px solid #FDF3F7", borderBottom: "1px solid #FDF3F7" },
  capBarTrack: { height: 5, background: "#E2E8F0", borderRadius: 4, overflow: "hidden" },
  capBarFill: { height: "100%", borderRadius: 4 },
  capLabel: { fontSize: 10, color: "#94A3B8", margin: "3px 0 6px" },
  // Banner der gør en overbooket dag umulig at overse, og som samtidig fortæller
  // hvor mange opgaver dagen indeholder — ellers kan man ikke se at der ligger
  // flere kort længere nede end skærmen viser.
  overBanner: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6,
    background: "#DC2626", color: "#fff", borderRadius: 6, padding: "3px 7px",
    fontSize: 10, fontWeight: 700, marginBottom: 5, cursor: "help" },
  overBannerCount: { background: "rgba(255,255,255,0.25)", borderRadius: 4, padding: "1px 5px", whiteSpace: "nowrap" },
  taskChip: { display: "flex", flexDirection: "column", justifyContent: "center", gap: 2, minHeight: 60, background: "#fff", border: "1px solid #E2E8F0", borderRadius: 6, padding: "5px 6px", marginBottom: 4, cursor: "pointer", position: "relative" },
  transportChip: { display: "flex", alignItems: "center", gap: 5, fontSize: 10, color: "#64748B", background: "repeating-linear-gradient(45deg, #F1EFE7, #F1EFE7 6px, #E9E6DC 6px, #E9E6DC 12px)", border: "1px dashed #CBD5E1", borderRadius: 6, padding: "4px 6px", marginBottom: 4 },
  chipTopRow: { display: "flex", alignItems: "center", gap: 4, minWidth: 0 },
  chipSubRow: { display: "flex", alignItems: "center", gap: 6, minWidth: 0 },
  taskChipTitle: { fontSize: 11, fontWeight: 600, flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  taskChipCustomer: { fontSize: 10, color: "#9C1B5D", fontWeight: 600, flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  taskChipAddress: { fontSize: 10, color: "#64748B", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", marginTop: 1 },
  taskChipDur: { fontSize: 10, color: "#64748B", flexShrink: 0 },
  statusDot: { width: 6, height: 6, borderRadius: 3, flexShrink: 0 },
  doneCheck: { color: "#16A34A", fontWeight: 800, fontSize: 13, lineHeight: 1, flexShrink: 0 },
  doneNote: { marginTop: 3, fontSize: 10, fontWeight: 700, color: "#15803D", background: "#DCFCE7",
    borderRadius: 5, padding: "2px 6px", display: "inline-block", cursor: "help" },
  chipXBtn: { border: "none", background: "transparent", color: "#94A3B8", cursor: "pointer", padding: 0, display: "flex" },
  chipAssigneeRow: { display: "flex", alignItems: "center", gap: 3, position: "relative", flexWrap: "wrap" },
  chipAvatar: { width: 16, height: 16, borderRadius: "50%", color: "#fff", fontSize: 8, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", border: "none", cursor: "pointer", flexShrink: 0 },
  chipAddBtn: { width: 16, height: 16, borderRadius: "50%", border: "1px dashed #CBD5E1", background: "#fff", color: "#64748B", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0 },
  chipAddMenu: { position: "absolute", top: 20, left: 0, background: "#fff", border: "1px solid #E2E8F0", borderRadius: 8, boxShadow: "0 6px 18px rgba(0,0,0,0.12)", padding: 4, zIndex: 20, minWidth: 140 },
  chipAddMenuItem: { display: "flex", alignItems: "center", gap: 6, width: "100%", border: "none", background: "transparent", padding: "5px 6px", borderRadius: 6, fontSize: 11.5, color: "#334155", cursor: "pointer", textAlign: "left" },
  emptyCol: { textAlign: "center", color: "#94A3B8", fontSize: 12.5, padding: "20px 0" },
  skillTag: { display: "inline-block", background: "#FCE4EF", color: "#9C1B5D", fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 999 },
  skillLevelTag: { display: "inline-flex", alignItems: "center", background: "#FCE4EF", color: "#9C1B5D", fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 999 },
  avatar: { width: 22, height: 22, borderRadius: "50%", color: "#fff", fontSize: 10, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  iconBtnGhost: { border: "none", background: "transparent", color: "#94A3B8", cursor: "pointer", padding: 4, borderRadius: 6, display: "flex", alignItems: "center", position: "absolute", top: 6, right: 6 },
  iconBtnGhostInline: { border: "none", background: "transparent", color: "#94A3B8", cursor: "pointer", padding: 4, borderRadius: 6, display: "flex", alignItems: "center" },
  empGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 14 },
  empCard: { background: "#fff", borderRadius: 12, padding: 14, boxShadow: "0 1px 2px rgba(15,42,40,0.08)" },
  empCardTop: { display: "flex", alignItems: "center", gap: 10, marginBottom: 10 },
  empName: { fontWeight: 600, fontSize: 14 },
  empLoad: { fontSize: 12, color: "#64748B" },
  empSkills: { display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 },
  capRow: { display: "flex", gap: 6, borderTop: "1px solid #FFF6FA", paddingTop: 10 },
  capDayBox: { flex: 1, textAlign: "center" },
  capDayLabel: { fontSize: 10, color: "#94A3B8", fontWeight: 600 },
  capDayValue: { fontSize: 12.5, fontWeight: 700, color: "#111111" },
  statBlock: { display: "flex", alignItems: "center", gap: 8, background: "#fff", padding: "10px 16px", borderRadius: 10, boxShadow: "0 1px 2px rgba(15,42,40,0.08)" },
  statValue: { fontWeight: 700, fontSize: 15 },
  statLabel: { fontSize: 11, color: "#64748B" },
  timeList: { display: "flex", flexDirection: "column", gap: 8 },
  timeRow: { display: "flex", alignItems: "center", gap: 12, background: "#fff", padding: "10px 14px", borderRadius: 10, boxShadow: "0 1px 2px rgba(15,42,40,0.08)" },
  timeRowAvatars: { display: "flex", gap: 2 },
  timeRowTitle: { fontWeight: 600, fontSize: 13.5 },
  timeRowMinutes: { fontSize: 13, fontWeight: 600, color: "#D6247A", width: 100, textAlign: "right" },
  timerBtn: { display: "flex", alignItems: "center", gap: 5, padding: "7px 12px", borderRadius: 8, border: "1px solid #CBD5E1", background: "#fff", color: "#334155", fontSize: 12.5, fontWeight: 600, cursor: "pointer" },
  timerBtnActive: { display: "flex", alignItems: "center", gap: 5, padding: "7px 12px", borderRadius: 8, border: "1px solid #B91C1C", background: "#FEE2E2", color: "#B91C1C", fontSize: 12.5, fontWeight: 600, cursor: "pointer" },
  overlay: { position: "fixed", inset: 0, background: "rgba(15,42,40,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 16 },
  modal: { background: "#fff", borderRadius: 14, width: 460, maxWidth: "100%", maxHeight: "90vh", overflowY: "auto", color: "#111111" },
  modalHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 18px", borderBottom: "1px solid #FFF6FA" },
  modalTitle: { fontWeight: 700, fontSize: 15, fontFamily: "'Space Grotesk', sans-serif" },
  modalBody: { padding: "16px 18px" }, formCol: { maxWidth: 720, margin: "0 auto", textAlign: "left" }, formSection: { border: "1px solid #E2E8F0", borderRadius: 10, overflow: "hidden", marginBottom: 14 }, formSectionHead: { padding: "9px 13px" }, formSectionTitle: { fontSize: 13.5, fontWeight: 700, display: "flex", alignItems: "center", gap: 7 }, formSectionHint: { fontSize: 11.5, marginTop: 2, opacity: 0.9 }, formSectionBody: { padding: 13, background: "#fff", textAlign: "left" },
  modalActions: { display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 14 },
  label: { display: "block", textAlign: "left", fontSize: 12, fontWeight: 600, color: "#475569", marginTop: 12, marginBottom: 5 },
  hint: { fontSize: 11.5, color: "#64748B", marginTop: 4 },
  input: { width: "100%", padding: "9px 10px", borderRadius: 8, border: "1px solid #E2E8F0", fontSize: 13.5, fontFamily: "inherit", background: "#fff", color: "#111111" },
  textarea: { width: "100%", padding: "9px 10px", borderRadius: 8, border: "1px solid #E2E8F0", fontSize: 13, fontFamily: "inherit", background: "#fff", color: "#111111", resize: "vertical" },
  inputSm: { flex: 1, padding: "7px 8px", borderRadius: 8, border: "1px solid #E2E8F0", fontSize: 12.5, fontFamily: "inherit", background: "#fff", color: "#111111" },
  typePicker: { display: "flex", gap: 6 },
  typePickBtn: { flex: 1, padding: "8px 6px", borderRadius: 8, border: "1px solid #E2E8F0", background: "#F8FAFC", color: "#475569", fontSize: 12, fontWeight: 600, cursor: "pointer" },
  skillPicker: { display: "flex", flexWrap: "wrap", gap: 6 },
  skillPickBtn: { padding: "6px 10px", borderRadius: 999, border: "1px solid #E2E8F0", background: "#F8FAFC", color: "#475569", fontSize: 12, cursor: "pointer" },
  skillPickBtnActive: { padding: "6px 10px", borderRadius: 999, border: "1px solid #D6247A", background: "#D6247A", color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer" },
  skillReqRow: { display: "flex", gap: 6, marginBottom: 6, alignItems: "center" },
  addSkillBtn: { display: "flex", alignItems: "center", gap: 4, border: "1px dashed #CBD5E1", background: "transparent", color: "#475569", borderRadius: 8, padding: "6px 10px", fontSize: 12, cursor: "pointer", marginTop: 2 },
  skillLevelGrid: { display: "flex", flexDirection: "column", gap: 6 },
  skillLevelRow: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 },
  skillLevelName: { fontSize: 12.5, fontWeight: 500, color: "#334155", width: 120 },
  levelSeg: { display: "flex", gap: 3 },
  levelBtn: { padding: "5px 9px", borderRadius: 6, border: "1px solid #E2E8F0", background: "#F8FAFC", color: "#64748B", fontSize: 11, cursor: "pointer" },
  levelBtnActive: { padding: "5px 9px", borderRadius: 6, border: "1px solid #D6247A", background: "#D6247A", color: "#fff", fontSize: 11, fontWeight: 600, cursor: "pointer" },
  levelBtnActiveNone: { padding: "5px 9px", borderRadius: 6, border: "1px solid #94A3B8", background: "#E2E8F0", color: "#334155", fontSize: 11, fontWeight: 600, cursor: "pointer" },
  capEditRow: { display: "flex", gap: 6 },

  // Medarbejderliste
  empVaerktoej: { display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 12 },
  empListe: { background: "#fff", borderRadius: 12, boxShadow: "0 1px 3px rgba(0,0,0,0.06)", overflow: "hidden" },
  empRaekke: { display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", cursor: "pointer" },
  empMaerker: { display: "flex", gap: 5, flexWrap: "wrap", justifyContent: "flex-end", flexShrink: 0, maxWidth: 300 },
  empMaerkeRosa: { background: "#FCE4EF", color: "#9C1B5D", borderRadius: 99, padding: "2px 9px", fontSize: 11, fontWeight: 600 },
  empMaerkeGraa: { background: "#F1F5F9", color: "#475569", borderRadius: 99, padding: "2px 9px", fontSize: 11, fontWeight: 600 },
  empMaerkeRoed: { background: "#FEF2F2", color: "#B91C1C", borderRadius: 99, padding: "2px 9px", fontSize: 11, fontWeight: 600 },
  empMaerkeLilla: { background: "#EEF2FF", color: "#4F46E5", borderRadius: 99, padding: "2px 9px", fontSize: 11, fontWeight: 600 },
  // Detaljerne rykkes ind under navnet, saa det er tydeligt hvem de hoerer til.
  empDetaljer: { padding: "0 14px 14px 60px", background: "#F8FAFC" },
  empUnderNavn: { fontSize: 12, color: "#64748B", marginTop: 3 },

  // Redigering af medarbejder, opdelt i afsnit
  empSection: { border: "1px solid #E2E8F0", borderRadius: 12, overflow: "hidden", marginBottom: 14 },
  empSectionHead: { padding: "9px 13px" },
  empSectionTitle: { fontSize: 13, fontWeight: 700 },
  empSectionHint: { fontSize: 12, marginTop: 1, lineHeight: 1.4 },
  empSectionBody: { padding: "12px 13px" },
  empFoldBtn: { background: "none", border: "none", padding: "6px 0", fontSize: 12.5, color: "#0F766E",
    textDecoration: "underline", cursor: "pointer", fontFamily: "inherit", textAlign: "left" },
  empTidFod: { display: "flex", alignItems: "center", justifyContent: "space-between",
    gap: 10, flexWrap: "wrap", marginTop: 8, marginBottom: 4 },
  // Hele feltet er trykflade, ikke bare afkrydsningen. Foer var det en 18 px firkant.
  empTjek: { display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left",
    padding: "11px 12px", borderRadius: 10, border: "1.5px solid #E2E8F0", background: "#fff",
    cursor: "pointer", fontFamily: "inherit", marginTop: 10 },
  empTjekAktivGroen: { display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left",
    padding: "11px 12px", borderRadius: 10, border: "2px solid #16A34A", background: "#F0FDF4",
    cursor: "pointer", fontFamily: "inherit", marginTop: 10 },
  empTjekAktivRoed: { display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left",
    padding: "11px 12px", borderRadius: 10, border: "2px solid #DC2626", background: "#FEF2F2",
    cursor: "pointer", fontFamily: "inherit" },
  empTjekFirkant: { width: 18, height: 18, borderRadius: 5, border: "2px solid #CBD5E1", background: "#fff", flexShrink: 0 },
  empTjekFirkantGroen: { width: 18, height: 18, borderRadius: 5, border: "2px solid #16A34A", background: "#16A34A",
    display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  empTjekFirkantRoed: { width: 18, height: 18, borderRadius: 5, border: "2px solid #DC2626", background: "#DC2626",
    display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  empAdminBoks: { border: "1px solid #FCA5A5", borderRadius: 12, padding: 12, marginBottom: 14 },
  empAdminAdvarsel: { fontSize: 12, color: "#B91C1C", lineHeight: 1.5, marginTop: 8 },
  capEditBox: { flex: 1, textAlign: "center" },
  capInput: { width: "100%", textAlign: "center", padding: "6px 4px", borderRadius: 6, border: "1px solid #E2E8F0", fontSize: 12.5, marginTop: 3 },

  detailMetaRow: { display: "flex", gap: 6, alignItems: "center", marginBottom: 4 },
  detailAssigneeList: { display: "flex", flexDirection: "column", gap: 4 },
  detailAssigneeRow: { display: "flex", alignItems: "center", gap: 8, padding: "4px 0" },
  customerBox: { background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: 10, padding: 10, marginTop: 8 },
  customerName: { fontSize: 13, fontWeight: 700, color: "#111111", marginBottom: 2 },
  accessBox: { background: "#FCE4EF", borderRadius: 10, padding: 10, marginTop: 8 },
  accessTitle: { display: "flex", alignItems: "center", gap: 5, fontSize: 11.5, fontWeight: 700, color: "#9C1B5D", marginBottom: 4 },

  phoneWrap: { display: "flex", justifyContent: "center" },
  phoneScreen: { width: 380, maxWidth: "100%", background: "#fff", borderRadius: 22, boxShadow: "0 10px 30px rgba(15,42,40,0.15)", padding: 14, border: "1px solid #E2E8F0" },
  phoneHeader: { display: "flex", alignItems: "center", gap: 8, color: "#111111" },
  phoneEmpSelect: { flex: 1, padding: "8px 10px", borderRadius: 10, border: "1px solid #E2E8F0", background: "#F8FAFC", fontSize: 14, fontWeight: 600 },
  phoneSub: { fontSize: 11.5, color: "#94A3B8", margin: "4px 0 10px" },
  phoneDayRow: { display: "flex", gap: 4, marginBottom: 12 },
  phoneDayBtn: { flex: 1, padding: "7px 0", borderRadius: 8, border: "1px solid #E2E8F0", background: "#F8FAFC", color: "#475569", fontSize: 11.5, fontWeight: 600, cursor: "pointer" },
  phoneDayBtnActive: { flex: 1, padding: "7px 0", borderRadius: 8, border: "1px solid #D6247A", background: "#D6247A", color: "#fff", fontSize: 11.5, fontWeight: 700, cursor: "pointer" },
  phoneList: { display: "flex", flexDirection: "column", gap: 10, maxHeight: 560, overflowY: "auto" },
  phoneCard: { border: "1px solid #E2E8F0", borderRadius: 14, padding: 10, background: "#FFFFFF" },
  phoneTransportCard: { display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, color: "#64748B", background: "#F1EFE7", border: "1px dashed #CBD5E1", borderRadius: 10, padding: "8px 10px" },
  phoneCardTop: { display: "flex", alignItems: "center", gap: 8, cursor: "pointer" },
  phoneAddressRow: { display: "flex", alignItems: "flex-start", gap: 6, background: "#F8FAFC", borderRadius: 8, padding: "6px 8px", marginTop: 6 },
  phoneCustomerName: { fontSize: 11.5, fontWeight: 700, color: "#111111" },
  navigateBtn: { display: "flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 700, color: "#fff", background: "#D6247A", borderRadius: 7, padding: "5px 8px", textDecoration: "none", flexShrink: 0, whiteSpace: "nowrap" },
  phoneCardBody: { marginTop: 8, paddingTop: 8, borderTop: "1px dashed #E2E8F0" },
  phoneCardFooter: { display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8, paddingTop: 8, borderTop: "1px dashed #E2E8F0" },
  phoneTimeLogged: { display: "flex", alignItems: "center", gap: 4, fontSize: 11.5, color: "#64748B" },
  instructionsBox: { background: "#FCE4EF", borderRadius: 10, padding: 10, marginBottom: 8 },
  instructionsTitle: { display: "flex", alignItems: "center", gap: 5, fontSize: 11.5, fontWeight: 700, color: "#9C1B5D", marginBottom: 4 },
  instructionsText: { fontSize: 12.5, color: "#111111", whiteSpace: "pre-line", lineHeight: 1.5 },
  videoBtn: { display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 600, color: "#111111", background: "#FCE4EF", borderRadius: 8, padding: "8px 10px", textDecoration: "none", width: "fit-content" },
  doneBtn: { display: "flex", alignItems: "center", gap: 5, padding: "7px 10px", borderRadius: 8, border: "1px solid #CBD5E1", background: "#fff", color: "#334155", fontSize: 11.5, fontWeight: 600, cursor: "pointer" },
  doneBtnActive: { display: "flex", alignItems: "center", gap: 5, padding: "7px 10px", borderRadius: 8, border: "1px solid #111111", background: "#EDEDED", color: "#111111", fontSize: 11.5, fontWeight: 700, cursor: "pointer" },

  extraItemRow: { display: "flex", gap: 6, marginTop: 6 },
  previewBox: { background: "#FCE4EF", borderRadius: 10, padding: 10, marginTop: 10 },
  previewItemRow: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "3px 0" },
  previewItemText: { fontSize: 12, color: "#111111" },
  checklistPreviewList: { margin: "8px 0 0", paddingLeft: 18 },
  checklistPreviewItem: { fontSize: 12, color: "#475569", marginBottom: 3 },
  checklistItemRow: { display: "flex", alignItems: "center", gap: 8, width: "100%", border: "none", background: "transparent", padding: "5px 0", cursor: "pointer", textAlign: "left" },
  checkboxEmpty: { width: 17, height: 17, borderRadius: 5, border: "1.5px solid #CBD5E1", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" },
  checkboxDone: { width: 17, height: 17, borderRadius: 5, border: "1.5px solid #111111", background: "#111111", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" },
  checklistItemText: { fontSize: 12.5, lineHeight: 1.4 },

  checklistEditRow: { display: "flex", alignItems: "flex-start", gap: 6, padding: "6px 0", borderBottom: "1px solid #FFF6FA" },
  itemFlags: { display: "flex", gap: 4, marginTop: 2 },
  itemFlagTag: { display: "inline-flex", alignItems: "center", gap: 2, fontSize: 10, color: "#D6247A", background: "#FCE4EF", borderRadius: 999, padding: "1px 6px" },
  itemDraftBox: { background: "#F8FAFC", border: "1px dashed #CBD5E1", borderRadius: 10, padding: 10, marginTop: 10, display: "flex", flexDirection: "column", gap: 6 },
  itemDraftTitle: { fontSize: 11.5, fontWeight: 700, color: "#475569" },
  itemDraftActions: { display: "flex", justifyContent: "flex-end", gap: 6, marginTop: 2 },
  checklistItemBlock: { borderBottom: "1px solid #FCE4EF", paddingBottom: 4, marginBottom: 2 },
  checklistItemExtra: { marginLeft: 25, marginBottom: 4 },
  checklistItemDescription: { fontSize: 11.5, color: "#64748B", fontStyle: "italic", marginBottom: 4, lineHeight: 1.4 },
  videoBtnSmall: { display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 600, color: "#111111", background: "#FCE4EF", borderRadius: 6, padding: "4px 8px", textDecoration: "none" },
};

