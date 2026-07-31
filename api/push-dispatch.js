// Despacho de Web Push — função Vercel standalone (CommonJS, fora do bundle Metro,
// como api/index.js). Chamada pelo trigger trg_notifications_push (pg_net) a cada
// INSERT em notifications. Autenticada por segredo compartilhado (x-push-secret).
// Rewrite em vercel.json: /api/push/dispatch → /api/push-dispatch.js.
const webpush = require("web-push");
const crypto = require("crypto");

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
const SERVICE_KEY = process.env.SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Mensagem por tipo de notificação. Tipos futuros caem no fallback — todo INSERT
// em notifications gera push (decisão de produto: sistema único).
function buildMessage(n) {
  const data = n.data ?? {};
  switch (n.type) {
    case "trip_shared":
      return {
        title: "MotoRoute",
        body: `${data.actor_name ?? "Alguém"} compartilhou uma viagem com você${data.trip_title ? `: ${data.trip_title}` : ""}`,
        url: "/perfil",
      };
    case "share_accepted":
      return {
        title: "MotoRoute",
        body: `${data.actor_name ?? "Alguém"} aceitou sua viagem compartilhada`,
        url: n.entity_id ? `/trip/${n.entity_id}` : "/perfil",
      };
    default:
      return {
        title: "MotoRoute",
        body: data.message ?? "Você tem uma nova notificação",
        url: "/perfil",
      };
  }
}

async function rest(pathAndQuery, init = {}) {
  return fetch(`${SUPABASE_URL}/rest/v1/${pathAndQuery}`, {
    ...init,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "method not allowed" });
  }
  const provided = Buffer.from(String(req.headers["x-push-secret"] ?? ""));
  const expected = Buffer.from(process.env.PUSH_WEBHOOK_SECRET ?? "");
  if (expected.length === 0 || provided.length !== expected.length || !crypto.timingSafeEqual(provided, expected)) {
    return res.status(401).json({ error: "unauthorized" });
  }
  if (!SUPABASE_URL || !SERVICE_KEY || !process.env.VAPID_PRIVATE_KEY || !process.env.EXPO_PUBLIC_VAPID_PUBLIC_KEY) {
    return res.status(200).json({ skipped: "missing configuration" });
  }

  const n = req.body ?? {};
  // recipient_id vira filtro do PostgREST — valida o formato antes de interpolar.
  if (!n.recipient_id || !UUID_RE.test(String(n.recipient_id))) {
    return res.status(200).json({ skipped: "no recipient" });
  }

  // Respeita o switch "Notificações" das preferências: desligado = silêncio total.
  const prefRes = await rest(`user_preferences?user_id=eq.${n.recipient_id}&select=notifications_enabled`);
  const prefRows = prefRes.ok ? await prefRes.json() : [];
  if (prefRows[0] && prefRows[0].notifications_enabled === false) {
    return res.status(200).json({ skipped: "notifications disabled" });
  }

  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT ?? "mailto:contato@motoroute.com.br",
    process.env.EXPO_PUBLIC_VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );

  const subsRes = await rest(`push_subscriptions?user_id=eq.${n.recipient_id}&select=endpoint,p256dh,auth`);
  const subs = subsRes.ok ? await subsRes.json() : [];
  if (subs.length === 0) {
    return res.status(200).json({ sent: 0 });
  }

  const payload = JSON.stringify(buildMessage(n));
  const results = await Promise.allSettled(
    subs.map((s) =>
      webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        payload
      )
    )
  );

  // Subscriptions mortas (404/410 = revogada/expirada) são removidas.
  let sent = 0;
  const dead = [];
  results.forEach((r, i) => {
    if (r.status === "fulfilled") sent++;
    else if (r.reason?.statusCode === 404 || r.reason?.statusCode === 410) dead.push(subs[i].endpoint);
  });
  await Promise.allSettled(
    dead.map((endpoint) =>
      rest(`push_subscriptions?endpoint=eq.${encodeURIComponent(endpoint)}`, { method: "DELETE" })
    )
  );

  return res.status(200).json({ sent, failed: results.length - sent, cleaned: dead.length });
};
