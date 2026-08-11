// ChopCircle — Post card component (Phase 6, real-time pass)
// One post card = media + caption + like/comment/share bar + a collapsible
// comment thread. Kept separate from feed-page.js so the orchestration file
// (list rendering, pagination, composer) stays under the ~150-line guideline.
//
// Like/comment/share counts, the heart's liked-state, and the comment list
// are all live now via feedService.js's listenPost()/listenUserLikedPost()/
// listenComments() — no manual refresh needed to see someone else's like or
// comment land. initPostCard() returns a cleanup() function that unsubscribes
// all three; feed-page.js calls it before ever replacing a card's markup
// (today that's only the empty-feed→first-load transition, since "Load
// more" always appends, but a listener left on a removed DOM node would
// otherwise run forever).
import { $ } from "../utils/dom.js";
import { stripHtml } from "../utils/validation.js";
import { relativeTime } from "../utils/format.js";
import { toggleLikePost, addComment, listenPost, listenUserLikedPost, listenComments } from "./feedService.js";

function commentHTML(comment) {
  return `
    <li class="comment" data-comment-id="${comment.id}">
      <a href="profile.html?id=${comment.authorId}"><img src="${comment.authorPhotoURL || "https://i.pravatar.cc/32?u=" + comment.authorId}" alt="" /></a>
      <div>
        <p><a href="profile.html?id=${comment.authorId}"><strong>${stripHtml(comment.authorName)}</strong></a> ${stripHtml(comment.text)}</p>
        <span class="text-xs text-muted">${relativeTime(comment.createdAt)}</span>
      </div>
    </li>`;
}

/**
 * Builds a post card's markup. `currentUser` may be null (logged-out
 * visitors can read the feed but liking/commenting prompts a login).
 */
export function postCardHTML(post) {
  const media = post.imageURLs?.[0]
    ? `<div class="post-card__media"><img src="${post.imageURLs[0]}" alt="" loading="lazy" /></div>`
    : "";
  return `
    <article class="card post-card" data-post-id="${post.id}">
      <div class="post-card__header">
        <a href="profile.html?id=${post.authorId}"><img src="${post.authorPhotoURL || "https://i.pravatar.cc/40?u=" + post.authorId}" alt="" /></a>
        <div>
          <a href="profile.html?id=${post.authorId}"><strong>${stripHtml(post.authorName)}</strong></a>
          <span class="text-xs text-muted">${relativeTime(post.createdAt)}</span>
        </div>
      </div>
      ${media}
      <div class="post-card__body">
        <p class="post-card__caption">${stripHtml(post.caption)}</p>
        <div class="post-card__bar">
          <button class="post-card__like" data-liked="false" aria-pressed="false">
            🤍 <span class="like-count">${post.likeCount || 0}</span>
          </button>
          <button class="post-card__comment-toggle">💬 <span class="comment-count">${post.commentCount || 0}</span></button>
          <button class="post-card__share"><span class="share-count">↗️ ${post.shareCount || 0}</span></button>
        </div>
        <div class="post-card__comments hidden">
          <ul class="comment-list"></ul>
          <form class="comment-form">
            <input type="text" placeholder="Add a comment…" aria-label="Add a comment" required />
            <button type="submit" class="btn btn--primary btn--icon">➤</button>
          </form>
        </div>
      </div>
    </article>`;
}

/**
 * Wires like/comment interactions for one already-rendered post card
 * element and starts its live listeners.
 * @returns {() => void} cleanup — unsubscribes every listener this card
 * started; call it before the card's DOM node is ever discarded.
 */
export function initPostCard(cardEl, post, currentUser, onNeedsAuth) {
  const likeBtn = $(".post-card__like", cardEl);
  const likeCountEl = $(".like-count", likeBtn);
  const commentToggle = $(".post-card__comment-toggle", cardEl);
  const commentCountEl = $(".comment-count", commentToggle);
  const shareCountEl = $(".share-count", cardEl);
  const commentsPanel = $(".post-card__comments", cardEl);
  const commentList = $(".comment-list", cardEl);
  const commentForm = $(".comment-form", cardEl);

  let likePending = false;
  let latestLikeCount = post.likeCount || 0;
  let latestLiked = false;
  let commentsListening = false;
  let unsubComments = null;

  function paintLiked(liked) {
    likeBtn.dataset.liked = String(liked);
    likeBtn.setAttribute("aria-pressed", String(liked));
    likeBtn.firstChild.textContent = liked ? "❤️ " : "🤍 ";
  }

  // Live post doc — likeCount is gated behind `likePending` (see this
  // file's header comment and feedService.js's listenPost() comment for
  // why); commentCount/shareCount have no such race and paint immediately.
  const unsubPost = listenPost(post.id, (livePost) => {
    latestLikeCount = livePost.likeCount || 0;
    if (!likePending) likeCountEl.textContent = latestLikeCount;
    commentCountEl.textContent = livePost.commentCount || 0;
    shareCountEl.textContent = `↗️ ${livePost.shareCount || 0}`;
  });

  // Live liked-state — only meaningful when signed in. Same gating.
  const unsubLiked = currentUser
    ? listenUserLikedPost(post.id, currentUser.uid, (liked) => {
        latestLiked = liked;
        if (!likePending) paintLiked(liked);
      })
    : null;

  function ensureCommentsListening() {
    if (commentsListening) return;
    commentsListening = true;
    unsubComments = listenComments("post", post.id, (comments) => {
      commentList.innerHTML = comments.map(commentHTML).join("") ||
        `<li class="text-muted text-sm">No comments yet — be the first.</li>`;
    });
  }

  likeBtn.addEventListener("click", async () => {
    if (!currentUser) return onNeedsAuth();
    if (likePending) return; // guards against rapid/double clicks racing toggleLikePost's transaction
    likePending = true;

    // Optimistic update — flip the icon/count immediately so the tap
    // feels instant, rather than waiting on toggleLikePost()'s round trip
    // (a transaction, which unlike a plain write gets no local-cache echo
    // from listenPost() above until the server confirms).
    const wasLiked = likeBtn.dataset.liked === "true";
    const nowLiked = !wasLiked;
    const countBeforeClick = Number(likeCountEl.textContent);
    paintLiked(nowLiked);
    likeCountEl.textContent = countBeforeClick + (nowLiked ? 1 : -1);

    try {
      await toggleLikePost(post.id, currentUser.uid);
    } catch (error) {
      console.error("Failed to toggle like:", error);
      paintLiked(wasLiked);
      likeCountEl.textContent = countBeforeClick;
    } finally {
      likePending = false;
      // Repaint from whatever listenPost()/listenUserLikedPost() most
      // recently received while gated, so we land on the true server
      // value rather than staying stuck on the optimistic guess.
      likeCountEl.textContent = latestLikeCount;
      paintLiked(latestLiked);
    }
  });

  commentToggle.addEventListener("click", () => {
    commentsPanel.classList.toggle("hidden");
    if (!commentsPanel.classList.contains("hidden")) ensureCommentsListening();
  });

  commentForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!currentUser) return onNeedsAuth();
    const input = commentForm.querySelector("input");
    const text = input.value.trim();
    if (!text) return;
    ensureCommentsListening(); // covers submitting before ever opening the panel
    input.disabled = true;
    try {
      await addComment("post", post.id, currentUser.uid, text);
      input.value = "";
      // No manual DOM insert needed — addComment() writes via a plain
      // (non-transaction) updateDoc()/addDoc(), which DOES get Firestore's
      // local-cache echo, so the listenComments() listener above already
      // renders it instantly.
    } catch (error) {
      console.error("Failed to add comment:", error);
    } finally {
      input.disabled = false;
    }
  });

  return function cleanup() {
    unsubPost();
    unsubLiked?.();
    unsubComments?.();
  };
}
