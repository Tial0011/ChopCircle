// ChopCircle — Profile page controller (Phase 7)
import { $, $$ } from "../utils/dom.js";
import { initTheme } from "../utils/theme.js";
import { initMobileNav } from "../utils/mobileNav.js";
import { initAuthHeader } from "../utils/header.js";
import { registerServiceWorker, initInstallPrompt } from "../utils/pwa.js";
import { getCurrentUser } from "../auth/authGuard.js";
import { getProfile, listenProfile, listUserRecipes, listUserPosts } from "./profileService.js";
import { initProfileActions } from "./profileActions.js";
import { recipeCardHTML } from "../recipes/recipeCard.js";
import { postCardHTML, initPostCard } from "../feed/postCard.js";
import { avatarSrc } from "../utils/avatar.js";

const profileId = new URLSearchParams(window.location.search).get("id");

const loadingState = $("#loading-state");
const notFoundState = $("#not-found-state");
const profileEl = $("#profile");
const coverImg = $("#profile-cover");
const avatarImg = $("#profile-avatar");
const nameEl = $("#profile-name");
const bioEl = $("#profile-bio");
const recipeCountEl = $("#profile-recipe-count");
const followerCountEl = $("#profile-follower-count");
const followingCountEl = $("#profile-following-count");
const followBtn = $("#follow-btn");
const messageLink = $("#message-link");
const editLink = $("#edit-link");

const tabsRow = $("#profile-tabs");
const tabRecipes = $("#tab-recipes");
const tabPosts = $("#tab-posts");
const recipesGrid = $("#profile-recipes-grid");
const recipesEmpty = $("#profile-recipes-empty");
const recipesLoadMoreBtn = $("#recipes-load-more");
const postsList = $("#profile-posts-list");
const postsEmpty = $("#profile-posts-empty");
const postsLoadMoreBtn = $("#posts-load-more");

let currentUser = null;
let recipesCursor = null;
let postsCursor = null;
let postsLoaded = false;

function goToLogin() {
  window.location.href = `login.html?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`;
}

function renderProfile(profile) {
  document.title = `${profile.displayName} — ChopCircle`;
  coverImg.src = profile.coverURL || "https://images.unsplash.com/photo-1543353071-873f17a7a088?w=1200&q=80";
  coverImg.alt = "";
  avatarImg.src = avatarSrc(profile.photoURL);
  avatarImg.alt = profile.displayName;
  nameEl.textContent = profile.displayName;
  bioEl.textContent = profile.bio || "";
  bioEl.classList.toggle("hidden", !profile.bio);
  recipeCountEl.textContent = profile.recipeCount || 0;
  followerCountEl.textContent = profile.followerCount || 0;
  followingCountEl.textContent = profile.followingCount || 0;
}

async function loadRecipes({ append = false } = {}) {
  recipesGrid.setAttribute("aria-busy", "true");
  const { recipes, lastDoc } = await listUserRecipes(profileId, { cursor: append ? recipesCursor : null });
  recipesCursor = lastDoc;
  const html = recipes.map((r) => recipeCardHTML(r, { basePath: "" })).join("");
  recipesGrid.innerHTML = append ? recipesGrid.innerHTML + html : html;
  recipesEmpty.classList.toggle("hidden", recipesGrid.children.length > 0);
  recipesLoadMoreBtn.hidden = !lastDoc || recipes.length === 0;
  recipesGrid.setAttribute("aria-busy", "false");
}

function wirePostCard(post) {
  const cardEl = postsList.querySelector(`[data-post-id="${post.id}"]`);
  initPostCard(cardEl, post, currentUser, goToLogin);
}

async function loadPosts({ append = false } = {}) {
  postsList.setAttribute("aria-busy", "true");
  const { posts, lastDoc } = await listUserPosts(profileId, { cursor: append ? postsCursor : null });
  postsCursor = lastDoc;
  const html = posts.map(postCardHTML).join("");
  if (append) {
    postsList.insertAdjacentHTML("beforeend", html);
  } else {
    postsList.innerHTML = html;
  }
  posts.forEach(wirePostCard);
  postsEmpty.classList.toggle("hidden", postsList.children.length > 0);
  postsLoadMoreBtn.hidden = !lastDoc || posts.length === 0;
  postsList.setAttribute("aria-busy", "false");
}

function initTabs() {
  tabsRow.addEventListener("click", async (event) => {
    const chip = event.target.closest(".chip");
    if (!chip) return;
    $$(".chip", tabsRow).forEach((c) => c.setAttribute("aria-pressed", "false"));
    chip.setAttribute("aria-pressed", "true");
    const tab = chip.dataset.tab;
    tabRecipes.classList.toggle("hidden", tab !== "recipes");
    tabPosts.classList.toggle("hidden", tab !== "posts");
    if (tab === "posts" && !postsLoaded) {
      postsLoaded = true;
      await loadPosts().catch((error) => {
        console.error("Failed to load posts:", error);
        postsList.innerHTML = `<p class="text-muted">Couldn't load posts right now.</p>`;
      });
    }
  });
}

async function init() {
  initTheme();
  initMobileNav();
  registerServiceWorker();
  initInstallPrompt();

  if (!profileId) {
    loadingState.classList.add("hidden");
    notFoundState.classList.remove("hidden");
    return;
  }

  const [profile, user] = await Promise.all([getProfile(profileId), getCurrentUser()]);
  currentUser = user;
  initAuthHeader(user, { basePath: "" });

  if (!profile) {
    loadingState.classList.add("hidden");
    notFoundState.classList.remove("hidden");
    return;
  }

  renderProfile(profile);
  const unsubProfile = listenProfile(profileId, renderProfile);
  window.addEventListener("beforeunload", unsubProfile);
  await initProfileActions({ currentUser, profileId, followBtn, messageLink, editLink, followerCountEl, goToLogin });
  initTabs();
  await loadRecipes();

  loadingState.classList.add("hidden");
  profileEl.classList.remove("hidden");
}

init().catch((error) => {
  console.error("Failed to load profile:", error);
  loadingState.classList.add("hidden");
  notFoundState.classList.remove("hidden");
});

recipesLoadMoreBtn?.addEventListener("click", () => loadRecipes({ append: true }));
postsLoadMoreBtn?.addEventListener("click", () => loadPosts({ append: true }));
