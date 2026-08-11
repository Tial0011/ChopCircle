// ChopCircle — Renders the "Featured creators" row on index.html with
// real users (ranked by followers + likes, see getTopCreators() in
// profileService.js), replacing the 5 hardcoded placeholder profiles that
// shipped with the marketing page. Same "own small render module, called
// from app.js" shape as js/feed/render-trending.js.
import { $ } from "../utils/dom.js";
import { getTopCreators } from "./profileService.js";

const row = $("#creators-row");

function fallbackAvatar(uid) {
  return `https://i.pravatar.cc/80?u=${uid}`;
}

function followerLabel(count = 0) {
  if (count >= 1000) return `${(count / 1000).toFixed(count % 1000 === 0 ? 0 : 1)}k followers`;
  return `${count} follower${count === 1 ? "" : "s"}`;
}

function creatorCardHTML(user) {
  return `
    <a class="creator-card" href="pages/profile.html?id=${user.id}">
      <img src="${user.photoURL || fallbackAvatar(user.id)}" alt="" />
      <h4>${user.displayName || "ChopCircle cook"}</h4>
      <p class="text-muted">${followerLabel(user.followerCount)}</p>
    </a>`;
}

/**
 * Loads and renders the top 5 creators into #creators-row. Safe to skip
 * silently if there aren't enough real users yet (a brand-new instance of
 * the app, or Firestore unreachable) — the section still has its heading,
 * it just won't force fake names to fill the gap.
 */
export async function renderCreators() {
  if (!row) return;
  row.setAttribute("aria-busy", "true");
  try {
    const creators = await getTopCreators(5);
    row.innerHTML = creators.length
      ? creators.map(creatorCardHTML).join("")
      : `<p class="text-muted">No creators to feature yet — be the first to build a following!</p>`;
  } catch (error) {
    console.error("Failed to load featured creators:", error);
    row.innerHTML = `<p class="text-muted">Couldn't load featured creators right now.</p>`;
  } finally {
    row.setAttribute("aria-busy", "false");
  }
}
