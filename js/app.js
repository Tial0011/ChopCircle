// ChopCircle — index.html entry point
// Handles light/dark theme, category chip toggling, and the newsletter form
// on the public marketing home page. Feed/recipe rendering lives in
// js/feed and js/recipes and is wired up on their own pages.
import { $, $$ } from "./utils/dom.js";
import { initTheme } from "./utils/theme.js";
import { initMobileNav } from "./utils/mobileNav.js";
import { initAuthHeader, initHeaderSearch } from "./utils/header.js";
import { registerServiceWorker, initInstallPrompt } from "./utils/pwa.js";
import { getCurrentUser } from "./auth/authGuard.js";
import { renderTrending } from "./feed/render-trending.js";
import { renderCreators } from "./profile/render-creators.js";

// Sponsored slot (see index.html's "SPONSORED" section) — Papilz Foods'
// "Shop now" button deep-links straight into a WhatsApp chat with a
// prefilled order message rather than a generic storefront link.
// TODO: replace with Papilz Foods' real WhatsApp number (digits only,
// country code first, no "+" or leading 0 — e.g. Nigerian 0803 555 1234
// becomes "2348035551234") before this goes live.
const PAPILZ_WHATSAPP_NUMBER = "2340000000000";
const PAPILZ_WHATSAPP_MESSAGE =
  "Hi Papilz Foods! I found you on ChopCircle and I'd like to order from you.";

function initSponsoredShopLink() {
  const link = $("#papilz-shop-now");
  if (!link) return;
  link.href = `https://wa.me/${+2348138076639}?text=${encodeURIComponent(PAPILZ_WHATSAPP_MESSAGE)}`;
}

function initCategoryChips() {
  const chipRow = $("#category-chips");
  chipRow?.addEventListener("click", (event) => {
    const chip = event.target.closest(".chip");
    if (!chip) return;
    $$(".chip", chipRow).forEach((c) =>
      c.setAttribute("aria-pressed", "false"),
    );
    chip.setAttribute("aria-pressed", "true");
    renderTrending(chip.dataset.category);
  });
}

function initNewsletterForm() {
  const form = $("#newsletter-form");
  form?.addEventListener("submit", (event) => {
    event.preventDefault();
    // TODO(Phase 11): wire to an actual list provider or a Firestore
    // `newsletterSignups` collection + Cloud Function.
    form.reset();
    alert("Thanks for subscribing! (Newsletter backend not yet connected.)");
  });
}

initTheme();
initMobileNav();
registerServiceWorker();
initInstallPrompt();
initCategoryChips();
initNewsletterForm();
initSponsoredShopLink();
initHeaderSearch("pages/");
renderTrending().catch((error) =>
  console.error("Failed to render trending recipes:", error),
);
renderCreators().catch((error) =>
  console.error("Failed to render featured creators:", error),
);
getCurrentUser().then((user) => {
  initAuthHeader(user, { basePath: "pages/" });
  // Already signed in — no point pushing a "sign up free" CTA at someone
  // with an account; the hero just offers to explore recipes instead.
  if (user) $("#hero-start-cooking")?.remove();
});
