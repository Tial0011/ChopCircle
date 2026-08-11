// ChopCircle — index.html entry point
// Handles light/dark theme, category chip toggling, and the newsletter form
// on the public marketing home page. Feed/recipe rendering lives in
// js/feed and js/recipes and is wired up on their own pages.
import { $, $$ } from "./utils/dom.js";
import { initTheme } from "./utils/theme.js";
import { initMobileNav } from "./utils/mobileNav.js";
import { initAuthHeader } from "./utils/header.js";
import { registerServiceWorker, initInstallPrompt } from "./utils/pwa.js";
import { getCurrentUser } from "./auth/authGuard.js";
import { renderTrending } from "./feed/render-trending.js";

function initCategoryChips() {
  const chipRow = $("#category-chips");
  chipRow?.addEventListener("click", (event) => {
    const chip = event.target.closest(".chip");
    if (!chip) return;
    $$(".chip", chipRow).forEach((c) => c.setAttribute("aria-pressed", "false"));
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
renderTrending().catch((error) => console.error("Failed to render trending recipes:", error));
getCurrentUser().then((user) => initAuthHeader(user, { basePath: "pages/" }));
