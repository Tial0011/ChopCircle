// ChopCircle — Notifications page controller (Phase 10)
// Full-history equivalent of the header bell dropdown. Renders through the
// SAME notificationItemHTML() the bell dropdown uses (js/notifications/
// notificationItem.js) so the two surfaces can never drift on copy or
// links — see that file's header comment.
import { $ } from "../utils/dom.js";
import { initTheme } from "../utils/theme.js";
import { initMobileNav } from "../utils/mobileNav.js";
import { initAuthHeader } from "../utils/header.js";
import { registerServiceWorker, initInstallPrompt } from "../utils/pwa.js";
import { requireAuth } from "../auth/authGuard.js"; // this page makes no sense logged out
import { listenNotifications, markAllRead } from "./notificationService.js";
import { notificationItemHTML } from "./notificationItem.js";

const list = $("#notif-page-list");
const empty = $("#notif-page-empty");

function renderNotifications(notifications) {
  if (notifications.length === 0) {
    list.innerHTML = "";
    empty.classList.remove("hidden");
    return;
  }
  empty.classList.add("hidden");
  list.innerHTML = notifications.map((n) => notificationItemHTML(n, { basePath: "" })).join("");
}

async function init() {
  initTheme();
  initMobileNav();
  registerServiceWorker();
  initInstallPrompt();

  const user = await requireAuth(); // redirects to login.html if signed out
  initAuthHeader(user, { basePath: "" });

  listenNotifications(user.uid, (notifications) => {
    renderNotifications(notifications);
    markAllRead(notifications).catch((error) => console.error("Failed to mark notifications read:", error));
  });
}

init().catch((error) => console.error("Failed to load notifications:", error));
