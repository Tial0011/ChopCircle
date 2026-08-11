// ChopCircle — Profile header action buttons (Follow / Message / Edit)
// Split out of profile-page.js (Phase 8) to keep that file under the
// codebase's ~150-line-per-file guideline — this was the piece that would
// have pushed it over when the Message button was added.
import { isFollowing, toggleFollow } from "./profileService.js";

/**
 * Wires the Follow/Message/Edit buttons in a profile's header for the given
 * viewer (`currentUser`, possibly null for a logged-out visitor) looking at
 * `profileId`'s profile. `goToLogin` is called instead of the real action
 * when a logged-out visitor clicks Follow or Message.
 */
export function initProfileActions({ currentUser, profileId, followBtn, messageLink, editLink, followerCountEl, goToLogin }) {
  if (currentUser && currentUser.uid === profileId) {
    editLink.href = "profile-edit.html";
    editLink.classList.remove("hidden");
    return Promise.resolve();
  }

  function updateFollowBtnUI(following) {
    followBtn.dataset.following = String(following);
    followBtn.setAttribute("aria-pressed", String(following));
    followBtn.textContent = following ? "Following" : "Follow";
    followBtn.classList.toggle("btn--secondary", following);
    followBtn.classList.toggle("btn--primary", !following);
  }

  if (!currentUser) {
    // Logged-out visitors can still view a profile — show Follow/Message,
    // but route through login when they actually click either.
    followBtn.classList.remove("hidden");
    updateFollowBtnUI(false);
    followBtn.addEventListener("click", goToLogin);
    messageLink.classList.remove("hidden");
    messageLink.addEventListener("click", (event) => {
      event.preventDefault();
      goToLogin();
    });
    return Promise.resolve();
  }

  followBtn.classList.remove("hidden");
  messageLink.classList.remove("hidden");
  messageLink.href = `chat.html?with=${profileId}`;

  return isFollowing(currentUser.uid, profileId).then((following) => {
    updateFollowBtnUI(following);
    followBtn.addEventListener("click", async () => {
      followBtn.disabled = true;
      try {
        const nowFollowing = await toggleFollow(currentUser.uid, profileId);
        updateFollowBtnUI(nowFollowing);
        followerCountEl.textContent = Number(followerCountEl.textContent) + (nowFollowing ? 1 : -1);
      } catch (error) {
        console.error("Failed to toggle follow:", error);
      } finally {
        followBtn.disabled = false;
      }
    });
  });
}
