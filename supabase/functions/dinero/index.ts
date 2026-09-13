import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const DINERO_CLIENT_ID = Deno.env.get("DINERO_CLIENT_ID") ?? "";
const DINERO_CLIENT_SECRET = Deno.env.get("DINERO_CLIENT_SECRET") ?? "";
const DINERO_API_KEY = Deno.env.get("DINERO_API_KEY") ?? "";
const DINERO_ORG_ID = Deno.env.get("DINERO_ORG_ID") ?? "324545";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

// Hvad en portalkunde overhovedet kan bede om. Alle tre er rene opslag mod Dinero.
// Listen staar her og ikke som spredte if-saetninger, saa det er til at se med ét blik
// at der ikke findes en vej fra portalen til noget der skriver.
const KUNDENS_HANDLINGER = ["kundefakturaer", "fakturalinjer", "fakturaPdf"];

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Tokenet gemmes mellem kald.
//
// Foer blev der hentet et NYT token ved hvert eneste kald - et fuldt OAuth-opslag mod
// Dinero foer noget som helst andet arbejde gik i gang. Det er 300-1500 ms hver gang,
// og det ligger foran ALLE handlinger, ogsaa dem der ellers er hurtige.
//
// En edge-funktion lever et stykke tid mellem kald, saa variablen her overlever fra
// den ene forespoergsel til den naeste. Sker det ikke - efter en genstart - hentes der
// bare et nyt. Der trækkes et minut fra udloebet, saa vi ikke naar at bruge et token
// der udloeber undervejs.
let cachetToken: string | null = null;
let cachetUdloeb = 0;

async function getDineroToken(): Promise<string> {
  if (cachetToken && Date.now() < cachetUdloeb) return cachetToken;
  const encoded = btoa(`${DINERO_CLIENT_ID}:${DINERO_CLIENT_SECRET}`);
  const res = await fetch("https://authz.dinero.dk/dineroapi/oauth/token", {
    method: "POST",
    headers: { "Authorization": `Basic ${encoded}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "password", scope: "read write", username: DINERO_API_KEY, password: DINERO_API_KEY }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Auth failed ${res.status}: ${text}`);
  const data = JSON.parse(text);
  if (!data.access_token) throw new Error("No access_token");
  // expires_in er sekunder. Kommer den ikke med, gaettes der lavt hellere end hoejt.
  const levetid = Number(data.expires_in) || 600;
  cachetToken = data.access_token;
  cachetUdloeb = Date.now() + Math.max(0, levetid - 60) * 1000;
  return data.access_token;
}

async function contactsByFilter(token: string, filter: string): Promise<any[]> {
  const url = `https://api.dinero.dk/v1/${DINERO_ORG_ID}/contacts?queryFilter=${encodeURIComponent(filter)}&fields=ContactGuid,Name,VatNumber,EanNumber&pageSize=20`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) return [];
  const data = await res.json();
  return data?.Collection || [];
}

async function findContactGuid(token: string, customerName: string): Promise<{ guid?: string; error?: string; matches?: string[] }> {
  const clean = String(customerName).replace(/'/g, "").trim();
  const withoutSuffix = clean.replace(/\s+(A\/S|ApS|I\/S|K\/S|Erhvervspark)$/i, "").trim();
  const firstWord = clean.split(/\s+/)[0];

  let hits = await contactsByFilter(token, "Name eq '" + clean + "'");
  if (hits.length === 1) return { guid: hits[0].ContactGuid };
  if (hits.length > 1) return { error: "ambiguous", matches: hits.map((c: any) => c.Name) };

  hits = await contactsByFilter(token, "Name contains '" + clean + "'");
  if (hits.length === 1) return { guid: hits[0].ContactGuid };
  if (hits.length > 1) return { error: "ambiguous", matches: hits.map((c: any) => c.Name) };

  if (withoutSuffix && withoutSuffix !== clean) {
    hits = await contactsByFilter(token, "Name contains '" + withoutSuffix + "'");
    if (hits.length === 1) return { guid: hits[0].ContactGuid };
    if (hits.length > 1) return { error: "ambiguous", matches: hits.map((c: any) => c.Name) };
  }

  if (firstWord && firstWord.length >= 3 && firstWord !== clean) {
    hits = await contactsByFilter(token, "Name contains '" + firstWord + "'");
    if (hits.length === 1) return { guid: hits[0].ContactGuid };
    if (hits.length > 1) return { error: "ambiguous", matches: hits.map((c: any) => c.Name) };
  }

  return { error: "not_found" };
}

async function findSalesAccountNumber(token: string): Promise<number> {
  const url = `https://api.dinero.dk/v1/${DINERO_ORG_ID}/accounts/entry`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) return 1000;
  const list = await res.json();
  if (!Array.isArray(list) || list.length === 0) return 1000;
  const match = list.find((a: any) =>
    typeof a.Name === "string" && /m\/moms/i.test(a.Name) && !/u\/moms|momsfri|udland/i.test(a.Name)
  );
  return match ? match.AccountNumber : 1000;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    // Hvem spoerger? Funktionen havde INGEN kontrol foer: enhver med den offentlige
    // noegle kunne kalde action "search" og laese hele kundelisten ud af Dinero.
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const jwt = (req.headers.get("Authorization") ?? "").replace("Bearer ", "").trim();
    const { data: { user } } = await admin.auth.getUser(jwt);
    if (!user) return jsonResponse({ error: "ikke_logget_ind" }, 401);

    const { data: medarb } = await admin
      .from("employees").select("id, is_admin").eq("auth_user_id", user.id).maybeSingle();
    const { data: portalbruger } = await admin
      .from("portal_brugere")
      .select("dinero_contact_guid, portal_abonnement!inner(status)")
      .eq("auth_user_id", user.id).eq("aktiv", true).maybeSingle();

    const erPlanlaegger = !!medarb?.is_admin;
    const portalGuid = portalbruger?.portal_abonnement?.status === "aktiv"
      ? portalbruger.dinero_contact_guid : null;

    const { action, query, contact, customerName, contactGuid, lines, date, invoiceDescription } = await req.json();

    // En portalkunde slipper KUN igennem paa de tre opslag. Spaerringen staar foer
    // alt andet, saa en ny handling ikke ved et uheld bliver aaben for kunder.
    if (!erPlanlaegger && !KUNDENS_HANDLINGER.includes(action)) {
      return jsonResponse({ error: "kun_planlaegger" }, 403);
    }

    const token = await getDineroToken();

    // Hvis kunde er det?
    //
    // For en PORTALKUNDE: altid hendes eget guid, slaaet op ud fra hendes login. Aldrig
    // det der staar i kaldet — ellers kunne enhver kunde se en andens fakturaer ved at
    // aendre ét felt i browseren.
    //
    // For en PLANLAEGGER: den kunde hun har slaaet op. Raekkefoelgen er vigtig. Er hun
    // OGSAA oprettet som portalbruger (det sker under afproevning), ville et portalguid
    // der kom foerst laase hende til den ene kunde inde i planlaegningen — og hun ville
    // se en anden kundes fakturaer paa kundekortet uden nogen forklaring.
    const minGuid = () => (erPlanlaegger ? (contactGuid || portalGuid) : portalGuid);

    // ── Kundens egne fakturaer ────────────────────────────────────────────
    if (action === "kundefakturaer") {
      const guid = minGuid();
      if (!guid) return jsonResponse({ error: "ingen_adgang" }, 403);

      // BEMAERK: ingen sort/sortOrder. Dinero svarer 500 med tom krop paa dem — maalt,
      // ikke gaettet: filter og felter gav 200, sorteringen alene gav 500.
      //
      // DATOAFGRAENSNING VIRKER IKKE HER. Der stod et forsoeg paa
      // "ContactGuid eq '...' and Date ge '...'" — Dineros filter paa dette endpoint
      // tager kun ÉN betingelse. Alt efter "eq" blev laest som selve vaerdien, og
      // svaret var: Could not parse value input '<guid>' and Date ge '<dato>' as guid.
      // Skal der afgraenses paa dato, skal Dineros dokumentation tjekkes foerst.
      const felter = "Guid,Number,Date,Description,TotalExclVat,TotalInclVat,PaymentDate,Status,ContactGuid,ContactName";
      const url = `https://api.dinero.dk/v1/${DINERO_ORG_ID}/invoices`
        + `?queryFilter=${encodeURIComponent("ContactGuid eq '" + guid + "'")}`
        + `&fields=${felter}&pageSize=50`;
      // Dineros fakturaopslag kan tage titusinder af sekunder for en kunde med lang
      // historik, og edge-funktionen bliver draebt foer den naar at svare. Browseren
      // meldte saa "Failed to send a request to the Edge Function", som om anmodningen
      // aldrig var kommet afsted. Nu opgives der efter 20 sekunder med en besked
      // planlaeggeren kan forstaa.
      const afbryd = AbortSignal.timeout(20000);
      let res: Response;
      try {
        res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: afbryd });
      } catch (e) {
        console.error("kundefakturaer timeout:", String((e as Error)?.message ?? e));
        return jsonResponse({ error: "dinero_svarede_ikke",
          message: "Dinero svarede ikke inden for 20 sekunder. Prøv igen om lidt." });
      }
      const tekst = await res.text();
      if (!res.ok) {
        console.error("kundefakturaer:", res.status, tekst.slice(0, 400));
        return jsonResponse({ error: "dinero_afviste", dineroStatus: res.status,
                              message: tekst.slice(0, 400) || "Dinero svarede " + res.status + " uden forklaring." });
      }
      const data = JSON.parse(tekst);
      const fakturaer = (data?.Collection ?? [])
        .slice()
        .sort((a: any, b: any) => String(b.Date ?? "").localeCompare(String(a.Date ?? "")));
      return jsonResponse({ ok: true, fakturaer });
    }

    // ── Linjerne paa én faktura ─────────────────────────────────────────
    // Rent opslag. Der returneres KUN linjernes indhold — ikke hele fakturaobjektet,
    // som ogsaa rummer felter der hoerer til bogfoeringen og ikke til kunden.
    if (action === "fakturalinjer") {
      const guid = minGuid();
      if (!guid) return jsonResponse({ error: "ingen_adgang" }, 403);
      const fakturaGuid = String(query ?? "").trim();
      if (!fakturaGuid) return jsonResponse({ error: "faktura_mangler" }, 400);

      const res = await fetch(
        `https://api.dinero.dk/v1/${DINERO_ORG_ID}/invoices/${fakturaGuid}`,
        { headers: { Authorization: `Bearer ${token}` } });
      const tekst = await res.text();
      if (!res.ok) {
        console.error("fakturalinjer:", res.status, tekst.slice(0, 300));
        return jsonResponse({ error: "ukendt_faktura", dineroStatus: res.status }, 404);
      }
      const d = JSON.parse(tekst);
      // Tilhoerer fakturaen hende overhovedet? Ellers kunne man laese en andens ved
      // at gaette et guid.
      if (d?.ContactGuid !== guid) return jsonResponse({ error: "ingen_adgang" }, 403);

      const linjer = (d?.ProductLines ?? []).map((l: any) => ({
        beskrivelse: l.Description ?? "",
        bemaerkning: l.Comments ?? l.comments ?? "",
        antal: Number(l.Quantity) || 0,
        enhed: l.Unit ?? "",
        stykpris: Number(l.BaseAmountValue) || 0,
        // Dinero regner selv totalen ud. Er den der ikke, ganges der her frem for at
        // vise ingenting.
        total: Number(l.TotalAmount ?? (Number(l.BaseAmountValue) || 0) * (Number(l.Quantity) || 0)),
      }));

      return jsonResponse({
        ok: true, linjer,
        exMoms: Number(d?.TotalExclVat) || 0,
        inklMoms: Number(d?.TotalInclVat) || 0,
        moms: (Number(d?.TotalInclVat) || 0) - (Number(d?.TotalExclVat) || 0),
      });
    }

    // ── Selve fakturaen som PDF ────────────────────────────────────────
    if (action === "fakturaPdf") {
      const guid = minGuid();
      if (!guid) return jsonResponse({ error: "ingen_adgang" }, 403);
      const fakturaGuid = String(query ?? "").trim();
      if (!fakturaGuid) return jsonResponse({ error: "faktura_mangler" }, 400);

      const tjek = await fetch(
        `https://api.dinero.dk/v1/${DINERO_ORG_ID}/invoices/${fakturaGuid}`,
        { headers: { Authorization: `Bearer ${token}` } });
      if (!tjek.ok) return jsonResponse({ error: "ukendt_faktura" }, 404);
      const detalje = await tjek.json();
      if (detalje?.ContactGuid !== guid) return jsonResponse({ error: "ingen_adgang" }, 403);

      const pdfRes = await fetch(
        `https://api.dinero.dk/v1/${DINERO_ORG_ID}/invoices/${fakturaGuid}`,
        { headers: { Authorization: `Bearer ${token}`, Accept: "application/octet-stream" } });
      if (!pdfRes.ok) return jsonResponse({ error: "pdf_fejlede", dineroStatus: pdfRes.status });

      return new Response(await pdfRes.arrayBuffer(), {
        headers: { ...corsHeaders, "Content-Type": "application/pdf" },
      });
    }

    // ── Herfra er alt planlaeggerens vaerktoejer ──────────────────────────────
    if (action === "search") {
      const url = `https://api.dinero.dk/v1/${DINERO_ORG_ID}/contacts?queryFilter=${encodeURIComponent("Name contains '" + String(query).replace(/'/g, "") + "'")}&fields=ContactGuid,Name,VatNumber,EanNumber,Street,ZipCode,City&pageSize=10`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      const text = await res.text();
      return new Response(text, { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: res.status });
    }

    if (action === "create") {
      const res = await fetch(`https://api.dinero.dk/v1/${DINERO_ORG_ID}/contacts`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          Name: contact.name,
          Street: contact.address || "",
          ZipCode: contact.zipCode || "",
          City: contact.city || "",
          IsPerson: false,
          CountryKey: contact.countryKey || "DK",
          IsMember: false,
          UseCvr: false,
        }),
      });
      const text = await res.text();
      return new Response(text, { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: res.status });
    }

    if (action === "createInvoiceDraft") {
      if (!customerName) return jsonResponse({ error: "missing_customerName" }, 400);
      if (!Array.isArray(lines) || lines.length === 0) return jsonResponse({ error: "missing_lines" }, 400);

      const contactResult = contactGuid ? { guid: contactGuid } : await findContactGuid(token, customerName);
      if (contactResult.error) {
        return new Response(
          JSON.stringify({
            error: contactResult.error,
            customerName,
            matches: contactResult.matches || [],
            message: contactResult.error === "ambiguous"
              ? `Flere kunder i Dinero hedder "${customerName}". Vaelg kunden igen paa opgaven, saa gemmes det unikke kundenummer — eller ryd op i dubletterne i Dinero.`
              : `Kunden "${customerName}" blev ikke fundet i Dinero.`,
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const salesAccount = await findSalesAccountNumber(token);
      if (!salesAccount) return jsonResponse({ error: "no_sales_account_found" }, 500);

      const ProductLines = lines.map((l: any) => ({
        BaseAmountValue: Number(l.unitPrice) || 0,
        Quantity: Number(l.quantity) || 0,
        AccountNumber: salesAccount,
        Discount: 0,
        Unit: l.unit || "hours",
        Description: String(l.description || "Rengøring").slice(0, 500),
        comments: String(l.comments || "").slice(0, 500),
      }));

      const res = await fetch(`https://api.dinero.dk/v1/${DINERO_ORG_ID}/invoices`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          ContactGuid: contactResult.guid,
          Date: date || new Date().toISOString().slice(0, 10),
          Description: invoiceDescription || "Fakturagrundlag",
          ProductLines,
        }),
      });
      const text = await res.text();
      if (!res.ok) {
        return jsonResponse({
          error: "dinero_afviste",
          dineroStatus: res.status,
          message: `Dinero afviste fakturaen (${res.status}): ${text.slice(0, 400)}`,
        });
      }
      return new Response(text, { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: res.status });
    }

    return jsonResponse({ error: "Unknown action" }, 400);
  } catch (err) {
    console.error("dinero:", (err as Error).message);
    return jsonResponse({ error: (err as Error).message }, 500);
  }
});
