// ChopCircle — Feed page controller (Phase 6)
import { $ } from "../utils/dom.js";
import { initTheme } from "../utils/theme.js";
import { initMobileNav } from "../utils/mobileNav.js";
import { initAuthHeader } from "../utils/header.js";
import { registerServiceWorker, initInstallPrompt } from "../utils/pwa.js";
import { getCurrentUser } from "../auth/authGuard.js";
import { initImageUploadField } from "../utils/imageUpload.js";
import { listPosts, createPost, listenNewestPost } from "./feedService.js";
import { postCardHTML, initPostCard } from "./postCard.js";

const feedList = $("#feed-list");
const emptyState = $("#feed-empty");
const loadMoreBtn = $("#load-more");
const composer = $("#composer");
const composerLoggedOut = $("#composer-logged-out");
const captionInput = $("#post-caption");
const newPostsBanner = $("#feed-new-posts-banner");
let postImageUpload = null;

let currentUser = null;
let cursor = null;
let cardCleanups = []; // unsubscribe fns from initPostCard() — cleared before any non-append re-render
let newestKnownPostId = null; // top-of-feed post id we've actually rendered; drives the "new posts" banner

function goToLogin() {
  window.location.href = `login.html?redirect=${encodeURIComponent(window.location.pathname)}`;
}

function wireCard(post) {
  const cardEl = feedList.querySelector(`[data-post-id="${post.id}"]`);
  cardCleanups.push(initPostCard(cardEl, post, currentUser, goToLogin));
}

function renderPosts(posts, { append = false } = {}) {
  const html = posts.map(postCardHTML).join("");
  if (append) {
    feedList.insertAdjacentHTML("beforeend", html);
  } else {
    cardCleanups.forEach((cleanup) => cleanup()); // stop any listeners on cards we're about to discard
    cardCleanups = [];
    feedList.innerHTML = html;
  }
  posts.forEach(wireCard);
}

function prependPost(post) {
  emptyState.classList.add("hidden");
  feedList.insertAdjacentHTML("afterbegin", postCardHTML(post));
  wireCard(post);
  newestKnownPostId = post.id;
}

async function loadFeed({ append = false } = {}) {
  feedList.setAttribute("aria-busy", "true");
  const { posts, lastDoc } = await listPosts({ cursor: append ? cursor : null });
  cursor = lastDoc;
  renderPosts(posts, { append });
  emptyState.classList.toggle("hidden", feedList.children.length > 0);
  loadMoreBtn.hidden = !lastDoc || posts.length === 0;
  feedList.setAttribute("aria-busy", "false");
  if (!append && posts[0]) newestKnownPostId = posts[0].id;
  newPostsBanner.classList.add("hidden");
}

/**
 * Real-time pass: watches for a brand-new post from ANYONE landing at the
 * top of the feed while this tab is open, and surfaces a "New posts"
 * banner rather than silently reflowing the list underneath a reader
 * (which — mid-scroll — would be jarring). Tapping the banner just
 * reloads the first page fresh. Own posts are excluded since
 * prependPost() already renders those instantly and updates
 * `newestKnownPostId` itself.
 */
function watchForNewPosts() {
  listenNewestPost((post) => {
    if (!newestKnownPostId || post.id === newestKnownPostId) return;
    if (currentUser && post.authorId === currentUser.uid) return; // we already rendered our own post optimistically
    newPostsBanner.classList.remove("hidden");
  });
  newPostsBanner.addEventListener("click", () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
    loadFeed().catch((error) => console.error("Failed to refresh feed:", error));
  });
}

function initComposer() {
  if (!currentUser) {
    composer.classList.add("hidden");
    composerLoggedOut.classList.remove("hidden");
    return;
  }
  composer.classList.remove("hidden");
  composerLoggedOut.classList.add("hidden");

  postImageUpload = initImageUploadField($("#post-image-upload"), { folder: "posts", uid: currentUser.uid });

  composer.addEventListener("submit", async (event) => {
    event.preventDefault();
    const caption = captionInput.value.trim();
    if (!caption) return;
    const submitBtn = $("button[type=submit]", composer);
    submitBtn.disabled = true;
    submitBtn.textContent = "Uploading…";
    try {
      await postImageUpload.waitForUpload();
    } catch {
      submitBtn.disabled = false;
      submitBtn.textContent = "Post";
      return; // imageUpload.js already surfaced the error on the field
    }
    submitBtn.textContent = "Posting…";
    try {
      const imageURLs = postImageUpload.getURL() ? [postImageUpload.getURL()] : [];
      const postId = await createPost(currentUser.uid, { caption, imageURLs });
      composer.reset();
      postImageUpload.setInitial(null);
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
  loadFeed()
    .then(watchForNewPosts)
    .catch((error) => {
      console.error("Failed to load feed:", error);
      feedList.innerHTML = `<p class="text-muted">Couldn't load the feed right now. Please try again shortly.</p>`;
    });
});

loadMoreBtn?.addEventListener("click", () => loadFeed({ append: true }));
