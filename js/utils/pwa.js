// ChopCircle — PWA registration + install prompt UI
// Phase 9. Imported by every page (see each page's closing <script type="module">
// tags) so the app installs and works offline no matter which page a user
// lands on first. Resolves its own asset URLs off import.meta.url rather
// than a page-relative path, so this one module works unmodified whether
// it's loaded as "js/utils/pwa.js" (index.html) or "../js/utils/pwa.js"
// (everything in pages/) — same reasoning as chatService.js's file-header
// note about picking one shape and reusing it.
import { $ } from "./dom.js";

const DISMISSED_KEY = "chopcircle-install-dismissed";
const rootUrl = (path) => new URL(`../../${path}`, import.meta.url).href;

export function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register(rootUrl("service-worker.js")).catch((error) => {
      console.error("ChopCircle: service worker registration failed", error);
    });
  });
}

function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true // iOS Safari's own flag
  );
}

function isIos() {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent) && !window.MSStream;
}

function buildBanner({ title, body, showInstallButton }) {
  const banner = document.createElement("div");
  banner.className = "install-banner";
  banner.id = "install-banner";
  banner.setAttribute("role", "dialog");
  banner.setAttribute("aria-label", "Install ChopCircle");
  banner.innerHTML = `
    <img class="install-banner__icon" src="${rootUrl("assets/icons/icon-96.png")}" alt="" width="48" height="48" />
    <div class="install-banner__text">
      <p class="install-banner__title">${title}</p>
      <p class="install-banner__body">${body}</p>
    </div>
    <div class="install-banner__actions">
      <button type="button" class="btn btn--ghost" id="install-banner-dismiss">Not now</button>
      ${showInstallButton ? '<button type="button" class="btn btn--primary" id="install-banner-install">Install</button>' : ""}
    </div>
  `;
  document.body.appendChild(banner);
  requestAnimationFrame(() => banner.classList.add("is-visible"));
  return banner;
}

function dismiss(banner) {
  banner.classList.remove("is-visible");
  localStorage.setItem(DISMISSED_KEY, "true");
  setTimeout(() => banner.remove(), 300);
}

export function initInstallPrompt() {
  if (isStandalone() || localStorage.getItem(DISMISSED_KEY) === "true") return;

  // Chrome/Edge/Android: the browser fires this event when it decides the
  // app is installable. We preventDefault() it so we can show our own
  // on-brand banner instead of the browser's default mini-infobar, then
  // replay the saved event when the user taps our Install button.
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    const banner = buildBanner({
      title: "Install ChopCircle",
      body: "Add it to your home screen for one-tap access and a faster, full-screen feel — even on a slow connection.",
      showInstallButton: true,
    });
    $("#install-banner-dismiss", banner)?.addEventListener("click", () => dismiss(banner));
    $("#install-banner-install", banner)?.addEventListener("click", async () => {
      banner.querySelector(".install-banner__actions").style.visibility = "hidden";
      event.prompt();
      await event.userChoice;
      dismiss(banner);
    });
  });

  window.addEventListener("appinstalled", () => {
    localStorage.setItem(DISMISSED_KEY, "true");
    $("#install-banner")?.remove();
  });

  // iOS Safari never fires beforeinstallprompt — "Add to Home Screen" is a
  // manual Share-sheet action there, so we show instructions instead of an
  // Install button.
  if (isIos()) {
    const banner = buildBanner({
      title: "Install ChopCircle",
      body: "Tap the Share icon, then \u201cAdd to Home Screen,\u201d for one-tap access anytime.",
      showInstallButton: false,
    });
    $("#install-banner-dismiss", banner)?.addEventListener("click", () => dismiss(banner));
  }
}
