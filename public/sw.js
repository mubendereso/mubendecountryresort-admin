// Mubende Country Resort Admin — service worker.
//
// Scope: install-time installability + a tiny offline app shell.
// Offline data sync (SQLite-WASM + outbox) lands in a later phase. For now
// the strategy is intentionally minimal:
//
//   - Static hashed assets under /_next/static/* are immutable → cache-first.
//   - Document (navigation) requests are network-first with a cache fallback,
//     so the app at least renders a shell when the user is fully offline.
//   - Everything else (server actions, API routes, image uploads, etc.) is
//     network-only — we never want to serve stale state for those.
//
// Bump CACHE_VERSION to force clients to evict old caches on next activate.

const CACHE_VERSION = "mcr-admin-v1";
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const PAGES_CACHE = `${CACHE_VERSION}-pages`;

const OFFLINE_FALLBACK = "/offline";

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(PAGES_CACHE);
      try {
        await cache.add(new Request(OFFLINE_FALLBACK, { cache: "reload" }));
      } catch {
        // Offline fallback page may not exist yet (added in a later phase).
        // Don't block install on it.
      }
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames
          .filter((name) => !name.startsWith(CACHE_VERSION))
          .map((name) => caches.delete(name))
      );
      await self.clients.claim();
    })()
  );
});

function isStaticAsset(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname === "/manifest.webmanifest"
  );
}

function isHtmlNavigation(request) {
  return (
    request.mode === "navigate" ||
    (request.method === "GET" && request.headers.get("accept")?.includes("text/html"))
  );
}

function isMutation(request) {
  if (request.method !== "GET" && request.method !== "HEAD") return true;
  // Next.js server actions always carry the next-action header.
  if (request.headers.get("next-action")) return true;
  return false;
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // Don't touch cross-origin requests.
  if (url.origin !== self.location.origin) return;

  // Never cache mutations, server actions, or auth.
  if (isMutation(request)) return;
  if (url.pathname.startsWith("/login")) return;
  if (url.pathname.startsWith("/api/")) return;

  if (isStaticAsset(url)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(STATIC_CACHE);
        const cached = await cache.match(request);
        if (cached) return cached;
        const response = await fetch(request);
        if (response.ok) cache.put(request, response.clone());
        return response;
      })()
    );
    return;
  }

  if (isHtmlNavigation(request)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(PAGES_CACHE);
        try {
          const network = await fetch(request);
          if (network.ok) cache.put(request, network.clone());
          return network;
        } catch {
          const cached = await cache.match(request);
          if (cached) return cached;
          const fallback = await cache.match(OFFLINE_FALLBACK);
          if (fallback) return fallback;
          return new Response("Offline", {
            status: 503,
            headers: { "content-type": "text/plain" }
          });
        }
      })()
    );
  }
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("push", (event) => {
  const payload = (() => {
    if (!event.data) return {};
    try { return event.data.json(); } catch { return { body: event.data.text() }; }
  })();

  event.waitUntil(
    self.registration.showNotification(
      typeof payload.title === "string" ? payload.title : "MCR Admin",
      {
        body: typeof payload.body === "string" ? payload.body : "A new booking is ready for review.",
        icon: "/icons/icon-192.png",
        badge: "/icons/icon-192.png",
        tag: typeof payload.tag === "string" ? payload.tag : undefined,
        data: payload.data && typeof payload.data === "object" ? payload.data : {}
      }
    )
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const requestedUrl =
    event.notification.data && typeof event.notification.data.url === "string"
      ? event.notification.data.url
      : "/bookings";
  const candidateUrl = new URL(requestedUrl, self.location.origin);
  const targetUrl =
    candidateUrl.origin === self.location.origin
      ? candidateUrl.href
      : new URL("/bookings", self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (clients) => {
      for (const client of clients) {
        if (client.url === targetUrl && "focus" in client) return client.focus();
      }
      for (const client of clients) {
        if (client.url.startsWith(self.location.origin)) {
          if ("navigate" in client) await client.navigate(targetUrl);
          if ("focus" in client) return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
    })
  );
});
