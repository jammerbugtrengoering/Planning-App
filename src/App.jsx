import React, { useState, useMemo, useEffect, useCallback } from "react";
import { supabase } from "./supabaseClient";
import {
  Plus, Download, X, Clock, Play, Square, AlertTriangle,
  Trash2, Pencil, Repeat, Zap, CalendarClock, Wand2, Star, ChevronLeft, ChevronRight,
  ClipboardList, Video, CheckCircle2, LogIn, ListChecks, Check, Lock, Navigation, Building2, Car, Copy,
  Thermometer, Palmtree,
} from "lucide-react";

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
  adhoc: { label: "Ad hoc", icon: Zap, color: "#B45309", bg: "#FEF3C7" },
  flexible: { label: "Fleksibel", icon: CalendarClock, color: "#111111", bg: "#EDEDED" },
  sygdom: { label: "Sygdom", icon: Thermometer, color: "#B91C1C", bg: "#FEE2E2" },
  ferie: { label: "Ferie", icon: Palmtree, color: "#0E7490", bg: "#CFFAFE" },
};
// Bruges til at afgøre om en instans er en blokering (sygdom/ferie) i stedet for
// en rigtig rengøringsopgave — blokeringer skal ikke tælle med i fakturagrundlag,
// rapportering osv., og skal forhindre auto-planlægning af den pågældende medarbejder.
const BLOCK_TYPES = ["sygdom", "ferie"];

function uid(p) { return p + Math.random().toString(36).slice(2, 9); }
function initials(name) { return name.split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase(); }
function fmtMin(min) {
  const h = Math.floor(min / 60), m = Math.round(min % 60);
  return h > 0 ? `${h}t${m > 0 ? " " + m + "m" : ""}` : `${m}m`;
}
function defaultCapacity() { return { Mon: 480, Tue: 480, Wed: 480, Thu: 480, Fri: 480 }; }
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
// returneres DAYS.length, så der ikke findes nogen gyldig dag tilbage.
function earliestAllowedDayIndex(week, year) {
  const monday = mondayOfWeek(week, year);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.round((today - monday) / 86400000);
  if (diffDays <= 0) return 0;
  if (diffDays >= DAYS.length) return DAYS.length;
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
function checklistProgress(t) {
  const items = t.checklist || [];
  return { done: items.filter((i) => i.done).length, total: items.length };
}
function itemText(x) { return typeof x === "string" ? x : x.text; }

// ---------- Seed data ----------
const seedEmployees = [
  { id: "e1", name: "Mette Holm", skills: { Gulvvask: 3, Sanitær: 2 }, color: "#D6247A", capacity: defaultCapacity() },
  { id: "e2", name: "Jonas Berg", skills: { Vinduespolering: 3, Højtryk: 2 }, color: "#111111", capacity: { ...defaultCapacity(), Fri: 240 } },
  { id: "e3", name: "Aisha Rahman", skills: { Sanitær: 3, Køkkenhygiejne: 3, Gulvvask: 1 }, color: "#9C1B5D", capacity: defaultCapacity() },
  { id: "e4", name: "Lars Kjær", skills: { Tæpperens: 2, Gulvvask: 2 }, color: "#5B5B60", capacity: { ...defaultCapacity(), Mon: 300, Tue: 300 } },
];

const seedTemplates = [
  { id: "tpl1", title: "Kontor 3. sal – gulvvask", requiredSkills: [rs("Gulvvask")], duration: 90, days: ["Mon", "Thu"],
    checklistItems: seedChecklistTemplates[0].items, videoUrl: "https://example.com/videoer/gulvvask-kontor",
    customerName: "Nordkraft A/S", address: "Nordkraftvej 12, 9000 Aalborg", poNumber: "PO-2026-0311",
    accessInstructions: "Nøgleboks ved hovedindgang, kode 4471. Alarm slås fra på panel i receptionen (kode 8899)." },
  { id: "tpl2", title: "Toiletter stue", requiredSkills: [rs("Sanitær", 2)], duration: 60, days: ["Mon", "Wed", "Fri"],
    checklistItems: seedChecklistTemplates[1].items, videoUrl: "https://example.com/videoer/sanitaer-rutine",
    customerName: "Nordkraft A/S", address: "Nordkraftvej 12, 9000 Aalborg", poNumber: "PO-2026-0311",
    accessInstructions: "Nøgleboks ved hovedindgang, kode 4471. Alarm slås fra på panel i receptionen (kode 8899)." },
];

const seedAdhocFlex = [
  { id: "i6", title: "Spildt kaffe – mødesal", requiredSkills: [rs("Gulvvask")], duration: 30, type: "adhoc", day: "Wed", week: 0, assignees: [], status: "unscheduled", timeLog: [],
    checklist: instantiateChecklist(["Optag spild med papir", "Vask efter med gulvsæbe", "Sæt advarselsskilt indtil gulvet er tørt"]), videoUrl: "",
    customerName: "Nordkraft A/S", address: "Nordkraftvej 12, 9000 Aalborg", poNumber: "PO-2026-0311", accessInstructions: "Nøgleboks ved hovedindgang, kode 4471." },
  { id: "i7", title: "Facadevinduer syd", requiredSkills: [rs("Vinduespolering")], duration: 180, type: "flexible", day: null, deadline: "Fri", week: 0, assignees: [], status: "unscheduled", timeLog: [],
    checklist: instantiateChecklist(seedChecklistTemplates[3].items), videoUrl: "https://example.com/videoer/facadevask",
    customerName: "Vesterhavsgade Erhvervspark", address: "Vesterhavsgade 88, 9800 Hjørring", poNumber: "PO-2026-0298", accessInstructions: "Ring til ejendomsservice på 98 12 34 56 for adgang til facadestillads." },
  { id: "i8", title: "Kantine dybderens", requiredSkills: [rs("Køkkenhygiejne", 2), rs("Sanitær")], duration: 150, type: "flexible", day: null, deadline: "Thu", week: 0, assignees: [], status: "unscheduled", timeLog: [],
    checklist: instantiateChecklist(seedChecklistTemplates[2].items), videoUrl: "https://example.com/videoer/kantine-dybderens",
    customerName: "Vesterhavsgade Erhvervspark", address: "Vesterhavsgade 88, 9800 Hjørring", poNumber: "PO-2026-0299", accessInstructions: "Nøgle afhentes hos vagten i stueetagen mod legitimation." },
  { id: "i9", title: "P-plads højtryksspuling", requiredSkills: [rs("Højtryk")], duration: 120, type: "flexible", day: null, deadline: "Fri", week: 0, assignees: [], status: "unscheduled", timeLog: [],
    checklist: instantiateChecklist(["Brug min. 150 bar", "Start i fjerneste hjørne mod afløb", "Brug øreværn og skridsikre støvler"]), videoUrl: "",
    customerName: "Vesterhavsgade Erhvervspark", address: "Vesterhavsgade 88, 9800 Hjørring", poNumber: "PO-2026-0298", accessInstructions: "" },
];

// ---------- Scheduling engine (operates on ONE week's instances) ----------
function usedMinutes(list, empId, day) {
  return list.filter((t) => t.assignees.includes(empId) && t.day === day).reduce((s, t) => s + t.duration, 0);
}
function remaining(employees, list, empId, day) {
  const emp = employees.find((e) => e.id === empId);
  return (emp?.capacity?.[day] ?? 0) - usedMinutes(list, empId, day);
}
function scheduleWeek(weekInstances, employees, autoOnly = false, areas = [], employeeAreas = [], restrictToIds = null) {
  let list = weekInstances.map((t) => ({ ...t }));

  // En medarbejder må aldrig auto-planlægges på en dag hvor de har en
  // sygdom/ferie-blokering liggende — uanset om de i øvrigt har ledig kapacitet.
  function isBlocked(empId, day) {
    return list.some((t2) => BLOCK_TYPES.includes(t2.type) && (t2.assignees || []).includes(empId) && t2.day === day);
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
    const candidates = allCandidates.filter((e) => !isBlocked(e.id, t.day));
    if (candidates.length === 0) { t.warning = "no_skill"; return; }
    const ranked = [...candidates].sort((a, b) => {
      const diff = skillScore(b, t) - skillScore(a, t);
      if (diff !== 0) return diff;
      return remaining(employees, list, b.id, t.day) - remaining(employees, list, a.id, t.day);
    });
    const withRoom = ranked.find((c) => remaining(employees, list, c.id, t.day) >= t.duration);
    const pick = withRoom || ranked[0];
    t.assignees = [pick.id];
    t.status = "planlagt";
    t.warning = withRoom ? null : "overloaded";
    if (outsideArea) t.outsideArea = true; // Markér som planlagt uden for område
  });

  list.forEach((t) => {
    if ((t.assignees && t.assignees.length) || (t.type !== "flexible" && !t._forceWindow)) return;
    if (autoOnly && !t.includeInAuto) return;
    if (restrictToIds && !restrictToIds.has(t.id)) return;
    // _forceWindow (array af dag-nøgler) styrer et forsinket-opgave-genoptag:
    // søg kun blandt de dage, der er angivet (typisk i dag og frem), i stedet
    // for det normale deadline-vindue for rigtige fleksible opgaver.
    const deadlineIdx = DAYS.findIndex((d) => d.key === (t.deadline || "Fri"));
    const window = t._forceWindow ? DAYS.filter((d) => t._forceWindow.includes(d.key)) : DAYS.slice(0, deadlineIdx + 1);
    const { candidates, outsideArea } = candidatesFor(t, employees, areas, employeeAreas);
    if (candidates.length === 0) { t.warning = "no_skill"; return; }
    let best = null;
    window.forEach((d) => {
      candidates.forEach((e) => {
        if (isBlocked(e.id, d.key)) return;
        const rem = remaining(employees, list, e.id, d.key);
        const fits = rem >= t.duration ? 1 : 0;
        const score = fits * 1_000_000 + skillScore(e, t) * 1000 + rem;
        if (!best || score > best.score) best = { day: d.key, empId: e.id, rem, score };
      });
    });
    if (!best) { t.warning = "no_skill"; return; }
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

function ensureWeekInstances(week, year, allInstances, templates, employees) {
  let list = [...allInstances];
  // Mandagen i den uge vi arbejder med — bruges til korrekte dato-sammenligninger
  // med kontraktens start-/udløbsdato, i stedet for at sammenligne rå ugenumre
  // (som giver forkerte svar når start/udløb ligger i et andet år).
  const weekMonday = mondayOfWeek(week, year);
  // Holder styr på hvilke instanser der bliver oprettet i netop dette kald, så
  // auto-planlægning bagefter KUN rører disse — og aldrig instanser der allerede
  // fandtes (uanset om de er tildelt eller bevidst sat til "ikke tildelt" af
  // planlæggeren). Uden dette ville en opgave, man har fjernet medarbejdere fra,
  // blive auto-tildelt igen næste gang ugen genindlæses/besøges.
  const newlyCreatedIds = new Set();
  templates.forEach((tpl) => {
    if (!tpl.days || tpl.days.length === 0) return;
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
    tpl.days.forEach((day) => {
      const exists = list.some((i) => i.templateId === tpl.id && i.week === week && i.year === year && i.day === day);
      if (!exists) {
        const newInst = {
          id: uid("i"), templateId: tpl.id, title: tpl.title, requiredSkills: tpl.requiredSkills,
          duration: tpl.duration, type: "fixed", day, week, year, assignees: [], status: "unscheduled", timeLog: [],
          checklist: instantiateChecklist(tpl.checklistItems || []), videoUrl: tpl.videoUrl || "",
          customerName: tpl.customerName || "", address: tpl.address || "", poNumber: tpl.poNumber || "",
          accessInstructions: tpl.accessInstructions || "",
          templateDays: tpl.days, // for off-schedule detection
          contractType: tpl.contractType || "privat",
          expiryDate: tpl.expiryDate || null,
          dineroSynced: tpl.dineroSynced ?? false,
        };
        list.push(newInst);
        newlyCreatedIds.add(newInst.id);
      }
    });
  });
  const thisWeek = list.filter((i) => i.week === week && i.year === year);
  const others = list.filter((i) => !(i.week === week && i.year === year));
  // Auto-planlæg kun instanser der er helt nyoprettede i dette kald.
  return [...others, ...scheduleWeek(thisWeek, employees, false, [], [], newlyCreatedIds)];
}

function statusLabel(s) { return { unscheduled: "Ubemandet", planlagt: "Planlagt", udført: "Udført" }[s] || s; }

// ---------- Transport / travel time between service orders ----------
// NOTE: This is an estimate, not a real routing calculation. This prototype has no
// live map/routing API access (that would need a backend + API key, e.g. Google
// Distance Matrix or Mapbox), so travel time between two different addresses uses a
// configurable default (or a manually entered override for a specific address pair)
// rather than an actual driving-time lookup.
function travelKey(a, b) { return [a, b].sort().join(" || "); }
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
function computeDaySchedule(dayTasks, travelSettings) {
  let cursor = parseTimeToMinutes(travelSettings.dayStart);
  const segments = [];
  dayTasks.forEach((t, idx) => {
    if (idx > 0) {
      const prev = dayTasks[idx - 1];
      const travel = getTravelMinutes(prev.address, t.address, travelSettings);
      if (travel > 0) {
        segments.push({ type: "transport", minutes: travel, start: cursor, end: cursor + travel, key: `${prev.id}->${t.id}` });
        cursor += travel;
      }
    }
    segments.push({ type: "task", task: t, start: cursor, end: cursor + t.duration });
    cursor += t.duration;
  });
  return segments;
}
function dayTransportMinutes(dayTasks, travelSettings) {
  return computeDaySchedule(dayTasks, travelSettings).filter((s) => s.type === "transport").reduce((sum, s) => sum + s.minutes, 0);
}
function cycleStatus(s) { return { planlagt: "udført", udført: "planlagt", unscheduled: "planlagt" }[s] || "planlagt"; }
function statusColor(s) { return { planlagt: "#9C1B5D", udført: "#111111", unscheduled: "#94A3B8" }[s]; }

export default function App() {
  // ── Auth ──
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session); setAuthLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setSession(session); setAuthLoading(false);
    });
    return () => subscription.unsubscribe();
  }, []);

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

  if (authLoading) {
    return <div style={{ display:"flex",alignItems:"center",justifyContent:"center",height:"100svh",color:"#9C1B5D",fontFamily:"system-ui",fontSize:15 }}>Indlæser…</div>;
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
        </div>
      </div>
    );
  }

  return <PlanningApp session={session} onSignOut={() => supabase.auth.signOut()} />;
}

function PlanningApp({ session, onSignOut }) {
  const [lang, setLang] = useState(() => localStorage.getItem("rp_lang") || "da");
  useEffect(() => { localStorage.setItem("rp_lang", lang); }, [lang]);

  const L = {
    da: { schedule:"Ugeplan", employees:"Medarbejdere", checklists:"Tjeklister", time:"Tid & Eksport", inventory:"Lager", contracts:"Aftaler", reports:"Rapportering", signOut:"Log ud", sub:"Ugeplanlægning · kapacitet · kompetenceniveauer" },
    en: { schedule:"Schedule", employees:"Employees", checklists:"Checklists", time:"Time & Export", inventory:"Inventory", contracts:"Contracts", reports:"Reporting", signOut:"Sign out", sub:"Weekly planning · capacity · skill levels" },
  }[lang];
  // ── Dynamiske master-data fra Supabase ──
  const [skills, setSkills] = useState(SKILLS_FALLBACK);
  const [customers, setCustomers] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [areas, setAreas] = useState([]);
  const [employeeAreas, setEmployeeAreas] = useState([]);
  const [pricing, setPricing] = useState({ privat: 450, nexus: 380, aeldrelov: 410 }); // [{employee_id, area_id}]
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
  const [showAddBlock, setShowAddBlock] = useState(false);
  const [copyPayload, setCopyPayload] = useState(null);
  const [showAddEmp, setShowAddEmp] = useState(false);
  const [editEmp, setEditEmp] = useState(null);
  const [toast, setToast] = useState(null);
  const [running, setRunning] = useState({});
  const [dragId, setDragId] = useState(null);
  const [openTaskId, setOpenTaskId] = useState(null);
  const [showTravelSettings, setShowTravelSettings] = useState(false);

  function notify(msg) { setToast(msg); setTimeout(() => setToast(null), 2800); }

  // ── Supabase: load alt ved opstart ──
  useEffect(() => {
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
        supabase.from("instances").select("*"),
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
        setEmployees(empMapped);
      }

      // Checklist-skabeloner – saml items ind
      if (clData?.length) {
        const mapped = clData.map((cl) => ({
          id: cl.id, name: cl.name,
          items: (clItemsData || []).filter((i) => i.checklist_template_id === cl.id)
            .map((i) => ({ text: i.text, description: i.description, videoUrl: i.video_url })),
        }));
        setChecklistTemplates(mapped);
      }

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
            videoUrl: t.video_url, poNumber: t.po_number,
            customerName: t.customer_name || cust?.name || "",
            address: t.address_text || cust?.address || "",
            accessInstructions: t.access_instructions || cust?.access_instructions || "",
            contractType: t.contract_type || "privat",
            dineroSynced: t.dinero_synced ?? false,
            checklistItems: [],
            startDate: t.start_date || null,
            expiryDate: t.expiry_date || null,
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
            accessInstructions: (i.access_instructions || cust?.access_instructions) ?? "",
            contractType: i.contract_type || "privat",
            invoiceReady: i.invoice_ready ?? false,
            dineroExported: i.dinero_exported ?? false,
            startDate: i.start_date || null,
            expiryDate: i.expiry_date || null,
            blockGroupId: i.block_group_id || null,
            dineroSynced: i.dinero_synced ?? false,
            includeInAuto: i.include_in_auto ?? false,
            offSchedule: i.off_schedule ?? false,
            onSchedule: i.on_schedule ?? false,
          };
        });
        const allInst = ensureWeekInstances(currentWeek, currentYear, existingInst, mapped, empMapped);
        setInstances(allInst);
        syncHealedAssignments(existingInst, allInst);
      } else if (instData?.length) {
        setInstances(instData.map((i) => ({
          ...i, timeLog: i.time_log ?? [], requiredSkills: i.required_skills ?? [],
          templateId: i.template_id ?? null,
          contractType: i.contract_type || "privat",
          invoiceReady: i.invoice_ready ?? false,
          dineroExported: i.dinero_exported ?? false,
          startDate: i.start_date || null,
          expiryDate: i.expiry_date || null,
          blockGroupId: i.block_group_id || null,
          dineroSynced: i.dinero_synced ?? false,
          includeInAuto: i.include_in_auto ?? false,
          offSchedule: i.off_schedule ?? false,
          onSchedule: i.on_schedule ?? false,
        })));
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

  // ── Supabase: sync-helpers ──
  const syncEmployee = useCallback(async (emp) => {
    const { data: skillRows_db } = await supabase.from("skills").select("id, name");
    await supabase.from("employees").upsert({ id: emp.id, name: emp.name, color: emp.color, is_admin: emp.isAdmin ?? false }, { onConflict: "id" });
    await supabase.from("employee_skills").delete().eq("employee_id", emp.id);
    const skillRows = Object.entries(emp.skills || {})
      .map(([name, level]) => {
        const match = skillRows_db?.find((s) => s.name === name);
        return match ? { employee_id: emp.id, skill_id: match.id, level } : null;
      }).filter(Boolean);
    if (skillRows.length) await supabase.from("employee_skills").insert(skillRows);
    const capRows = Object.entries(emp.capacity || {}).map(([weekday, minutes]) => ({ employee_id: emp.id, weekday, minutes }));
    if (capRows.length) await supabase.from("employee_capacity").upsert(capRows, { onConflict: "employee_id,weekday" });
    // Also ensure capacity rows exist for all days
    const missingDays = ["Mon","Tue","Wed","Thu","Fri"].filter(d => !(emp.capacity || {})[d]);
    if (missingDays.length) {
      await supabase.from("employee_capacity").upsert(
        missingDays.map(weekday => ({ employee_id: emp.id, weekday, minutes: 480 })),
        { onConflict: "employee_id,weekday" }
      );
    }
  }, []);

  const removeEmployee = useCallback(async (id) => {
    await supabase.from("employees").delete().eq("id", id);
  }, []);

  const syncInstance = useCallback(async (inst) => {
    const { error } = await supabase.from("instances").upsert({
      id: inst.id, template_id: inst.templateId ?? null, title: inst.title,
      type: inst.type, week: inst.week, year: inst.year ?? null, day: inst.day ?? null,
      deadline: inst.deadline ?? null, duration: inst.duration,
      status: inst.status ?? "unscheduled", video_url: inst.videoUrl ?? "",
      customer_id: null, po_number: inst.poNumber ?? "",
      warning: inst.warning ?? null,
      assignees: inst.assignees ?? [],
      checklist: inst.checklist ?? [],
      time_log: inst.timeLog ?? [],
      required_skills: inst.requiredSkills ?? [],
      customer_name: inst.customerName ?? "",
      address_text: inst.address ?? "",
      access_instructions: inst.accessInstructions ?? "",
      contract_type: inst.contractType ?? "privat",
      invoice_ready: inst.invoiceReady ?? false,
      dinero_exported: inst.dineroExported ?? false,
      start_date: inst.startDate || null,
      expiry_date: inst.expiryDate || null,
      block_group_id: inst.blockGroupId || null,
      dinero_synced: inst.dineroSynced ?? false,
      include_in_auto: inst.includeInAuto ?? false,
      off_schedule: inst.offSchedule ?? false,
      on_schedule: inst.onSchedule ?? false,
    }, { onConflict: "id" });
    if (error) console.error("syncInstance error:", error.message, error.details, inst.id);
  }, []);

  const removeInstance = useCallback(async (id) => {
    await supabase.from("instances").delete().eq("id", id);
  }, []);

  // Persisterer kunde-/kontraktfelter direkte på en "Fast interval"-skabelon, så
  // ændringer også slår igennem på de instanser der først materialiseres i fremtiden
  // (uden dette ville nye ugers opgaver blive genskabt med tomme kundefelter igen).
  const syncTemplateFields = useCallback(async (tplId, fields) => {
    if (!tplId) return;
    const payload = {};
    if ("customerName" in fields) payload.customer_name = fields.customerName ?? "";
    if ("address" in fields) payload.address_text = fields.address ?? "";
    if ("accessInstructions" in fields) payload.access_instructions = fields.accessInstructions ?? "";
    if ("contractType" in fields) payload.contract_type = fields.contractType ?? "privat";
    if ("dineroSynced" in fields) payload.dinero_synced = !!fields.dineroSynced;
    if (Object.keys(payload).length === 0) return;
    const { error } = await supabase.from("service_templates").update(payload).eq("id", tplId);
    if (error) console.error("syncTemplateFields error:", error.message);
  }, []);

  const syncChecklistTemplate = useCallback(async (cl) => {
    await supabase.from("checklist_templates").upsert({ id: cl.id, name: cl.name }, { onConflict: "id" });
    await supabase.from("checklist_template_items").delete().eq("checklist_template_id", cl.id);
    const rows = (cl.items || []).map((it, i) => ({
      checklist_template_id: cl.id, sort_order: i,
      text: it.text, description: it.description || "", video_url: it.videoUrl || "",
    }));
    if (rows.length) await supabase.from("checklist_template_items").insert(rows);
  }, []);

  const removeChecklistTemplate = useCallback(async (id) => {
    await supabase.from("checklist_templates").delete().eq("id", id);
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
      if (prev && JSON.stringify(prev.assignees || []) !== JSON.stringify(t.assignees || [])) {
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
      const next = ensureWeekInstances(nextWeek, nextYear, cur, templates, employees);
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
      const forceWindowKeys = DAYS.slice(earliestAllowedDayIndex(weekOffset, weekYear)).map((d) => d.key);
      const overdueForRun = overdueCandidates.map((t) => ({ ...t, _forceWindow: forceWindowKeys }));

      const others = prev.filter((t) => !(t.week === weekOffset && t.year === weekYear) && !overdueIds.has(t.id));

      const before = [...thisWeek, ...overdueForRun].filter((t) => !(t.assignees && t.assignees.length)).length;
      const scheduledBatch = scheduleWeek([...thisWeek, ...overdueForRun], employees, true, areas, employeeAreas); // kun markerede
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
        const after = scheduleWeek(thisWeek, employees, true, areas, employeeAreas);
        const still = after.filter((t) => !(t.assignees && t.assignees.length)).length;
        totalBefore += before;
        totalStill += still;
        result = [...others, ...after];
      });
      notify(totalBefore - totalStill > 0 ? `${totalBefore - totalStill} opgave(r) planlagt automatisk på tværs af alle uger` : "Ingen markerede opgaver til planlægning");
      return result;
    });
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
        duration: payload.duration, days: payload.days, checklistItems: checklistItemsCombined,
        videoUrl: payload.videoUrl, customerName: payload.customerName, address: payload.address,
        poNumber: payload.poNumber, accessInstructions: payload.accessInstructions,
        contractType: payload.contractType, expiryDate: payload.expiryDate,
        startDate: payload.startDate || null, dineroSynced: payload.dineroSynced || false,
      };
      const { error: tplErr } = await supabase.from("service_templates").insert({
        id: tplId, title: tpl.title, duration: tpl.duration, days: tpl.days,
        video_url: tpl.videoUrl || "", po_number: tpl.poNumber || "",
        customer_name: tpl.customerName || "", address_text: tpl.address || "",
        access_instructions: tpl.accessInstructions || "", contract_type: tpl.contractType || "privat",
        dinero_synced: tpl.dineroSynced,
        start_date: payload.startDate || null,
        expiry_date: payload.expiryDate || null,
      });
      if (tplErr) console.error("service_templates insert error:", tplErr.message);
      const { data: skillsDb } = await supabase.from("skills").select("id,name");
      const skillRows = (payload.requiredSkills || []).map((r) => {
        const sk = skillsDb?.find((s) => s.name === r.skill);
        return sk ? { template_id: tplId, skill_id: sk.id, min_level: r.minLevel } : null;
      }).filter(Boolean);
      if (skillRows.length) await supabase.from("service_template_skills").insert(skillRows);

      setTemplates((prevT) => {
        const nextT = [...prevT, tpl];
        setInstances((cur) => {
          const weeks = weeksUntilExpiry(payload.expiryDate, payload.startDate);
          let next = [...cur];
          weeks.forEach(({ week: wk, year: wy }) => {
            const before = next;
            const expanded = ensureWeekInstances(wk, wy, next, nextT, employees);
            const newOnes = expanded.filter((i) => !next.find((c) => c.id === i.id));
            newOnes.forEach((inst) => syncInstance({ ...inst, contractType: payload.contractType, expiryDate: payload.expiryDate }));
            syncHealedAssignments(before, expanded);
            next = expanded;
          });
          return next;
        });
        return nextT;
      });
    } else {
      const adhocWeekInfo = payload.adhocDate ? isoWeekInfo(new Date(payload.adhocDate)) : { week: weekOffset, year: weekYear };
      const adhocWeek = adhocWeekInfo.week;
      const adhocYear = adhocWeekInfo.year;

      if (payload.type === "flexible" && payload.expiryDate) {
        // Create one flexible instance per week until expiry
        const weeks = weeksUntilExpiry(payload.expiryDate, null);
        const newInstances = weeks.map(({ week: wk, year: wy }) => ({
          id: uid("i"), title: payload.title, requiredSkills: payload.requiredSkills,
          duration: payload.duration, assignees: [], status: "unscheduled", timeLog: [],
          week: wk, year: wy, checklist: instantiateChecklist(checklistItemsCombined),
          videoUrl: payload.videoUrl, customerName: payload.customerName,
          address: payload.address, poNumber: payload.poNumber, accessInstructions: payload.accessInstructions,
          type: "flexible", day: null, deadline: payload.deadline,
          contractType: payload.contractType, expiryDate: payload.expiryDate,
          dineroSynced: payload.dineroSynced || false,
        }));
        setInstances((prev) => {
          let next = [...prev];
          newInstances.forEach((inst) => {
            const thisWeek = [...next.filter((t) => t.week === inst.week && t.year === inst.year), inst];
            const others = next.filter((t) => !(t.week === inst.week && t.year === inst.year));
            const scheduled = scheduleWeek(thisWeek, employees, false, areas, employeeAreas);
            scheduled.forEach(syncInstance);
            next = [...others, ...scheduled];
          });
          return next;
        });
      } else {
        const base = {
          id: uid("i"), title: payload.title, requiredSkills: payload.requiredSkills,
          duration: payload.duration, assignees: [], status: "unscheduled", timeLog: [],
          week: adhocWeek, year: adhocYear, checklist: instantiateChecklist(checklistItemsCombined),
          videoUrl: payload.videoUrl, customerName: payload.customerName,
          address: payload.address, poNumber: payload.poNumber, accessInstructions: payload.accessInstructions,
          contractType: payload.contractType, dineroSynced: payload.dineroSynced || false,
        };
        const newInstance = payload.type === "adhoc"
          ? { ...base, type: "adhoc", day: payload.day }
          : { ...base, type: "flexible", day: null, deadline: payload.deadline };
        setInstances((prev) => {
          const thisWeek = [...prev.filter((t) => t.week === adhocWeek && t.year === adhocYear), newInstance];
          const others = prev.filter((t) => !(t.week === adhocWeek && t.year === adhocYear));
          const scheduled = scheduleWeek(thisWeek, employees, false, areas, employeeAreas);
          scheduled.forEach(syncInstance);
          return [...others, ...scheduled];
        });
      }
    }
    setShowAddTask(false);
  }

  function updateInstance(taskId, updater) {
    setInstances((prev) => prev.map((t) => {
      if (t.id !== taskId) return t;
      const updated = updater(t);
      syncInstance(updated);
      return updated;
    }));
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
      const dayLabel = DAYS.find((d) => d.key === day)?.label || day;
      const agreedLabels = agreedDays.map((k) => DAYS.find((d) => d.key === k)?.label || k).join(", ");
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
        ? { ...t, assignees: [], day: t.type === "flexible" ? null : t.day, status: "unscheduled" }
        : { ...t, assignees: nextAssignees };
    });
  }
  function unplace(taskId) {
    updateInstance(taskId, (t) => ({
      ...t,
      day: t.type === "flexible" ? null : t.day,
      assignees: [],
      status: "unscheduled",
      offSchedule: false,
      onSchedule: false,
      outsideArea: false,
      warning: null,
    }));
  }
  function deleteTask(taskId) {
    setInstances((prev) => prev.filter((t) => t.id !== taskId));
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
        if (dow !== 0 && dow !== 6) {
          const { week, year } = isoWeekInfo(cursor);
          const dayKey = DAY_KEYS_BY_DOW[dow];
          // Sørg for at ugen er materialiseret (faste opgaver oprettet), så vi kan
          // fjerne medarbejderen fra evt. opgaver den allerede har den dag.
          list = ensureWeekInstances(week, year, list, templates, employees);
          list = list.map((t) => {
            if (BLOCK_TYPES.includes(t.type)) return t;
            if (t.week !== week || t.year !== year || t.day !== dayKey) return t;
            if (!(t.assignees || []).includes(employeeId)) return t;
            const nextAssignees = t.assignees.filter((id) => id !== employeeId);
            const updated = nextAssignees.length === 0
              ? { ...t, assignees: [], day: t.type === "flexible" ? null : t.day, status: "unscheduled" }
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

  function dateOfBlockInstance(t) {
    const monday = mondayOfWeek(t.week, t.year);
    const dayIdx = DAYS.findIndex((d) => d.key === t.day);
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
    await supabase.from("budgets").upsert(row, { onConflict: "id" });
  }
  function bumpStatus(taskId) {
    updateInstance(taskId, (t) => ({ ...t, status: cycleStatus(t.status) }));
  }
  function setTaskStatus(taskId, status) {
    updateInstance(taskId, (t) => ({ ...t, status }));
  }
  function toggleChecklistItem(taskId, itemId) {
    updateInstance(taskId, (t) => ({
      ...t, checklist: (t.checklist || []).map((i) => (i.id === itemId ? { ...i, done: !i.done } : i)),
    }));
  }
  function saveChecklistTemplate(tpl) {
    setChecklistTemplates((prev) => {
      const exists = prev.some((c) => c.id === tpl.id);
      return exists ? prev.map((c) => (c.id === tpl.id ? tpl : c)) : [...prev, tpl];
    });
    syncChecklistTemplate(tpl);
  }
  function deleteChecklistTemplate(id) {
    setChecklistTemplates((prev) => prev.filter((c) => c.id !== id));
    removeChecklistTemplate(id);
  }

  function saveEmployee(emp) {
    setEmployees((prev) => {
      const exists = prev.some((e) => e.id === emp.id);
      const next = exists ? prev.map((e) => (e.id === emp.id ? emp : e)) : [...prev, emp];
      // Ingen automatisk omfordeling ved ændring af medarbejder
      return next;
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
    const rows = [["Uge", "Dag", "Opgave", "Kunde", "Adresse", "PO-nummer", "Type", "Kontrakttype", "Medarbejdere", "Status", "Planlagt (min)", "Planlagt (timer)", "Registreret (min)", "Registreret (timer)"]];
    toExport.forEach((t) => {
      const names = (t.assignees || []).map((id) => employees.find((e) => e.id === id)?.name).filter(Boolean);
      const tl = t.timeLog || t.time_log || [];
      const logged = tl.reduce((s, l) => s + (l.minutes || 0), 0);
      rows.push([
        `Uge ${t.week}`,
        DAYS.find((d) => d.key === t.day)?.label || "—",
        t.title,
        t.customerName || "",
        t.address || "",
        t.poNumber || "",
        TYPE_META[t.type]?.label || t.type,
        t.contractType === "nexus" ? "Nexus" : t.contractType === "aeldrelov" ? "Ældrelov" : "Privat",
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

  async function exportToDinero(filteredInstances, label) {
    // Ekskluderer altid opgaver der allerede er markeret som sendt til Dinero –
    // uanset visningsfiltre i UI'et – så samme linje aldrig kan overføres to gange.
    const toExport = (filteredInstances || instances.filter((t) => t.assignees && t.assignees.length))
      .filter((t) => t.invoiceReady)
      .filter((t) => !t.dineroExported);
    if (toExport.length === 0) {
      notify("Ingen nye opgaver klar til Dinero (allerede sendt eller intet fakturagrundlag)");
      return;
    }

    const missingCustomer = toExport.filter((t) => !t.customerName || !t.customerName.trim());
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
      (missingCustomer.length ? `\n\n⚠️ ${missingCustomer.length} opgave(r) uden kundenavn springes over (fx "${missingCustomer[0].title}").` : "");

    if (!window.confirm(confirmMsg)) return;

    const dayLabelOf = (t) => DAYS.find((d) => d.key === t.day)?.label || t.day || "—";
    const today = new Date().toISOString().slice(0, 10);

    const results = { success: [], notFound: [], ambiguous: [], error: [] };

    for (const customerName of customerNames) {
      const tasks = groups[customerName];
      const lines = tasks.map((t) => {
        const logged = (t.timeLog || t.time_log || []).reduce((s, l) => s + (l.minutes || 0), 0);
        const minutes = logged > 0 ? logged : t.duration;
        const hours = Math.round((minutes / 60) * 100) / 100;
        const rate = pricing[t.contractType || "privat"] || 0;
        return {
          description: `${t.title} (Uge ${t.week}, ${dayLabelOf(t)})${t.poNumber ? ` — PO: ${t.poNumber}` : ""}`,
          quantity: hours,
          unitPrice: rate,
          unit: "hours",
        };
      });

      try {
        const { data, error } = await supabase.functions.invoke("dinero", {
          body: {
            action: "createInvoiceDraft",
            customerName,
            date: today,
            invoiceDescription: `Faktura ${label}`,
            lines,
          },
        });
        if (error) {
          results.error.push({ customerName, message: error.message || String(error) });
          continue;
        }
        if (data?.error === "not_found") {
          results.notFound.push({ customerName });
        } else if (data?.error === "ambiguous") {
          results.ambiguous.push({ customerName, matches: data.matches || [] });
        } else if (data?.error) {
          results.error.push({ customerName, message: data.error });
        } else if (data?.Guid) {
          results.success.push({ customerName, guid: data.Guid });
          // Markér alle opgaver i denne gruppe som sendt til Dinero, så de ikke kan eksporteres igen.
          tasks.forEach((t) => updateInstance(t.id, (old) => ({ ...old, dineroExported: true })));
        } else {
          results.error.push({ customerName, message: "Uventet svar fra Dinero" });
        }
      } catch (err) {
        results.error.push({ customerName, message: err.message || String(err) });
      }
    }

    const parts = [];
    if (results.success.length) parts.push(`✅ ${results.success.length} fakturakladde(r) oprettet: ${results.success.map((r) => r.customerName).join(", ")}`);
    if (results.notFound.length) parts.push(`❌ Kunde ikke fundet i Dinero: ${results.notFound.map((r) => r.customerName).join(", ")}`);
    if (results.ambiguous.length) parts.push(`⚠️ Flere match i Dinero (ret kundenavn): ${results.ambiguous.map((r) => `${r.customerName} (${r.matches.join(" / ")})`).join(", ")}`);
    if (results.error.length) parts.push(`⚠️ Fejl: ${results.error.map((r) => `${r.customerName}: ${r.message}`).join("; ")}`);

    notify(results.success.length ? "Fakturakladder oprettet i Dinero" : "Eksport til Dinero afsluttet med fejl");
    if (parts.length) window.alert(parts.join("\n\n"));
  }

  // Er den aktuelt loggede planlægger/bruger administrator? Matcher login-email mod
  // medarbejderens app_email. Hvis loginnet ikke er koblet til en medarbejder (fx ejerens
  // egen konto), betragtes det som administrator.
  const currentEmployeeForAuth = employees.find(
    (e) => e.app_email && session?.user?.email && e.app_email.toLowerCase() === session.user.email.toLowerCase()
  );
  const isAdminUser = !currentEmployeeForAuth || !!currentEmployeeForAuth.isAdmin;

  const currentIsoWeek = isoWeekInfo(new Date());
  const weekInstancesList = instances.filter((t) => t.week === weekOffset && t.year === weekYear);
  // Ikke-tildelte opgaver skal være tilgængelige uanset hvilken uge man kigger på —
  // ikke kun i den uge de oprindeligt hørte til. Så en opgave man har taget ud kan
  // ses og placeres i en hvilken som helst uge, fx hvis den skal rykkes til næste uge.
  const unplaced = instances
    .filter((t) => !(t.assignees && t.assignees.length))
    .sort((a, b) => {
      if (a.week !== b.week) return a.week - b.week;
      const aDay = a.day ? DAYS.findIndex((d) => d.key === a.day) : 99;
      const bDay = b.day ? DAYS.findIndex((d) => d.key === b.day) : 99;
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
          {[["uge", L.schedule], ["employees", L.employees], ["checklists", L.checklists], ["time", L.time], ["inventory", L.inventory], ["contracts", L.contracts], ["reports", L.reports]].map(([k, l]) => (
            <button key={k} onClick={() => setView(k)} style={view === k ? styles.navBtnActive : styles.navBtn}>{l}</button>
          ))}
          <div style={{ display:"flex", gap:4, marginLeft:12, borderLeft:"1px solid #333", paddingLeft:12 }}>
            <button onClick={() => setLang("da")} style={{ fontSize:20, background:"none", border:"none", cursor:"pointer", opacity: lang==="da" ? 1 : 0.35, padding:"2px 4px", borderRadius:6 }}>🇩🇰</button>
            <button onClick={() => setLang("en")} style={{ fontSize:20, background:"none", border:"none", cursor:"pointer", opacity: lang==="en" ? 1 : 0.35, padding:"2px 4px", borderRadius:6 }}>🇬🇧</button>
          </div>
          <a
            href={`https://translate.google.com/translate?sl=da&tl=en&u=${encodeURIComponent(window.location.href)}`}
            target="_blank" rel="noreferrer"
            style={{ fontSize:13, color:"#94A3B8", textDecoration:"none", padding:"4px 8px", borderRadius:6, border:"1px solid #333", marginLeft:4 }}
            title="Oversæt siden til engelsk via Google Translate">
            🌐 Oversæt
          </a>
          <button onClick={onSignOut} style={{ ...styles.navBtn, marginLeft: 4, color: "#E8AFC9", borderLeft: "1px solid #333", paddingLeft:12 }}>{L.signOut}</button>
        </nav>
      </header>

      {toast && <div style={styles.toast}>{toast}</div>}

      {view === "uge" && (
        <WeekView
          employees={employees} instances={weekInstancesList} unplaced={unplaced}
          onAdd={() => setShowAddTask(true)} onAuto={runAuto} onAutoAllWeeks={runAutoAllWeeks}
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
        />
      )}
      {view === "employees" && (
        <EmployeesView employees={employees} instances={weekInstancesList}
          onAdd={() => { setEditEmp(null); setShowAddEmp(true); }}
          onEdit={(e) => { setEditEmp(e); setShowAddEmp(true); }}
          onDelete={deleteEmployee}
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
        <TimeView instances={instances} employees={employees}
          onExportToDinero={exportToDinero} totalLogged={totalLogged} weekLabel={wk.label}
          isAdminUser={isAdminUser}
          pricing={pricing} onPricingChange={async (newPricing) => {
            setPricing(newPricing);
            for (const [type, rate] of Object.entries(newPricing)) {
              await supabase.from("pricing").upsert({ id: `price_${type}`, contract_type: type, hourly_rate: rate }, { onConflict: "id" });
            }
          }}
          onUpdateInstance={(taskId, fields) => updateInstance(taskId, (t) => ({ ...t, ...fields }))}
          onOpenTask={setOpenTaskId} />
      )}

      {view === "contracts" && (
        <ContractsView templates={templates} instances={instances} />
      )}

      {view === "reports" && (
        <ReportsView instances={instances} pricing={pricing} budgets={budgets} onSaveBudget={saveBudget} isAdminUser={isAdminUser} />
      )}

      {view === "inventory" && (
        <InventoryView supabase={supabase} employees={employees} />
      )}

      {view === "skills" && (
        <SkillsView supabase={supabase} skills={skills} onSkillsChange={setSkills} />
      )}

      {showAddTask && <TaskModal onClose={() => { setShowAddTask(false); setCopyPayload(null); }} onSave={addTask} checklistTemplates={checklistTemplates} skills={skills} copyFrom={copyPayload} />}
      {showAddEmp && <EmployeeModal emp={editEmp} onClose={() => { setShowAddEmp(false); setEditEmp(null); }} onSave={saveEmployee} skills={skills} />}
      {showAddBlock && <BlockModal employees={employees} onClose={() => setShowAddBlock(false)} onSave={addBlock} />}
      {showTravelSettings && (
        <TravelSettingsModal
          settings={travelSettings}
          onClose={() => setShowTravelSettings(false)}
          onSave={(s) => { setTravelSettings(s); setShowTravelSettings(false); }}
        />
      )}
      {openTaskId && (
        <TaskDetailModal
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
          }))}
          onAddChecklistTemplate={(taskId, cl) => updateInstance(taskId, (t) => {
            const existingTexts = new Set((t.checklist || []).map((i) => i.text));
            const newItems = (cl.items || [])
              .filter((it) => !existingTexts.has(it.text || it))
              .map((it) => ({ id: uid("ck"), text: it.text || it, description: it.description || "", videoUrl: it.videoUrl || "", done: false }));
            return { ...t, checklist: [...(t.checklist || []), ...newItems] };
          })}
          onUpdateCustomer={(taskId, fields) => updateInstance(taskId, (t) => ({ ...t, ...fields }))}
          onUpdateCustomerInfo={updateCustomerInfo}
          onUpdateContractType={updateContractType}
          onUpdateSkills={(taskId, newSkills) => updateInstance(taskId, (t) => ({ ...t, requiredSkills: newSkills }))}
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
  const schedule = computeDaySchedule(myTasks, travelSettings);

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
            {DAYS.map((d) => (
              <button key={d.key} style={d.key === day ? styles.phoneDayBtnActive : styles.phoneDayBtn} onClick={() => setDay(d.key)}>{d.label.slice(0, 3)}</button>
            ))}
          </div>

          <div style={styles.phoneList}>
            {myTasks.length === 0 && <div style={styles.emptyCol}>{emp ? `${emp.name} har ingen opgaver ${DAYS.find((d) => d.key === day)?.label.toLowerCase()}` : "Vælg medarbejder"}</div>}
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
function WeekView({ employees, instances, unplaced, onAdd, onAuto, onAutoAllWeeks, onPlace, onUnplace, onRemoveAssignee, onDelete, onOpenTask, onToggleInclude, onEditEmp, dragId, setDragId, weekLabel, weekNo, weekOffset, weekYear, onPrevWeek, onNextWeek, onTodayWeek, travelSettings, onOpenTravelSettings, currentIsoWeek, areas, employeeAreas, onOpenAddBlock }) {
  const [addMenuTaskId, setAddMenuTaskId] = useState(null);
  const [showWeekend, setShowWeekend] = useState(false);
  const [capView, setCapView] = useState("bar");
  const [selectedAreaId, setSelectedAreaId] = useState("all"); // "all" eller area.id
  const visibleDays = showWeekend ? ALL_DAYS : DAYS;

  // Filtrer medarbejdere baseret på valgt område
  const visibleEmployees = selectedAreaId === "all"
    ? employees
    : employees.filter((e) => employeeAreas.some((ea) => ea.employee_id === e.id && ea.area_id === selectedAreaId));

  return (
    <div style={styles.page}>
      <div style={styles.toolbar}>
        <button style={styles.primaryBtn} onClick={onAdd}><Plus size={16} /> Ny opgave</button>
        <button style={styles.secondaryBtn} onClick={onAuto}><Wand2 size={16} /> Planlæg ugen automatisk</button>
        <button style={styles.secondaryBtn} onClick={onAutoAllWeeks} title="Kør automatisk planlægning for alle uger, ikke kun den du kigger på lige nu"><Wand2 size={16} /> Planlæg alle uger</button>
        <button style={styles.secondaryBtn} onClick={onOpenTravelSettings}><Car size={16} /> Transporttid</button>
        <button style={{ ...styles.secondaryBtn, color: "#B91C1C", borderColor: "#FECACA" }} onClick={onOpenAddBlock}><Thermometer size={16} /> Sygdom/Ferie</button>
        <button
          style={{ ...styles.secondaryBtn, ...(showWeekend ? { background: "#FCE4EF", color: "#D6247A", borderColor: "#D6247A" } : {}) }}
          onClick={() => setShowWeekend((v) => !v)}
          title="Vis/skjul weekend">
          {showWeekend ? "Man–Søn ✓" : "Man–Fre"}
        </button>
        <button
          style={{ ...styles.secondaryBtn, ...(capView === "detail" ? { background: "#EEF2FF", color: "#4F46E5", borderColor: "#4F46E5" } : {}) }}
          onClick={() => setCapView((v) => v === "bar" ? "detail" : "bar")}
          title="Skift kapacitetsvisning">
          {capView === "detail" ? "📊 Belægning" : "📊 Belægning"}
        </button>
        {areas && areas.length > 0 && (
          <select
            style={{ ...styles.inputSm, fontSize: 13, color: selectedAreaId !== "all" ? "#4F46E5" : "#111111", borderColor: selectedAreaId !== "all" ? "#4F46E5" : "#E2E8F0", background: selectedAreaId !== "all" ? "#EEF2FF" : "#fff", fontWeight: selectedAreaId !== "all" ? 700 : 400 }}
            value={selectedAreaId}
            onChange={(e) => setSelectedAreaId(e.target.value)}>
            <option value="all">📍 Alle medarbejdere</option>
            {areas.map((a) => <option key={a.id} value={a.id}>📍 {a.name}</option>)}
          </select>
        )}
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
        {Object.entries(TYPE_META).map(([k, m]) => (
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
          <div style={styles.backlogTitle}>Ikke tildelt ({unplaced.length})</div>
          {unplaced.length === 0 && <div style={styles.emptyCol}>Alt er planlagt 🎉</div>}
          <div style={styles.backlogList}>
            {unplaced.map((t) => {
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
                <div style={styles.cardMeta}>Uge {t.week}{t.day ? ` · ${DAYS.find((d) => d.key === t.day)?.label}` : ""} · {skillLabel(t)} · {fmtMin(t.duration)}{t.deadline ? ` · senest ${DAYS.find((d) => d.key === t.deadline)?.label}` : ""}</div>
                {liveNoSkill && <span style={styles.errorChip}><AlertTriangle size={12} /> Ingen har alle krævede kompetencer</span>}
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
          <div style={{ display: "grid", gridTemplateColumns: `160px repeat(${visibleDays.length}, 1fr)`, gap: 8, minWidth: 700 }}>
            <div style={styles.gridCornerCell} />
            {visibleDays.map((d, i) => (
              <div key={d.key} style={{ ...styles.gridHeaderCell, borderRight: i < visibleDays.length - 1 ? "1px solid #CBD5E1" : "none", ...(["Sat","Sun"].includes(d.key) ? { background: "#F8FAFC", color: "#94A3B8" } : {}) }}>{d.label}</div>
            ))}

            {visibleEmployees.map((emp) => (
              <React.Fragment key={emp.id}>
                <div style={{ ...styles.gridRowLabel, cursor: "pointer" }} onClick={() => onEditEmp && onEditEmp(emp)} title={`Rediger ${emp.name}`}>
                  <span style={{ ...styles.avatar, background: emp.color }}>{initials(emp.name)}</span>
                  <span style={{ textDecoration: "underline dotted", textUnderlineOffset: 3 }}>{emp.name}</span>
                </div>
                {visibleDays.map((d, i) => {
                  const dayTasks = instances.filter((t) => (t.assignees || []).includes(emp.id) && t.day === d.key);
                  const schedule = computeDaySchedule(dayTasks, travelSettings);
                  const transportMin = schedule.filter((s) => s.type === "transport").reduce((s2, seg) => s2 + seg.minutes, 0);
                  const used = dayTasks.reduce((s, t) => s + t.duration, 0) + transportMin;
                  const cap = emp.capacity[d.key] || 0;
                  const pct = cap ? Math.min((used / cap) * 100, 100) : 0;
                  const over = used > cap;
                  return (
                    <div key={d.key} style={{ ...styles.gridCell, borderRight: i < visibleDays.length - 1 ? "1px solid #CBD5E1" : "none", ...(["Sat","Sun"].includes(d.key) ? { background: "#FAFAFA" } : {}) }}
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
                              const dayLabel = DAYS.find((x) => x.key === d.key)?.label || d.key;
                              const agreedLabels = agreedDays.map((k) => DAYS.find((x) => x.key === k)?.label || k).join(", ");
                              const ok = window.confirm(`Denne faste opgave er aftalt til: ${agreedLabels}.\n\nEr du sikker på at du vil planlægge den på ${dayLabel} — uden for aftalen?`);
                              if (!ok) { setDragId(null); return; }
                            }
                          }
                          onPlace(dragId, d.key, emp.id);
                        }
                        setDragId(null);
                      }}>
                      <div style={styles.capBarTrack}>
                        <div style={{ ...styles.capBarFill, width: `${pct}%`, background: over ? "#DC2626" : pct > 80 ? "#D97706" : "#D6247A" }} />
                      </div>
                      {capView === "bar" ? (
                        <div style={styles.capLabel}>{fmtMin(used)} / {fmtMin(cap)}{transportMin > 0 ? ` (inkl. ${fmtMin(transportMin)} transport)` : ""}</div>
                      ) : (
                        <div style={{ fontSize: 10, margin: "3px 0 6px", display: "flex", gap: 6, flexWrap: "wrap" }}>
                          <span style={{ color: over ? "#DC2626" : pct > 80 ? "#D97706" : "#64748B", fontWeight: 600 }}>
                            {Math.round(pct)}% belægt
                          </span>
                          <span style={{ color: over ? "#DC2626" : "#16A34A", fontWeight: 600 }}>
                            {over ? `${fmtMin(used - cap)} over` : `${fmtMin(cap - used)} ledig`}
                          </span>
                        </div>
                      )}
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
                        return (
                          <div key={t.id} draggable onDragStart={() => setDragId(t.id)}
                            style={{ ...styles.taskChip, ...(t.offSchedule ? { borderLeft: "3px solid #F59E0B" } : t.onSchedule ? { borderLeft: "3px solid #22C55E" } : {}), ...(t.outsideArea ? { borderTop: "2px solid #7C3AED" } : {}) }}
                            onClick={() => onOpenTask(t.id)} title="Klik for at åbne serviceordren">
                            <div style={styles.chipTopRow}>
                              <TypeBadge type={t.type} mini />
                              <span style={styles.taskChipTitle}>{seg.start != null ? `${fmtClock(seg.start)} · ` : ""}{t.title}</span>
                              {t.offSchedule && <span title="Planlagt uden for aftale" style={{ fontSize: 12, marginLeft: 2 }}>⚠️</span>}
                              {t.onSchedule && !t.offSchedule && <span title="Planlagt på aftalt dag" style={{ fontSize: 12, marginLeft: 2 }}>✓</span>}
                              {t.outsideArea && <span title="Planlagt uden for medarbejderens område" style={{ fontSize: 12, marginLeft: 2 }}>📍⚠️</span>}
                              <span style={{ ...styles.statusDot, background: statusColor(t.status) }} />
                              <button style={styles.chipXBtn} title="Fjern fra board" onClick={(e) => { e.stopPropagation(); onUnplace(t.id); }}><X size={11} /></button>
                            </div>
                            <div style={styles.chipSubRow}>
                              {t.customerName && <span style={styles.taskChipCustomer}>{t.customerName}</span>}
                              {prog.total > 0 && <span style={styles.taskChipDur}>{prog.done}/{prog.total}</span>}
                              <span style={styles.taskChipDur}>{fmtMin(t.duration)}</span>
                            </div>
                            {t.address && <div style={styles.taskChipAddress}>📍 {t.address}</div>}
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
      {capView === "detail" && (
        <div style={{ marginTop: 12, background: "#F8FAFC", borderRadius: 10, padding: "10px 14px" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#475569", marginBottom: 8 }}>📊 Ugebelægning{selectedAreaId !== "all" && areas ? ` — ${areas.find((a) => a.id === selectedAreaId)?.name}` : " — alle medarbejdere"}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {visibleEmployees.map((emp) => {
              const totalUsed = visibleDays.reduce((s, d) => {
                const dayTasks = instances.filter((t) => (t.assignees || []).includes(emp.id) && t.day === d.key);
                return s + dayTasks.reduce((s2, t) => s2 + t.duration, 0);
              }, 0);
              const totalCap = visibleDays.reduce((s, d) => s + (emp.capacity[d.key] || 0), 0);
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
function EmployeesView({ employees, instances, onAdd, onEdit, onDelete, supabase, skills, onSkillsChange, areas, employeeAreas, onAreasChange, onEmployeeAreasChange }) {
  const [showSkillsPanel, setShowSkillsPanel] = useState(false);
  const [showAreasPanel, setShowAreasPanel] = useState(false);
  const [inviteEmail, setInviteEmail] = useState({});
  const [inviteStatus, setInviteStatus] = useState({});
  const [orderPanel, setOrderPanel] = useState(null); // emp.id
  const [empProducts, setEmpProducts] = useState([]); // medarbejderprodukter
  const [empOrders, setEmpOrders] = useState({}); // { empId: [transactions] }
  const [orderQty, setOrderQty] = useState({}); // { itemId: qty }
  const [ordering, setOrdering] = useState(false);

  // Load medarbejderprodukter én gang
  useEffect(() => {
    async function loadProducts() {
      const { data: cats } = await supabase.from("inventory_categories").select("id").eq("type", "medarbejder");
      if (!cats?.length) return;
      const { data } = await supabase
        .from("inventory_items")
        .select("*, inventory_categories(name, icon)")
        .in("category_id", cats.map((c) => c.id))
        .order("name");
      setEmpProducts(data || []);
    }
    loadProducts();
  }, []);

  async function openOrderPanel(emp) {
    setOrderPanel(emp.id);
    setOrderQty({});
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

  async function submitOrder(emp) {
    const entries = Object.entries(orderQty).filter(([, q]) => Number(q) > 0);
    if (!entries.length) return;
    setOrdering(true);
    for (const [itemId, qty] of entries) {
      const amount = Number(qty);
      const item = empProducts.find((i) => i.id === itemId);
      if (!item) continue;
      await supabase.from("inventory_transactions").insert({
        item_id: itemId, quantity: -amount, type: "out",
        reason: `Udleveret til ${emp.name}`,
        employee_id: emp.id,
      });
      await supabase.from("inventory_items").update({ stock: Math.max(0, item.stock - amount) }).eq("id", itemId);
      setEmpProducts((prev) => prev.map((p) => p.id === itemId ? { ...p, stock: Math.max(0, p.stock - amount) } : p));
    }
    // Opdatér historik
    const { data } = await supabase
      .from("inventory_transactions")
      .select("*, inventory_items(name, unit)")
      .eq("employee_id", emp.id).eq("type", "out")
      .order("id", { ascending: false }).limit(20);
    setEmpOrders((prev) => ({ ...prev, [emp.id]: data || [] }));
    setOrderQty({});
    setOrdering(false);
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
      await supabase.from("employees").update({ auth_user_id: userId, app_email: email }).eq("id", emp.id);
      emp.auth_user_id = userId;
      emp.app_email = email;
    }

    setInviteStatus((prev) => ({ ...prev, [emp.id]: "sent" }));
    setInviteEmail((prev) => ({ ...prev, [emp.id]: "" }));
  }

  async function deactivateUser(emp) {
    if (!window.confirm(`Luk adgang for ${emp.name}? De kan ikke længere logge ind på medarbejder-appen.`)) return;
    setInviteStatus((prev) => ({ ...prev, [emp.id]: "deactivating" }));
    await supabase.from("employees").update({ auth_user_id: null }).eq("id", emp.id);
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
      <div style={styles.empGrid}>
        {employees.map((e) => {
          const activeMin = DAYS.reduce((s, d) => s + usedMinutes(instances, e.id, d.key), 0);
          const capMin = DAYS.reduce((s, d) => s + (e.capacity[d.key] || 0), 0);
          const status = inviteStatus[e.id];
          const hasUser = !!e.auth_user_id;
          return (
            <div key={e.id} style={styles.empCard}>
              <div style={styles.empCardTop}>
                <span style={{ ...styles.avatar, background: e.color, width: 40, height: 40, fontSize: 15 }}>{initials(e.name)}</span>
                <div style={{ flex: 1 }}>
                  <div style={styles.empName}>{e.name}</div>
                  <div style={styles.empLoad}>{fmtMin(activeMin)} af {fmtMin(capMin)} planlagt denne uge</div>
                </div>
                <button style={styles.iconBtnGhostInline} onClick={() => onEdit(e)} title="Rediger medarbejder"><Pencil size={14} /></button>
                <button style={styles.iconBtnGhostInline} onClick={() => onDelete(e.id)} title="Slet medarbejder"><Trash2 size={14} /></button>
              </div>
              <div style={styles.empSkills}>
                {Object.entries(e.skills).map(([s, lvl]) => (
                  <span key={s} style={styles.skillLevelTag}>{s} <StarLevel level={lvl} /></span>
                ))}
                {Object.keys(e.skills).length === 0 && <span style={styles.cardMeta}>Ingen kompetencer angivet</span>}
              </div>
              <div style={styles.capRow}>
                {DAYS.map((d) => (
                  <div key={d.key} style={styles.capDayBox}>
                    <div style={styles.capDayLabel}>{d.label.slice(0, 3)}</div>
                    <div style={styles.capDayValue}>{(e.capacity[d.key] / 60).toFixed(1)}t</div>
                  </div>
                ))}
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

  return (
    <Modal onClose={onClose} title={checklist ? "Rediger tjekliste" : "Ny tjekliste"} persistent>
      <label style={styles.label}>Navn</label>
      <input style={styles.input} value={name} onChange={(e) => setName(e.target.value)} placeholder="F.eks. Gulvvask – standard" />

      <label style={styles.label}>Tasks ({items.length})</label>
      {items.map((it, i) => (
        <div key={i} style={styles.checklistEditRow}>
          <div style={{ flex: 1 }}>
            <div style={styles.previewItemText}>{i + 1}. {it.text}</div>
            <div style={styles.itemFlags}>
              {it.description && <span style={styles.itemFlagTag}><ClipboardList size={10} /> Beskrivelse</span>}
              {it.videoUrl && <span style={styles.itemFlagTag}><Video size={10} /> Video</span>}
            </div>
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
function TimeView({ instances, employees, totalLogged, onExportToDinero, weekLabel, onUpdateInstance, pricing: pricingProp, onPricingChange, isAdminUser, onOpenTask }) {
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
  const [localPricing, setLocalPricing] = useState(pricingProp || { privat: 450, nexus: 380, aeldrelov: 410 });

  useEffect(() => { if (pricingProp) setLocalPricing(pricingProp); }, [JSON.stringify(pricingProp)]);

  // Beregn hvilke ISO-uger der falder inden for den valgte måned/år
  function weeksInMonth(year, month) {
    const weeks = new Set();
    const d = new Date(year, month, 1);
    while (d.getMonth() === month) {
      // ISO week
      const tmp = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      const dayNum = (tmp.getDay() + 6) % 7;
      tmp.setDate(tmp.getDate() - dayNum + 3);
      const yearStart = new Date(tmp.getFullYear(), 0, 1);
      const wk = Math.ceil(((tmp - yearStart) / 86400000 + 1) / 7);
      weeks.add(wk);
      d.setDate(d.getDate() + 1);
    }
    return weeks;
  }

  const validWeeks = weeksInMonth(filterYear, filterMonth);

  const placed = instances
    .filter((t) => !BLOCK_TYPES.includes(t.type))
    .filter((t) => validWeeks.has(t.week) && (t.year ?? filterYear) === filterYear)
    .filter((t) => statusFilter === "all" || t.status === statusFilter)
    .filter((t) => !invoiceOnly || t.invoiceReady)
    .filter((t) => !invoiceOnly || showDineroExported || !t.dineroExported)
    .sort((a, b) => {
      if (a.week !== b.week) return a.week - b.week;
      const aEmp = (a.assignees || []).map((id) => employees.find((e) => e.id === id)?.name || "").sort().join(", ") || "\uffff";
      const bEmp = (b.assignees || []).map((id) => employees.find((e) => e.id === id)?.name || "").sort().join(", ") || "\uffff";
      if (aEmp !== bEmp) return aEmp.localeCompare(bEmp, "da");
      const aDay = a.day ? DAYS.findIndex((d) => d.key === a.day) : 99;
      const bDay = b.day ? DAYS.findIndex((d) => d.key === b.day) : 99;
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
          const plannedRev = placed.reduce((s, t) => s + (t.duration / 60) * (localPricing[t.contractType || "privat"] || 0), 0);
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
            {[["privat", "🏠 Privat"], ["nexus", "🏢 Nexus"], ["aeldrelov", "👴 Ældrelov"]].map(([type, label]) => (
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
        <span style={{ textAlign: "right" }}>Planlagt</span>
        <span style={{ textAlign: "right" }}>Registreret</span>
        <span style={{ textAlign: "right" }}>Planlagt kr.</span>
        <span style={{ textAlign: "right" }}>Registreret kr.</span>
        <span style={{ textAlign: "right" }}>Difference</span>
        <span style={{ textAlign: "center" }}>Dinero</span>
        <span style={{ textAlign: "center" }}>📄</span>
      </div>

      <div style={{ background: "#fff", borderRadius: "0 0 10px 10px", boxShadow: "0 1px 3px rgba(0,0,0,0.06)", overflow: "hidden" }}>
        {placed.map((t, idx) => {
          const emps = (t.assignees || []).map((id) => employees.find((e) => e.id === id)).filter(Boolean);
          const logged = (t.timeLog || t.time_log || []).reduce((s, l) => s + (l.minutes || 0), 0);
          const dayLabel = DAYS.find((d) => d.key === t.day)?.label || t.day || "—";
          const isLow = logged > 0 && logged < t.duration * 0.5;
          const isEditing = editMinutes[t.id] !== undefined;
          const rate = localPricing[t.contractType || "privat"] || 0;
          const plannedKr = Math.round((t.duration / 60) * rate);
          const registeredKr = Math.round((logged / 60) * rate);
          const diffKr = registeredKr - plannedKr;

          return (
            <div key={t.id} style={{ display: "grid", gridTemplateColumns: "50px 140px 120px 160px 1fr 70px 80px 100px 100px 100px 90px 70px 28px", gap: 0, padding: "10px 14px", borderBottom: idx < placed.length - 1 ? "1px solid #F1F5F9" : "none", alignItems: "center", background: t.dineroExported ? "#EEF2FF" : t.invoiceReady ? "#F0FDF4" : "transparent" }}>
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
                  <span
                    style={{ fontSize: 13, fontWeight: 700, color: logged === 0 ? "#94A3B8" : isLow ? "#D97706" : "#16A34A", cursor: "pointer", borderBottom: "1px dashed currentColor" }}
                    title="Klik for at justere timer"
                    onClick={() => setEditMinutes((prev) => ({ ...prev, [t.id]: String(logged) }))}>
                    {fmtMin(logged)}
                  </span>
                )}
              </div>
              {/* Beløb planlagt */}
              <div style={{ fontSize: 13, fontWeight: 500, color: "#64748B", textAlign: "right" }}>
                {rate > 0 ? `${plannedKr.toLocaleString("da-DK")} kr` : "—"}
              </div>
              {/* Beløb registreret */}
              <div style={{ fontSize: 13, fontWeight: 600, color: logged > 0 ? "#16A34A" : "#94A3B8", textAlign: "right" }}>
                {rate > 0 && logged > 0 ? `${registeredKr.toLocaleString("da-DK")} kr` : "—"}
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
          );
        })}
        {placed.length === 0 && <div style={{ ...styles.emptyCol, padding: 40 }}>Ingen planlagte opgaver denne uge</div>}
      </div>

      {placed.length > 0 && (() => {
        const totalPlannedKr = placed.reduce((s, t) => {
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
    </div>
  );
}

// ── Reports View (Rapportering: budget vs. omsætning pr. område) ──────────────
const REPORT_AREAS = [
  ["privat", "🏠 Privat"],
  ["nexus", "🏢 Nexus"],
  ["aeldrelov", "👴 Ældrelov"],
];
const REPORT_MONTHS = ["Januar","Februar","Marts","April","Maj","Juni","Juli","August","September","Oktober","November","December"];

function weeksInMonthReport(year, monthIndex) {
  // monthIndex er 0-baseret (0 = januar), ligesom Date.getMonth()
  const weeks = new Set();
  const d = new Date(year, monthIndex, 1);
  while (d.getMonth() === monthIndex) {
    const tmp = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const dayNum = (tmp.getDay() + 6) % 7;
    tmp.setDate(tmp.getDate() - dayNum + 3);
    const yearStart = new Date(tmp.getFullYear(), 0, 1);
    const wk = Math.ceil(((tmp - yearStart) / 86400000 + 1) / 7);
    weeks.add(wk);
    d.setDate(d.getDate() + 1);
  }
  return weeks;
}

const REPORT_AREA_COLORS = { privat: "#D6247A", nexus: "#4F46E5", aeldrelov: "#C2410C", alle: "#334155" };
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
      const validWeeks = weeksInMonthReport(selectedYear, idx);
      let plannedKr = 0;
      let registeredKr = 0;
      let budgetKr = 0;
      areasToSum.forEach((area) => {
        const rate = pricing[area] || 0;
        const tasksInMonth = instances.filter(
          (t) => !BLOCK_TYPES.includes(t.type) && t.assignees && t.assignees.length && validWeeks.has(t.week) && (t.year ?? selectedYear) === selectedYear && (t.contractType || "privat") === area
        );
        plannedKr += tasksInMonth.reduce((s, t) => s + (t.duration / 60) * rate, 0);
        registeredKr += tasksInMonth.reduce((s, t) => {
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
function TaskModal({ onClose, onSave, checklistTemplates, skills, copyFrom }) {
  const [type, setType] = useState(copyFrom?.type || "fixed");
  const [contractType, setContractType] = useState(copyFrom?.contractType || "privat");
  const [title, setTitle] = useState(copyFrom ? `Kopi af ${copyFrom.title}` : "");
  const [duration, setDuration] = useState(copyFrom?.duration || 60);
  const [requiredSkills, setRequiredSkills] = useState(copyFrom?.requiredSkills || [{ skill: skills[0] ?? "", minLevel: 1 }]);
  const [days, setDays] = useState(copyFrom?.templateDays || copyFrom?.days || ["Mon"]);
  const [day, setDay] = useState("Mon");
  const [adhocDate, setAdhocDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [deadline, setDeadline] = useState("Fri");
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [expiryDate, setExpiryDate] = useState(() => {
    const d = new Date(); d.setFullYear(d.getFullYear() + 1);
    return d.toISOString().slice(0, 10);
  });
  const [checklistTemplateIds, setChecklistTemplateIds] = useState([]);
  const [extraItems, setExtraItems] = useState(
    copyFrom?.checklist?.map((i) => i.text || i).filter(Boolean) || []
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

  const [dineroAvailable, setDineroAvailable] = useState(true);

  async function searchDinero(q) {
    setCustomerName(q);
    if (q.length < 2) { setDineroResults([]); return; }
    if (!dineroAvailable) return; // Dinero ikke tilgængelig — brug manuel indtastning
    setDineroSearching(true);
    try {
      const { data, error } = await supabase.functions.invoke("dinero", {
        body: { action: "search", query: q },
      });
      if (!error && data?.Collection) {
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

  return (
    <Modal onClose={onClose} title={copyFrom ? `Kopiér: ${copyFrom.title}` : "Ny opgave"} persistent>
      {/* Kontrakttype */}
      <label style={styles.label}>Kontrakttype</label>
      <div style={styles.typePicker}>
        {[["privat","🏠 Privat"],["nexus","🏢 Nexus"],["aeldrelov","👴 Ældrelov"]].map(([k,l]) => (
          <button key={k} type="button" onClick={() => setContractType(k)}
            style={contractType === k ? { ...styles.typePickBtn, borderColor:"#D6247A", color:"#D6247A", background:"#FCE4EF" } : styles.typePickBtn}>
            {l}
          </button>
        ))}
      </div>

      <label style={styles.label}>Type</label>
      <div style={styles.typePicker}>
        {Object.entries(TYPE_META).map(([k, m]) => (
          <button key={k} type="button" onClick={() => setType(k)} style={type === k ? { ...styles.typePickBtn, borderColor: m.color, color: m.color, background: m.bg } : styles.typePickBtn}>{m.label}</button>
        ))}
      </div>
      {type === "fixed" && <div style={styles.hint}>Faste opgaver gentages automatisk hver uge på de valgte dage — frem til udløbsdatoen.</div>}
      {type === "flexible" && <div style={styles.hint}>Fleksible opgaver oprettes hver uge frem til udløbsdatoen.</div>}

      <label style={styles.label}>Titel</label>
      <input style={styles.input} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="F.eks. Gulvvask kontor 2. sal" />

      <label style={styles.label}>
        Kundenavn
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

      <label style={styles.label}>Adresse for udførsel</label>
      <input style={styles.input} value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Vejnavn 1, 9000 Aalborg" />

      <label style={styles.label}>PO-nummer til fakturering (valgfrit)</label>
      <input style={styles.input} value={poNumber} onChange={(e) => setPoNumber(e.target.value)} placeholder="F.eks. PO-2026-0311" />

      <label style={styles.label}>Adgang (nøgleboks, koder, kontaktperson m.v.)</label>
      <textarea style={styles.textarea} rows={2} value={accessInstructions} onChange={(e) => setAccessInstructions(e.target.value)} placeholder="F.eks. Nøgleboks ved hovedindgang, kode 4471" />

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
      <input type="number" min={5} step={5} style={styles.input} value={duration} onChange={(e) => setDuration(Number(e.target.value))} />

      {type === "fixed" && (
        <>
          <label style={styles.label}>Startdato (første gang opgaven udføres)</label>
          <input type="date" style={styles.input} value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          <label style={styles.label}>Ugedage (gentages hver uge)</label>
          <div style={styles.skillPicker}>
            {DAYS.map((d) => <button key={d.key} type="button" onClick={() => toggleDay(d.key)} style={days.includes(d.key) ? styles.skillPickBtnActive : styles.skillPickBtn}>{d.label}</button>)}
          </div>
          <label style={styles.label}>Udløbsdato (aftalen gælder til og med)</label>
          <input type="date" style={styles.input} value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} />
        </>
      )}
      {type === "adhoc" && (
        <>
          <label style={styles.label}>Senest udført dato</label>
          <input type="date" style={styles.input} value={adhocDate} onChange={(e) => {
            setAdhocDate(e.target.value);
            const d = new Date(e.target.value);
            const dayKeys = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
            setDay(dayKeys[d.getDay()]);
          }} />
        </>
      )}
      {type === "flexible" && (
        <>
          <label style={styles.label}>Senest udført dato</label>
          <input type="date" style={styles.input} value={adhocDate} onChange={(e) => {
            setAdhocDate(e.target.value);
            const d = new Date(e.target.value);
            const dayKeys = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
            setDeadline(dayKeys[d.getDay()]);
          }} />
          <label style={styles.label}>Udløbsdato (aftalen gælder til og med)</label>
          <input type="date" style={styles.input} value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} />
        </>
      )}

      <label style={styles.label}>Tjeklister (tasks der skal udføres)</label>
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
      <input style={styles.input} value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} placeholder="https://…" />

      <div style={styles.modalActions}>
        <button style={styles.secondaryBtn} onClick={onClose}>Annuller</button>
        <button
          style={styles.primaryBtn}
          disabled={!title.trim() || (type === "fixed" && days.length === 0) || requiredSkills.length === 0}
          onClick={() => onSave({ type, contractType, title: title.trim(), requiredSkills, duration, days, day, adhocDate, deadline, startDate, expiryDate, checklistTemplateIds, extraItems, videoUrl: videoUrl.trim(), customerName: customerName.trim(), address: address.trim(), poNumber: poNumber.trim(), accessInstructions: accessInstructions.trim(), dineroSynced: customerDineroSynced })}
        >
          Gem og planlæg
        </button>
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

function ContractsView({ templates, instances }) {
  // Find den reelle, aktuelle kontrakttype for en skabelon: den seneste værdi sat på
  // en tilknyttet opgave slår den statiske skabelonværdi, så redigering i ugeplanen
  // altid afspejles korrekt her.
  function effectiveContractType(tpl) {
    const linked = instances.filter((i) => i.templateId === tpl.id && i.contractType);
    if (linked.length) return linked[linked.length - 1].contractType;
    return tpl.contractType || "privat";
  }

  // Hent alle faste kontrakter med udløbsdato — sortér efter nærmest udløbende
  const contracts = templates
    .filter((t) => t.expiryDate)
    .map((t) => {
      const expiry = new Date(t.expiryDate);
      const start = t.startDate ? new Date(t.startDate) : null;
      const daysLeft = Math.ceil((expiry - new Date()) / (1000 * 60 * 60 * 24));
      return { ...t, contractType: effectiveContractType(t), expiry, start, daysLeft };
    })
    .sort((a, b) => a.expiry - b.expiry);

  const noExpiry = templates
    .filter((t) => !t.expiryDate)
    .map((t) => ({ ...t, contractType: effectiveContractType(t) }));

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
                <div style={{ fontWeight: 700, fontSize: 15, color: "#111111", marginBottom: 3 }}>{t.title}</div>
                <div style={{ fontSize: 12, color: "#64748B", display: "flex", gap: 12, flexWrap: "wrap" }}>
                  {t.customerName && <span>👤 {t.customerName}</span>}
                  <DayPills days={t.days} />
                  {t.start && <span>Fra {t.start.toLocaleDateString("da-DK", { day: "numeric", month: "short", year: "numeric" })}</span>}
                  <span>Til {t.expiry.toLocaleDateString("da-DK", { day: "numeric", month: "short", year: "numeric" })}</span>
                  <span style={{ fontWeight: 600, color: "#9C1B5D" }}>{t.contractType === "nexus" ? "🏢 Nexus" : t.contractType === "aeldrelov" ? "👴 Ældrelov" : "🏠 Privat"}</span>
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
                  <div style={{ fontWeight: 700, fontSize: 15, color: "#111111", marginBottom: 3 }}>{t.title}</div>
                  <div style={{ fontSize: 12, color: "#64748B", display: "flex", gap: 12, flexWrap: "wrap" }}>
                    {t.customerName && <span>👤 {t.customerName}</span>}
                    <DayPills days={t.days} />
                    <span style={{ fontWeight: 600, color: "#9C1B5D" }}>{t.contractType === "nexus" ? "🏢 Nexus" : t.contractType === "aeldrelov" ? "👴 Ældrelov" : "🏠 Privat"}</span>
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
      await supabase.from("areas").update({ name: areaName.trim(), zip_codes: zips }).eq("id", editArea.id);
      onAreasChange((prev) => prev.map((a) => a.id === editArea.id ? { ...a, name: areaName.trim(), zip_codes: zips } : a));
    } else {
      const { data } = await supabase.from("areas").insert({ name: areaName.trim(), zip_codes: zips }).select().single();
      if (data) onAreasChange((prev) => [...prev, data]);
    }
    setSaving(false); setShowAdd(false); setEditArea(null); setAreaName(""); setAreaZips("");
  }

  async function deleteArea(area) {
    if (!window.confirm(`Slet området "${area.name}"?`)) return;
    await supabase.from("areas").delete().eq("id", area.id);
    onAreasChange((prev) => prev.filter((a) => a.id !== area.id));
    onEmployeeAreasChange((prev) => prev.filter((ea) => ea.area_id !== area.id));
  }

  async function toggleEmpArea(empId, areaId) {
    const exists = employeeAreas.some((ea) => ea.employee_id === empId && ea.area_id === areaId);
    if (exists) {
      await supabase.from("employee_areas").delete().match({ employee_id: empId, area_id: areaId });
      onEmployeeAreasChange((prev) => prev.filter((ea) => !(ea.employee_id === empId && ea.area_id === areaId)));
    } else {
      await supabase.from("employee_areas").insert({ employee_id: empId, area_id: areaId });
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
    await supabase.from("skills").delete().eq("id", item.id);
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
function InventoryView({ supabase, employees }) {
  const [categories, setCategories] = useState([]);
  const [items, setItems] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddItem, setShowAddItem] = useState(false);
  const [showAdjust, setShowAdjust] = useState(null);
  const [showEditItem, setShowEditItem] = useState(null);
  const [editItemName, setEditItemName] = useState("");
  const [editItemUnit, setEditItemUnit] = useState("");
  const [editItemMin, setEditItemMin] = useState(0);
  const [editItemCat, setEditItemCat] = useState("");
  const [adjustQty, setAdjustQty] = useState("");
  const [adjustReason, setAdjustReason] = useState("");
  const [adjustType, setAdjustType] = useState("in");
  const [filterCat, setFilterCat] = useState("all");
  const [filterType, setFilterType] = useState("all");

  // New item form
  const [newName, setNewName] = useState("");
  const [newCat, setNewCat] = useState("");
  const [newUnit, setNewUnit] = useState("stk");
  const [newStock, setNewStock] = useState(0);
  const [newMin, setNewMin] = useState(0);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const [{ data: cats }, { data: itms }, { data: txns }] = await Promise.all([
        supabase.from("inventory_categories").select("*").order("type"),
        supabase.from("inventory_items").select("*, inventory_categories(name,type,icon)").order("name"),
        supabase.from("inventory_transactions").select("*, inventory_items(name), employees(name)").order("created_at", { ascending: false }).limit(50),
      ]);
      setCategories(cats || []);
      setItems(itms || []);
      setTransactions(txns || []);
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
    }).select("*, inventory_categories(name,type,icon)").single();
    if (data) { setItems((prev) => [...prev, data]); setShowAddItem(false); setNewName(""); setNewStock(0); setNewMin(0); }
  }

  async function saveEditItem() {
    if (!showEditItem || !editItemName.trim()) return;
    const { error } = await supabase.from("inventory_items").update({
      name: editItemName.trim(),
      unit: editItemUnit,
      min_stock: Number(editItemMin),
      category_id: editItemCat,
    }).eq("id", showEditItem.id);
    if (!error) {
      setItems((prev) => prev.map((i) => i.id === showEditItem.id
        ? { ...i, name: editItemName.trim(), unit: editItemUnit, min_stock: Number(editItemMin), category_id: editItemCat }
        : i));
      setShowEditItem(null);
    }
  }

  async function deleteItem(item) {
    if (!window.confirm(`Slet "${item.name}"? Dette kan ikke fortrydes.`)) return;
    await supabase.from("inventory_items").delete().eq("id", item.id);
    setItems((prev) => prev.filter((i) => i.id !== item.id));
  }

  async function adjust() {
    if (!showAdjust || !adjustQty) return;
    const qty = adjustType === "out" ? -Math.abs(Number(adjustQty)) : Math.abs(Number(adjustQty));
    const newStock = showAdjust.stock + qty;
    await supabase.from("inventory_transactions").insert({
      item_id: showAdjust.id, quantity: qty, type: adjustType, reason: adjustReason,
    });
    await supabase.from("inventory_items").update({ stock: newStock }).eq("id", showAdjust.id);
    setItems((prev) => prev.map((i) => i.id === showAdjust.id ? { ...i, stock: newStock } : i));
    setShowAdjust(null); setAdjustQty(""); setAdjustReason("");
  }

  const filtered = items.filter((i) => {
    if (filterCat !== "all" && i.category_id !== filterCat) return false;
    if (filterType !== "all" && i.inventory_categories?.type !== filterType) return false;
    return true;
  });

  if (loading) return <div style={{ padding: 40, textAlign: "center", color: "#9C1B5D" }}>Indlæser lager…</div>;

  return (
    <div style={styles.page}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <select style={{ ...styles.inputSm, fontSize: 13 }} value={filterType} onChange={(e) => setFilterType(e.target.value)}>
            <option value="all">Alle kategorier</option>
            <option value="kunde">🧹 Kundeprodukter</option>
            <option value="medarbejder">👕 Medarbejderprodukter</option>
          </select>
          <select style={{ ...styles.inputSm, fontSize: 13 }} value={filterCat} onChange={(e) => setFilterCat(e.target.value)}>
            <option value="all">Alle underkategorier</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
          </select>
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

      {/* Product list */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px,1fr))", gap: 10 }}>
        {filtered.map((item) => {
          const low = item.stock <= item.min_stock;
          const cat = item.inventory_categories;
          return (
            <div key={item.id} style={{ background: "#fff", borderRadius: 12, padding: 14, boxShadow: "0 1px 3px rgba(0,0,0,0.06)", borderLeft: `4px solid ${low ? "#DC2626" : cat?.type === "medarbejder" ? "#4F46E5" : "#D6247A"}` }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 8 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14, color: "#111111" }}>{item.name}</div>
                  <div style={{ fontSize: 12, color: "#64748B" }}>{cat?.icon} {cat?.name}</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <button style={{ ...styles.addSkillBtn, fontSize: 12 }} onClick={() => { setShowAdjust(item); setAdjustType("in"); }}>
                    Justér
                  </button>
                  <button style={styles.iconBtnGhostInline} onClick={() => { setShowEditItem(item); setEditItemName(item.name); setEditItemUnit(item.unit); setEditItemMin(item.min_stock); setEditItemCat(item.category_id); }} title="Rediger"><Pencil size={13} /></button>
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
          <label style={styles.label}>Kategori</label>
          <select style={styles.input} value={newCat} onChange={(e) => setNewCat(e.target.value)}>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.icon} {c.name} ({c.type === "kunde" ? "Kundeprodukt" : "Medarbejderprodukt"})</option>)}
          </select>
          <label style={styles.label}>Enhed</label>
          <select style={styles.input} value={newUnit} onChange={(e) => setNewUnit(e.target.value)}>
            {["stk","rulle","par","dunk","liter","kg","pose","æske","sæt"].map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
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
          <label style={styles.label}>Kategori</label>
          <select style={styles.input} value={editItemCat} onChange={(e) => setEditItemCat(e.target.value)}>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.icon} {c.name} ({c.type === "kunde" ? "Kundeprodukt" : "Medarbejderprodukt"})</option>)}
          </select>
          <label style={styles.label}>Enhed</label>
          <select style={styles.input} value={editItemUnit} onChange={(e) => setEditItemUnit(e.target.value)}>
            {["stk","rulle","par","dunk","liter","kg","pose","æske","sæt"].map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
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
  const [empSkills, setEmpSkills] = useState(emp?.skills || {});
  const [capacity, setCapacity] = useState(emp?.capacity || defaultCapacity());
  const [isAdmin, setIsAdmin] = useState(emp?.isAdmin || false);
  const colorPool = ["#D6247A", "#111111", "#9C1B5D", "#5B5B60", "#C2487A", "#3A3A3E"];
  const [color] = useState(emp?.color || colorPool[Math.floor(Math.random() * colorPool.length)]);

  function setLevel(skill, level) {
    setEmpSkills((prev) => { const next = { ...prev }; if (level === 0) delete next[skill]; else next[skill] = level; return next; });
  }
  function setCap(day, hours) { setCapacity((prev) => ({ ...prev, [day]: Math.max(0, Number(hours)) * 60 })); }

  return (
    <Modal onClose={onClose} title={emp ? `Rediger ${emp.name}` : "Ny medarbejder"} persistent>
      <label style={styles.label}>Navn</label>
      <input style={styles.input} value={name} onChange={(e) => setName(e.target.value)} placeholder="Fulde navn" />

      <label style={styles.label}>Kompetenceniveau pr. kompetence</label>
      <div style={styles.skillLevelGrid}>
        {(skillList || []).map((s) => {
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

      <label style={styles.label}>Timer til rådighed pr. dag</label>
      <div style={styles.capEditRow}>
        {DAYS.map((d) => (
          <div key={d.key} style={styles.capEditBox}>
            <div style={styles.capDayLabel}>{d.label.slice(0, 3)}</div>
            <input type="number" min={0} step={0.5} style={styles.capInput} value={(capacity[d.key] / 60).toString()} onChange={(e) => setCap(d.key, e.target.value)} />
          </div>
        ))}
      </div>

      <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", marginTop: 12 }} onClick={() => setIsAdmin((v) => !v)}>
        <span style={{ width: 18, height: 18, borderRadius: 5, border: isAdmin ? "2px solid #16A34A" : "2px solid #CBD5E1", background: isAdmin ? "#16A34A" : "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
          {isAdmin && <Check size={11} color="#fff" strokeWidth={3} />}
        </span>
        <span style={{ fontSize: 13, fontWeight: 600, color: "#111111" }}>🛡️ Administrator (kan markere opgaver som sendt til Dinero)</span>
      </label>

      <div style={styles.modalActions}>
        <button style={styles.secondaryBtn} onClick={onClose}>Annuller</button>
        <button style={styles.primaryBtn} disabled={!name.trim()} onClick={() => onSave({ id: emp?.id || uid("e"), name: name.trim(), skills: empSkills, color: emp?.color || color, capacity, isAdmin })}>Gem medarbejder</button>
      </div>
    </Modal>
  );
}

// ---------- Task / service order detail ----------
function TaskDetailModal({ task, employees, checklistTemplates, skills, isAdminUser, areas, employeeAreas, onClose, onSetStatus, onToggleChecklistItem, onAddChecklistItem, onAddChecklistTemplate, onAddAssignee, onRemoveAssignee, onUnplace, onDelete, onUpdateCustomer, onUpdateCustomerInfo, onUpdateContractType, onCopy, onUpdateSkills, onEndBlockEarly }) {
  const [addOpen, setAddOpen] = useState(false);
  const [newItemText, setNewItemText] = useState("");
  const [showTemplates, setShowTemplates] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(false);
  const [editingSkills, setEditingSkills] = useState(false);
  const [custName, setCustName] = useState("");
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

  useEffect(() => {
    if (task) {
      setCustName(task.customerName || "");
      setCustAddress(task.address || "");
      setCustPo(task.poNumber || "");
      setCustAccess(task.accessInstructions || "");
      setTaskSkills(task.requiredSkills || []);
      setDineroResults([]);
      setShowDineroCreate(false);
      setCustomerSelected(!!task.customerName);
      setCustomerDineroSynced(!!task.dineroSynced);
    }
  }, [task?.id]);

  async function searchDineroForCustomer(q) {
    setCustName(q);
    if (q.length < 2) { setDineroResults([]); return; }
    if (!dineroAvailable) return; // Dinero ikke tilgængelig — brug manuel indtastning
    setDineroSearching(true);
    try {
      const { data, error } = await supabase.functions.invoke("dinero", {
        body: { action: "search", query: q },
      });
      if (!error && data?.Collection) {
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

  // Sygdom/ferie er en blokering, ikke en rigtig rengøringsopgave — vis en
  // forenklet dialog i stedet for hele det almindelige opgave-UI (kunde,
  // tjekliste, kompetencer osv. giver ikke mening for en blokering).
  if (BLOCK_TYPES.includes(task.type)) {
    const emp = employees.find((e) => (task.assignees || []).includes(e.id));
    const dayLabel = DAYS.find((d) => d.key === task.day)?.label || task.day;
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
  const dayLabel = t.day ? DAYS.find((d) => d.key === t.day)?.label : "Ikke planlagt endnu";
  const totalLogged = (t.timeLog || []).reduce((s, l) => s + l.minutes, 0);
  const byEmployee = {};
  (t.timeLog || []).forEach((l) => { if (!l.empId) return; byEmployee[l.empId] = (byEmployee[l.empId] || 0) + l.minutes; });
  const existingTexts = new Set((t.checklist || []).map((i) => i.text));

  function saveCustomer() {
    onUpdateCustomerInfo(t.id, { customerName: custName, address: custAddress, poNumber: custPo, accessInstructions: custAccess, dineroSynced: customerDineroSynced });
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

  return (
    <Modal onClose={onClose} title={t.title} persistent>
      <div style={styles.detailMetaRow}>
        {locked ? (
          <TypeBadge type={t.type} />
        ) : (
          <select
            style={{ fontSize: 12, fontWeight: 600, padding: "3px 8px", borderRadius: 99, border: "1.5px solid #E2E8F0", cursor: "pointer", background: TYPE_META[t.type]?.bg || "#F1F5F9", color: TYPE_META[t.type]?.color || "#475569" }}
            value={t.type}
            onChange={(e) => onUpdateCustomer(t.id, { type: e.target.value })}>
            <option value="fixed">↻ Fast interval</option>
            <option value="adhoc">⚡ Ad hoc</option>
            <option value="flexible">📅 Fleksibel</option>
          </select>
        )}
        <span style={{ ...styles.typeChip, color: statusColor(t.status), background: "#F1EFE7" }}>{statusLabel(t.status)}</span>
        {locked ? (
          t.contractType && <span style={{ ...styles.typeChip, background: t.contractType === "nexus" ? "#EEF2FF" : t.contractType === "aeldrelov" ? "#FFF7ED" : "#FFF6FA", color: t.contractType === "nexus" ? "#4F46E5" : t.contractType === "aeldrelov" ? "#C2410C" : "#9C1B5D" }}>{t.contractType === "nexus" ? "🏢 Nexus" : t.contractType === "aeldrelov" ? "👴 Ældrelov" : "🏠 Privat"}</span>
        ) : (
          <select
            style={{ fontSize: 12, fontWeight: 600, padding: "3px 8px", borderRadius: 99, border: "1.5px solid #E2E8F0", background: t.contractType === "nexus" ? "#EEF2FF" : t.contractType === "aeldrelov" ? "#FFF7ED" : "#FFF6FA", color: t.contractType === "nexus" ? "#4F46E5" : t.contractType === "aeldrelov" ? "#C2410C" : "#9C1B5D", cursor: "pointer" }}
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
      <div style={styles.cardMeta}>{dayLabel} · {fmtMin(t.duration)}{t.deadline ? ` · senest ${DAYS.find((d) => d.key === t.deadline)?.label}` : ""}{t.expiryDate ? ` · udløber ${t.expiryDate}` : ""}</div>

      {/* Kompetencer — redigerbare */}
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

      {/* Kunde — redigerbar indtil udført */}
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
            <input style={styles.input} value={custPo} onChange={(e) => setCustPo(e.target.value)} placeholder="PO-nummer" />
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
              {custPo && <div style={styles.cardMeta}>PO-nummer: {custPo}</div>}
              {custAccess && (
                <div style={{ ...styles.accessBox, marginTop: 8 }}>
                  <div style={styles.accessTitle}><Lock size={13} /> Adgang</div>
                  <div style={styles.checklistItemDescription}>{custAccess}</div>
                </div>
              )}
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
      {candidatesFor(t, employees, areas, employeeAreas).candidates.length === 0 && <span style={styles.errorChip}><AlertTriangle size={12} /> Ingen har alle krævede kompetencer</span>}
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
            <button type="button" style={styles.iconBtnGhostInline} onClick={() => onRemoveAssignee(t.id, e.id)} title="Fjern fra opgaven"><X size={13} /></button>
          </div>
        ))}
        {assignedEmps.length === 0 && <div style={styles.cardMeta}>Ingen tildelt endnu</div>}
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
      <div style={styles.cardMeta}>{fmtMin(totalLogged)} registreret i alt af {fmtMin(t.duration)} planlagt</div>

      <div style={styles.modalActions}>
        {onCopy && <button style={{ ...styles.secondaryBtn, color: "#9C1B5D", borderColor: "#FCE4EF" }} onClick={() => onCopy(t)}><Copy size={14} /> Kopiér</button>}
        <button style={{ ...styles.secondaryBtn, color: "#B91C1C", borderColor: "#FEE2E2" }} onClick={() => onDelete(t.id)}><Trash2 size={14} /> Slet</button>
        <button style={{ ...styles.primaryBtn, marginLeft: "auto" }} onClick={onClose}>Luk</button>
      </div>
    </Modal>
  );
}

function Modal({ title, children, onClose, persistent = false }) {
  return (
    <div style={styles.overlay} onClick={persistent ? undefined : onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.modalHeader}>
          <span style={styles.modalTitle}>{title}</span>
          <button style={styles.iconBtnGhostInline} onClick={onClose}><X size={16} /></button>
        </div>
        <div style={styles.modalBody}>{children}</div>
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
`;

const styles = {
  app: { fontFamily: "'Inter', -apple-system, system-ui, sans-serif", background: "#FFF6FA", minHeight: "100vh", color: "#111111", display: "flex", flexDirection: "column" },
  header: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 24px", background: "#111111", color: "#fff", flexWrap: "wrap", gap: 12 },
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
  taskChip: { display: "flex", flexDirection: "column", justifyContent: "center", gap: 2, minHeight: 60, background: "#fff", border: "1px solid #E2E8F0", borderRadius: 6, padding: "5px 6px", marginBottom: 4, cursor: "pointer", position: "relative" },
  transportChip: { display: "flex", alignItems: "center", gap: 5, fontSize: 10, color: "#64748B", background: "repeating-linear-gradient(45deg, #F1EFE7, #F1EFE7 6px, #E9E6DC 6px, #E9E6DC 12px)", border: "1px dashed #CBD5E1", borderRadius: 6, padding: "4px 6px", marginBottom: 4 },
  chipTopRow: { display: "flex", alignItems: "center", gap: 4, minWidth: 0 },
  chipSubRow: { display: "flex", alignItems: "center", gap: 6, minWidth: 0 },
  taskChipTitle: { fontSize: 11, fontWeight: 600, flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  taskChipCustomer: { fontSize: 10, color: "#9C1B5D", fontWeight: 600, flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  taskChipAddress: { fontSize: 10, color: "#64748B", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", marginTop: 1 },
  taskChipDur: { fontSize: 10, color: "#64748B", flexShrink: 0 },
  statusDot: { width: 6, height: 6, borderRadius: 3, flexShrink: 0 },
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
  modalBody: { padding: "16px 18px" },
  modalActions: { display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 14 },
  label: { display: "block", fontSize: 12, fontWeight: 600, color: "#475569", marginTop: 12, marginBottom: 5 },
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
