// Overblikket (8.10.2026): virksomhedens temperatur, punkter der kræver handling og otte nøgletal. Indgangen til rapporterne: hvert kort og hvert punkt fører til rapporten bag det,
// og fra rapporterne er der en knap tilbage hertil. Regnearbejdet står i overblik.js; her er kun visningen.

import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabaseClient";
import { MAAL, DELE, maalTal, beregnPeriode, temperatur, opmaerksomhed, statusFor, sidsteMaaneder } from "./overblik.js";

const CSS = `
.ob { --ink:#1C1320; --ink2:#5E4F5B; --ink3:#8B7C87; --line:#EBDFE6; --surf:#fff; --surf2:#F6EEF2; --acc:#D6247A; --deep:#7A1148;
  --good:#17795A; --goods:#E1F4EC; --warn:#A85F00; --warns:#FFF0D6; --crit:#C0233A; --crits:#FDE5E8; color:var(--ink); display:flex; flex-direction:column; gap:20px; text-align:left; }
.ob * { box-sizing:border-box; }
.ob h2,.ob h3 { margin:0; }
.ob .top { display:flex; flex-wrap:wrap; justify-content:space-between; align-items:flex-end; gap:10px; }
.ob .seg { display:inline-flex; background:var(--surf); border:1px solid var(--line); border-radius:10px; padding:3px; gap:2px; }
.ob .seg button { font:600 13px inherit; font-family:inherit; border:0; background:transparent; color:var(--ink2); padding:7px 14px; border-radius:7px; cursor:pointer; }
.ob .seg button[aria-pressed="true"] { background:var(--acc); color:#fff; }
.ob .hero { display:grid; grid-template-columns:minmax(300px,390px) minmax(0,1fr); gap:16px; align-items:start; }
.ob .hoejre { display:flex; flex-direction:column; min-width:0; }
.ob .venstre { display:flex; flex-direction:column; gap:16px; min-width:0; }
@media (max-width:900px) { .ob .hero { grid-template-columns:minmax(0,1fr); } }
.ob .card { background:var(--surf); border:1px solid var(--line); border-radius:16px; box-shadow:0 1px 2px rgba(60,20,45,.06),0 4px 14px rgba(60,20,45,.04); }
.ob .temp { padding:18px; display:flex; flex-direction:column; align-items:center; gap:4px; }
.ob .lab { font-weight:700; font-size:12px; letter-spacing:.08em; text-transform:uppercase; color:var(--ink3); align-self:flex-start; }
.ob .gauge { width:100%; max-width:290px; height:auto; }
.ob .verdict { font-weight:800; font-size:18px; }
.ob .sub { color:var(--ink2); text-align:center; margin:0; max-width:32ch; }
.ob .parts { width:100%; margin-top:12px; display:grid; gap:9px; }
.ob .part { display:grid; grid-template-columns:116px minmax(0,1fr) 34px; align-items:center; gap:10px; }
.ob .part .n { color:var(--ink2); font-weight:600; }
.ob .part .t { height:8px; border-radius:99px; background:var(--surf2); position:relative; overflow:hidden; }
.ob .part .t i { position:absolute; inset:0 auto 0 0; border-radius:99px; }
.ob .part b { text-align:right; }
.ob .attn { padding:16px 16px 6px; }
.ob .attn-head { display:flex; justify-content:space-between; align-items:baseline; flex-wrap:wrap; gap:8px; margin-bottom:6px; }
.ob .att { display:grid; grid-template-columns:minmax(0,1fr); gap:3px; align-items:start; justify-items:start; padding:11px 4px; border:0; border-top:1px solid var(--line); background:transparent; width:100%; text-align:left; font:inherit; color:inherit; cursor:pointer; border-radius:10px; }
.ob .att:first-of-type { border-top:0; }
.ob .att:hover { background:var(--surf2); }
.ob .att .tt { font-weight:600; }
.ob .att .dd { color:var(--ink2); font-size:13px; }
.ob .go { font-weight:600; font-size:13px; color:var(--deep); white-space:nowrap; }
.ob .pill { display:inline-flex; align-items:center; gap:5px; font-weight:700; font-size:11px; padding:2px 8px 2px 6px; border-radius:99px; white-space:nowrap; }
.ob .pill svg { width:11px; height:11px; flex:none; }
.ob .pill.crit { background:var(--crits); color:var(--crit); } .ob .pill.warn { background:var(--warns); color:var(--warn); }
.ob .pill.good { background:var(--goods); color:var(--good); } .ob .pill.info { background:var(--surf2); color:var(--ink2); } .ob .pill.ingen { background:var(--surf2); color:var(--ink3); }
.ob .sect { display:flex; justify-content:space-between; align-items:baseline; flex-wrap:wrap; gap:8px; margin-bottom:10px; }
.ob .tiles { display:grid; grid-template-columns:repeat(auto-fill,minmax(190px,1fr)); gap:10px; }
.ob .tile { padding:10px 12px 8px; display:flex; flex-direction:column; gap:2px; min-width:0; text-align:left; font:inherit; color:inherit; cursor:pointer; }
.ob .tile:hover { border-color:var(--acc); }
.ob .tile .row { display:flex; justify-content:space-between; align-items:center; gap:8px; }
.ob .tile .name { font-weight:600; font-size:12.5px; line-height:1.25; color:var(--ink2); }
.ob .tile .val { font-weight:800; font-size:22px; line-height:1.15; letter-spacing:-.02em; font-variant-numeric:tabular-nums; }
.ob .tile .val small { font-weight:600; font-size:12px; color:var(--ink3); margin-left:3px; letter-spacing:0; }
.ob .tile .meta { display:flex; gap:8px; flex-wrap:wrap; color:var(--ink3); font-size:11.5px; }
.ob .gd { color:var(--good); font-weight:700; } .ob .bd { color:var(--crit); font-weight:700; }
.ob .spark { width:100%; height:24px; display:block; overflow:visible; }
.ob .src { display:none; }
.ob .foot { color:var(--ink3); font-size:12.5px; max-width:80ch; }
.ob button:focus-visible { outline:2px solid var(--acc); outline-offset:2px; }
`;
const ICON = {
  crit: '<polygon points="6,0.8 11.2,10.8 0.8,10.8" fill="currentColor"/>',
  warn: '<polygon points="6,0.6 11.4,6 6,11.4 0.6,6" fill="currentColor"/>',
  good: '<circle cx="6" cy="6" r="5" fill="currentColor"/>',
  info: '<circle cx="6" cy="6" r="4.2" fill="none" stroke="currentColor" stroke-width="1.8"/>',
  ingen: '<circle cx="6" cy="6" r="4.2" fill="none" stroke="currentColor" stroke-width="1.8"/>',
};
const LABEL = { crit: "Kritisk", warn: "Følg op", good: "I mål", info: "Info", ingen: "Ingen data" };
function Pill({ k, tekst }) {
  return <span className={`pill ${k}`}><svg viewBox="0 0 12 12" aria-hidden="true" dangerouslySetInnerHTML={{ __html: ICON[k] }} />{tekst || LABEL[k]}</span>;
}
const FARVE = { good: "#17795A", warn: "#A85F00", crit: "#C0233A", ingen: "#8B7C87" };
const iso = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const dk = (v, dec = 0) => Number(v).toLocaleString("da-DK", { minimumFractionDigits: dec, maximumFractionDigits: dec });
function fmt(nogle, v) {
  if (v == null) return "–";
  const m = MAAL[nogle];
  return m.enhed === "%" ? dk(v, v < 10 ? 1 : 0) : dk(v, 0);
}

function Maaler({ score, niveau }) {
  const R = 92, pt = (r, a) => [110 + r * Math.cos(a), 112 + r * Math.sin(a)], ang = (v) => Math.PI + (v / 100) * Math.PI;
  const arc = (a0, a1) => { const p0 = pt(R, a0), p1 = pt(R, a1); return `M${p0[0].toFixed(2)} ${p0[1].toFixed(2)} A${R} ${R} 0 0 1 ${p1[0].toFixed(2)} ${p1[1].toFixed(2)}`; };
  const f = FARVE[niveau] || FARVE.ingen, s = score == null ? 0 : score, e = pt(R, ang(Math.max(0.5, s)));
  return (
    <svg className="gauge" viewBox="0 0 220 138" role="img" aria-label={score == null ? "Temperatur ukendt" : `Temperatur ${score} af 100`}>
      <path d={arc(ang(0), ang(40))} stroke="#C0233A" strokeOpacity=".22" strokeWidth="16" fill="none" />
      <path d={arc(ang(40), ang(70))} stroke="#A85F00" strokeOpacity=".26" strokeWidth="16" fill="none" />
      <path d={arc(ang(70), ang(100))} stroke="#17795A" strokeOpacity=".26" strokeWidth="16" fill="none" />
      {score != null && <path d={arc(ang(0.5), ang(Math.max(0.5, s)))} stroke={f} strokeWidth="16" strokeLinecap="round" fill="none" />}
      {score != null && <circle cx={e[0]} cy={e[1]} r="11" fill="#fff" stroke={f} strokeWidth="3" />}
      <text x="110" y="100" textAnchor="middle" style={{ font: "800 52px inherit", fill: "#1C1320" }}>{score == null ? "–" : score}</text>
      <text x="110" y="122" textAnchor="middle" style={{ font: "500 13px inherit", fill: "#8B7C87" }}>af 100</text>
      <text x="22" y="132" textAnchor="middle" style={{ font: "500 12px inherit", fill: "#8B7C87" }}>Kold</text>
      <text x="198" y="132" textAnchor="middle" style={{ font: "500 12px inherit", fill: "#8B7C87" }}>Varm</text>
    </svg>
  );
}

function Kurve({ vaerdier, mal, farve }) {
  const xs = vaerdier.filter((v) => v != null);
  if (xs.length < 2) return <div style={{ height: 24 }} />;
  const W = 220, H = 24, p = 3, mn = Math.min(...xs, mal), mx = Math.max(...xs, mal);
  const n = vaerdier.length, sx = (i) => p + (i * (W - 2 * p)) / (n - 1), sy = (v) => H - p - ((v - mn) / (mx - mn || 1)) * (H - 2 * p);
  const pts = vaerdier.map((v, i) => (v == null ? null : [sx(i), sy(v)])).filter(Boolean);
  const linje = pts.map((q, i) => `${i ? "L" : "M"}${q[0].toFixed(1)} ${q[1].toFixed(1)}`).join(" ");
  const flade = `${linje} L${pts[pts.length - 1][0].toFixed(1)} ${H - p} L${pts[0][0].toFixed(1)} ${H - p} Z`;
  const my = sy(mal);
  return (
    <svg className="spark" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
      <line x1={p} x2={W - p} y1={my} y2={my} stroke="#EBDFE6" strokeWidth="1.5" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
      <path d={flade} fill={farve} fillOpacity=".14" />
      <path d={linje} fill="none" stroke={farve} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
}

export default function OverblikRapport({ input, medDinero, onAabn, onSide }) {
  const nu = new Date(), idag = iso(nu);
  const [periode, setPeriode] = useState("maaned");
  const [forfaldne, setForfaldne] = useState(null);

  // Forfaldne fakturaer ligger i Dinero-statussen (samme tabel som Overskud-fanen). Mangler modulet, er der ingen linje.
  useEffect(() => {
    if (!medDinero) return;
    let afbrudt = false;
    supabase.from("dinero_fakturastatus").select("status, beloeb, antal").then(({ data }) => {
      if (afbrudt || !data) return;
      const f = data.filter((r) => r.status === "Overdue");
      setForfaldne({ antal: f.reduce((s, r) => s + (r.antal || 0), 0), beloeb: f.reduce((s, r) => s + (Number(r.beloeb) || 0), 0) });
    });
    return () => { afbrudt = true; };
  }, [medDinero]);

  // Målene kommer fra Opsætning -> Nøgletal og mål; input.maal er firma.noegletal_maal.
  const maal = useMemo(() => maalTal(input.maal), [input.maal]);
  const grund = useMemo(() => ({ ...input, maal, idag, forfaldne }), [input, maal, idag, forfaldne]);
  const raekke = useMemo(() => {
    const y = nu.getFullYear(), m = nu.getMonth();
    const lav = (a, b) => ({ fra: iso(a), til: iso(b) });
    if (periode === "maaned") return { nu: lav(new Date(y, m, 1), new Date(y, m + 1, 0)), foer: lav(new Date(y, m - 1, 1), new Date(y, m, 0)), navn: nu.toLocaleDateString("da-DK", { month: "long", year: "numeric" }), mod: "forrige måned" };
    if (periode === "kvartal") { const q = Math.floor(m / 3) * 3; return { nu: lav(new Date(y, q, 1), new Date(y, q + 3, 0)), foer: lav(new Date(y, q - 3, 1), new Date(y, q, 0)), navn: `${Math.floor(m / 3) + 1}. kvartal ${y}`, mod: "forrige kvartal" }; }
    return { nu: lav(new Date(y, 0, 1), new Date(y, 11, 31)), foer: lav(new Date(y - 1, 0, 1), new Date(y - 1, 11, 31)), navn: String(y), mod: "sidste år" };
  }, [periode]); // eslint-disable-line react-hooks/exhaustive-deps
  const p = useMemo(() => beregnPeriode(grund, raekke.nu.fra, raekke.nu.til), [grund, raekke]);
  const foer = useMemo(() => beregnPeriode(grund, raekke.foer.fra, raekke.foer.til).v, [grund, raekke]);
  // Tolv måneder som kurve: samme funktion pr. måned. Aftaler, der udløber, er et øjebliksbillede og har ingen kurve.
  const serie = useMemo(() => sidsteMaaneder(idag, 12).map((mm) => beregnPeriode(grund, mm.fra, mm.til).v), [grund, idag]);
  const temp = useMemo(() => temperatur(p.v, maal), [p, maal]);
  const punkter = useMemo(() => opmaerksomhed(grund, p), [grund, p]);
  const antal = (k) => punkter.filter((x) => x.alvor === k).length;
  const ord = temp.niveau === "good" ? "Sund drift" : temp.niveau === "warn" ? "Følg med" : temp.niveau === "crit" ? "Under pres" : "Ingen tal endnu";
  const tekst = punkter.length === 0 ? "Intet kræver handling lige nu." : `${punkter.length} ${punkter.length === 1 ? "ting trækker" : "ting trækker"} ned eller kræver handling.`;
  const gaa = (x) => (x.rapport ? onAabn(x.rapport) : onSide(x.side, x.arg));

  return (
    <div className="ob">
      <style>{CSS}</style>
      <div className="top">
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 800 }}>Virksomhedens temperatur</h2>
          <div style={{ color: "#5E4F5B" }}>{raekke.navn}</div>
        </div>
        <div className="seg" role="group" aria-label="Periode">
          {[["maaned", "Måned"], ["kvartal", "Kvartal"], ["aar", "År"]].map(([k, l]) => (
            <button key={k} type="button" aria-pressed={periode === k} onClick={() => setPeriode(k)}>{l}</button>
          ))}
        </div>
      </div>

      <section className="hero">
        <div className="venstre">
        <div className="card temp">
          <div className="lab">Temperatur</div>
          <Maaler score={temp.score} niveau={temp.niveau} />
          <div className="verdict" style={{ color: FARVE[temp.niveau] }}>{ord}</div>
          <p className="sub">{tekst}</p>
          <div className="parts">
            {temp.dele.map((d) => (
              <div className="part" key={d.key}>
                <span className="n">{d.navn}</span>
                <span className="t"><i style={{ width: `${d.score || 0}%`, background: d.score == null ? "#CBD5E1" : d.score >= 70 ? FARVE.good : d.score >= 40 ? FARVE.warn : FARVE.crit }} /></span>
                <b>{d.score == null ? "–" : d.score}</b>
              </div>
            ))}
          </div>
        </div>

        </div>
        <div className="hoejre">
        <div className="sect"><h3 style={{ fontSize: 18, fontWeight: 800 }}>Nøgletal</h3><span style={{ color: "#8B7C87", fontSize: 13 }}>Mod {raekke.mod} · kurve: de sidste tolv måneder · stiplet streg er målet</span></div>
        <div className="tiles">
          {Object.entries(MAAL).map(([k, m]) => {
            const v = p.v[k], s = statusFor(k, v, maal), tidl = foer[k];
            const d = v != null && tidl != null ? v - tidl : null;
            const godt = d == null ? null : m.hoej ? d >= 0 : d <= 0;
            const dtxt = d == null ? "" : `${d >= 0 ? "▲" : "▼"} ${dk(Math.abs(d), m.enhed === "%" ? 1 : 0)}${m.enhed === "%" ? " pkt." : m.enhed === "kr." ? " kr." : ""}`;
            return (
              <button type="button" className="card tile" key={k} onClick={() => onAabn(m.rapport)} title={`Åbn rapporten: ${m.navn}`}>
                <div className="row"><span className="name">{m.navn}</span><Pill k={s} tekst={s === "good" ? "I mål" : s === "warn" ? "Under" : s === "crit" ? "Langt fra" : "Ingen data"} /></div>
                <div className="val">{fmt(k, v)}<small>{m.enhed}</small></div>
                <div className="meta">{d != null && <span className={godt ? "gd" : "bd"}>{dtxt}</span>}<span>Mål {m.hoej ? "" : "højst "}{fmt(k, maal[k])} {m.enhed}</span></div>
                {k !== "udloeb" && <Kurve vaerdier={serie.map((x) => x[k])} mal={maal[k]} farve={s === "crit" ? FARVE.crit : s === "warn" ? FARVE.warn : "#D6247A"} />}
                <span className="src">Åbn rapporten →</span>
              </button>
            );
          })}
        </div>
        <div style={{ height: 16 }} />
        <div className="card attn">
          <div className="attn-head">
            <h3 style={{ fontSize: 18, fontWeight: 800 }}>Kræver opmærksomhed</h3>
            <span style={{ color: "#8B7C87", fontSize: 13 }}>{antal("crit")} kritiske · {antal("warn")} til opfølgning{antal("info") ? ` · ${antal("info")} til information` : ""}</span>
          </div>
          {punkter.length === 0 && <div style={{ padding: "14px 4px", color: "#5E4F5B" }}>Ingen punkter. Alt er inden for mål.</div>}
          {punkter.map((x, i) => (
            <button type="button" className="att" key={i} onClick={() => gaa(x)}>
              <Pill k={x.alvor} />
              <div><div className="tt">{x.titel}</div><div className="dd">{x.tekst}</div></div>
              <span className="go">{x.knap} →</span>
            </button>
          ))}
        </div>
        </div>

      </section>

      <p className="foot">
        Temperaturen er gennemsnittet af fire dele ({DELE.map((d) => d[1]).join(", ")}). Hver del er gennemsnittet af sine nøgletal, hvor 100 betyder, at målet er nået.
        Under {40} er det kritisk, under {70} skal I følge med. Målene sættes under Opsætning → Nøgletal og mål. Tallene er de samme som i rapporterne bag kortene, regnet på den valgte periode.
      </p>
    </div>
  );
}
