import webpush from "npm:web-push@3.6.7";
import { klient, cors, svar, SERVICE_KEY } from "../_felles/firmaer.ts";

// KUNDEDATABASEN (projekt zwbsbckoyxzzobudjxij). Samme opgave som Jammerbugts send-push,
// med ét krav mere: beskeden maa KUN naa telefoner i afsenderens eget firma.
//
//   1. service-noeglen (baggrundsjobbene). Modtagerne er medarbejder-id'er, som jobbet
//      selv har fundet i sit eget firma. «alle» kraever x-firma-id.
//   2. en indlogget planlaegger. Modtagerne begraenses til hendes eget firma, uanset
//      hvilke id'er der sendes med.
//
// Kraever hemmelighederne VAPID_OFFENTLIG_NOEGLE og VAPID_PRIVAT_NOEGLE (et nyt par til
// kundeloesningen — ikke Jammerbugts). Den offentlige noegle skal ogsaa staa i
// kunde-worklist som VITE_VAPID_OFFENTLIG.

const VAPID_OFFENTLIG = Deno.env.get("VAPID_OFFENTLIG_NOEGLE") ?? "";
const VAPID_PRIVAT = Deno.env.get("VAPID_PRIVAT_NOEGLE") ?? "";
const VAPID_KONTAKT = Deno.env.get("VAPID_KONTAKT") ?? "mailto:jammerbugtrengoering@outlook.dk";

function rolleIToken(token: string): string | null {
  try {
    const b64 = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(b64.padEnd(b64.length + (4 - b64.length % 4) % 4, "=")))?.role ?? null;
  } catch { return null; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    if (!VAPID_OFFENTLIG || !VAPID_PRIVAT) return svar({ error: "vapid_mangler" }, 500);
    const admin = klient();
    const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "").trim();

    let firmaId: string | null = null;
    const erService = token === SERVICE_KEY || rolleIToken(token) === "service_role";
    if (erService) {
      firmaId = req.headers.get("x-firma-id") || null;
    } else if (token) {
      const { data: { user } } = await admin.auth.getUser(token);
      if (user) {
        const { data: m } = await admin.from("employees").select("is_admin, firma_id")
          .eq("auth_user_id", user.id).is("fratraadt_dato", null).maybeSingle();
        if (m?.is_admin) firmaId = m.firma_id;
      }
      if (!firmaId) return svar({ error: "ingen_adgang" }, 401);
    } else {
      return svar({ error: "ingen_adgang" }, 401);
    }

    const { medarbejdere, alle, titel, tekst, url, maerke } = await req.json();
    if (!titel || !tekst) return svar({ error: "mangler_felter" }, 400);
    if (alle && !firmaId) return svar({ error: "alle_kraever_firma" }, 400);

    let sp = admin.from("push_abonnementer").select("endpoint, p256dh, auth, employee_id");
    if (firmaId) sp = sp.eq("firma_id", firmaId);
    if (!alle) {
      const liste = Array.isArray(medarbejdere) ? medarbejdere.map(String) : [];
      if (!liste.length) return svar({ ok: true, sendt: 0, grund: "ingen_modtagere" });
      sp = sp.in("employee_id", liste);
    }
    const { data: abon, error } = await sp;
    if (error) return svar({ error: error.message }, 500);
    if (!abon?.length) return svar({ ok: true, sendt: 0, grund: "ingen_tilmeldte_telefoner" });

    webpush.setVapidDetails(VAPID_KONTAKT, VAPID_OFFENTLIG, VAPID_PRIVAT);
    const nyttelast = JSON.stringify({ titel, tekst, url: url || "/", maerke: maerke || "besked" });

    let sendt = 0;
    const doede: string[] = [];
    await Promise.all(abon.map(async (a) => {
      try {
        await webpush.sendNotification({ endpoint: a.endpoint as string, keys: { p256dh: a.p256dh as string, auth: a.auth as string } },
          nyttelast, { TTL: 60 * 60 * 12 });
        sendt++;
      } catch (e) {
        const kode = (e as { statusCode?: number })?.statusCode;
        if (kode === 404 || kode === 410) doede.push(a.endpoint as string);
        else console.error("push fejlede", kode, String((e as Error)?.message ?? e).slice(0, 200));
      }
    }));
    if (doede.length) await admin.from("push_abonnementer").delete().in("endpoint", doede);
    if (sendt) {
      await admin.from("push_abonnementer").update({ sidst_brugt: new Date().toISOString() })
        .in("endpoint", abon.filter((a) => !doede.includes(a.endpoint as string)).map((a) => a.endpoint as string));
    }
    return svar({ ok: true, sendt, fjernet: doede.length });
  } catch (e) {
    console.error("send-push:", String((e as Error)?.message ?? e));
    return svar({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
