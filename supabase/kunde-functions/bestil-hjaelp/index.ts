import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// KUNDEDATABASEN (projekt zwbsbckoyxzzobudjxij).
//
// «Bestil ekstra hjaelp» hos Jammerbugt Rengoering (fase 5, 29.9.2026). Kun firmaets
// planlaeggere. Bestillingen gemmes IKKE her: den sendes over broen til Jammerbugts
// database (bro-modtag), og status hentes derfra. Saa findes der kun ét svar.
//
// Firmaet tages fra den, der er logget ind — aldrig fra det, der sendes med.
//
// Body:
//   { handling: "ydelser" }
//   { handling: "liste" }
//   { handling: "bestil", ydelse_id?, fritekst?, oensket_dato?, adresse?, bemaerkning? }

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const JR_BRO = Deno.env.get("JR_BRO_URL") ?? "https://gteowfoahsfpunzgdxum.supabase.co/functions/v1/bro-modtag";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const svar = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  try {
    const jwt = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    const { data: { user } } = await admin.auth.getUser(jwt);
    if (!user) return svar({ error: "ikke_logget_ind" }, 401);
    const { data: mig } = await admin.from("employees").select("name, app_email, is_admin, firma_id")
      .eq("auth_user_id", user.id).is("fratraadt_dato", null).maybeSingle();
    if (!mig?.is_admin || !mig.firma_id) return svar({ error: "kun_planlaegger" }, 403);
    const { data: firma } = await admin.from("firma").select("status").eq("id", mig.firma_id).maybeSingle();
    if (firma?.status !== "aktiv") return svar({ error: "ikke_aktiv" }, 403);

    const b = await req.json().catch(() => ({}));
    const handling = ["ydelser", "liste", "bestil"].includes(b.handling) ? b.handling : "liste";
    const body: Record<string, unknown> = { handling, firma_id: mig.firma_id };
    if (handling === "bestil") {
      Object.assign(body, {
        ydelse_id: b.ydelse_id || null, fritekst: b.fritekst ?? null, oensket_dato: b.oensket_dato || null,
        adresse: b.adresse ?? null, bemaerkning: b.bemaerkning ?? null,
        navn: mig.name ?? null, email: mig.app_email ?? user.email ?? null,
      });
    }

    const { data: noegle } = await admin.rpc("bro_noegle");
    let r: Response;
    try {
      r = await fetch(JR_BRO, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-bro-noegle": String(noegle ?? "") },
        body: JSON.stringify(body),
      });
    } catch {
      return svar({ error: "jr_utilgaengelig" }, 502);
    }
    const d = await r.json().catch(() => ({}));
    return svar(d, r.ok ? 200 : r.status);
  } catch (e) {
    console.error("bestil-hjaelp:", String((e as Error)?.message ?? e));
    return svar({ error: "ukendt" }, 500);
  }
});
