// Dækningsbidrag pr. aftaletype (7.10.2026). Kun for administratorer, fordi lønsatserne kun læses ind for dem.
// Regnearbejdet står i daekningsbidrag.js.

import React, { useMemo, useState } from "react";
import { daekningPrSegment } from "./daekningsbidrag.js";

const BOX = { background: "#fff", borderRadius: 14, boxShadow: "0 1px 3px rgba(0,0,0,0.06)", padding: "14px 16px", textAlign: "left", overflowX: "auto" };
const FELT = { padding: "8px 10px", border: "1.5px solid #E2E8F0", borderRadius: 10, fontSize: 14, fontFamily: "inherit", background: "#fff" };
const kr = (n) => Math.round(Number(n) || 0).toLocaleString("da-DK") + " kr.";

export default function DaekningsRapport({ opgaver, beregn, satsFor, datoAf, segmenter, harSatser }) {
  const iAar = new Date().getFullYear();
  const [aar, setAar] = useState(String(iAar));
  const tal = useMemo(() => daekningPrSegment(opgaver, { beregn, satsFor, datoAf, aar, segmenter }), [opgaver, beregn, satsFor, datoAf, aar, segmenter]);
  const navn = Object.fromEntries(segmenter);
  const toppen = Math.max(1, ...tal.raekker.map((r) => Math.abs(r.bidrag)));
  const raekker = tal.raekker.filter((r) => r.antal > 0);

  if (!harSatser) return <div style={{ ...BOX, color: "#64748B" }}>Lønsatserne er ikke læst ind. Dækningsbidraget kan kun ses af administratorer.</div>;

  return (
    <div>
      <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 4 }}>Dækningsbidrag pr. aftaletype</div>
      <div style={{ fontSize: 13, color: "#64748B", marginBottom: 14, lineHeight: 1.55, maxWidth: 820 }}>
        Realiseret omsætning minus den løn, der er brugt på opgaverne. Brug det til at se, hvilke aftaletyper der bærer virksomheden, og hvor timeprisen ikke dækker lønnen.
      </div>
      <div style={{ marginBottom: 14 }}>
        <label htmlFor="db-aar" style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: "#475569", marginBottom: 3 }}>År</label>
        <select id="db-aar" style={FELT} value={aar} onChange={(e) => setAar(e.target.value)}>
          <option value="alle">Alle år</option>
          {[iAar - 1, iAar, iAar + 1].map((a) => <option key={a} value={String(a)}>{a}</option>)}
        </select>
      </div>
      <div style={BOX}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
          <thead>
            <tr style={{ color: "#64748B", textAlign: "right" }}>
              <th style={{ textAlign: "left", padding: "4px 6px", fontWeight: 600 }}>Aftaletype</th>
              <th style={{ padding: "4px 6px", fontWeight: 600 }}>Opgaver</th>
              <th style={{ padding: "4px 6px", fontWeight: 600 }}>Timer</th>
              <th style={{ padding: "4px 6px", fontWeight: 600 }}>Omsætning</th>
              <th style={{ padding: "4px 6px", fontWeight: 600 }}>Løn</th>
              <th style={{ padding: "4px 6px", fontWeight: 600, background: "#FDF2F8", color: "#7A1148" }}>Dækningsbidrag</th>
              <th style={{ padding: "4px 6px", fontWeight: 600 }}>Procent</th>
            </tr>
          </thead>
          <tbody>
            {raekker.map((r) => (
              <tr key={r.noegle} style={{ borderTop: "1px solid #F1F5F9", textAlign: "right" }}>
                <td style={{ textAlign: "left", padding: "7px 6px" }}>
                  <div>{navn[r.noegle] || r.noegle}</div>
                  <div aria-hidden="true" style={{ height: 5, borderRadius: 3, marginTop: 4, width: `${Math.round((Math.abs(r.bidrag) / toppen) * 100)}%`, background: r.bidrag < 0 ? "#DC2626" : "#D6247A" }} />
                </td>
                <td style={{ padding: "7px 6px" }}>{r.antal.toLocaleString("da-DK")}</td>
                <td style={{ padding: "7px 6px" }}>{r.timer.toLocaleString("da-DK", { maximumFractionDigits: 0 })} t</td>
                <td style={{ padding: "7px 6px" }}>{kr(r.omsaetning)}</td>
                <td style={{ padding: "7px 6px" }}>{kr(r.loen)}{r.udenSatsMin > 0 ? " *" : ""}</td>
                <td style={{ padding: "7px 6px", fontWeight: 700, background: "#FDF2F8", color: r.bidrag < 0 ? "#DC2626" : "#7A1148" }}>{kr(r.bidrag)}</td>
                <td style={{ padding: "7px 6px" }}>{r.procent == null ? "–" : Math.round(r.procent) + " %"}</td>
              </tr>
            ))}
            {raekker.length === 0 && <tr><td colSpan={7} style={{ padding: "12px 6px", color: "#64748B" }}>Ingen udførte opgaver i det valgte år.</td></tr>}
            <tr style={{ borderTop: "2px solid #E2E8F0", textAlign: "right", fontWeight: 700 }}>
              <td style={{ textAlign: "left", padding: "8px 6px" }}>I alt</td>
              <td style={{ padding: "8px 6px" }}>{tal.ialt.antal.toLocaleString("da-DK")}</td>
              <td style={{ padding: "8px 6px" }}>{tal.ialt.timer.toLocaleString("da-DK", { maximumFractionDigits: 0 })} t</td>
              <td style={{ padding: "8px 6px" }}>{kr(tal.ialt.omsaetning)}</td>
              <td style={{ padding: "8px 6px" }}>{kr(tal.ialt.loen)}</td>
              <td style={{ padding: "8px 6px" }}>{kr(tal.ialt.bidrag)}</td>
              <td style={{ padding: "8px 6px" }}>{tal.ialt.procent == null ? "–" : Math.round(tal.ialt.procent) + " %"}</td>
            </tr>
          </tbody>
        </table>
        {tal.ialt.udenSatsMin > 0 && (
          <div style={{ marginTop: 10, padding: "9px 11px", borderRadius: 10, background: "#FFFBEB", color: "#92400E", fontSize: 13, lineHeight: 1.5 }}>
            * {Math.round(tal.ialt.udenSatsMin / 60).toLocaleString("da-DK")} timer på {tal.ialt.udenSatsOpgaver.toLocaleString("da-DK")} opgaver har ingen lønsats på opgavens dato og er ikke regnet med i lønnen. Bidraget er derfor for højt. Læg sats ind på medarbejderkortet.
          </div>
        )}
        <div style={{ fontSize: 12, color: "#94A3B8", marginTop: 10, lineHeight: 1.5 }}>
          Omsætning er faktureret tid (fastpris for udførte fastprisopgaver). Løn er registreret tid × medarbejderens sats på opgavens dato, uden tillæg. Kørsel, bonus og de frie omkostninger er ikke med, så det er et bidrag før faste omkostninger og ikke overskuddet (se Overskud). Aflyste opgaver og blokeringer er ikke med.
        </div>
      </div>
    </div>
  );
}
