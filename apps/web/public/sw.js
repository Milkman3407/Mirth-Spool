/* global Response, URL, caches, fetch, self */
/* MirthSpool's service worker is intentionally shell-only. Never add API, HTML,
 * feed, library, account, or media responses to Cache Storage. */
const VERSION = "m15-v1";
const SHELL_CACHE = `mirthspool-shell-${VERSION}`;
const STATIC_CACHE = `mirthspool-static-${VERSION}`;
const OWNED_CACHE_PREFIX = "mirthspool-";
const SAFE_SHELL = [
  "/offline.html",
  "/offline.css",
  "/icons/mirthspool-192.png",
  "/icons/mirthspool-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(warmSafeShell());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter(
              (key) =>
                key.startsWith(OWNED_CACHE_PREFIX) &&
                key !== SHELL_CACHE &&
                key !== STATIC_CACHE,
            )
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.origin !== self.location.origin) return;
  const type = event.data && event.data.type;
  if (type === "SKIP_WAITING") {
    void self.skipWaiting();
    acknowledge(event, true);
    return;
  }
  if (type === "WARM_SAFE_SHELL") {
    event.waitUntil(warmSafeShell().then(() => acknowledge(event, true)));
    return;
  }
  if (type === "CLEAR_CACHES") {
    event.waitUntil(
      caches
        .keys()
        .then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
        .then(() => acknowledge(event, true)),
    );
  }
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(async () => {
        const cached = await caches.match("/offline.html");
        return cached || Response.error();
      }),
    );
    return;
  }

  if (
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/_next/image") ||
    request.destination === "image" ||
    request.destination === "video" ||
    request.destination === "audio"
  ) {
    return;
  }

  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirstStatic(request));
  }
});

async function warmSafeShell() {
  const cache = await caches.open(SHELL_CACHE);
  await cache.addAll(SAFE_SHELL);
}

async function cacheFirstStatic(request) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok && response.type === "basic") {
    await cache.put(request, response.clone());
  }
  return response;
}

function acknowledge(event, ok) {
  if (event.ports && event.ports[0]) event.ports[0].postMessage({ ok });
}
