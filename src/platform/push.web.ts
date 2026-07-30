import type { PushPlatform } from "./push";
import { getSupabase } from "@/services/supabase";

// Chave pública VAPID — inlined no bundle pelo Expo (EXPO_PUBLIC_*). A privada
// só existe no servidor (api/push-dispatch.js).
const VAPID_PUBLIC_KEY = process.env.EXPO_PUBLIC_VAPID_PUBLIC_KEY ?? "";
let warnedMissingKey = false;

function isSupported(): boolean {
  const base =
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window;
  if (base && !VAPID_PUBLIC_KEY && !warnedMissingKey) {
    warnedMissingKey = true;
    // Sem a env no build a feature morreria em silêncio — deixa rastro no console.
    console.warn("[push] EXPO_PUBLIC_VAPID_PUBLIC_KEY ausente — Web Push desabilitado");
  }
  return base && !!VAPID_PUBLIC_KEY;
}

// applicationServerKey precisa ser Uint8Array (base64url → bytes).
function urlBase64ToUint8Array(base64url: string): Uint8Array {
  const padding = "=".repeat((4 - (base64url.length % 4)) % 4);
  const base64 = (base64url + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

// Detecta rotação da chave VAPID: uma subscription assinada com chave antiga
// nunca mais receberia push (403 no push service) e não seria limpa (não é 404/410).
function sameServerKey(sub: PushSubscription): boolean {
  const raw = sub.options?.applicationServerKey;
  if (!raw) return false;
  const existing = new Uint8Array(raw);
  const current = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
  if (existing.length !== current.length) return false;
  for (let i = 0; i < current.length; i++) if (existing[i] !== current[i]) return false;
  return true;
}

async function persist(sub: PushSubscription, userId: string): Promise<boolean> {
  const json = sub.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return false;
  const { error } = await getSupabase().from("push_subscriptions").upsert(
    {
      user_id: userId,
      endpoint: json.endpoint,
      p256dh: json.keys.p256dh,
      auth: json.keys.auth,
      user_agent: navigator.userAgent.slice(0, 200),
    },
    { onConflict: "endpoint" }
  );
  return !error;
}

export const getPushStatus: PushPlatform["getPushStatus"] = async () => {
  if (!isSupported()) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  try {
    // getRegistration (e não .ready): se o registro do SW falhou, .ready fica
    // pendurado para sempre; getRegistration resolve undefined.
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) return "unsupported";
    const sub = await reg.pushManager.getSubscription();
    // Permissão resetada para "default" invalida a entrega mesmo com subscription viva.
    return sub && Notification.permission === "granted" ? "subscribed" : "unsubscribed";
  } catch {
    return "unsubscribed";
  }
};

// Contrato: nunca lança — sempre resolve num PushStatus (a UI só trata estados).
export const subscribePush: PushPlatform["subscribePush"] = async () => {
  try {
    if (!isSupported()) return "unsupported";

    const permission = await Notification.requestPermission();
    if (permission !== "granted") return permission === "denied" ? "denied" : "unsubscribed";

    const supabase = getSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return "unsubscribed";

    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) return "unsupported";

    let sub = await reg.pushManager.getSubscription();
    if (sub && !sameServerKey(sub)) {
      await sub.unsubscribe().catch(() => {});
      sub = null;
    }
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true, // obrigatório (Chrome e iOS)
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
    }

    if (await persist(sub, user.id)) return "subscribed";

    // Falha típica de persistência: o endpoint pertence a OUTRO usuário (troca de
    // conta no mesmo navegador) e a RLS bloqueia o upsert. Endpoint novo resolve.
    await sub.unsubscribe().catch(() => {});
    const fresh = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });
    if (await persist(fresh, user.id)) return "subscribed";
    await fresh.unsubscribe().catch(() => {});
    return "unsubscribed";
  } catch {
    return "unsubscribed";
  }
};

export const unsubscribePush: PushPlatform["unsubscribePush"] = async () => {
  if (!isSupported()) return "unsupported";
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    if (sub) {
      const endpoint = sub.endpoint;
      await sub.unsubscribe().catch(() => {});
      await getSupabase().from("push_subscriptions").delete().eq("endpoint", endpoint);
    }
    return "unsubscribed";
  } catch {
    return "unsubscribed";
  }
};
