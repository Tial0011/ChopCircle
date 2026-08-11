// ChopCircle — Shared notification row renderer (Phase 10)
// Used by js/utils/header.js (bell dropdown preview) and
// js/notifications/notifications-page.js (full list) — kept as one
// component file, same split-out-of-the-page-controller shape as
// postCard.js/recipeCard.js, so the two surfaces can never drift apart on
// what a notification row looks like.
import { stripHtml } from "../utils/validation.js";
import { relativeTime } from "../utils/format.js";
import { notificationText, notificationHref } from "./notificationService.js";
import { avatarSrc } from "../utils/avatar.js";

/**
 * @param {object} n a notification doc (with `id`)
 * @param {{basePath?: string}} [opts] basePath is prefixed onto the link
 *   href, same root-vs-pages/ convention as recipeCardHTML().
 */
export function notificationItemHTML(n, { basePath = "" } = {}) {
  const avatar = avatarSrc(n.actorPhotoURL);
  return `
    <li class="notif-item ${n.isRead ? "" : "notif-item--unread"}" data-notification-id="${n.id}">
      <a href="${notificationHref(n, { basePath })}" class="notif-item__link">
        <img src="${avatar}" alt="" />
        <div class="notif-item__body">
          <p><strong>${stripHtml(n.actorName)}</strong> ${notificationText(n)}</p>
          <span class="text-xs text-muted">${relativeTime(n.createdAt)}</span>
        </div>
        ${n.isRead ? "" : '<span class="notif-item__dot" aria-hidden="true"></span>'}
      </a>
    </li>`;
}
