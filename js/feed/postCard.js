// ChopCircle — Post card component (Phase 6)
// One post card = media + caption + like/comment/share bar + a collapsible
// comment thread. Kept separate from feed-page.js so the orchestration file
// (list rendering, pagination, composer) stays under the ~150-line guideline.
import { $ } from "../utils/dom.js";
import { stripHtml } from "../utils/validation.js";
import { relativeTime } from "../utils/format.js";
import { hasUserLiked, toggleLikePost, listComments, addComment } from "./feedService.js";

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
          <button class="post-card__share">↗️ ${post.shareCount || 0}</button>
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

/** Wires like/comment interactions for one already-rendered post card element. */
export function initPostCard(cardEl, post, currentUser, onNeedsAuth) {
  const likeBtn = $(".post-card__like", cardEl);
  const commentToggle = $(".post-card__comment-toggle", cardEl);
  const commentsPanel = $(".post-card__comments", cardEl);
  const commentList = $(".comment-list", cardEl);
  const commentForm = $(".comment-form", cardEl);
  let commentsLoaded = false;

  (async () => {
    if (currentUser && (await hasUserLiked("post", post.id, currentUser.uid))) {
      likeBtn.dataset.liked = "true";
      likeBtn.setAttribute("aria-pressed", "true");
      likeBtn.firstChild.textContent = "❤️ ";
    }
  })();

  let likePending = false;
  likeBtn.addEventListener("click", async () => {
    if (!currentUser) return onNeedsAuth();
    if (likePending) return; // guards against rapid/double clicks racing toggleLikePost's transaction
    likePending = true;
    likeBtn.disabled = true;
    try {
      const liked = await toggleLikePost(post.id, currentUser.uid);
      likeBtn.dataset.liked = String(liked);
      likeBtn.setAttribute("aria-pressed", String(liked));
      likeBtn.firstChild.textContent = liked ? "❤️ " : "🤍 ";
      const countEl = $(".like-count", likeBtn);
      countEl.textContent = Number(countEl.textContent) + (liked ? 1 : -1);
    } catch (error) {
      console.error("Failed to toggle like:", error);
    } finally {
      likePending = false;
      likeBtn.disabled = false;
    }
  });

  commentToggle.addEventListener("click", async () => {
    commentsPanel.classList.toggle("hidden");
    if (!commentsLoaded && !commentsPanel.classList.contains("hidden")) {
      commentsLoaded = true;
      const comments = await listComments("post", post.id);
      commentList.innerHTML = comments.map(commentHTML).join("") ||
        `<li class="text-muted text-sm">No comments yet — be the first.</li>`;
    }
  });

  commentForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!currentUser) return onNeedsAuth();
    const input = commentForm.querySelector("input");
    const text = input.value.trim();
    if (!text) return;
    input.disabled = true;
    await addComment("post", post.id, currentUser.uid, text);
    input.value = "";
    input.disabled = false;
    const emptyMsg = commentList.querySelector(".text-muted");
    if (emptyMsg) emptyMsg.remove();
    commentList.insertAdjacentHTML("beforeend", commentHTML({
      authorName: currentUser.displayName || "You",
      authorPhotoURL: currentUser.photoURL,
      authorId: currentUser.uid,
      text,
      createdAt: null,
    }));
    const countEl = $(".comment-count", commentToggle);
    countEl.textContent = Number(countEl.textContent) + 1;
  });
}
