# ChopCircle — Manual setup checklist (Phase 9: PWA)

Everything code-side is done (manifest, service worker, install prompt UI,
offline fallback — see HANDOFF.md for the full list). The items below need
a human with a real device, browser, or hosting account — nothing here can
be done from inside the repo.

> **Looking for the full pre-launch checklist (Firebase project setup,
> Functions deploy, everything across every phase)?** See
> `TESTING_PHASE_SETUP.md` in the repo root — this file only covers the
> Phase 9 PWA-specific items below. `TESTING_PHASE_SETUP.md` supersedes
> this one; kept separate rather than merged so each phase's handoff stays
> self-contained per this repo's existing pattern.

## 1. Serve over HTTPS (or localhost)

Service workers only register on secure origins. `npx serve .` on
`localhost` is fine for local testing; for a real deploy, make sure
whatever host you pick (Firebase Hosting, Netlify, etc.) serves HTTPS by
default — most do.

## 2. Verify the manifest is picked up

1. Open the deployed (or `npx serve .`-served) site in Chrome.
2. DevTools → Application tab → Manifest. Confirm name, icons, and
   theme/background colors all show correctly and there are no console
   warnings about missing/invalid fields.
3. Application → Service Workers: confirm `service-worker.js` shows
   "activated and is running".

## 3. Test the install flow on real devices

The install banner (`js/utils/pwa.js`) only shows once per browser per
device until dismissed (`localStorage` flag) — clear site data between
tests if you need to see it again.

- **Android Chrome:** visit the site, wait for the bottom banner, tap
  Install, confirm the app opens standalone (no browser chrome) from the
  home screen icon.
- **Desktop Chrome/Edge:** look for the install icon in the address bar in
  addition to the in-page banner; both should work.
- **iOS Safari:** confirm the banner shows the "tap Share → Add to Home
  Screen" instructions (iOS never fires `beforeinstallprompt`, so there's
  no programmatic Install button there — this is expected, not a bug).
  After adding to home screen, confirm the icon and status-bar color look
  right.

## 4. Test offline behavior

1. Visit a few pages while online (so they land in the runtime cache).
2. DevTools → Network → set to "Offline" (or turn off wifi on a real
   device).
3. Reload a previously-visited page — it should still load from cache.
4. Navigate to a page you have never visited while offline — you should
   land on the branded "You're offline" page (`pages/offline.html`), not a
   browser error page.
5. Turn the network back on and confirm normal navigation resumes.

## 5. After any deploy that changes cached files

`CACHE_VERSION` in `service-worker.js` (currently `"chopcircle-v1"`) must
be bumped any time `SHELL_ASSETS` changes, or a returning visitor's
service worker will keep serving stale shell files until the browser
happens to re-check. Bump it, e.g., to `"chopcircle-v2"`, whenever you add,
remove, or rename anything in that list.

## Optional, not blocking

- **Screenshots for the manifest:** Chrome's richer install UI (the
  desktop "app store"-style install card) uses a manifest `screenshots`
  array, which isn't included — it needs real captured screenshots of the
  app, which can't be generated from inside this repo. Add one wide
  (desktop) and one narrow (mobile) screenshot under `assets/` and add a
  `screenshots` array to `manifest.json` if you want that richer prompt.
- **Update-available UI:** the service worker calls `skipWaiting()` on
  every install, so a hard refresh always picks up the newest shell — but
  there's no in-app "a new version is available, refresh?" toast yet.
  Worth adding once the app has enough returning traffic for stale-tab
  staleness to matter.
