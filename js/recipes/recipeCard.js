// ChopCircle — Shared recipe card renderer.
// Used by js/recipes/recipes-page.js, js/feed/render-trending.js, and
// js/profile/profile-page.js. Deliberately does NOT render an author name/
// avatar — recipe docs don't denormalize author info (unlike posts), and
// fetching users/{authorId} per card in a grid would be an N+1 read. The
// one place author IS shown is recipe-details.html, which only ever
// renders one recipe so a single extra read is fine (see
// recipe-details-page.js's renderAuthor()).
/**
 * @param {object} recipe
 * @param {{basePath?: string}} [opts] basePath is prefixed onto the link
 *   href so this works whether the calling page lives in pages/ (basePath
 *   "") or at the site root (basePath "pages/").
 */
export function recipeCardHTML(recipe, { basePath = "" } = {}) {
  return `
    <article class="card recipe-card">
      <a href="${basePath}recipe-details.html?id=${recipe.id}" class="recipe-card__link">
        <div class="recipe-card__media">
          <img src="${recipe.coverImageURL}" alt="${recipe.title}" loading="lazy" />
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
