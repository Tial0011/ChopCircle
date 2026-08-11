// ChopCircle — Service Worker
// Caches the static app shell (HTML/CSS/JS/icons) so the app installs and
// opens instantly, and falls back to pages/offline.html for any navigation
// that can't reach the network and isn't already cached. Deliberately does
// NOT cache anything Firebase — Auth/Firestore/Storage calls always go to
// the network untouched (see shouldBypass()); this worker only owns the UI
// shell, not app data. Registered from js/utils/pwa.js.
//
// Phase 10 (Notifications) deliberately did NOT add a `push` /
// `notificationclick` handler here: real browser push delivery needs a
// server holding VAPID keys that calls the FCM send endpoint whenever a
// notification is created, and this app has no backend (Firestore writes
// are client-side — see firebase/firestore-schema.md). In-app
// notifications (bell + badge + pages/notifications.html, all live via
// onSnapshot) ship the actual value without that dependency. Revisit once
// a Cloud Functions backend exists (see /functions and MANUAL_SETUP.md).

const CACHE_VERSION = "chopcircle-v1";
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
          const response = await fetch(request);
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
      const network = fetch(request)
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
