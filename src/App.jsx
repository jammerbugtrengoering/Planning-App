import React, { useState, useMemo } from "react";
import {
  Plus, Upload, Download, X, Clock, Play, Square, AlertTriangle,
  Trash2, Pencil, Repeat, Zap, CalendarClock, Wand2, Star, ChevronLeft, ChevronRight,
  ClipboardList, Video, CheckCircle2, LogIn, ListChecks, Check, Lock, Navigation, Building2, Car,
} from "lucide-react";

// ---------- Constants ----------
const SKILLS = ["Gulvvask", "Vinduespolering", "Sanitær", "Højtryk", "Tæpperens", "Køkkenhygiejne"];
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
const TYPE_META = {
  fixed: { label: "Fast interval", icon: Repeat, color: "#9C1B5D", bg: "#FCE4EF" },
  adhoc: { label: "Ad hoc", icon: Zap, color: "#B45309", bg: "#FEF3C7" },
  flexible: { label: "Fleksibel", icon: CalendarClock, color: "#111111", bg: "#EDEDED" },
};

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
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}
function weekMeta(offset) {
  const monday = mondayOf(new Date());
  monday.setDate(monday.getDate() + offset * 7);
  const friday = new Date(monday); friday.setDate(monday.getDate() + 4);
  const fmt = (d) => d.toLocaleDateString("da-DK", { day: "numeric", month: "short" });
  return { label: `${fmt(monday)} – ${fmt(friday)}`, weekNo: isoWeekNumber(monday), monday };
}

// ---------- Skill matching ----------
function meetsRequirement(emp, req) { return (emp.skills[req.skill] || 0) >= req.minLevel; }
function candidatesFor(t, employees) { return employees.filter((e) => t.requiredSkills.every((r) => meetsRequirement(e, r))); }
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
function scheduleWeek(weekInstances, employees) {
  let list = weekInstances.map((t) => ({ ...t }));

  list.forEach((t) => {
    if ((t.assignees && t.assignees.length) || !t.day || t.type === "flexible") return;
    const candidates = candidatesFor(t, employees);
    if (candidates.length === 0) { t.warning = "no_skill"; return; }
    const ranked = [...candidates].sort((a, b) => {
      const diff = skillScore(b, t) - skillScore(a, t);
      if (diff !== 0) return diff;
      return remaining(employees, list, b.id, t.day) - remaining(employees, list, a.id, t.day);
    });
    const withRoom = ranked.find((c) => remaining(employees, list, c.id, t.day) >= t.duration);
    const pick = withRoom || ranked[0];
    t.assignees = [pick.id]; t.status = "planlagt"; t.warning = withRoom ? null : "overloaded";
  });

  list.forEach((t) => {
    if ((t.assignees && t.assignees.length) || t.type !== "flexible") return;
    const deadlineIdx = DAYS.findIndex((d) => d.key === (t.deadline || "Fri"));
    const window = DAYS.slice(0, deadlineIdx + 1);
    const candidates = candidatesFor(t, employees);
    if (candidates.length === 0) { t.warning = "no_skill"; return; }
    let best = null;
    window.forEach((d) => {
      candidates.forEach((e) => {
        const rem = remaining(employees, list, e.id, d.key);
        const fits = rem >= t.duration ? 1 : 0;
        const score = fits * 1_000_000 + skillScore(e, t) * 1000 + rem;
        if (!best || score > best.score) best = { day: d.key, empId: e.id, rem, score };
      });
    });
    t.day = best.day; t.assignees = [best.empId]; t.status = "planlagt"; t.warning = best.rem < t.duration ? "overloaded" : null;
  });

  return list;
}

function ensureWeekInstances(week, allInstances, templates, employees) {
  let list = [...allInstances];
  templates.forEach((tpl) => {
    tpl.days.forEach((day) => {
      const exists = list.some((i) => i.templateId === tpl.id && i.week === week && i.day === day);
      if (!exists) {
        list.push({
          id: uid("i"), templateId: tpl.id, title: tpl.title, requiredSkills: tpl.requiredSkills,
          duration: tpl.duration, type: "fixed", day, week, assignees: [], status: "unscheduled", timeLog: [],
          checklist: instantiateChecklist(tpl.checklistItems || []), videoUrl: tpl.videoUrl || "",
          customerName: tpl.customerName || "", address: tpl.address || "", poNumber: tpl.poNumber || "", accessInstructions: tpl.accessInstructions || "",
        });
      }
    });
  });
  const thisWeek = list.filter((i) => i.week === week);
  const others = list.filter((i) => i.week !== week);
  return [...others, ...scheduleWeek(thisWeek, employees)];
}

function statusLabel(s) { return { unscheduled: "Ubemandet", planlagt: "Planlagt", i_gang: "I gang", udført: "Udført" }[s] || s; }

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
function cycleStatus(s) { return { planlagt: "i_gang", i_gang: "udført", udført: "planlagt", unscheduled: "planlagt" }[s] || "planlagt"; }
function statusColor(s) { return { planlagt: "#9C1B5D", i_gang: "#D97706", udført: "#111111", unscheduled: "#94A3B8" }[s]; }

export default function App() {
  const [employees, setEmployees] = useState(seedEmployees);
  const [templates, setTemplates] = useState(seedTemplates);
  const [checklistTemplates, setChecklistTemplates] = useState(seedChecklistTemplates);
  const [weekOffset, setWeekOffset] = useState(0);
  const [instances, setInstances] = useState(() => ensureWeekInstances(0, seedAdhocFlex, seedTemplates, seedEmployees));
  const [view, setView] = useState("uge");
  const [showAddTask, setShowAddTask] = useState(false);
  const [showAddEmp, setShowAddEmp] = useState(false);
  const [editEmp, setEditEmp] = useState(null);
  const [toast, setToast] = useState(null);
  const [running, setRunning] = useState({});
  const [dragId, setDragId] = useState(null);
  const [openTaskId, setOpenTaskId] = useState(null);
  const [travelSettings, setTravelSettings] = useState({ defaultMinutes: 20, dayStart: "07:00", overrides: {} });
  const [showTravelSettings, setShowTravelSettings] = useState(false);

  function notify(msg) { setToast(msg); setTimeout(() => setToast(null), 2800); }

  function changeWeek(delta) {
    const next = weekOffset + delta;
    setInstances((cur) => ensureWeekInstances(next, cur, templates, employees));
    setWeekOffset(next);
  }

  function runAuto() {
    setInstances((prev) => {
      const thisWeek = prev.filter((t) => t.week === weekOffset);
      const others = prev.filter((t) => t.week !== weekOffset);
      const before = thisWeek.filter((t) => !(t.assignees && t.assignees.length)).length;
      const after = scheduleWeek(thisWeek, employees);
      const still = after.filter((t) => !(t.assignees && t.assignees.length)).length;
      notify(before - still > 0 ? `${before - still} opgave(r) planlagt automatisk` : "Ingen flere opgaver kunne planlægges");
      return [...others, ...after];
    });
  }

  function addTask(payload) {
    const checklistItemsCombined = [
      ...payload.checklistTemplateIds.flatMap((id) => checklistTemplates.find((c) => c.id === id)?.items || []),
      ...payload.extraItems,
    ];
    if (payload.type === "fixed") {
      const tpl = { id: uid("tpl"), title: payload.title, requiredSkills: payload.requiredSkills, duration: payload.duration, days: payload.days, checklistItems: checklistItemsCombined, videoUrl: payload.videoUrl,
        customerName: payload.customerName, address: payload.address, poNumber: payload.poNumber, accessInstructions: payload.accessInstructions };
      setTemplates((prevT) => {
        const nextT = [...prevT, tpl];
        setInstances((cur) => ensureWeekInstances(weekOffset, cur, nextT, employees));
        return nextT;
      });
    } else {
      const base = { id: uid("i"), title: payload.title, requiredSkills: payload.requiredSkills, duration: payload.duration, assignees: [], status: "unscheduled", timeLog: [], week: weekOffset, checklist: instantiateChecklist(checklistItemsCombined), videoUrl: payload.videoUrl,
        customerName: payload.customerName, address: payload.address, poNumber: payload.poNumber, accessInstructions: payload.accessInstructions };
      const newInstance = payload.type === "adhoc" ? { ...base, type: "adhoc", day: payload.day } : { ...base, type: "flexible", day: null, deadline: payload.deadline };
      setInstances((prev) => {
        const thisWeek = [...prev.filter((t) => t.week === weekOffset), newInstance];
        const others = prev.filter((t) => t.week !== weekOffset);
        return [...others, ...scheduleWeek(thisWeek, employees)];
      });
    }
    setShowAddTask(false);
  }

  function importExcel() {
    const imported = [
      { title: "Reception – gulvvask", requiredSkills: [rs("Gulvvask")], duration: 60, type: "adhoc", day: "Tue" },
      { title: "Møderum vinduer", requiredSkills: [rs("Vinduespolering", 2)], duration: 90, type: "flexible", day: null, deadline: "Fri" },
      { title: "Personale-toiletter", requiredSkills: [rs("Sanitær")], duration: 45, type: "adhoc", day: "Thu" },
    ].map((t) => ({ ...t, id: uid("i"), week: weekOffset, assignees: [], status: "unscheduled", timeLog: [] }));
    setInstances((prev) => {
      const thisWeek = [...prev.filter((t) => t.week === weekOffset), ...imported];
      const others = prev.filter((t) => t.week !== weekOffset);
      return [...others, ...scheduleWeek(thisWeek, employees)];
    });
    notify(`${imported.length} opgaver importeret fra Excel og forsøgt planlagt for denne uge`);
  }

  function manualPlace(taskId, day, empId) {
    setInstances((prev) => prev.map((t) => {
      if (t.id !== taskId) return t;
      const already = t.assignees || [];
      const nextAssignees = already.includes(empId) ? already : [...already, empId];
      return { ...t, day, assignees: nextAssignees, status: t.status === "unscheduled" ? "planlagt" : t.status, warning: null };
    }));
  }
  function removeAssignee(taskId, empId) {
    setInstances((prev) => prev.map((t) => {
      if (t.id !== taskId) return t;
      const nextAssignees = (t.assignees || []).filter((id) => id !== empId);
      if (nextAssignees.length === 0) {
        return { ...t, assignees: [], day: t.type === "flexible" ? null : t.day, status: "unscheduled" };
      }
      return { ...t, assignees: nextAssignees };
    }));
  }
  function unplace(taskId) {
    setInstances((prev) => prev.map((t) => (t.id === taskId ? { ...t, day: t.type === "flexible" ? null : t.day, assignees: [], status: "unscheduled" } : t)));
  }
  function deleteTask(taskId) { setInstances((prev) => prev.filter((t) => t.id !== taskId)); }
  function bumpStatus(taskId) { setInstances((prev) => prev.map((t) => (t.id === taskId ? { ...t, status: cycleStatus(t.status) } : t))); }
  function setTaskStatus(taskId, status) { setInstances((prev) => prev.map((t) => (t.id === taskId ? { ...t, status } : t))); }
  function toggleChecklistItem(taskId, itemId) {
    setInstances((prev) => prev.map((t) => (t.id === taskId ? { ...t, checklist: (t.checklist || []).map((i) => (i.id === itemId ? { ...i, done: !i.done } : i)) } : t)));
  }
  function saveChecklistTemplate(tpl) {
    setChecklistTemplates((prev) => {
      const exists = prev.some((c) => c.id === tpl.id);
      return exists ? prev.map((c) => (c.id === tpl.id ? tpl : c)) : [...prev, tpl];
    });
  }
  function deleteChecklistTemplate(id) { setChecklistTemplates((prev) => prev.filter((c) => c.id !== id)); }

  function saveEmployee(emp) {
    setEmployees((prev) => {
      const exists = prev.some((e) => e.id === emp.id);
      const next = exists ? prev.map((e) => (e.id === emp.id ? emp : e)) : [...prev, emp];
      setInstances((cur) => {
        const thisWeek = cur.filter((t) => t.week === weekOffset);
        const others = cur.filter((t) => t.week !== weekOffset);
        return [...others, ...scheduleWeek(thisWeek, next)];
      });
      return next;
    });
    notify(`Medarbejder ${emp.name} gemt`);
    setShowAddEmp(false); setEditEmp(null);
  }
  function deleteEmployee(id) {
    setEmployees((prev) => prev.filter((e) => e.id !== id));
    setInstances((prev) => prev.map((t) => {
      if (!(t.assignees || []).includes(id)) return t;
      const nextAssignees = t.assignees.filter((a) => a !== id);
      return nextAssignees.length === 0 ? { ...t, assignees: [], status: "unscheduled" } : { ...t, assignees: nextAssignees };
    }));
  }

  function toggleTimer(taskId, empId) {
    const key = `${taskId}:${empId}`;
    setRunning((prev) => {
      const next = { ...prev };
      if (next[key]) {
        const startTs = next[key];
        const minutes = Math.max((Date.now() - startTs) / 60000, 1);
        setInstances((ts) => ts.map((t) => (t.id === taskId ? { ...t, timeLog: [...t.timeLog, { minutes, empId }] } : t)));
        delete next[key];
      } else next[key] = Date.now();
      return next;
    });
  }

  function exportCSV() {
    const rows = [["Uge", "Opgave", "Kunde", "Adresse", "PO-nummer", "Type", "Dag", "Krævede kompetencer", "Medarbejdere", "Status", "Varighed (min)", "Registreret (min)"]];
    instances.forEach((t) => {
      const names = (t.assignees || []).map((id) => employees.find((e) => e.id === id)?.name).filter(Boolean);
      const logged = t.timeLog.reduce((s, l) => s + l.minutes, 0);
      const wk = weekMeta(t.week);
      rows.push([`Uge ${wk.weekNo}`, t.title, t.customerName || "", t.address || "", t.poNumber || "", TYPE_META[t.type].label, DAYS.find((d) => d.key === t.day)?.label || "-", skillLabel(t), names.length ? names.join(" + ") : "Ikke tildelt", statusLabel(t.status), t.duration, logged.toFixed(0)]);
    });
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "ugeplan-eksport.csv"; a.click();
    URL.revokeObjectURL(url);
    notify("Eksport downloadet (til løn/faktura)");
  }

  const weekInstancesList = instances.filter((t) => t.week === weekOffset);
  const unplaced = weekInstancesList.filter((t) => !(t.assignees && t.assignees.length));
  const totalLogged = useMemo(() => instances.reduce((s, t) => s + t.timeLog.reduce((s2, l) => s2 + l.minutes, 0), 0), [instances]);
  const wk = weekMeta(weekOffset);

  return (
    <div style={styles.app}>
      <style>{globalCss}</style>
      <header style={styles.header}>
        <div style={styles.brand}>
          <div style={styles.brandMark}>RP</div>
          <div>
            <div style={styles.brandTitle}>Rengøringsplan</div>
            <div style={styles.brandSub}>Ugeplanlægning · kapacitet · kompetenceniveauer</div>
          </div>
        </div>
        <nav style={styles.nav}>
          {[["uge", "Ugeplan"], ["employees", "Medarbejdere"], ["checklists", "Tjeklister"], ["time", "Tid & Eksport"], ["mobil", "Medarbejder-app"]].map(([k, l]) => (
            <button key={k} onClick={() => setView(k)} style={view === k ? styles.navBtnActive : styles.navBtn}>{l}</button>
          ))}
        </nav>
      </header>

      {toast && <div style={styles.toast}>{toast}</div>}

      {view === "uge" && (
        <WeekView
          employees={employees} instances={weekInstancesList} unplaced={unplaced}
          onAdd={() => setShowAddTask(true)} onImport={importExcel} onAuto={runAuto}
          onPlace={manualPlace} onUnplace={unplace} onRemoveAssignee={removeAssignee} onDelete={deleteTask}
          onOpenTask={setOpenTaskId}
          dragId={dragId} setDragId={setDragId}
          weekLabel={wk.label} weekNo={wk.weekNo} weekOffset={weekOffset}
          onPrevWeek={() => changeWeek(-1)} onNextWeek={() => changeWeek(1)} onTodayWeek={() => changeWeek(-weekOffset)}
          travelSettings={travelSettings} onOpenTravelSettings={() => setShowTravelSettings(true)}
        />
      )}
      {view === "employees" && (
        <EmployeesView employees={employees} instances={weekInstancesList}
          onAdd={() => { setEditEmp(null); setShowAddEmp(true); }}
          onEdit={(e) => { setEditEmp(e); setShowAddEmp(true); }}
          onDelete={deleteEmployee} />
      )}
      {view === "checklists" && (
        <ChecklistsView checklistTemplates={checklistTemplates} onSave={saveChecklistTemplate} onDelete={deleteChecklistTemplate} />
      )}
      {view === "time" && (
        <TimeView instances={weekInstancesList} employees={employees}
          onExport={exportCSV} totalLogged={totalLogged} weekLabel={wk.label} />
      )}

      {view === "mobil" && (
        <EmployeeAppView
          employees={employees} instances={weekInstancesList} running={running}
          onToggleTimer={toggleTimer} onSetStatus={setTaskStatus} onToggleChecklistItem={toggleChecklistItem} weekLabel={wk.label}
          travelSettings={travelSettings}
        />
      )}

      {showAddTask && <TaskModal onClose={() => setShowAddTask(false)} onSave={addTask} checklistTemplates={checklistTemplates} />}
      {showAddEmp && <EmployeeModal emp={editEmp} onClose={() => { setShowAddEmp(false); setEditEmp(null); }} onSave={saveEmployee} />}
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
          onClose={() => setOpenTaskId(null)}
          onSetStatus={setTaskStatus}
          onToggleChecklistItem={toggleChecklistItem}
          onAddAssignee={(taskId, empId) => { const t = instances.find((x) => x.id === taskId); if (t?.day) manualPlace(taskId, t.day, empId); }}
          onRemoveAssignee={removeAssignee}
          onUnplace={(taskId) => { unplace(taskId); setOpenTaskId(null); }}
          onDelete={(taskId) => { deleteTask(taskId); setOpenTaskId(null); }}
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

function EmployeeAppView({ employees, instances, running, onToggleTimer, onSetStatus, onToggleChecklistItem, weekLabel, travelSettings }) {
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
              const isRunning = !!running[`${t.id}:${empId}`];
              const logged = t.timeLog.reduce((s, l) => s + l.minutes, 0);
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
                    <span style={styles.phoneTimeLogged}><Clock size={12} /> Din tid: {fmtMin(myLogged)}{shared ? ` · Total: ${fmtMin(logged)}` : ""} / {fmtMin(t.duration)}</span>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button style={isRunning ? styles.timerBtnActive : styles.timerBtn} onClick={() => onToggleTimer(t.id, empId)}>
                        {isRunning ? <><Square size={12} /> Stop</> : <><Play size={12} /> Start</>}
                      </button>
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
function WeekView({ employees, instances, unplaced, onAdd, onImport, onAuto, onPlace, onUnplace, onRemoveAssignee, onDelete, onOpenTask, dragId, setDragId, weekLabel, weekNo, weekOffset, onPrevWeek, onNextWeek, onTodayWeek, travelSettings, onOpenTravelSettings }) {
  const [addMenuTaskId, setAddMenuTaskId] = useState(null);

  return (
    <div style={styles.page}>
      <div style={styles.toolbar}>
        <button style={styles.primaryBtn} onClick={onAdd}><Plus size={16} /> Ny opgave</button>
        <button style={styles.secondaryBtn} onClick={onImport}><Upload size={16} /> Importer fra Excel</button>
        <button style={styles.secondaryBtn} onClick={onAuto}><Wand2 size={16} /> Planlæg ugen automatisk</button>
        <button style={styles.secondaryBtn} onClick={onOpenTravelSettings}><Car size={16} /> Transporttid</button>
        <div style={styles.toolbarSpacer} />
        <div style={styles.weekNav}>
          <button style={styles.weekNavBtn} onClick={onPrevWeek}><ChevronLeft size={16} /></button>
          <div style={styles.weekNavLabel}>
            <span style={styles.weekNavStrong}>Uge {weekNo}</span> · {weekLabel}
            {weekOffset === 0 && <span style={styles.weekNowTag}>Denne uge</span>}
          </div>
          <button style={styles.weekNavBtn} onClick={onNextWeek}><ChevronRight size={16} /></button>
          {weekOffset !== 0 && <button style={styles.secondaryBtn} onClick={onTodayWeek}>I dag</button>}
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
            {unplaced.map((t) => (
              <div key={t.id} draggable onDragStart={() => setDragId(t.id)} style={styles.backlogCard} onClick={() => onOpenTask(t.id)} title="Klik for at åbne serviceordren">
                <TypeBadge type={t.type} />
                <div style={styles.cardTitle}>{t.title}</div>
                {t.customerName && <div style={styles.taskChipCustomer}>{t.customerName}</div>}
                <div style={styles.cardMeta}>{skillLabel(t)} · {fmtMin(t.duration)}{t.deadline ? ` · senest ${DAYS.find((d) => d.key === t.deadline)?.label}` : ""}</div>
                {t.warning === "no_skill" && <span style={styles.errorChip}><AlertTriangle size={12} /> Ingen har alle krævede kompetencer</span>}
                {t.warning === "overloaded" && <span style={styles.warnChip}><AlertTriangle size={12} /> Ingen ledig kapacitet</span>}
                <button style={styles.iconBtnGhost} onClick={(e) => { e.stopPropagation(); onDelete(t.id); }}><Trash2 size={13} /></button>
              </div>
            ))}
          </div>
        </div>

        <div style={styles.gridWrap}>
          <div style={{ display: "grid", gridTemplateColumns: `160px repeat(${DAYS.length}, 1fr)`, gap: 8 }}>
            <div style={styles.gridCornerCell} />
            {DAYS.map((d, i) => (
              <div key={d.key} style={{ ...styles.gridHeaderCell, borderRight: i < DAYS.length - 1 ? "1px solid #CBD5E1" : "none" }}>{d.label}</div>
            ))}

            {employees.map((emp) => (
              <React.Fragment key={emp.id}>
                <div style={styles.gridRowLabel}>
                  <span style={{ ...styles.avatar, background: emp.color }}>{initials(emp.name)}</span>
                  {emp.name}
                </div>
                {DAYS.map((d, i) => {
                  const dayTasks = instances.filter((t) => (t.assignees || []).includes(emp.id) && t.day === d.key);
                  const schedule = computeDaySchedule(dayTasks, travelSettings);
                  const transportMin = schedule.filter((s) => s.type === "transport").reduce((s2, seg) => s2 + seg.minutes, 0);
                  const used = dayTasks.reduce((s, t) => s + t.duration, 0) + transportMin;
                  const cap = emp.capacity[d.key] || 0;
                  const pct = cap ? Math.min((used / cap) * 100, 100) : 0;
                  const over = used > cap;
                  return (
                    <div key={d.key} style={{ ...styles.gridCell, borderRight: i < DAYS.length - 1 ? "1px solid #CBD5E1" : "none" }}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={() => { if (dragId) onPlace(dragId, d.key, emp.id); setDragId(null); }}>
                      <div style={styles.capBarTrack}>
                        <div style={{ ...styles.capBarFill, width: `${pct}%`, background: over ? "#DC2626" : pct > 80 ? "#D97706" : "#D6247A" }} />
                      </div>
                      <div style={styles.capLabel}>{fmtMin(used)} / {fmtMin(cap)}{transportMin > 0 ? ` (inkl. ${fmtMin(transportMin)} transport)` : ""}</div>
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
                          <div key={t.id} draggable onDragStart={() => setDragId(t.id)} style={styles.taskChip} onClick={() => onOpenTask(t.id)} title="Klik for at åbne serviceordren">
                            <div style={styles.chipTopRow}>
                              <TypeBadge type={t.type} mini />
                              <span style={styles.taskChipTitle}>{seg.start != null ? `${fmtClock(seg.start)} · ` : ""}{t.title}</span>
                              <span style={{ ...styles.statusDot, background: statusColor(t.status) }} />
                              <button style={styles.chipXBtn} title="Fjern fra board (tilbage til Ikke tildelt)" onClick={(e) => { e.stopPropagation(); onUnplace(t.id); }}><X size={11} /></button>
                            </div>
                            <div style={styles.chipSubRow}>
                              {t.customerName && <span style={styles.taskChipCustomer}>{t.customerName}</span>}
                              {prog.total > 0 && <span style={styles.taskChipDur}>{prog.done}/{prog.total}</span>}
                              <span style={styles.taskChipDur}>{fmtMin(t.duration)}</span>
                            </div>

                            <div style={styles.chipAssigneeRow} onClick={(e) => e.stopPropagation()}>
                              {assignedEmps.map((a) => (
                                <button key={a.id} type="button" style={{ ...styles.chipAvatar, background: a.color }} title={`Fjern ${a.name} fra denne opgave`}
                                  onClick={() => onRemoveAssignee(t.id, a.id)}>
                                  {initials(a.name)}
                                </button>
                              ))}
                              {addable.length > 0 && (
                                <button type="button" style={styles.chipAddBtn} title="Tilføj flere medarbejdere" onClick={() => setAddMenuTaskId(menuOpen ? null : t.id)}>
                                  <Plus size={10} />
                                </button>
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
function EmployeesView({ employees, instances, onAdd, onEdit, onDelete }) {
  return (
    <div style={styles.page}>
      <div style={styles.toolbar}><button style={styles.primaryBtn} onClick={onAdd}><Plus size={16} /> Ny medarbejder</button></div>
      <div style={styles.empGrid}>
        {employees.map((e) => {
          const activeMin = DAYS.reduce((s, d) => s + usedMinutes(instances, e.id, d.key), 0);
          const capMin = DAYS.reduce((s, d) => s + (e.capacity[d.key] || 0), 0);
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
    <Modal onClose={onClose} title={checklist ? "Rediger tjekliste" : "Ny tjekliste"}>
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
function TimeView({ instances, employees, totalLogged, onExport, weekLabel }) {
  const placed = instances.filter((t) => t.assignees && t.assignees.length).sort((a, b) => DAYS.findIndex((d) => d.key === a.day) - DAYS.findIndex((d) => d.key === b.day));
  return (
    <div style={styles.page}>
      <div style={styles.toolbar}>
        <div style={styles.statBlock}><Clock size={16} /><div><div style={styles.statValue}>{fmtMin(totalLogged)}</div><div style={styles.statLabel}>Registreret i alt (alle uger)</div></div></div>
        <div style={styles.cardMeta}>Viser: {weekLabel}</div>
        <div style={styles.toolbarSpacer} />
        <button style={styles.primaryBtn} onClick={onExport}><Download size={16} /> Eksporter til løn/faktura (CSV)</button>
      </div>
      <div style={styles.hint}>Medarbejdere registrerer selv tid på deres opgaver i Medarbejder-appen. Her ser du et samlet overblik.</div>
      <div style={styles.timeList}>
        {placed.map((t) => {
          const emps = t.assignees.map((id) => employees.find((e) => e.id === id)).filter(Boolean);
          const logged = t.timeLog.reduce((s, l) => s + l.minutes, 0);
          return (
            <div key={t.id} style={styles.timeRow}>
              <div style={styles.timeRowAvatars}>
                {emps.map((emp) => <span key={emp.id} style={{ ...styles.avatar, background: emp.color }} title={emp.name}>{initials(emp.name)}</span>)}
              </div>
              <div style={{ flex: 1 }}>
                <div style={styles.timeRowTitle}>{t.title}</div>
                <div style={styles.cardMeta}>{emps.map((e) => e.name).join(" + ")} · {DAYS.find((d) => d.key === t.day)?.label} · {statusLabel(t.status)}</div>
              </div>
              <div style={styles.timeRowMinutes}>{fmtMin(logged)} / {fmtMin(t.duration)}</div>
            </div>
          );
        })}
        {placed.length === 0 && <div style={styles.emptyCol}>Ingen planlagte opgaver denne uge</div>}
      </div>
    </div>
  );
}

// ---------- Modals ----------
function TaskModal({ onClose, onSave, checklistTemplates }) {
  const [type, setType] = useState("fixed");
  const [title, setTitle] = useState("");
  const [duration, setDuration] = useState(60);
  const [requiredSkills, setRequiredSkills] = useState([{ skill: SKILLS[0], minLevel: 1 }]);
  const [days, setDays] = useState(["Mon"]);
  const [day, setDay] = useState("Mon");
  const [deadline, setDeadline] = useState("Fri");
  const [checklistTemplateIds, setChecklistTemplateIds] = useState([]);
  const [extraItems, setExtraItems] = useState([]);
  const [newItemText, setNewItemText] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [address, setAddress] = useState("");
  const [poNumber, setPoNumber] = useState("");
  const [accessInstructions, setAccessInstructions] = useState("");

  function toggleTemplate(id) { setChecklistTemplateIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])); }
  function addExtraItem() { if (!newItemText.trim()) return; setExtraItems((prev) => [...prev, newItemText.trim()]); setNewItemText(""); }
  function removeExtraItem(i) { setExtraItems((prev) => prev.filter((_, idx) => idx !== i)); }

  const previewItems = [
    ...checklistTemplateIds.flatMap((id) => checklistTemplates.find((c) => c.id === id)?.items || []),
    ...extraItems,
  ];

  function toggleDay(d) { setDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d])); }
  function addSkillRow() {
    const unused = SKILLS.find((s) => !requiredSkills.some((r) => r.skill === s)) || SKILLS[0];
    setRequiredSkills((prev) => [...prev, { skill: unused, minLevel: 1 }]);
  }
  function updateSkillRow(i, field, value) {
    setRequiredSkills((prev) => prev.map((r, idx) => (idx === i ? { ...r, [field]: field === "minLevel" ? Number(value) : value } : r)));
  }
  function removeSkillRow(i) { setRequiredSkills((prev) => prev.filter((_, idx) => idx !== i)); }

  return (
    <Modal onClose={onClose} title="Ny opgave">
      <label style={styles.label}>Type</label>
      <div style={styles.typePicker}>
        {Object.entries(TYPE_META).map(([k, m]) => (
          <button key={k} type="button" onClick={() => setType(k)} style={type === k ? { ...styles.typePickBtn, borderColor: m.color, color: m.color, background: m.bg } : styles.typePickBtn}>{m.label}</button>
        ))}
      </div>
      {type === "fixed" && <div style={styles.hint}>Faste opgaver gentages automatisk hver uge på de valgte dage.</div>}

      <label style={styles.label}>Titel</label>
      <input style={styles.input} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="F.eks. Gulvvask kontor 2. sal" />

      <label style={styles.label}>Kundenavn</label>
      <input style={styles.input} value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="F.eks. Nordkraft A/S" />

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
            {SKILLS.map((s) => <option key={s} value={s}>{s}</option>)}
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
          <label style={styles.label}>Ugedage (gentages hver uge)</label>
          <div style={styles.skillPicker}>
            {DAYS.map((d) => <button key={d.key} type="button" onClick={() => toggleDay(d.key)} style={days.includes(d.key) ? styles.skillPickBtnActive : styles.skillPickBtn}>{d.label}</button>)}
          </div>
        </>
      )}
      {type === "adhoc" && (
        <>
          <label style={styles.label}>Dag (denne uge)</label>
          <select style={styles.input} value={day} onChange={(e) => setDay(e.target.value)}>{DAYS.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}</select>
        </>
      )}
      {type === "flexible" && (
        <>
          <label style={styles.label}>Skal være udført senest (denne uge)</label>
          <select style={styles.input} value={deadline} onChange={(e) => setDeadline(e.target.value)}>{DAYS.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}</select>
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
          onClick={() => onSave({ type, title: title.trim(), requiredSkills, duration, days, day, deadline, checklistTemplateIds, extraItems, videoUrl: videoUrl.trim(), customerName: customerName.trim(), address: address.trim(), poNumber: poNumber.trim(), accessInstructions: accessInstructions.trim() })}
        >
          Gem og planlæg
        </button>
      </div>
    </Modal>
  );
}

// ---------- Travel time settings ----------
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

function EmployeeModal({ emp, onClose, onSave }) {
  const [name, setName] = useState(emp?.name || "");
  const [skills, setSkills] = useState(emp?.skills || {});
  const [capacity, setCapacity] = useState(emp?.capacity || defaultCapacity());
  const colorPool = ["#D6247A", "#111111", "#9C1B5D", "#5B5B60", "#C2487A", "#3A3A3E"];
  const [color] = useState(emp?.color || colorPool[Math.floor(Math.random() * colorPool.length)]);

  function setLevel(skill, level) {
    setSkills((prev) => { const next = { ...prev }; if (level === 0) delete next[skill]; else next[skill] = level; return next; });
  }
  function setCap(day, hours) { setCapacity((prev) => ({ ...prev, [day]: Math.max(0, Number(hours)) * 60 })); }

  return (
    <Modal onClose={onClose} title={emp ? `Rediger ${emp.name}` : "Ny medarbejder"}>
      <label style={styles.label}>Navn</label>
      <input style={styles.input} value={name} onChange={(e) => setName(e.target.value)} placeholder="Fulde navn" />

      <label style={styles.label}>Kompetenceniveau pr. kompetence</label>
      <div style={styles.skillLevelGrid}>
        {SKILLS.map((s) => {
          const current = skills[s] || 0;
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

      <div style={styles.modalActions}>
        <button style={styles.secondaryBtn} onClick={onClose}>Annuller</button>
        <button style={styles.primaryBtn} disabled={!name.trim()} onClick={() => onSave({ id: emp?.id || uid("e"), name: name.trim(), skills, color: emp?.color || color, capacity })}>Gem medarbejder</button>
      </div>
    </Modal>
  );
}

// ---------- Task / service order detail ----------
function TaskDetailModal({ task, employees, onClose, onSetStatus, onToggleChecklistItem, onAddAssignee, onRemoveAssignee, onUnplace, onDelete }) {
  const [addOpen, setAddOpen] = useState(false);
  if (!task) return null;
  const t = task;
  const assignedEmps = (t.assignees || []).map((id) => employees.find((e) => e.id === id)).filter(Boolean);
  const addable = employees.filter((e) => !(t.assignees || []).includes(e.id));
  const prog = checklistProgress(t);
  const dayLabel = t.day ? DAYS.find((d) => d.key === t.day)?.label : "Ikke planlagt endnu";
  const totalLogged = t.timeLog.reduce((s, l) => s + l.minutes, 0);
  const byEmployee = {};
  t.timeLog.forEach((l) => { if (!l.empId) return; byEmployee[l.empId] = (byEmployee[l.empId] || 0) + l.minutes; });

  return (
    <Modal onClose={onClose} title={t.title}>
      <div style={styles.detailMetaRow}>
        <TypeBadge type={t.type} />
        <span style={{ ...styles.typeChip, color: statusColor(t.status), background: "#F1EFE7" }}>{statusLabel(t.status)}</span>
      </div>
      <div style={styles.cardMeta}>{dayLabel} · {fmtMin(t.duration)}{t.deadline ? ` · senest ${DAYS.find((d) => d.key === t.deadline)?.label}` : ""}</div>
      <div style={styles.cardMeta}>{skillLabel(t)}</div>

      {(t.customerName || t.address || t.poNumber) && (
        <div style={styles.customerBox}>
          {t.customerName && <div style={styles.customerName}>{t.customerName}</div>}
          {t.address && <div style={styles.cardMeta}>{t.address}</div>}
          {t.poNumber && <div style={styles.cardMeta}>PO-nummer: {t.poNumber}</div>}
        </div>
      )}
      {t.accessInstructions && (
        <div style={styles.accessBox}>
          <div style={styles.accessTitle}><Lock size={13} /> Adgang</div>
          <div style={styles.checklistItemDescription}>{t.accessInstructions}</div>
        </div>
      )}
      {t.warning === "no_skill" && <span style={styles.errorChip}><AlertTriangle size={12} /> Ingen har alle krævede kompetencer</span>}
      {t.warning === "overloaded" && <span style={styles.warnChip}><AlertTriangle size={12} /> Ingen ledig kapacitet den dag</span>}

      <label style={styles.label}>Status</label>
      <div style={styles.typePicker}>
        {["planlagt", "i_gang", "udført"].map((s) => (
          <button key={s} type="button" onClick={() => onSetStatus(t.id, s)}
            style={t.status === s ? { ...styles.typePickBtn, borderColor: statusColor(s), color: statusColor(s), background: "#F8FAFC" } : styles.typePickBtn}>
            {statusLabel(s)}
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

      {t.checklist && t.checklist.length > 0 && (
        <>
          <label style={styles.label}>Tasks ({prog.done}/{prog.total})</label>
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
                    <Video size={11} /> Se video til denne task
                  </a>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {t.videoUrl && (
        <a href={t.videoUrl} target="_blank" rel="noreferrer" style={{ ...styles.videoBtn, marginTop: 10 }}>
          <Video size={14} /> Se instruktionsvideo
        </a>
      )}

      <label style={styles.label}>Tidsregistrering</label>
      <div style={styles.cardMeta}>{fmtMin(totalLogged)} registreret i alt af {fmtMin(t.duration)} planlagt</div>

      <div style={styles.modalActions}>
        <button style={styles.secondaryBtn} onClick={() => onUnplace(t.id)}>Flyt til ikke tildelt</button>
        <button style={{ ...styles.secondaryBtn, color: "#B91C1C", borderColor: "#FEE2E2" }} onClick={() => onDelete(t.id)}><Trash2 size={14} /> Slet</button>
        <button style={styles.primaryBtn} onClick={onClose}>Luk</button>
      </div>
    </Modal>
  );
}

function Modal({ title, children, onClose }) {
  return (
    <div style={styles.overlay} onClick={onClose}>
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
  body { margin: 0; }
  ::-webkit-scrollbar { width: 8px; height: 8px; }
  ::-webkit-scrollbar-thumb { background: #CBD5E1; border-radius: 8px; }
`;

const styles = {
  app: { fontFamily: "'Inter', -apple-system, system-ui, sans-serif", background: "#FFF6FA", minHeight: "100vh", color: "#111111" },
  header: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 24px", background: "#111111", color: "#fff", flexWrap: "wrap", gap: 12 },
  brand: { display: "flex", alignItems: "center", gap: 12 },
  brandMark: { width: 36, height: 36, borderRadius: 10, background: "#D6247A", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 14 },
  brandTitle: { fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, fontSize: 16 },
  brandSub: { fontSize: 12, color: "#E8AFC9" },
  nav: { display: "flex", gap: 6 },
  navBtn: { padding: "8px 14px", borderRadius: 8, border: "none", background: "transparent", color: "#D9A9C0", cursor: "pointer", fontSize: 13.5, fontWeight: 500 },
  navBtnActive: { padding: "8px 14px", borderRadius: 8, border: "none", background: "#D6247A", color: "#fff", cursor: "pointer", fontSize: 13.5, fontWeight: 600 },
  toast: { position: "fixed", top: 16, right: 24, background: "#111111", color: "#fff", padding: "10px 16px", borderRadius: 8, fontSize: 13.5, zIndex: 50, boxShadow: "0 8px 24px rgba(0,0,0,0.2)" },
  page: { padding: "20px 24px 40px", maxWidth: 1500, margin: "0 auto" },
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
  weekLayout: { display: "grid", gridTemplateColumns: "270px 1fr", gap: 16, alignItems: "start" },
  backlog: { background: "#FCE9F1", borderRadius: 12, padding: 12, minHeight: 300 },
  backlogTitle: { fontWeight: 700, fontSize: 13, marginBottom: 10, color: "#111111" },
  backlogList: { display: "flex", flexDirection: "column", gap: 8 },
  backlogCard: { background: "#fff", borderRadius: 10, padding: 10, boxShadow: "0 1px 2px rgba(15,42,40,0.08)", cursor: "grab", position: "relative" },
  cardTitle: { fontWeight: 600, fontSize: 12.5, marginTop: 6, lineHeight: 1.3 },
  cardMeta: { fontSize: 11, color: "#64748B", marginTop: 2 },
  errorChip: { display: "flex", alignItems: "center", gap: 4, color: "#B91C1C", fontSize: 11, fontWeight: 600, marginTop: 6 },
  warnChip: { display: "flex", alignItems: "center", gap: 4, color: "#B45309", fontSize: 11, fontWeight: 600, marginTop: 6 },
  gridWrap: { background: "#fff", borderRadius: 12, padding: 10, overflowX: "auto" },
  gridHeaderRow: { display: "grid", gap: 8, marginBottom: 6 },
  gridHeaderCell: { fontWeight: 700, fontSize: 12.5, color: "#111111", textAlign: "center", padding: "4px 0" },
  gridCornerCell: {},
  gridRow: { display: "grid", gap: 8, marginBottom: 8, alignItems: "start" },
  gridRowLabel: { display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, fontWeight: 600, padding: "8px 4px", borderRight: "1px solid #CBD5E1" },
  gridCell: { background: "#F8FAFC", borderRadius: 0, padding: 6, minHeight: 90, borderTop: "1px solid #FDF3F7", borderBottom: "1px solid #FDF3F7" },
  capBarTrack: { height: 5, background: "#E2E8F0", borderRadius: 4, overflow: "hidden" },
  capBarFill: { height: "100%", borderRadius: 4 },
  capLabel: { fontSize: 10, color: "#94A3B8", margin: "3px 0 6px" },
  taskChip: { display: "flex", flexDirection: "column", justifyContent: "center", gap: 2, height: 60, background: "#fff", border: "1px solid #E2E8F0", borderRadius: 6, padding: "5px 6px", marginBottom: 4, cursor: "pointer", position: "relative" },
  transportChip: { display: "flex", alignItems: "center", gap: 5, fontSize: 10, color: "#64748B", background: "repeating-linear-gradient(45deg, #F1EFE7, #F1EFE7 6px, #E9E6DC 6px, #E9E6DC 12px)", border: "1px dashed #CBD5E1", borderRadius: 6, padding: "4px 6px", marginBottom: 4 },
  chipTopRow: { display: "flex", alignItems: "center", gap: 4, minWidth: 0 },
  chipSubRow: { display: "flex", alignItems: "center", gap: 6, minWidth: 0 },
  taskChipTitle: { fontSize: 11, fontWeight: 600, flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  taskChipCustomer: { fontSize: 10, color: "#9C1B5D", fontWeight: 600, flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
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
  modal: { background: "#fff", borderRadius: 14, width: 460, maxWidth: "100%", maxHeight: "90vh", overflowY: "auto" },
  modalHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 18px", borderBottom: "1px solid #FFF6FA" },
  modalTitle: { fontWeight: 700, fontSize: 15, fontFamily: "'Space Grotesk', sans-serif" },
  modalBody: { padding: "16px 18px" },
  modalActions: { display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 14 },
  label: { display: "block", fontSize: 12, fontWeight: 600, color: "#475569", marginTop: 12, marginBottom: 5 },
  hint: { fontSize: 11.5, color: "#64748B", marginTop: 4 },
  input: { width: "100%", padding: "9px 10px", borderRadius: 8, border: "1px solid #E2E8F0", fontSize: 13.5, fontFamily: "inherit", background: "#F8FAFC" },
  textarea: { width: "100%", padding: "9px 10px", borderRadius: 8, border: "1px solid #E2E8F0", fontSize: 13, fontFamily: "inherit", background: "#F8FAFC", resize: "vertical" },
  inputSm: { flex: 1, padding: "7px 8px", borderRadius: 8, border: "1px solid #E2E8F0", fontSize: 12.5, fontFamily: "inherit", background: "#F8FAFC" },
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
