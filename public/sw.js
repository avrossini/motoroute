// Service worker do PWA — SEM cache offline de propósito (sem handler de 'fetch';
// passthrough total). Funções: habilitar a instalação no Android e Web Push.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

// Web Push: payload JSON {title, body, url} enviado por api/push-dispatch.js.
self.addEventListener("push", (event) => {
  let msg = { title: "MotoRoute", body: "Você tem uma nova notificação", url: "/perfil" };
  try {
    if (event.data) msg = { ...msg, ...event.data.json() };
  } catch {
    // payload não-JSON (ex.: teste do DevTools) → usa o fallback acima
  }
  event.waitUntil(
    self.registration.showNotification(msg.title, {
      body: msg.body,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      data: { url: msg.url },
    })
  );
});

// Clique na notificação: foca uma janela aberta do app (e navega) ou abre uma nova.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  // Só destinos same-origin: um payload comprometido nunca leva o clique pra fora do app.
  const dest = new URL(event.notification.data?.url ?? "/", self.location.origin);
  const url = dest.origin === self.location.origin ? dest.pathname + dest.search : "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      const client = clients.find((c) => c.visibilityState === "visible") ?? clients[0];
      if (client && "focus" in client) {
        return client
          .focus()
          .then((c) => ("navigate" in (c ?? client) ? (c ?? client).navigate(url) : undefined))
          .catch(() => self.clients.openWindow(url));
      }
      return self.clients.openWindow(url);
    })
  );
});
