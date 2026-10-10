// Sygefravær og vikardækning (7.10.2026). Kun for administratorer. Regnearbejdet står i sygefravaer.js.
// Rapporten viser dage og timer, aldrig en årsag: systemet gemmer ingen diagnose og skal ikke gøre det.

import React, { useMemo, useState } from "react";
import { sygefravaerOgVikar } from "./sygefravaer.js";

const BOX = { background: "#fff", borderRadius: 14, boxShadow: "0 1px 3px rgba(0,0,0,0.06)", padding: "14px 16px", textAlign: "left", overflowX: "auto" };
const FELT = { padding: "8px 10px", border: "1.5px solid #E2E8F0", borderRadius: 10, fontSize: 14, fontFamily: "inherit", background: "#fff" };
const MAANEDER = ["Januar", "Februar", "Marts", "April", "Maj", "Juni", "Juli", "August", "September", "Oktober", "November", "December"];
const UDFALD = {
  daekket: { tekst: "Dækket", farve: "#166534", bg: "#F0FDF4" },
  ikkeDaekket: { tekst: "Ikke dækket", farve: "#B91C1C", bg: "#FEF2F2" },
  aflyst: { tekst: "Aflyst", farve: "#64748B", bg: "#F1F5F9" },
};
const t = (min) => (min / 60).toLocaleString("da-DK", { maximumFractionDigits: 1 }) + " t";
const pct = (p) => (p == null ? "–" : (Math.round(p * 10) / 10).toLocaleString("da-DK") + " %");
const iso = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const dk = (d) => d.split("-").reverse().join(".");
const MAX_OPGAVER = 50;

export default function SygefravaerRapport({ opgaver, medarbejdere, alleMedarbejdere, datoAf, erSygdom, erAflyst, fastFor }) {
  const nu = new Date();
  const [aar, setAar] = useState(nu.getFullYear());
  const [maaned, setMaaned] = useState(0);   // 0 = hele året
  const fra = maaned ? `${aar}-${String(maaned).padStart(2, "0")}-01` : `${aar}-01-01`;
  const til = maaned ? iso(new Date(aar, maaned, 0)) : `${aar}-12-31`;
  const tal = useMemo(() => sygefravaerOgVikar({ medarbejdere, opgaver, fra, til, datoAf, erSygdom, erAflyst, fastFor }),
    [medarbejdere, opgaver, fra, til, datoAf, erSygdom, erAflyst, fastFor]);
  // Navnene slås op blandt ALLE medarbejdere, ikke kun dem, der indgår i rapporten: en ejer, der tog en sygedags opgave (afløser), er uden for rapporterne, men skal stå med navn.
  // Før 10.10.2026 stod vedkommende med sit id («e5», «evfebxn6»).
  const navn = useMemo(() => Object.fromEntries((alleMedarbejdere || medarbejdere).map((m) => [m.id, m.name])), [alleMedarbejdere, medarbejdere]);
  const raekker = useMemo(() => [...tal.raekker].filter((r) => r.sygeDage > 0).sort((a, b) => b.sygMin - a.sygMin), [tal]);
  // Ikke dækket først: det er dem, planlæggeren skal gøre noget ved.
  const rang = { ikkeDaekket: 0, daekket: 1, aflyst: 2 };
  const beroerte = useMemo(() => [...tal.beroerte].sort((a, b) => rang[a.udfald] - rang[b.udfald] || a.dato.localeCompare(b.dato)), [tal]); // eslint-disable-line
  const TH = { padding: "4px 6px", fontWeight: 600 };
  const kort = (titel, vaerdi, farve, under) => (
    <div style={{ ...BOX, padding: "8px 14px" }}>
      <div style={{ fontSize: 12, color: "#64748B" }}>{titel}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: farve }}>{vaerdi}</div>
      {under && <div style={{ fontSize: 11.5, color: "#64748B" }}>{under}</div>}
    </div>
  );

  return (
    <div>
      <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 4 }}>Sygefravær og vikardækning</div>
      <div style={{ fontSize: 13, color: "#64748B", marginBottom: 14, lineHeight: 1.55, maxWidth: 820 }}>
        Hvor mange timer der er tabt til sygdom, og hvad der blev af de opgaver, hvor aftalens faste medarbejder var syg. Brug det til at se, om sygdom rammer kunderne, og hvor der mangler en afløser.
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14, alignItems: "flex-end" }}>
        <div><label htmlFor="sy-aar" style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: "#475569", marginBottom: 3 }}>År</label>
          <select id="sy-aar" style={FELT} value={aar} onChange={(e) => setAar(Number(e.target.value))}>
            {[nu.getFullYear() - 1, nu.getFullYear(), nu.getFullYear() + 1].map((a) => <option key={a} value={a}>{a}</option>)}
          </select></div>
        <div><label htmlFor="sy-md" style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: "#475569", marginBottom: 3 }}>Periode</label>
          <select id="sy-md" style={FELT} value={maaned} onChange={(e) => setMaaned(Number(e.target.value))}>
            <option value={0}>Hele året</option>
            {MAANEDER.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </select></div>
        {kort("Sygefravær", pct(tal.ialt.procent), "#7A1148", `${t(tal.ialt.sygMin)} af ${t(tal.ialt.brutto)}`)}
        {kort("Sygedage", tal.ialt.sygeDage.toLocaleString("da-DK"), "#334155", `${tal.ialt.perioder} ${tal.ialt.perioder === 1 ? "sygemelding" : "sygemeldinger"}`)}
        {kort("Vikardækning", pct(tal.vikar.procent), "#166534", `${tal.vikar.daekket} af ${tal.vikar.berorte} opgaver dækket`)}
        {kort("Ikke dækket", tal.vikar.ikkeDaekket.toLocaleString("da-DK"), tal.vikar.ikkeDaekket ? "#B91C1C" : "#94A3B8", "opgaver uden medarbejder")}
      </div>

      <div style={{ ...BOX, marginBottom: 14 }}>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 8 }}>Pr. medarbejder</div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
          <thead>
            <tr style={{ color: "#64748B", textAlign: "right" }}>
              <th style={{ ...TH, textAlign: "left" }}>Medarbejder</th>
              <th style={TH}>Sygedage</th>
              <th style={TH}>Sygemeldinger</th>
              <th style={TH}>Sygetimer</th>
              <th style={TH}>Kapacitet</th>
              <th style={{ ...TH, background: "#FDF2F8", color: "#7A1148" }}>Sygefravær ▼</th>
            </tr>
          </thead>
          <tbody>
            {raekker.map((r) => (
              <tr key={r.id} style={{ borderTop: "1px solid #F1F5F9", textAlign: "right" }}>
                <td style={{ textAlign: "left", padding: "7px 6px" }}>{r.navn}</td>
                <td style={{ padding: "7px 6px" }}>{r.sygeDage}</td>
                <td style={{ padding: "7px 6px" }}>{r.perioder}</td>
                <td style={{ padding: "7px 6px" }}>{t(r.sygMin)}</td>
                <td style={{ padding: "7px 6px" }}>{t(r.brutto)}</td>
                <td style={{ padding: "7px 6px", fontWeight: 700, background: "#FDF2F8", color: "#7A1148" }}>{pct(r.procent)}</td>
              </tr>
            ))}
            {raekker.length === 0 && <tr><td colSpan={6} style={{ padding: "12px 6px", color: "#64748B" }}>Ingen sygedage i perioden.</td></tr>}
            <tr style={{ borderTop: "2px solid #E2E8F0", textAlign: "right", fontWeight: 700 }}>
              <td style={{ textAlign: "left", padding: "8px 6px" }}>Hele virksomheden</td>
              <td style={{ padding: "8px 6px" }}>{tal.ialt.sygeDage}</td>
              <td style={{ padding: "8px 6px" }}>{tal.ialt.perioder}</td>
              <td style={{ padding: "8px 6px" }}>{t(tal.ialt.sygMin)}</td>
              <td style={{ padding: "8px 6px" }}>{t(tal.ialt.brutto)}</td>
              <td style={{ padding: "8px 6px" }}>{pct(tal.ialt.procent)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div style={BOX}>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 8 }}>Opgaver, hvor den faste medarbejder var syg</div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
          <thead>
            <tr style={{ color: "#64748B", textAlign: "left" }}>
              <th style={TH}>Dato</th><th style={TH}>Kunde</th><th style={TH}>Fast medarbejder</th><th style={TH}>Afløser</th><th style={TH}>Status</th>
            </tr>
          </thead>
          <tbody>
            {beroerte.slice(0, MAX_OPGAVER).map((b) => {
              const u = UDFALD[b.udfald];
              return (
                <tr key={b.t.id} style={{ borderTop: "1px solid #F1F5F9" }}>
                  <td style={{ padding: "7px 6px" }}>{dk(b.dato)}</td>
                  <td style={{ padding: "7px 6px", fontWeight: 600 }}>{b.t.customerName || b.t.title}</td>
                  <td style={{ padding: "7px 6px" }}>{navn[b.fast] || b.fast}</td>
                  <td style={{ padding: "7px 6px" }}>{b.vikarer.length ? b.vikarer.map((v) => navn[v] || v).join(", ") : "–"}</td>
                  <td style={{ padding: "7px 6px" }}><span style={{ fontSize: 12, fontWeight: 700, color: u.farve, background: u.bg, borderRadius: 99, padding: "2px 9px" }}>{u.tekst}</span></td>
                </tr>
              );
            })}
            {beroerte.length === 0 && <tr><td colSpan={5} style={{ padding: "12px 6px", color: "#64748B" }}>Ingen opgaver i perioden, hvor den faste medarbejder var syg.</td></tr>}
            {beroerte.length > MAX_OPGAVER && <tr><td colSpan={5} style={{ padding: "8px 6px", color: "#64748B", fontSize: 12.5 }}>Viser de {MAX_OPGAVER} første af {beroerte.length.toLocaleString("da-DK")}. «Ikke dækket» står først.</td></tr>}
          </tbody>
        </table>
        <div style={{ fontSize: 12, color: "#94A3B8", marginTop: 10, lineHeight: 1.5 }}>
          Sygefraværet er sygedagenes timer delt med medarbejderens kapacitet i perioden, før ferie og sygdom er trukket fra. Der vises ingen årsag. Vikardækningen ser kun på opgaver med en fast medarbejder på aftalen og en dato: fleksible og ad hoc-opgaver uden fast medarbejder kan ikke kobles til en sygedag. «Ikke dækket» er opgaver uden medarbejder, eller hvor den faste stadig står på.
        </div>
      </div>
    </div>
  );
}
