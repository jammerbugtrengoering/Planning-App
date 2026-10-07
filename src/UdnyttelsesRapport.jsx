// Udnyttelsesgrad pr. medarbejder (7.10.2026). Regnearbejdet står i udnyttelse.js.
// Kapaciteten kommer fra medarbejderkortet, så rapporten er kun så god som de timer, der står dér.

import React, { useMemo, useState } from "react";
import { udnyttelsePrMedarbejder, status, LAV_GRAENSE, HOEJ_GRAENSE } from "./udnyttelse.js";

const BOX = { background: "#fff", borderRadius: 14, boxShadow: "0 1px 3px rgba(0,0,0,0.06)", padding: "14px 16px", textAlign: "left", overflowX: "auto" };
const FELT = { padding: "8px 10px", border: "1.5px solid #E2E8F0", borderRadius: 10, fontSize: 14, fontFamily: "inherit", background: "#fff" };
const FARVE = { plads: "#D97706", sund: "#D6247A", fuld: "#DC2626", ingen: "#CBD5E1" };
const MAANEDER = ["Januar", "Februar", "Marts", "April", "Maj", "Juni", "Juli", "August", "September", "Oktober", "November", "December"];
const t = (min) => (min / 60).toLocaleString("da-DK", { maximumFractionDigits: 0 }) + " t";
const pct = (p) => (p == null ? "–" : Math.round(p) + " %");
const iso = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);

export default function UdnyttelsesRapport({ opgaver, medarbejdere, datoAf, planlagtFor, erBlok, erUdelukket }) {
  const nu = new Date();
  const [aar, setAar] = useState(nu.getFullYear());
  const [maaned, setMaaned] = useState(nu.getMonth() + 1);   // 0 = hele året
  const idag = iso(nu);
  const fra = maaned ? `${aar}-${String(maaned).padStart(2, "0")}-01` : `${aar}-01-01`;
  const til = maaned ? iso(new Date(aar, maaned, 0)) : `${aar}-12-31`;
  const tal = useMemo(() => udnyttelsePrMedarbejder({ medarbejdere, opgaver, fra, til, idag, datoAf, planlagtFor, erBlok, erUdelukket }),
    [medarbejdere, opgaver, fra, til, idag, datoAf, planlagtFor, erBlok, erUdelukket]);
  const sorteret = useMemo(() => [...tal.raekker].sort((a, b) => (a.planlagtPct ?? 999) - (b.planlagtPct ?? 999)), [tal]);
  const plads = tal.raekker.filter((r) => status(r.planlagtPct) === "plads").reduce((s, r) => s + Math.max(0, r.kapacitet * (LAV_GRAENSE / 100) - r.planlagt), 0);
  const TH = { padding: "4px 6px", fontWeight: 600 };

  return (
    <div>
      <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 4 }}>Udnyttelsesgrad</div>
      <div style={{ fontSize: 13, color: "#64748B", marginBottom: 14, lineHeight: 1.55, maxWidth: 820 }}>
        Hvor stor en del af den tid, medarbejderne er til rådighed, der er fyldt med opgaver hos kunderne. Brug det til at se, hvem der har plads til flere opgaver, og hvem der er så fyldt, at en sygedag vælter planen.
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14, alignItems: "flex-end" }}>
        <div><label htmlFor="ud-aar" style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: "#475569", marginBottom: 3 }}>År</label>
          <select id="ud-aar" style={FELT} value={aar} onChange={(e) => setAar(Number(e.target.value))}>
            {[nu.getFullYear() - 1, nu.getFullYear(), nu.getFullYear() + 1].map((a) => <option key={a} value={a}>{a}</option>)}
          </select></div>
        <div><label htmlFor="ud-md" style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: "#475569", marginBottom: 3 }}>Periode</label>
          <select id="ud-md" style={FELT} value={maaned} onChange={(e) => setMaaned(Number(e.target.value))}>
            <option value={0}>Hele året</option>
            {MAANEDER.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </select></div>
        <div style={{ ...BOX, padding: "8px 14px" }}>
          <div style={{ fontSize: 12, color: "#64748B" }}>Samlet planlagt udnyttelse</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: FARVE[status(tal.ialt.planlagtPct)] }}>{pct(tal.ialt.planlagtPct)}</div>
        </div>
        <div style={{ ...BOX, padding: "8px 14px" }}>
          <div style={{ fontSize: 12, color: "#64748B" }}>Ledig tid op til {LAV_GRAENSE} %</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: "#7A1148" }}>{t(plads)}</div>
        </div>
      </div>

      <div style={BOX}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
          <thead>
            <tr style={{ color: "#64748B", textAlign: "right" }}>
              <th style={{ ...TH, textAlign: "left" }}>Medarbejder</th>
              <th style={TH}>Kapacitet</th>
              <th style={TH}>Ferie/syg</th>
              <th style={TH}>Planlagt</th>
              <th style={{ ...TH, background: "#FDF2F8", color: "#7A1148", minWidth: 150, textAlign: "left" }}>Planlagt udnyttelse ▼</th>
              <th style={TH}>Udført hidtil</th>
            </tr>
          </thead>
          <tbody>
            {sorteret.map((r) => (
              <tr key={r.id} style={{ borderTop: "1px solid #F1F5F9", textAlign: "right" }}>
                <td style={{ textAlign: "left", padding: "7px 6px" }}>{r.navn}</td>
                <td style={{ padding: "7px 6px" }}>{t(r.kapacitet)}</td>
                <td style={{ padding: "7px 6px", color: r.fravaer ? "#475569" : "#CBD5E1" }}>{r.fravaer ? t(r.fravaer) : "–"}</td>
                <td style={{ padding: "7px 6px" }}>{t(r.planlagt)}</td>
                <td style={{ padding: "7px 6px", textAlign: "left", background: "#FDF2F8" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div aria-hidden="true" style={{ flex: 1, height: 8, borderRadius: 4, background: "#F1F5F9", position: "relative", minWidth: 70 }}>
                      <div style={{ width: `${Math.min(100, r.planlagtPct || 0)}%`, height: "100%", borderRadius: 4, background: FARVE[status(r.planlagtPct)] }} />
                      <div style={{ position: "absolute", left: `${LAV_GRAENSE}%`, top: -2, bottom: -2, width: 1, background: "#94A3B8" }} />
                    </div>
                    <b style={{ color: FARVE[status(r.planlagtPct)], minWidth: 44, textAlign: "right" }}>{pct(r.planlagtPct)}</b>
                  </div>
                </td>
                <td style={{ padding: "7px 6px" }}>{r.kapTilDato ? `${t(r.udfoert)} · ${pct(r.udfoertPct)}` : "–"}</td>
              </tr>
            ))}
            {sorteret.length === 0 && <tr><td colSpan={6} style={{ padding: "12px 6px", color: "#64748B" }}>Ingen medarbejdere med kapacitet i perioden.</td></tr>}
            <tr style={{ borderTop: "2px solid #E2E8F0", textAlign: "right", fontWeight: 700 }}>
              <td style={{ textAlign: "left", padding: "8px 6px" }}>I alt</td>
              <td style={{ padding: "8px 6px" }}>{t(tal.ialt.kapacitet)}</td>
              <td style={{ padding: "8px 6px" }}>{t(tal.ialt.fravaer)}</td>
              <td style={{ padding: "8px 6px" }}>{t(tal.ialt.planlagt)}</td>
              <td style={{ padding: "8px 6px", textAlign: "left" }}>{pct(tal.ialt.planlagtPct)}</td>
              <td style={{ padding: "8px 6px" }}>{tal.ialt.kapTilDato ? `${t(tal.ialt.udfoert)} · ${pct(tal.ialt.udfoertPct)}` : "–"}</td>
            </tr>
          </tbody>
        </table>
        <div style={{ fontSize: 12, color: "#94A3B8", marginTop: 10, lineHeight: 1.5 }}>
          Kapacitet er de timer pr. ugedag, der står på medarbejderkortet, minus ferie og sygdom. Planlagt er opgavernes tid i hele perioden; udført er den registrerede tid til og med i dag, målt mod kapaciteten for de samme dage. Kørsel og kontortid er ikke med. Gul: under {LAV_GRAENSE} % (plads til flere). Rød: over {HOEJ_GRAENSE} % (ingen luft til sygdom). Streg i bjælken: {LAV_GRAENSE} %. Aflyste opgaver er ikke med.
        </div>
      </div>
    </div>
  );
}
