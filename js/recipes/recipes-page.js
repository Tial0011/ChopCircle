// ChopCircle — Recipes browse page controller
import { $, $$ } from "../utils/dom.js";
import { initTheme } from "../utils/theme.js";
import { initMobileNav } from "../utils/mobileNav.js";
import { initAuthHeader, initHeaderSearch } from "../utils/header.js";
import { registerServiceWorker, initInstallPrompt } from "../utils/pwa.js";
import { getCurrentUser } from "../auth/authGuard.js";
import { listRecipes, CATEGORIES, PAGE_SIZE } from "./recipeService.js";
import { recipeCardHTML } from "./recipeCard.js";

const grid = $("#recipe-grid");
const emptyState = $("#empty-state");
const loadMoreBtn = $("#load-more");
const chipRow = $("#category-chips");
const sortSelect = $("#sort-select");
const searchInput = $("#recipe-search");

let state = { category: "", sortBy: "newest", cursor: null, search: "" };

// The header search box (js/utils/header.js's initHeaderSearch()) sends
// people here as `recipes.html?search=...` — pick that back up so it
// actually lands on filtered results instead of just an unfiltered page.
const initialSearch = new URLSearchParams(window.location.search).get("search") || "";
if (initialSearch) {
  state.search = initialSearch.trim().toLowerCase();
  if (searchInput) searchInput.value = initialSearch;
}

function renderChips() {
  CATEGORIES.forEach(({ slug, name }) => {
    const chip = document.createElement("button");
    chip.className = "chip";
    chip.setAttribute("role", "listitem");
    chip.dataset.category = slug;
    chip.textContent = name;
    chipRow.appendChild(chip);
  });
}

function matchesSearch(recipe) {
  if (!state.search) return true;
  return recipe.title.toLowerCase().includes(state.search) ||
    recipe.description?.toLowerCase().includes(state.search);
}

async function loadRecipes({ append = false } = {}) {
  grid.setAttribute("aria-busy", "true");
  const { recipes, lastDoc } = await listRecipes({
    category: state.category || null,
    sortBy: state.sortBy,
    cursor: append ? state.cursor : null,
  });
  state.cursor = lastDoc;

  const filtered = recipes.filter(matchesSearch);
  const html = filtered.map(recipeCardHTML).join("");

  if (append) {
    grid.insertAdjacentHTML("beforeend", html);
  } else {
    grid.innerHTML = html;
  }

  emptyState.classList.toggle("hidden", grid.children.length > 0);
  // Same fix as feed-page.js/profile-page.js: a short-of-PAGE_SIZE page
  // means the collection's exhausted even though lastDoc is still set —
  // only a full page means there's actually another one to load.
  loadMoreBtn.hidden = !lastDoc || recipes.length < PAGE_SIZE;
  grid.setAttribute("aria-busy", "false");
}

function initChipFilter() {
  chipRow.addEventListener("click", (event) => {
    const chip = event.target.closest(".chip");
    if (!chip) return;
    $$(".chip", chipRow).forEach((c) => c.setAttribute("aria-pressed", "false"));
    chip.setAttribute("aria-pressed", "true");
    state.category = chip.dataset.category;
    loadRecipes();
  });
}

function initSort() {
  sortSelect?.addEventListener("change", () => {
    state.sortBy = sortSelect.value;
    loadRecipes();
  });
}

function initSearch() {
  let debounceTimer;
  searchInput?.addEventListener("input", () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      state.search = searchInput.value.trim().toLowerCase();
      loadRecipes();
    }, 250);
  });
}

function initLoadMore() {
  loadMoreBtn?.addEventListener("click", () => loadRecipes({ append: true }));
}

initTheme();
initMobileNav();
registerServiceWorker();
initInstallPrompt();
renderChips();
initChipFilter();
initSort();
initSearch();
initLoadMore();
getCurrentUser().then((user) => {
  initAuthHeader(user, { basePath: "" });
  initHeaderSearch("");
});
loadRecipes().catch((error) => {
  console.error("Failed to load recipes:", error);
  grid.innerHTML = `<p class="text-muted">Couldn't load recipes right now. Please try again shortly.</p>`;
});
