// Omsætning pr. medarbejder (8.10.2026). Kun for administratorer: rapporten viser lønnen ved siden af omsætningen.
// Regnearbejdet og fordelingsreglen står i medarbejderomsaetning.js.

import React, { useMemo, useState } from "react";
import { omsaetningPrMedarbejder, KONTORET } from "./medarbejderomsaetning.js";

const BOX = { background: "#fff", borderRadius: 14, boxShadow: "0 1px 3px rgba(0,0,0,0.06)", padding: "14px 16px", textAlign: "left", overflowX: "auto" };
const FELT = { padding: "8px 10px", border: "1.5px solid #E2E8F0", borderRadius: 10, fontSize: 14, fontFamily: "inherit", background: "#fff" };
const MAANEDER = ["Januar", "Februar", "Marts", "April", "Maj", "Juni", "Juli", "August", "September", "Oktober", "November", "December"];
const kr = (n) => Math.round(Number(n) || 0).toLocaleString("da-DK") + " kr.";
const tal0 = (n) => Math.round(Number(n) || 0).toLocaleString("da-DK");
const pct = (p) => (p == null ? "–" : Math.round(p) + " %");

export default function MedarbejderOmsaetningRapport({ opgaver, medarbejdere, udenfor, beregn, loenFor, datoAf, segmenter, harSatser, farver = {} }) {
  const nu = new Date();
  const [aar, setAar] = useState(nu.getFullYear());
  const [maaned, setMaaned] = useState(0);
  const [segment, setSegment] = useState("alle");
  const tal = useMemo(() => omsaetningPrMedarbejder(opgaver, { beregn, loenFor, datoAf, aar, maaned, segment }),
    [opgaver, beregn, loenFor, datoAf, aar, maaned, segment]);
  const navn = useMemo(() => Object.fromEntries(medarbejdere.map((m) => [m.id, m.name])), [medarbejdere]);
  // Medarbejdere, der ikke indgår i rapporterne (ejere), står ikke som rækker; deres omsætning er med i det samlede tal og nævnes i en linje under tabellen.
  const skjulte = useMemo(() => tal.raekker.filter((r) => udenfor && udenfor.has(r.id)), [tal, udenfor]);
  const raekker = useMemo(() => [...tal.raekker].filter((r) => !(udenfor && udenfor.has(r.id))).sort((a, b) => (a.id === KONTORET) - (b.id === KONTORET) || b.omsaetning - a.omsaetning), [tal, udenfor]);
  const toppen = Math.max(1, ...raekker.map((r) => r.omsaetning));
  const udenSats = raekker.reduce((s, r) => s + r.udenSatsMin, 0);
  const timer = tal.raekker.reduce((s, r) => s + r.registreretMin, 0) / 60;
  const TH = { padding: "4px 6px", fontWeight: 600 };

  if (!harSatser) return <div style={{ ...BOX, color: "#64748B" }}>Lønsatserne er ikke læst ind. Rapporten kan kun ses af administratorer.</div>;

  return (
    <div>
      <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 4 }}>Omsætning pr. medarbejder</div>
      <div style={{ fontSize: 13, color: "#64748B", marginBottom: 14, lineHeight: 1.55, maxWidth: 820 }}>
        Hvor meget af den faktureredes omsætning hver medarbejder har leveret, og hvad det er pr. arbejdstime. Brug det til at se, hvem der bærer driften, og hvor timerne ikke giver omsætning.
      </div>
      {/* Forklaring til farverne i Omsætning-kolonnen (10.10.2026): én farve pr. aftaletype, de samme som i de andre rapporter. */}
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 12, fontSize: 12.5, color: "#475569" }} aria-label="Forklaring til farverne">
        {segmenter.map(([k, l]) => (
          <span key={k} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span aria-hidden="true" style={{ width: 11, height: 11, borderRadius: 3, background: farver[k] || "#94A3B8", display: "inline-block" }} />{l.replace(/^\S+\s/, "")}
          </span>
        ))}
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14, alignItems: "flex-end" }}>
        <div><label htmlFor="mo-aar" style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: "#475569", marginBottom: 3 }}>År</label>
          <select id="mo-aar" style={FELT} value={aar} onChange={(e) => setAar(Number(e.target.value))}>
            {[nu.getFullYear() - 1, nu.getFullYear(), nu.getFullYear() + 1].map((a) => <option key={a} value={a}>{a}</option>)}
          </select></div>
        <div><label htmlFor="mo-md" style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: "#475569", marginBottom: 3 }}>Periode</label>
          <select id="mo-md" style={FELT} value={maaned} onChange={(e) => setMaaned(Number(e.target.value))}>
            <option value={0}>Hele året</option>
            {MAANEDER.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </select></div>
        <div><label htmlFor="mo-seg" style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: "#475569", marginBottom: 3 }}>Aftaletype</label>
          <select id="mo-seg" style={FELT} value={segment} onChange={(e) => setSegment(e.target.value)}>
            <option value="alle">Alle</option>
            {segmenter.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select></div>
        <div style={{ ...BOX, padding: "8px 14px" }}>
          <div style={{ fontSize: 12, color: "#64748B" }}>Omsætning i alt</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: "#7A1148" }}>{kr(tal.ialt)}</div>
        </div>
        <div style={{ ...BOX, padding: "8px 14px" }}>
          <div style={{ fontSize: 12, color: "#64748B" }}>Pr. arbejdstime</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: "#334155" }}>{timer > 0 ? kr(tal.ialt / timer) : "–"}</div>
        </div>
      </div>

      <div style={BOX}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
          <thead>
            <tr style={{ color: "#64748B", textAlign: "right" }}>
              <th style={{ ...TH, textAlign: "left" }}>Medarbejder</th>
              <th style={TH}>Opgaver</th>
              <th style={TH}>Timer</th>
              <th style={{ ...TH, textAlign: "left", background: "#FDF2F8", color: "#7A1148", minWidth: 190 }}>Omsætning ▼</th>
              <th style={TH}>Andel</th>
              <th style={TH}>Pr. time</th>
              <th style={TH}>Løn</th>
              <th style={TH}>Bidrag</th>
            </tr>
          </thead>
          <tbody>
            {raekker.map((r) => (
              <tr key={r.id} style={{ borderTop: "1px solid #F1F5F9", textAlign: "right" }}>
                <td style={{ textAlign: "left", padding: "7px 6px" }}>{r.id === KONTORET ? "Kontoret (forgæves besøg m.m.)" : (navn[r.id] || r.id)}</td>
                <td style={{ padding: "7px 6px" }}>{r.id === KONTORET ? "–" : r.opgaver}</td>
                <td style={{ padding: "7px 6px" }}>{r.id === KONTORET ? "–" : r.timer.toLocaleString("da-DK", { maximumFractionDigits: 0 }) + " t"}</td>
                <td style={{ padding: "7px 6px", textAlign: "left", background: "#FDF2F8" }}>
                  {/* De fire aftaletyper med hver sin farve over totalen, og en stak stang, der er delt i de samme farver. Stangens længde følger totalen, så den største medarbejder stadig er fuld bredde. */}
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap", fontSize: 11.5, marginBottom: 3 }}
                    aria-label={segmenter.map(([k, l]) => `${l.replace(/^\S+\s/, "")} ${kr((r.perType || {})[k] || 0)}`).join(", ")}>
                    {segmenter.map(([k, l]) => {
                      const v = (r.perType || {})[k] || 0;
                      return (
                        <span key={k} title={`${l.replace(/^\S+\s/, "")}: ${kr(v)}`} style={{ color: v > 0 ? (farver[k] || "#334155") : "#CBD5E1", fontWeight: v > 0 ? 600 : 400, whiteSpace: "nowrap" }}>
                          <span aria-hidden="true" style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: v > 0 ? (farver[k] || "#94A3B8") : "#E2E8F0", marginRight: 4 }} />{v > 0 ? tal0(v) : "–"}
                        </span>
                      );
                    })}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div aria-hidden="true" style={{ flex: 1, height: 8, borderRadius: 4, background: "#F1F5F9", minWidth: 60, overflow: "hidden" }}>
                      <div style={{ width: `${Math.round((r.omsaetning / toppen) * 100)}%`, height: "100%", display: "flex" }}>
                        {segmenter.map(([k]) => {
                          const v = (r.perType || {})[k] || 0;
                          return v > 0 && r.omsaetning > 0 ? <div key={k} style={{ width: `${(v / r.omsaetning) * 100}%`, background: farver[k] || "#94A3B8" }} /> : null;
                        })}
                      </div>
                    </div>
                    <b style={{ minWidth: 84, textAlign: "right", color: "#7A1148" }}>{kr(r.omsaetning)}</b>
                  </div>
                </td>
                <td style={{ padding: "7px 6px" }}>{pct(r.andel)}</td>
                <td style={{ padding: "7px 6px" }}>{r.krPrTime == null || r.id === KONTORET ? "–" : kr(r.krPrTime)}</td>
                <td style={{ padding: "7px 6px" }}>{r.id === KONTORET ? "–" : kr(r.loen) + (r.udenSatsMin > 0 ? " *" : "")}</td>
                <td style={{ padding: "7px 6px", color: r.id !== KONTORET && r.bidrag < 0 ? "#DC2626" : undefined }}>{r.id === KONTORET ? "–" : kr(r.bidrag)}</td>
              </tr>
            ))}
            {raekker.length === 0 && <tr><td colSpan={8} style={{ padding: "12px 6px", color: "#64748B" }}>Ingen udførte opgaver i det valgte udsnit.</td></tr>}
          </tbody>
        </table>
        {skjulte.length > 0 && (
          <div style={{ marginTop: 10, fontSize: 12.5, color: "#64748B", lineHeight: 1.5 }}>
            Ikke vist, fordi de indgår ikke i rapporterne: {skjulte.map((r) => navn[r.id] || r.id).join(", ")}. Deres omsætning ({kr(skjulte.reduce((a, r) => a + r.omsaetning, 0))}) er med i «Omsætning i alt» øverst.
          </div>
        )}
        {udenSats > 0 && (
          <div style={{ marginTop: 10, padding: "9px 11px", borderRadius: 10, background: "#FFFBEB", color: "#92400E", fontSize: 13, lineHeight: 1.5 }}>
            * {Math.round(udenSats / 60).toLocaleString("da-DK")} timer har ingen lønsats på opgavens dato og er ikke regnet med i lønnen. Bidraget er derfor for højt for dem. Læg sats ind på medarbejderkortet.
          </div>
        )}
        <div style={{ fontSize: 12, color: "#94A3B8", marginTop: 10, lineHeight: 1.5 }}>
          Farverne viser, hvordan omsætningen fordeler sig på aftaletyperne. Omsætningen er den realiserede (faktureret tid, eller fastprisen for udførte fastprisopgaver) og fordeles på dem, der leverede den: efter fakturerbare minutter på timeopgaver, efter planlagt tid på fastpris. En elev (oplæring) får ingen omsætning, men tiden tæller som løn. «Pr. time» er omsætning delt med al registreret tid. Løn er registreret tid gange medarbejderens sats på opgavens dato, uden tillæg; kørsel og bonus er ikke med. Summen af rækkerne er præcis den realiserede omsætning i Budget-fanen.
        </div>
      </div>
    </div>
  );
}
