// ChopCircle — Notifications page controller (Phase 10)
// Full-history equivalent of the header bell dropdown. Renders through the
// SAME notificationItemHTML() the bell dropdown uses (js/notifications/
// notificationItem.js) so the two surfaces can never drift on copy or
// links — see that file's header comment.
import { $ } from "../utils/dom.js";
import { initTheme } from "../utils/theme.js";
import { initMobileNav } from "../utils/mobileNav.js";
import { initAuthHeader, initHeaderSearch } from "../utils/header.js";
import { registerServiceWorker, initInstallPrompt } from "../utils/pwa.js";
import { requireAuth } from "../auth/authGuard.js"; // this page makes no sense logged out
import { listenNotifications, markAllRead } from "./notificationService.js";
import { notificationItemHTML } from "./notificationItem.js";
import { isPushSupported, pushPermissionState, enablePush, listenForegroundPush } from "./push.js";

const list = $("#notif-page-list");
const empty = $("#notif-page-empty");
const pushBanner = $("#push-banner");
const pushEnableBtn = $("#push-enable-btn");
const pushStatus = $("#push-status");

function renderNotifications(notifications) {
  if (notifications.length === 0) {
    list.innerHTML = "";
    empty.classList.remove("hidden");
    return;
  }
  empty.classList.add("hidden");
  list.innerHTML = notifications.map((n) => notificationItemHTML(n, { basePath: "" })).join("");
}

function showPushStatus(message) {
  if (!pushStatus) return;
  pushStatus.textContent = message;
  pushStatus.classList.toggle("hidden", !message);
}

/**
 * Shows the "Enable notifications" banner only when it's actually
 * actionable: push has to be supported AND permission has to still be
 * undecided ("default") — if the person already granted or denied it at
 * the browser level, prompting again would either be redundant or just
 * silently fail, so the banner stays hidden in both of those cases rather
 * than nagging.
 */
async function initPushBanner(uid) {
  if (!pushBanner || !(await isPushSupported()) || pushPermissionState() !== "default") return;
  pushBanner.classList.remove("hidden");

  pushEnableBtn.addEventListener("click", async () => {
    pushEnableBtn.disabled = true;
    pushEnableBtn.textContent = "Enabling…";
    try {
      await enablePush(uid);
      pushBanner.classList.add("hidden");
      showPushStatus("Push notifications are on for this browser.");
    } catch (error) {
      console.error("Failed to enable push notifications:", error);
      pushEnableBtn.disabled = false;
      pushEnableBtn.textContent = "Enable notifications";
      showPushStatus(error.message || "Couldn't enable push notifications — please try again.");
    }
  });
}

async function init() {
  initTheme();
  initMobileNav();
  registerServiceWorker();
  initInstallPrompt();

  const user = await requireAuth(); // redirects to login.html if signed out
  initAuthHeader(user, { basePath: "" });
  initHeaderSearch("");

  listenNotifications(user.uid, (notifications) => {
    renderNotifications(notifications);
    markAllRead(notifications).catch((error) => console.error("Failed to mark notifications read:", error));
  });

  initPushBanner(user.uid).catch((error) => console.error("Failed to check push support:", error));
  listenForegroundPush().catch((error) => console.error("Failed to listen for foreground push:", error));
}

init().catch((error) => console.error("Failed to load notifications:", error));
