// ChopCircle — Recipe detail page controller
import { $ } from "../utils/dom.js";
import { initTheme } from "../utils/theme.js";
import { initMobileNav } from "../utils/mobileNav.js";
import { initAuthHeader, initHeaderSearch } from "../utils/header.js";
import { registerServiceWorker, initInstallPrompt } from "../utils/pwa.js";
import { auth, db } from "../firebase/firebase-init.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { getCurrentUser } from "../auth/authGuard.js";
import {
  getRecipe,
  deleteRecipe,
  hasUserLikedRecipe,
  toggleLikeRecipe,
  listenRecipe,
  listenUserLikedRecipe,
  categoryName,
} from "./recipeService.js";
import { avatarSrc } from "../utils/avatar.js";

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
  $("#detail-author-photo").src = avatarSrc(author.photoURL);
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
  initHeaderSearch("");

  if (!recipe) {
    loadingState.classList.add("hidden");
    notFoundState.classList.remove("hidden");
    return;
  }

  document.title = `${recipe.title} — ChopCircle`;
  $("#detail-cover").src = recipe.coverImageURL;
  $("#detail-cover").alt = recipe.title;
  const videoEl = $("#detail-video");
  if (recipe.videoURL) {
    videoEl.src = recipe.videoURL;
    videoEl.classList.remove("hidden");
  }
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

  // Real-time pass: keep the like count and heart state live for everyone
  // viewing this recipe, not just the person who clicked — same pattern as
  // the feed's postCard.js. `likePending` gates the live listeners' DOM
  // writes while this tab's own click is still in flight, so the
  // optimistic update below doesn't get briefly overwritten by a stale
  // snapshot before the real transaction result arrives (see
  // recipeService.js's listenRecipe()/listenUserLikedRecipe() doc comments).
  let likePending = false;
  let latestLikeCount = recipe.likeCount;
  let latestLiked = likeBtn.getAttribute("aria-pressed") === "true";

  function paintLike() {
    if (likePending) return;
    likeCountEl.textContent = latestLikeCount;
    likeBtn.setAttribute("aria-pressed", String(latestLiked));
    likeBtn.firstChild.textContent = latestLiked ? "❤️ " : "🤍 ";
  }

  const unsubRecipe = listenRecipe(recipeId, (live) => {
    latestLikeCount = live.likeCount;
    paintLike();
  });
  let unsubLiked = null;
  if (currentUser) {
    unsubLiked = listenUserLikedRecipe(recipeId, currentUser.uid, (liked) => {
      latestLiked = liked;
      paintLike();
    });
  }
  window.addEventListener("beforeunload", () => {
    unsubRecipe();
    if (unsubLiked) unsubLiked();
  });

  likeBtn.addEventListener("click", async () => {
    if (!auth.currentUser) {
      window.location.href = `login.html?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`;
      return;
    }
    if (likePending) return; // guards against rapid/double clicks racing toggleLikeRecipe's transaction
    likePending = true;

    // Optimistic update — same reasoning as postCard.js's like button:
    // flip the icon/count immediately rather than waiting on the
    // transaction's round trip, roll back in the catch below if the
    // write actually fails.
    const wasLiked = likeBtn.getAttribute("aria-pressed") === "true";
    const nowLiked = !wasLiked;
    const countBeforeClick = Number(likeCountEl.textContent);
    likeBtn.setAttribute("aria-pressed", String(nowLiked));
    likeBtn.firstChild.textContent = nowLiked ? "❤️ " : "🤍 ";
    likeCountEl.textContent = countBeforeClick + (nowLiked ? 1 : -1);

    try {
      await toggleLikeRecipe(recipeId, auth.currentUser.uid);
    } catch (error) {
      console.error("Failed to toggle like:", error);
      likeBtn.setAttribute("aria-pressed", String(wasLiked));
      likeBtn.firstChild.textContent = wasLiked ? "❤️ " : "🤍 ";
      likeCountEl.textContent = countBeforeClick;
    } finally {
      likePending = false;
      paintLike(); // repaint from whatever the listeners last received while we were gated
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
