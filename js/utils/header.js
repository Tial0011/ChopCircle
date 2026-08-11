// ChopCircle — Auth-aware header (Phase 10)
// Every page with a .site-header now ships BOTH a logged-out block
// (#auth-guest — Log in / Join free) and a logged-in block (#auth-user —
// notification bell + avatar menu) in its static markup, matching this
// codebase's no-build-step, duplicated-per-page header pattern (see
// mobileNav.js's file header). This module is the one piece of behavior
// shared by all of them: call initAuthHeader(user, { basePath }) from a
// page's own controller, right alongside initTheme()/initMobileNav(),
// after resolving getCurrentUser()/requireAuth() — same wiring shape
// every page-controller already follows for those two.
//
// Fixes the long-standing HANDOFF.md gap: "every page's header is still
// static markup regardless of sign-in state... no unread-message badge on
// the Messages nav link and no 'my profile' avatar anywhere."
import { $, $$ } from "./dom.js";
import { logout } from "../auth/logout.js";
import { getProfile } from "../profile/profileService.js";
import { listenNotifications, markAllRead } from "../notifications/notificationService.js";
import { notificationItemHTML } from "../notifications/notificationItem.js";
import { listenUserChats } from "../chat/chatService.js";
import { avatarSrc } from "./avatar.js";

const FALLBACK_AVATAR = () => avatarSrc(null);
const DROPDOWN_PREVIEW_COUNT = 5;

/** Generic show/hide-on-outside-click dropdown, shared by the notification
 * bell and the avatar menu — same open/close/backdrop shape as
 * mobileNav.js's drawer, just without the slide-in panel. */
function wireDropdown(trigger, panel) {
  if (!trigger || !panel) return { onOpen: () => {} };
  let onOpenCallback = () => {};

  function close() {
    panel.classList.add("hidden");
    trigger.setAttribute("aria-expanded", "false");
  }
  function open() {
    panel.classList.remove("hidden");
    trigger.setAttribute("aria-expanded", "true");
    onOpenCallback();
  }
  trigger.addEventListener("click", (event) => {
    event.stopPropagation();
    panel.classList.contains("hidden") ? open() : close();
  });
  panel.addEventListener("click", (event) => event.stopPropagation());
  document.addEventListener("click", close);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") close();
  });

  return { onOpen: (cb) => (onOpenCallback = cb) };
}

function wireNotifications(uid, basePath) {
  const bell = $("#notif-bell");
  const badge = $("#notif-badge");
  const panel = $("#notif-dropdown");
  const list = $("#notif-list");
  const empty = $("#notif-empty");
  if (!bell || !panel) return;

  let latest = [];
  const dropdown = wireDropdown(bell, panel);
  dropdown.onOpen(() => {
    if (latest.some((n) => !n.isRead)) markAllRead(latest).catch((error) => console.error("Failed to mark notifications read:", error));
  });

  listenNotifications(uid, (notifications) => {
    latest = notifications;
    const unreadCount = notifications.filter((n) => !n.isRead).length;
    if (badge) {
      badge.textContent = unreadCount > 9 ? "9+" : String(unreadCount);
      badge.classList.toggle("hidden", unreadCount === 0);
    }
    if (list) {
      const preview = notifications.slice(0, DROPDOWN_PREVIEW_COUNT);
      list.innerHTML = preview.map((n) => notificationItemHTML(n, { basePath })).join("");
      empty?.classList.toggle("hidden", preview.length > 0);
    }
  });
}

/** Toggles a small unread dot next to every "Messages" nav link on the
 * page (desktop nav + mobile drawer both render one, per mobileNav.js's
 * file-header note about duplicated markup) whenever any chat has a
 * message from the other participant that hasn't been opened yet. */
function wireMessagesBadge(uid) {
  const dots = $$(".messages-badge");
  if (dots.length === 0) return;
  listenUserChats(uid, (chats) => {
    const hasUnread = chats.some((c) => c.lastSenderId && c.lastSenderId !== uid && c.lastMessageStatus !== "seen");
    dots.forEach((dot) => dot.classList.toggle("hidden", !hasUnread));
  });
}

/** Every "My profile" link on the page — desktop dropdown AND the mobile
 * drawer's plain link list both render one (class-based, not a single
 * #id, same plural reasoning as the guest/user swap above) — needs the
 * signed-in user's uid appended, same convention recipeCardHTML() uses
 * for its own links. */
function wireAccountProfileLinks(uid, basePath) {
  $$(".account-profile-link").forEach((el) => {
    el.href = `${basePath}profile.html?id=${uid}`;
  });
}

/** Every "Log out" control on the page — desktop dropdown button AND the
 * mobile drawer's plain-list button both carry this class (see note on
 * wireAccountProfileLinks above for why class-based). */
function wireLogoutButtons() {
  $$(".logout-btn").forEach((btn) =>
    btn.addEventListener("click", () => logout().catch((error) => console.error("Failed to log out:", error)))
  );
}

async function wireAvatarMenu(user, basePath) {
  const avatarBtn = $("#avatar-btn");
  const avatarImg = $("#header-avatar");
  const panel = $("#account-dropdown");
  if (!avatarBtn || !panel) return;

  wireDropdown(avatarBtn, panel);

  // Firestore's `users/{uid}` doc is authoritative for displayName/photoURL
  // (profileService.js's updateUserProfile() deliberately doesn't sync
  // changes back to Firebase Auth), so fetch it rather than trusting
  // `user.photoURL`/`user.displayName` off the Auth object, which can be
  // stale the moment someone edits their profile.
  if (avatarImg) {
    avatarImg.alt = user.displayName || "Account";
    avatarImg.src = FALLBACK_AVATAR(user.uid);
    try {
      const profile = await getProfile(user.uid);
      if (profile?.photoURL) avatarImg.src = profile.photoURL;
      if (profile?.displayName) avatarImg.alt = profile.displayName;
    } catch (error) {
      console.error("Failed to load profile for header avatar:", error);
    }
  }
}

/**
 * Wires the whole auth-aware header for one page. `user` is whatever
 * getCurrentUser()/requireAuth() resolved (possibly null). `basePath`
 * matches recipeCardHTML()'s convention: "" from pages/*.html, "pages/"
 * from index.html.
 */
export function initAuthHeader(user, { basePath = "" } = {}) {
  const guestBlocks = $$(".auth-guest");
  const userBlocks = $$(".auth-user");

  guestBlocks.forEach((el) => el.classList.toggle("hidden", !!user));
  userBlocks.forEach((el) => el.classList.toggle("hidden", !user));

  if (!user) return;

  wireAccountProfileLinks(user.uid, basePath);
  wireLogoutButtons();
  wireAvatarMenu(user, basePath); // desktop-only: avatar image + dropdown open/close
  wireNotifications(user.uid, basePath); // desktop-only: bell + dropdown open/close
  wireMessagesBadge(user.uid); // both desktop nav-links and mobile-drawer__links
}
