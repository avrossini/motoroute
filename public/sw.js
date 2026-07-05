// Service worker stub — NÃO faz cache offline.
// Sua única função é satisfazer o critério de instalabilidade do Chrome/Android
// (um SW registrado). Sem handler de 'fetch' de propósito: passthrough total,
// zero interferência de rede.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
