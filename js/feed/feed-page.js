// ChopCircle — Feed page controller (Phase 6)
import { $ } from "../utils/dom.js";
import { initTheme } from "../utils/theme.js";
import { initMobileNav } from "../utils/mobileNav.js";
import { initAuthHeader } from "../utils/header.js";
import { registerServiceWorker, initInstallPrompt } from "../utils/pwa.js";
import { getCurrentUser } from "../auth/authGuard.js";
import { listPosts, createPost } from "./feedService.js";
import { postCardHTML, initPostCard } from "./postCard.js";

const feedList = $("#feed-list");
const emptyState = $("#feed-empty");
const loadMoreBtn = $("#load-more");
const composer = $("#composer");
const composerLoggedOut = $("#composer-logged-out");
const captionInput = $("#post-caption");
const imageInput = $("#post-image-url");

let currentUser = null;
let cursor = null;

function goToLogin() {
  window.location.href = `login.html?redirect=${encodeURIComponent(window.location.pathname)}`;
}

function wireCard(post) {
  const cardEl = feedList.querySelector(`[data-post-id="${post.id}"]`);
  initPostCard(cardEl, post, currentUser, goToLogin);
}

function renderPosts(posts, { append = false } = {}) {
  const html = posts.map(postCardHTML).join("");
  if (append) {
    feedList.insertAdjacentHTML("beforeend", html);
  } else {
    feedList.innerHTML = html;
  }
  posts.forEach(wireCard);
}

function prependPost(post) {
  emptyState.classList.add("hidden");
  feedList.insertAdjacentHTML("afterbegin", postCardHTML(post));
  wireCard(post);
}

async function loadFeed({ append = false } = {}) {
  feedList.setAttribute("aria-busy", "true");
  const { posts, lastDoc } = await listPosts({ cursor: append ? cursor : null });
  cursor = lastDoc;
  renderPosts(posts, { append });
  emptyState.classList.toggle("hidden", feedList.children.length > 0);
  loadMoreBtn.hidden = !lastDoc || posts.length === 0;
  feedList.setAttribute("aria-busy", "false");
}

function initComposer() {
  if (!currentUser) {
    composer.classList.add("hidden");
    composerLoggedOut.classList.remove("hidden");
    return;
  }
  composer.classList.remove("hidden");
  composerLoggedOut.classList.add("hidden");

  composer.addEventListener("submit", async (event) => {
    event.preventDefault();
    const caption = captionInput.value.trim();
    if (!caption) return;
    const submitBtn = $("button[type=submit]", composer);
    submitBtn.disabled = true;
    submitBtn.textContent = "Posting…";
    try {
      const imageURLs = imageInput.value.trim() ? [imageInput.value.trim()] : [];
      const postId = await createPost(currentUser.uid, { caption, imageURLs });
      composer.reset();
      prependPost({
        id: postId,
        authorId: currentUser.uid,
        authorName: currentUser.displayName || "You",
        authorPhotoURL: currentUser.photoURL,
        caption,
        imageURLs,
        likeCount: 0,
        commentCount: 0,
        shareCount: 0,
        createdAt: null,
      });
    } catch (error) {
      console.error("Failed to create post:", error);
      alert("Something went wrong posting that — please try again.");
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Post";
    }
  });
}

initTheme();
initMobileNav();
registerServiceWorker();
initInstallPrompt();
getCurrentUser().then((user) => {
  currentUser = user;
  initAuthHeader(user, { basePath: "" });
  initComposer();
  loadFeed().catch((error) => {
    console.error("Failed to load feed:", error);
    feedList.innerHTML = `<p class="text-muted">Couldn't load the feed right now. Please try again shortly.</p>`;
  });
});

loadMoreBtn?.addEventListener("click", () => loadFeed({ append: true }));
