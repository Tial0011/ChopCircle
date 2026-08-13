// ChopCircle — Renders the "Trending recipes" grid on index.html.
// Kept separate from js/feed/feed-page.js since this runs on the public
// home page, not pages/feed.html — reuses recipeService.js rather than
// duplicating recipe-fetching logic in js/feed.
import { $ } from "../utils/dom.js";
import { listRecipes } from "../recipes/recipeService.js";
import { thumbnailURL } from "../utils/thumbnail.js";

const grid = $("#trending-recipes");

// NOTE: like js/recipes/recipes-page.js's recipeCardHTML, this deliberately
// does NOT show an author name/avatar — recipe docs don't denormalize
// author info (unlike posts), and fetching users/{authorId} per card in a
// grid would mean one extra read per recipe. The save button is decorative
// for now (saving isn't wired up yet — see savedCollections in the schema).
function recipeCardHTML(recipe) {
  const thumb = thumbnailURL(recipe.coverImageURL) || recipe.coverImageURL;
  return `
    <article class="card recipe-card">
      <a href="pages/recipe-details.html?id=${recipe.id}" class="recipe-card__link">
        <div class="recipe-card__media">
          <img src="${thumb}" onerror="this.onerror=null;this.src='${recipe.coverImageURL}'" alt="${recipe.title}" loading="lazy" />
          <button class="recipe-card__save" aria-label="Save recipe">🤍</button>
        </div>
        <div class="recipe-card__body">
          <h3 class="recipe-card__title">${recipe.title}</h3>
          <div class="recipe-card__meta">
            <span class="text-mono">${recipe.cookTimeMinutes} min</span><span>·</span>
            <span>${recipe.difficulty}</span><span>·</span>
            <span>Serves ${recipe.servings}</span>
          </div>
        </div>
      </a>
    </article>`;
}

/**
 * Loads and renders trending recipes into #trending-recipes, optionally
 * filtered by category slug. Replaces the static markup used for first
 * paint. Safe to call repeatedly (e.g. on each category chip click).
 */
export async function renderTrending(category = "") {
  if (!grid) return;
  grid.setAttribute("aria-busy", "true");
  try {
    const { recipes } = await listRecipes({ category: category || null, sortBy: "trending" });
    grid.innerHTML = recipes.length
      ? recipes.map(recipeCardHTML).join("")
      : `<p class="text-muted">No trending recipes in this category yet.</p>`;
  } catch (error) {
    console.error("Failed to load trending recipes:", error);
    grid.innerHTML = `<p class="text-muted">Couldn't load trending recipes right now.</p>`;
  } finally {
    grid.setAttribute("aria-busy", "false");
  }
}
