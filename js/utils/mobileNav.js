// ChopCircle — Shared mobile nav (hamburger + slide-in drawer)
// Every page with a .site-header includes a #hamburger-toggle button and a
// #mobile-drawer element with the same content as that page's .nav-links /
// .header-actions (drawers are static markup per page, matching the rest of
// this codebase's no-build-step, duplicated-per-page header pattern — see
// HANDOFF.md). This module only owns open/close behavior, shared by all.
import { $ } from "./dom.js";

export function initMobileNav() {
  const toggle = $("#hamburger-toggle");
  const drawer = $("#mobile-drawer");
  if (!toggle || !drawer) return;

  const backdrop = drawer.querySelector(".mobile-drawer__backdrop");
  const closeBtn = drawer.querySelector(".mobile-drawer__close");
  const links = drawer.querySelectorAll(".mobile-drawer__links a");

  function open() {
    drawer.setAttribute("data-open", "true");
    drawer.setAttribute("aria-hidden", "false");
    toggle.setAttribute("aria-expanded", "true");
    document.body.classList.add("drawer-open");
  }

  function close() {
    drawer.setAttribute("data-open", "false");
    drawer.setAttribute("aria-hidden", "true");
    toggle.setAttribute("aria-expanded", "false");
    document.body.classList.remove("drawer-open");
  }

  toggle.addEventListener("click", () => {
    const isOpen = drawer.getAttribute("data-open") === "true";
    isOpen ? close() : open();
  });

  backdrop?.addEventListener("click", close);
  closeBtn?.addEventListener("click", close);
  links.forEach((link) => link.addEventListener("click", close));

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") close();
  });
}
