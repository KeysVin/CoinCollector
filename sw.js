const CACHE = "coincollector-v7";

const ASSETS = [
  "/",
  "/index.html",
  "/assets/css/styles.css?v=6",
  "/assets/js/app.js?v=6",
  "/assets/icons/coin.svg",
  "/manifest.webmanifest",
  "/admin/",
  "/admin/index.html",
  "/admin/admin.css?v=6",
  "/admin/admin.js?v=8",
  "/admin/batch.js",
  "/admin/photo-tools.js",
  "/admin/offline-store.js"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then(cache => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches
      .keys()
      .then(keys =>
        Promise.all(
          keys
            .filter(key => key !== CACHE)
            .map(key => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const request = event.request;

  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);

  if (url.origin !== self.location.origin) {
    return;
  }

  event.respondWith(
    fetch(request)
      .then(response => {
        if (response.ok) {
          const copy = response.clone();

          caches.open(CACHE).then(cache => {
            cache.put(request, copy);
          });
        }

        return response;
      })
      .catch(() => caches.match(request))
  );
});
