/* Le Feutre — le HTML vient du réseau, le cache porte le numéro du build.
   Un service worker n'intercepte pas les WebSockets. */
const VERSION = "feutre-__FEUTRE_BUILD__";

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== VERSION).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
      .then(() => self.clients.matchAll({ type: "window", includeUncontrolled: true }))
      .then((windowClients) =>
        Promise.all(
          windowClients.map((client) => (client.url.startsWith(self.location.origin) ? client.navigate(client.url) : undefined)),
        ),
      ),
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "skip-waiting") self.skipWaiting();
});

function documentRequest(url, request) {
  return request.mode === "navigate" || url.pathname === "/" || url.pathname.endsWith("/index.html") || url.pathname.endsWith(".html");
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname === "/ws" || url.pathname.startsWith("/ws")) return;
  if (url.pathname === "/sw.js") return;

  if (documentRequest(url, request) || url.pathname === "/version.json") {
    event.respondWith(networkFirst(request, true));
    return;
  }
  event.respondWith(networkFirst(request, false));
});

function networkFirst(request, fresh) {
  const init = fresh ? { cache: "no-store", credentials: "same-origin", redirect: "follow" } : undefined;
  const target = fresh ? request.url : request;
  return fetch(target, init)
    .then((response) => {
      if (response.ok && response.type === "basic") {
        const copy = response.clone();
        caches.open(VERSION).then((cache) => cache.put(request, copy)).catch(() => undefined);
      }
      return response;
    })
    .catch(() => caches.match(request).then((cached) => cached || caches.match("/")));
}
