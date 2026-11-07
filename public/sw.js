/* Le Feutre — réseau d'abord.
   Ne met jamais en cache les WebSockets : un service worker n'intercepte pas ws/wss.
   HTML, manifeste et ce fichier lui-même restent revalidés par le serveur (Cache-Control: no-cache). */
const VERSION = "feutre-v2";

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== VERSION).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname === "/ws" || url.pathname.startsWith("/ws")) return;
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok && !url.pathname.endsWith("sw.js")) {
          const copy = response.clone();
          caches.open(VERSION).then((cache) => cache.put(request, copy)).catch(() => undefined);
        }
        return response;
      })
      .catch(() => caches.match(request).then((cached) => cached || caches.match("/"))),
  );
});
