import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

// Sender push-beskeder til medarbejdernes telefoner.
//
// To slags kaldere slipper igennem:
//   1. service-noeglen - vores egne baggrundsjob
//   2. en indlogget PLANLAEGGER - saa ugeplanen kan svare paa et oenske med det samme
//
// En almindelig medarbejder maa IKKE sende. Ellers kunne hun sende beskeder ud i
// firmaets navn til alle kolleger.
//
// Body:
//   { medarbejdere: ["e2","e5"], titel, tekst, url?, maerke? }
//   { alle: true, ... }            - til alle med en tilmeldt telefon

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const VAPID_OFFENTLIG = Deno.env.get("VAPID_OFFENTLIG_NOEGLE") ?? "";
const VAPID_PRIVAT = Deno.env.get("VAPID_PRIVAT_NOEGLE") ?? "";
// Push-tjenesterne vil have en kontaktadresse, saa de kan sige til hvis vi opfoerer
// os daarligt. Det er et krav i protokollen, ikke en høflighed.
const VAPID_KONTAKT = Deno.env.get("VAPID_KONTAKT") ?? "mailto:jammerbugtrengoering@outlook.dk";

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

function rolleIToken(token: string): string | null {
  try {
    const dele = token.split(".");
    if (dele.length !== 3) return null;
    const b64 = dele[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(b64.padEnd(b64.length + (4 - b64.length % 4) % 4, "=")))?.role ?? null;
  } catch { return null; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    if (!VAPID_OFFENTLIG || !VAPID_PRIVAT) {
      console.error("send-push: VAPID-noegler mangler");
      return svar({ error: "vapid_mangler" }, 500);
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "").trim();

    let maaSende = token === SERVICE_KEY || rolleIToken(token) === "service_role";
    if (!maaSende && token) {
      const { data: { user } } = await admin.auth.getUser(token);
      if (user) {
        const { data: m } = await admin.from("employees")
          .select("is_admin").eq("auth_user_id", user.id).maybeSingle();
        maaSende = !!m?.is_admin;
      }
    }
    if (!maaSende) {
      console.error("send-push afvist. rolle:", rolleIToken(token) ?? "ukendt");
      return svar({ error: "ingen_adgang" }, 401);
    }

    const { medarbejdere, alle, titel, tekst, url, maerke } = await req.json();
    if (!titel || !tekst) return svar({ error: "mangler_felter" }, 400);

    let sp = admin.from("push_abonnementer").select("endpoint, p256dh, auth, employee_id");
    if (!alle) {
      const liste = Array.isArray(medarbejdere) ? medarbejdere : [];
      if (!liste.length) return svar({ ok: true, sendt: 0, grund: "ingen_modtagere" });
      sp = sp.in("employee_id", liste);
    }
    const { data: abon, error: hentFejl } = await sp;
    if (hentFejl) return svar({ error: hentFejl.message }, 500);
    if (!abon?.length) return svar({ ok: true, sendt: 0, grund: "ingen_tilmeldte_telefoner" });

    webpush.setVapidDetails(VAPID_KONTAKT, VAPID_OFFENTLIG, VAPID_PRIVAT);

    // Indholdet krypteres til den enkelte telefon. Push-tjenesten (Apple, Google)
    // kan altsaa ikke laese hvad der staar - kun telefonen kan.
    const nyttelast = JSON.stringify({
      titel, tekst,
      url: url || "/",
      // Samme maerke overskriver en tidligere besked af samme slags i stedet for at
      // lave en ny. Uden det ville fem planaendringer give fem notifikationer.
      maerke: maerke || "besked",
    });

    let sendt = 0, fjernet = 0;
    const doede: string[] = [];

    await Promise.all(abon.map(async (a) => {
      try {
        await webpush.sendNotification(
          { endpoint: a.endpoint as string,
            keys: { p256dh: a.p256dh as string, auth: a.auth as string } },
          nyttelast,
          { TTL: 60 * 60 * 12 },
        );
        sendt++;
      } catch (e) {
        const kode = (e as { statusCode?: number })?.statusCode;
        // 404 og 410 betyder at telefonen ikke findes laengere - appen er afinstalleret
        // eller browseren har ryddet op. Raekken slettes, ellers vokser listen med
        // doede poster som vi bliver ved at forsoege paa i det uendelige.
        if (kode === 404 || kode === 410) {
          doede.push(a.endpoint as string); fjernet++;
        } else {
          console.error("push fejlede", kode, String((e as Error)?.message ?? e).slice(0, 200));
        }
      }
    }));

    if (doede.length) {
      await admin.from("push_abonnementer").delete().in("endpoint", doede);
    }
    if (sendt) {
      await admin.from("push_abonnementer")
        .update({ sidst_brugt: new Date().toISOString() })
        .in("endpoint", abon.filter((a) => !doede.includes(a.endpoint as string))
                            .map((a) => a.endpoint as string));
    }

    console.log(`send-push: ${sendt} sendt, ${fjernet} doede fjernet`);
    return svar({ ok: true, sendt, fjernet });
  } catch (e) {
    console.error("send-push:", String((e as Error).message ?? e));
    return svar({ error: String((e as Error).message ?? e) }, 500);
  }
});
