// ChopCircle — Service Worker
// Caches the static app shell (HTML/CSS/JS/icons) so the app installs and
// opens instantly, and falls back to pages/offline.html for any navigation
// that can't reach the network and isn't already cached. Deliberately does
// NOT cache anything Firebase — Auth/Firestore/Storage calls always go to
// the network untouched (see shouldBypass()); this worker only owns the UI
// shell, not app data. Registered from js/utils/pwa.js.
//
// Phase 12 adds real web push delivery: the `push` handler below shows a
// notification for messages the browser delivers while this tab isn't in
// the foreground (foreground delivery is handled separately by
// js/notifications/push.js's onMessage() listener, which FCM routes
// differently). The server half — a Cloud Function that actually calls
// the FCM send API whenever a notification is created — lives in
// functions/index.js's `sendPush` export. See MANUAL_SETUP.md for the
// Firebase console steps (VAPID key, Blaze plan) this needed before it
// could go live; in-app notifications (bell + badge +
// pages/notifications.html, all live via onSnapshot) work with none of
// that and remain the source of truth either way.

const CACHE_VERSION = "chopcircle-v4";
const SHELL_CACHE = `${CACHE_VERSION}-shell`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;
const OFFLINE_URL = "pages/offline.html";

// Everything needed to render the public home page + navigate to an
// offline fallback while fully disconnected. Page-specific JS/CSS (feed,
// recipes, chat, profile...) is left to runtime caching below rather than
// listed here — precaching every page's assets up front would make the
// install step slow and brittle for a marginal offline benefit.
const SHELL_ASSETS = [
  "./",
  "index.html",
  "manifest.json",
  OFFLINE_URL,
  "css/style.css",
  "css/base/tokens.css",
  "css/base/reset.css",
  "css/base/typography.css",
  "css/layouts/header.css",
  "css/layouts/footer.css",
  "css/components/buttons.css",
  "css/components/cards.css",
  "css/components/chips.css",
  "css/components/pot-rim.css",
  "css/components/forms.css",
  "css/components/install-banner.css",
  "css/pages/home.css",
  "css/pages/offline.css",
  "css/utilities/utilities.css",
  "js/app.js",
  "js/utils/dom.js",
  "js/utils/theme.js",
  "js/utils/mobileNav.js",
  "js/utils/pwa.js",
  "js/feed/render-trending.js",
  "assets/logos/favicon.svg",
  "assets/logos/apple-touch-icon.png",
  "assets/icons/icon-192.png",
  "assets/icons/icon-512.png",
];

function shouldBypass(url) {
  // Cross-origin (Firebase Auth/Firestore/Storage, Google Fonts, Unsplash
  // hero images, etc.) — let the browser handle these natively so this
  // worker never becomes a stale cache of live app data.
  return url.origin !== self.location.origin;
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      // Cache each asset individually (not cache.addAll) so one missing/
      // renamed file during future edits can't fail the entire install.
      await Promise.allSettled(SHELL_ASSETS.map((asset) => cache.add(asset)));
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith("chopcircle-") && key !== SHELL_CACHE && key !== RUNTIME_CACHE)
          .map((key) => caches.delete(key))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== "GET" || shouldBypass(url)) return;

  // Page navigations: network-first (so signed-in users always see fresh
  // content when online), falling back to a cached copy of that exact page,
  // then finally to the offline fallback page.
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          // `cache: "no-store"` here (and in the static-asset branch below)
          // is the actual fix for "I have to hard-refresh every time":
          // without it, this fetch() can itself be silently answered by the
          // BROWSER's own HTTP cache instead of genuinely hitting the
          // network — meaning the "revalidate" step was sometimes just
          // revalidating against the same stale response, so a normal
          // reload never picked up a new deploy. Only a hard refresh
          // (which bypasses HTTP cache) ever showed the real update.
          const response = await fetch(request, { cache: "no-store" });
          const cache = await caches.open(RUNTIME_CACHE);
          cache.put(request, response.clone());
          return response;
        } catch {
          const cached = await caches.match(request);
          return cached || (await caches.match(OFFLINE_URL));
        }
      })()
    );
    return;
  }

  // Static assets (CSS/JS/images/icons): stale-while-revalidate — serve
  // from cache instantly if present, refresh the cache in the background.
  event.respondWith(
    (async () => {
      const cached = await caches.match(request);
      const network = fetch(request, { cache: "no-store" })
        .then(async (response) => {
          if (response && response.ok) {
            const cache = await caches.open(RUNTIME_CACHE);
            cache.put(request, response.clone());
          }
          return response;
        })
        .catch(() => undefined);
      return cached || (await network) || Response.error();
    })()
  );
});

// ---------------------------------------------------------------------------
// Web push (Phase 12) — see the file-header comment above.
// ---------------------------------------------------------------------------

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    return; // not a JSON payload this app knows how to render
  }

  // functions/index.js's sendPush() sets both `notification` (title/body —
  // shown by the OS automatically on some platforms) and `data` (the same
  // fields, plus routing info) so this handler works whether the browser
  // already auto-displayed the `notification` block or not; showNotification
  // is idempotent enough here since sendPush() only sends one or the other
  // per platform via FCM's own webpush/data split, not both redundantly.
  const title = payload.notification?.title || payload.data?.title || "ChopCircle";
  const body = payload.notification?.body || payload.data?.body || "";
  const url = payload.data?.url || "./";

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: "assets/icons/icon-192.png",
      badge: "assets/icons/icon-96.png",
      data: { url },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "./";

  event.waitUntil(
    (async () => {
      const allClients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const existing = allClients.find((client) => client.url.includes(url));
      if (existing) {
        existing.focus();
      } else {
        self.clients.openWindow(url);
      }
    })()
  );
});
