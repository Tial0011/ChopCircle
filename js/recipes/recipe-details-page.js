// ChopCircle — Recipe detail page controller
import { $ } from "../utils/dom.js";
import { initTheme } from "../utils/theme.js";
import { initMobileNav } from "../utils/mobileNav.js";
import { initAuthHeader } from "../utils/header.js";
import { registerServiceWorker, initInstallPrompt } from "../utils/pwa.js";
import { auth, db } from "../firebase/firebase-init.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { getCurrentUser } from "../auth/authGuard.js";
import {
  getRecipe,
  deleteRecipe,
  hasUserLikedRecipe,
  toggleLikeRecipe,
  categoryName,
} from "./recipeService.js";

const recipeId = new URLSearchParams(window.location.search).get("id");

const loadingState = $("#loading-state");
const notFoundState = $("#not-found-state");
const detail = $("#recipe-detail");
const likeBtn = $("#like-btn");
const likeCountEl = $("#like-count");
const editLink = $("#edit-link");
const deleteBtn = $("#delete-btn");

function renderIngredients(ingredients) {
  $("#ingredient-list").innerHTML = ingredients
    .map((i) => `<li><span>${i.amount ?? ""} ${i.unit ?? ""}</span> ${i.name}</li>`)
    .join("");
}

function renderSteps(steps) {
  const ordered = [...steps].sort((a, b) => a.order - b.order);
  $("#step-list").innerHTML = ordered.map((s) => `<li>${s.text}</li>`).join("");
}

function renderNutrition(nutrition) {
  if (!nutrition) return;
  $("#nutrition-section").classList.remove("hidden");
  const rows = [
    ["Calories", nutrition.calories],
    ["Protein", `${nutrition.protein}g`],
    ["Carbs", `${nutrition.carbs}g`],
    ["Fat", `${nutrition.fat}g`],
  ];
  $("#nutrition-grid").innerHTML = rows
    .map(([label, value]) => `<div><strong>${value ?? "—"}</strong><span>${label}</span></div>`)
    .join("");
}

async function renderAuthor(authorId) {
  const snap = await getDoc(doc(db, "users", authorId));
  const author = snap.exists() ? snap.data() : { displayName: "ChopCircle cook", photoURL: null };
  $("#detail-author-name").textContent = author.displayName;
  $("#detail-author-photo").src = author.photoURL || "https://i.pravatar.cc/80";
  $("#detail-author-photo").alt = author.displayName;
  $("#detail-author-link").href = `profile.html?id=${authorId}`;
}

async function updateLikeUI(recipe, currentUser) {
  likeCountEl.textContent = recipe.likeCount;
  if (!currentUser) return;
  const liked = await hasUserLikedRecipe(recipeId, currentUser.uid);
  likeBtn.setAttribute("aria-pressed", String(liked));
  likeBtn.firstChild.textContent = liked ? "❤️ " : "🤍 ";
}

function wireOwnerActions(recipe, currentUser) {
  if (!currentUser || currentUser.uid !== recipe.authorId) return;
  editLink.href = `recipe-form.html?id=${recipeId}`;
  editLink.classList.remove("hidden");
  deleteBtn.classList.remove("hidden");
  deleteBtn.addEventListener("click", async () => {
    if (!confirm("Delete this recipe? This can't be undone.")) return;
    deleteBtn.disabled = true;
    try {
      await deleteRecipe(recipeId);
      window.location.href = "recipes.html";
    } catch (error) {
      console.error("Failed to delete recipe:", error);
      deleteBtn.disabled = false;
    }
  });
}

async function init() {
  initTheme();
  initMobileNav();
  registerServiceWorker();
  initInstallPrompt();

  if (!recipeId) {
    loadingState.classList.add("hidden");
    notFoundState.classList.remove("hidden");
    return;
  }

  const [recipe, currentUser] = await Promise.all([getRecipe(recipeId), getCurrentUser()]);
  initAuthHeader(currentUser, { basePath: "" });

  if (!recipe) {
    loadingState.classList.add("hidden");
    notFoundState.classList.remove("hidden");
    return;
  }

  document.title = `${recipe.title} — ChopCircle`;
  $("#detail-cover").src = recipe.coverImageURL;
  $("#detail-cover").alt = recipe.title;
  $("#detail-category").textContent = categoryName(recipe.category);
  $("#detail-title").textContent = recipe.title;
  $("#detail-description").textContent = recipe.description;
  $("#detail-time").textContent = `${recipe.cookTimeMinutes} min`;
  $("#detail-difficulty").textContent = recipe.difficulty;
  $("#detail-servings").textContent = recipe.servings;
  renderIngredients(recipe.ingredients);
  renderSteps(recipe.steps);
  renderNutrition(recipe.nutrition);
  await renderAuthor(recipe.authorId);
  await updateLikeUI(recipe, currentUser);
  wireOwnerActions(recipe, currentUser);

  likeBtn.addEventListener("click", async () => {
    if (!auth.currentUser) {
      window.location.href = `login.html?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`;
      return;
    }
    likeBtn.disabled = true;
    try {
      const liked = await toggleLikeRecipe(recipeId, auth.currentUser.uid);
      likeBtn.setAttribute("aria-pressed", String(liked));
      likeBtn.firstChild.textContent = liked ? "❤️ " : "🤍 ";
      likeCountEl.textContent = Number(likeCountEl.textContent) + (liked ? 1 : -1);
    } catch (error) {
      console.error("Failed to toggle like:", error);
    } finally {
      likeBtn.disabled = false;
    }
  });

  loadingState.classList.add("hidden");
  detail.classList.remove("hidden");
}

init().catch((error) => {
  console.error("Failed to load recipe:", error);
  loadingState.classList.add("hidden");
  notFoundState.classList.remove("hidden");
});
