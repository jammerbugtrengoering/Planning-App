// En rigtig Excel-fil (.xlsx) uden et bibliotek (29.9.2026).
//
// Bruges i kundeudgaven, hvor der ikke er Dinero: Fakturering eksporteres til Excel i
// stedet (Jonn). En .xlsx er en zip med nogle faa XML-filer. Zip'en her er «stored»
// (ukomprimeret) — Excel, Numbers og LibreOffice aabner den uden problemer, og filerne
// er smaa nok til, at komprimering ikke betyder noget.
//
// raekker: [[celle, celle, ...], ...] — foerste raekke er overskrifterne.
// En celle er et tal (bliver et tal i Excel) eller tekst.
//
// Aendrer du noget her, saa ret excel.test.mjs i samme ombaering.

const enc = new TextEncoder();

const CRC_TABEL = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(bytes) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABEL[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
    // Kontroltegn er ikke tilladt i XML og ville goere filen ulaeselig.
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
}

// A, B, ... Z, AA, AB ...
export function kolonneNavn(i) {
  let s = "";
  let n = i + 1;
  while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

function arkXml(raekker) {
  const rows = raekker.map((r, ri) => {
    const celler = r.map((v, ci) => {
      const ref = `${kolonneNavn(ci)}${ri + 1}`;
      if (v === null || v === undefined || v === "") return "";
      // Overskriftsraekken faar fed skrift (stil 1).
      const stil = ri === 0 ? ' s="1"' : "";
      if (typeof v === "number" && Number.isFinite(v)) return `<c r="${ref}"${stil}><v>${v}</v></c>`;
      return `<c r="${ref}" t="inlineStr"${stil}><is><t xml:space="preserve">${esc(v)}</t></is></c>`;
    }).join("");
    return `<row r="${ri + 1}">${celler}</row>`;
  }).join("");
  const bredder = (raekker[0] || []).map((_, ci) => {
    const maks = Math.max(...raekker.map((r) => String(r[ci] ?? "").length), 6);
    return `<col min="${ci + 1}" max="${ci + 1}" width="${Math.min(60, maks + 2)}" customWidth="1"/>`;
  }).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
    + `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">`
    + `<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>`
    + (bredder ? `<cols>${bredder}</cols>` : "")
    + `<sheetData>${rows}</sheetData></worksheet>`;
}

function filer(arknavn, raekker) {
  const navn = esc(String(arknavn || "Ark1").replace(/[\\/?*[\]:]/g, " ").slice(0, 31));
  return [
    ["[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`],
    ["_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
    ["xl/workbook.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${navn}" sheetId="1" r:id="rId1"/></sheets></workbook>`],
    ["xl/_rels/workbook.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`],
    ["xl/styles.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`],
    ["xl/worksheets/sheet1.xml", arkXml(raekker)],
  ];
}

// Samler filerne i en ukomprimeret zip. Returnerer Uint8Array.
export function lavXlsx(arknavn, raekker) {
  const dele = [];
  const central = [];
  let offset = 0;
  const u16 = (v) => [v & 0xFF, (v >>> 8) & 0xFF];
  const u32 = (v) => [v & 0xFF, (v >>> 8) & 0xFF, (v >>> 16) & 0xFF, (v >>> 24) & 0xFF];
  for (const [navn, tekst] of filer(arknavn, raekker)) {
    const n = enc.encode(navn);
    const data = enc.encode(tekst);
    const crc = crc32(data);
    const lokal = new Uint8Array([
      ...u32(0x04034b50), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x21),
      ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(n.length), ...u16(0), ...n]);
    dele.push(lokal, data);
    central.push(new Uint8Array([
      ...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x21),
      ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(n.length), ...u16(0), ...u16(0),
      ...u16(0), ...u16(0), ...u32(0), ...u32(offset), ...n]));
    offset += lokal.length + data.length;
  }
  const centralLaengde = central.reduce((s, c) => s + c.length, 0);
  const slut = new Uint8Array([
    ...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(central.length), ...u16(central.length),
    ...u32(centralLaengde), ...u32(offset), ...u16(0)]);
  const alt = [...dele, ...central, slut];
  const ud = new Uint8Array(alt.reduce((s, a) => s + a.length, 0));
  let p = 0;
  for (const a of alt) { ud.set(a, p); p += a.length; }
  return ud;
}

// Henter filen i browseren.
export function hentXlsx(filnavn, arknavn, raekker) {
  const blob = new Blob([lavXlsx(arknavn, raekker)],
    { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filnavn.endsWith(".xlsx") ? filnavn : `${filnavn}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
