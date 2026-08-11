// ChopCircle — Shared theme toggle
// Originally lived only in app.js (home page); factored out here in Phase 5
// so recipes/recipe-details/recipe-form (and any future page) get the same
// persisted light/dark behavior via one #theme-toggle button.
import { $ } from "./dom.js";

const THEME_KEY = "chopcircle-theme";

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  const toggle = $("#theme-toggle");
  if (toggle) toggle.textContent = theme === "dark" ? "☀️" : "🌙";
}

export function initTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  const preferred = saved || (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  applyTheme(preferred);

  $("#theme-toggle")?.addEventListener("click", () => {
    const current = document.documentElement.getAttribute("data-theme");
    const next = current === "dark" ? "light" : "dark";
    localStorage.setItem(THEME_KEY, next);
    applyTheme(next);
  });
}
