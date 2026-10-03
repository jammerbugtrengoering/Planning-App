import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Kundens vej ind til sit eget tilbud. Hun har ingen konto og skal ikke have en.
//
// verify_jwt er slaaet fra med vilje: adgangen ER den lange tilfaeldige noegle i
// linket. Til gengaeld faar hverken hun eller anon-noeglen fat i tabellen. Alt gaar
// gennem service-noeglen herinde, og de to databasefunktioner er revoked fra anon.
// Saa kan ingen sidde og afproeve noegler direkte mod databasen.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function svar(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...cors, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const body = await req.json().catch(() => ({}));
    const noegle = String(body.noegle ?? "").trim();
    if (noegle.length < 20) return svar({ error: "ugyldig_noegle" }, 400);

    if (body.handling === "hent") {
      const { data, error } = await admin.rpc("hent_tilbud_offentligt", { p_noegle: noegle });
      if (error) return svar({ error: error.message }, 500);
      if (!data) return svar({ error: "ukendt" }, 404);

      // PDF'en ligger i en privat bucket. Kunden faar en midlertidig URL, ikke en
      // permanent — ellers kunne linket deles videre og leve for evigt.
      let pdfUrl: string | null = null;
      if (data.pdfSti) {
        const { data: signeret } = await admin.storage.from("tilbud")
          .createSignedUrl(data.pdfSti, 60 * 60);
        pdfUrl = signeret?.signedUrl ?? null;
      }
      // pdfSti hoerer ikke hjemme hos kunden — den siger noget om vores lager.
      delete (data as Record<string, unknown>).pdfSti;
      return svar({ ok: true, tilbud: data, pdfUrl });
    }

    if (body.handling === "accepter") {
      const navn = String(body.navn ?? "").trim();
      if (!navn) return svar({ ok: false, grund: "navn_mangler" });

      // IP'en tages fra headeren og ALDRIG fra det klienten sender. Ellers ville
      // beviset kunne skrives af den der bestrider det bagefter.
      const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || null;
      const ua = req.headers.get("user-agent");

      const { data, error } = await admin.rpc("accepter_tilbud", {
        p_noegle: noegle, p_navn: navn,
        p_email: body.email ?? null, p_ip: ip, p_user_agent: ua,
      });
      if (error) return svar({ error: error.message }, 500);
      return svar(data);
    }

    return svar({ error: "ukendt_handling" }, 400);
  } catch (e) {
    return svar({ error: String((e && (e as Error).message) || e) }, 500);
  }
});
