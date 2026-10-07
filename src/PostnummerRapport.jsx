// Nøgletal pr. postnummer: kort med varme og en tabel ved siden af (7.10.2026). Regnearbejdet står i postnummer.js.
//
// Kortet (Leaflet og OpenStreetMap-fliser) hentes først, når rapporten åbnes. Kan kortet ikke tegnes — ingen forbindelse, eller fliserne bliver blokeret — står tabellen stadig,
// for den indeholder de samme tal. Kortet er pynt oven på tallene, ikke en forudsætning for dem.

import React, { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "./supabaseClient";
import { samlPrPostnr, centroider, varmeAndel, varmeFarve, vaerdi, formatVaerdi, MAAL } from "./postnummer.js";

const BOX = { background: "#fff", borderRadius: 14, boxShadow: "0 1px 3px rgba(0,0,0,0.06)", padding: "14px 16px", textAlign: "left" };
const FELT = { padding: "8px 10px", border: "1.5px solid #E2E8F0", borderRadius: 10, fontSize: 14, fontFamily: "inherit", background: "#fff" };

export default function PostnummerRapport({ opgaver, beregn, datoAf, segmenter }) {
  const iAar = new Date().getFullYear();
  const [maal, setMaal] = useState("antal");
  const [segment, setSegment] = useState("alle");
  const [aar, setAar] = useState(String(iAar));
  const [ruter, setRuter] = useState(null);
  const [kortFejl, setKortFejl] = useState("");
  const [kortKlar, setKortKlar] = useState(false);
  const kortEl = useRef(null);
  const kortRef = useRef(null);
  const lagRef = useRef(null);
  const lRef = useRef(null);
  const harPassetKort = useRef(false);

  // Midtpunkterne ligger i de ruter, der allerede er slået op. Der geokodes intet nyt her.
  useEffect(() => {
    let afbrudt = false;
    supabase.from("travel_overrides").select("addr_a, lat_a, lng_a, addr_b, lat_b, lng_b")
      .then(({ data }) => { if (!afbrudt) setRuter(data || []); });
    return () => { afbrudt = true; };
  }, []);
  const midt = useMemo(() => centroider(ruter || []), [ruter]);

  const tal = useMemo(() => samlPrPostnr(opgaver, { beregn, datoAf, segment, aar }), [opgaver, beregn, datoAf, segment, aar]);
  const sorteret = useMemo(() => [...tal.raekker].sort((a, b) => vaerdi(b, maal) - vaerdi(a, maal)), [tal, maal]);
  const top = sorteret.length ? vaerdi(sorteret[0], maal) : 0;
  const maalInfo = MAAL.find((m) => m.key === maal);

  // Kortet tegnes én gang.
  useEffect(() => {
    let afbrudt = false;
    (async () => {
      try {
        const L = (await import("leaflet")).default;
        await import("leaflet/dist/leaflet.css");
        if (afbrudt || !kortEl.current) return;
        const kort = L.map(kortEl.current, { scrollWheelZoom: false }).setView([57.1, 9.5], 9);
        L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 17, attribution: "© OpenStreetMap" }).addTo(kort);
        lagRef.current = L.layerGroup().addTo(kort);
        lRef.current = L; kortRef.current = kort;
        setKortKlar(true);
      } catch (e) {
        if (!afbrudt) setKortFejl("Kortet kunne ikke tegnes. Tabellen har de samme tal.");
      }
    })();
    return () => { afbrudt = true; if (kortRef.current) { kortRef.current.remove(); kortRef.current = null; } };
  }, []);

  // Cirklerne tegnes forfra, når tallene skifter. To lag: en blød glorie og en fast cirkel, så det ligner varme og ikke bare prikker.
  useEffect(() => {
    const L = lRef.current, lag = lagRef.current, kort = kortRef.current;
    if (!kortKlar || !L || !lag || !kort) return;
    lag.clearLayers();
    const punkter = [];
    sorteret.forEach((r) => {
      const m = midt[r.postnr];
      if (!m) return;
      const andel = varmeAndel(vaerdi(r, maal), top);
      const radius = 12 + andel * 30;
      const farve = varmeFarve(andel);
      L.circleMarker([m.lat, m.lng], { radius: radius * 1.9, stroke: false, fillColor: farve, fillOpacity: 0.25 }).addTo(lag);
      L.circleMarker([m.lat, m.lng], { radius, color: "#7A1148", weight: 1, fillColor: farve, fillOpacity: 0.85 })
        .bindTooltip(`${r.postnr} ${r.by}: ${formatVaerdi(vaerdi(r, maal), maal)}`, { direction: "top" }).addTo(lag);
      punkter.push([m.lat, m.lng]);
    });
    if (punkter.length && !harPassetKort.current) { kort.fitBounds(punkter, { padding: [60, 60], maxZoom: 11 }); harPassetKort.current = true; }
  }, [kortKlar, sorteret, midt, maal, top]);

  const udenKoordinater = sorteret.filter((r) => !midt[r.postnr]);
  const aarListe = [String(iAar - 1), String(iAar), String(iAar + 1)];
  const andelUden = tal.ialt.antal > 0 ? Math.round((tal.uden.antal / tal.ialt.antal) * 100) : 0;

  return (
    <div>
      <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 4 }}>Hvor arbejder vi? Nøgletal pr. postnummer</div>
      <div style={{ fontSize: 13, color: "#64748B", marginBottom: 14, lineHeight: 1.55, maxWidth: 820 }}>
        Opgaverne samlet efter postnummeret i adressen. Jo mørkere og større cirkel, jo mere. Brug det til at se, hvor driften er tæt, og hvor der er plads til at vokse.
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14, alignItems: "flex-end" }}>
        <div><label htmlFor="pn-maal" style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: "#475569", marginBottom: 3 }}>Mål</label>
          <select id="pn-maal" style={FELT} value={maal} onChange={(e) => setMaal(e.target.value)}>
            {MAAL.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
          </select></div>
        <div><label htmlFor="pn-seg" style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: "#475569", marginBottom: 3 }}>Aftaletype</label>
          <select id="pn-seg" style={FELT} value={segment} onChange={(e) => setSegment(e.target.value)}>
            <option value="alle">Alle</option>
            {segmenter.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select></div>
        <div><label htmlFor="pn-aar" style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: "#475569", marginBottom: 3 }}>År</label>
          <select id="pn-aar" style={FELT} value={aar} onChange={(e) => setAar(e.target.value)}>
            <option value="alle">Alle år</option>
            {aarListe.map((a) => <option key={a} value={a}>{a}</option>)}
          </select></div>
      </div>

      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "flex-start" }}>
        <div style={{ ...BOX, flex: "1 1 460px", minWidth: 300, padding: 8 }}>
          <div ref={kortEl} style={{ height: 460, borderRadius: 10, background: "#F1F5F9" }} aria-label="Kort med varme pr. postnummer" />
          {kortFejl && <div style={{ fontSize: 13, color: "#B45309", padding: "8px 6px 2px" }}>{kortFejl}</div>}
          {ruter !== null && udenKoordinater.length > 0 && (
            <div style={{ fontSize: 12.5, color: "#64748B", padding: "8px 6px 2px" }}>
              Ikke på kortet (ingen opslåede adresser endnu): {udenKoordinater.map((r) => r.postnr).join(", ")}. De står i tabellen.
            </div>
          )}
        </div>

        <div style={{ ...BOX, flex: "1 1 420px", minWidth: 300, overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
            <thead>
              <tr style={{ color: "#64748B", textAlign: "right" }}>
                <th style={{ textAlign: "left", padding: "4px 6px", fontWeight: 600 }}>Postnummer</th>
                <th style={{ padding: "4px 6px", fontWeight: 600 }}>Opgaver</th>
                <th style={{ padding: "4px 6px", fontWeight: 600 }}>Timer</th>
                <th style={{ padding: "4px 6px", fontWeight: 600 }}>Planlagt</th>
                <th style={{ padding: "4px 6px", fontWeight: 600 }}>Realiseret</th>
              </tr>
            </thead>
            <tbody>
              {sorteret.map((r) => {
                const andel = varmeAndel(vaerdi(r, maal), top);
                return (
                  <tr key={r.postnr} style={{ borderTop: "1px solid #F1F5F9", textAlign: "right" }}>
                    <td style={{ textAlign: "left", padding: "7px 6px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span aria-hidden="true" style={{ width: 14, height: 14, borderRadius: "50%", background: varmeFarve(andel), border: "1px solid #7A1148", flexShrink: 0 }} />
                        <span><b>{r.postnr}</b> {r.by}</span>
                      </div>
                    </td>
                    <td style={{ padding: "7px 6px", fontWeight: maal === "antal" ? 700 : 400 }}>{r.antal.toLocaleString("da-DK")}</td>
                    <td style={{ padding: "7px 6px", fontWeight: maal === "timer" ? 700 : 400 }}>{formatVaerdi(r.timer, "timer")}</td>
                    <td style={{ padding: "7px 6px", fontWeight: maal === "planlagtKr" ? 700 : 400 }}>{formatVaerdi(r.planlagtKr, "planlagtKr")}</td>
                    <td style={{ padding: "7px 6px", fontWeight: maal === "realiseretKr" ? 700 : 400 }}>{formatVaerdi(r.realiseretKr, "realiseretKr")}</td>
                  </tr>
                );
              })}
              {sorteret.length === 0 && <tr><td colSpan={5} style={{ padding: "12px 6px", color: "#64748B" }}>Ingen opgaver med postnummer i det valgte udsnit.</td></tr>}
              <tr style={{ borderTop: "2px solid #E2E8F0", textAlign: "right", fontWeight: 700 }}>
                <td style={{ textAlign: "left", padding: "8px 6px" }}>I alt</td>
                <td style={{ padding: "8px 6px" }}>{tal.ialt.antal.toLocaleString("da-DK")}</td>
                <td style={{ padding: "8px 6px" }}>{formatVaerdi(tal.ialt.timer, "timer")}</td>
                <td style={{ padding: "8px 6px" }}>{formatVaerdi(tal.ialt.planlagtKr, "planlagtKr")}</td>
                <td style={{ padding: "8px 6px" }}>{formatVaerdi(tal.ialt.realiseretKr, "realiseretKr")}</td>
              </tr>
            </tbody>
          </table>
          {tal.uden.antal > 0 && (
            <div style={{ marginTop: 10, padding: "9px 11px", borderRadius: 10, background: "#FFFBEB", color: "#92400E", fontSize: 13, lineHeight: 1.5 }}>
              {tal.uden.antal.toLocaleString("da-DK")} opgaver ({andelUden} %) har ikke et postnummer i adressen og er ikke på kortet, men er med i «I alt». Ret adressen på aftalen, så den står som «Vejnavn nr, postnummer by».
            </div>
          )}
          <div style={{ fontSize: 12, color: "#94A3B8", marginTop: 10, lineHeight: 1.5 }}>
            Mål: {maalInfo.label}. Aflyste opgaver og blokeringer er ikke med. «Realiseret» er faktureret tid, så opgaver, der ikke er udført endnu, står med 0 kr.
          </div>
        </div>
      </div>
    </div>
  );
}
