// ChopCircle — Notifications data service (Phase 10)
// The ONLY file that talks to the `notifications` collection, per
// firebase/firestore-schema.md. Every other service (feedService,
// recipeService, profileService) calls INTO this one to raise a
// notification after a like/follow/comment write succeeds — same
// cross-service-call shape profileActions.js already uses to reach
// profileService.js. notifications never call back into those services.
//
// Like chatService.js (Phase 8), this needs live updates — a bell badge
// that only refreshes on page load isn't a notification system. All of
// this file's read functions are onSnapshot() listeners; callers own the
// returned unsubscribe and MUST call it on teardown.
import { db } from "../firebase/firebase-init.js";
import {
  collection,
  doc,
  addDoc,
  updateDoc,
  onSnapshot,
  writeBatch,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

const NOTIFICATIONS = "notifications";

// How many recent notifications the bell dropdown / notifications.html
// listen to. One query, one composite index (`recipientId ASC, createdAt
// DESC`, already documented in firestore-schema.md) — unread count is
// derived client-side from this same page rather than a second query
// filtered on `isRead`, which would need a second composite index for a
// number that only ever needs to be "roughly right, refreshes live".
const LISTEN_LIMIT = 30;

/**
 * Records that `actorId` did `type` to `targetId` (a `targetType` doc),
 * and that `recipientId` should be told about it. No-ops for a self-
 * notification (liking your own recipe, etc.) — nobody wants to be told
 * about their own actions, and it'd otherwise make every author's bell
 * spam itself on their own posts.
 *
 * actorName/actorPhotoURL/targetPreview are denormalized onto the
 * notification doc at write time, same read-speed trade-off documented
 * for authorName on posts/recipes/comments in firestore-schema.md — a
 * notification list rendering 30 rows would otherwise mean 30 extra user
 * reads just to show who did the thing.
 */
export async function createNotification({ recipientId, actorId, actorName, actorPhotoURL, type, targetType, targetId, targetPreview = "" }) {
  if (!recipientId || !actorId || recipientId === actorId) return;
  await addDoc(collection(db, NOTIFICATIONS), {
    recipientId,
    actorId,
    actorName: actorName || "ChopCircle cook",
    actorPhotoURL: actorPhotoURL || null,
    type,
    targetType,
    targetId,
    targetPreview,
    isRead: false,
    createdAt: serverTimestamp(),
  });
}

/**
 * Live list of `uid`'s most recent notifications, newest first. Matches
 * the `notifications: recipientId ASC, createdAt DESC` composite index.
 * @returns {() => void} unsubscribe function
 */
export function listenNotifications(uid, callback) {
  const q = query(
    collection(db, NOTIFICATIONS),
    where("recipientId", "==", uid),
    orderBy("createdAt", "desc"),
    limit(LISTEN_LIMIT)
  );
  return onSnapshot(q, (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
}

/** Marks a single notification read (e.g. when its row is clicked/opened). */
export async function markRead(notificationId) {
  await updateDoc(doc(db, NOTIFICATIONS, notificationId), { isRead: true });
}

/**
 * Marks every currently-unread notification in `notifications` as read —
 * called when the bell dropdown opens / notifications.html loads. Same
 * "cheap no-op batch when nothing's unread" shape as chatService.js's
 * markThreadSeen().
 */
export async function markAllRead(notifications) {
  const unread = notifications.filter((n) => !n.isRead);
  if (unread.length === 0) return;
  const batch = writeBatch(db);
  unread.forEach((n) => batch.update(doc(db, NOTIFICATIONS, n.id), { isRead: true }));
  await batch.commit();
}

/** Short, human copy for one notification row. Kept here (not duplicated
 * per template) so the bell dropdown and notifications.html always agree. */
export function notificationText(n) {
  switch (n.type) {
    case "like":
      return `liked your ${n.targetType === "recipe" ? "recipe" : "post"}${n.targetPreview ? ` "${n.targetPreview}"` : ""}`;
    case "follow":
      return "started following you";
    case "comment":
      return `commented on your post${n.targetPreview ? `: "${n.targetPreview}"` : ""}`;
    case "reply":
      return `replied to your comment${n.targetPreview ? `: "${n.targetPreview}"` : ""}`;
    case "share":
      return "reposted your post";
    case "message":
      return `sent you a message${n.targetPreview ? `: "${n.targetPreview}"` : ""}`;
    default:
      return "interacted with you";
  }
}

/**
 * Where a notification row should link. Recipes have their own detail
 * page; posts and comments/replies don't (feed.html renders posts inline,
 * no post-details.html exists yet per HANDOFF.md's pending list), so those
 * land on the feed; a follow links to the actor's profile.
 * @param {{basePath?: string}} [opts] same root-vs-pages/ prefix pattern
 *   recipeCard.js's recipeCardHTML() uses.
 */
export function notificationHref(n, { basePath = "" } = {}) {
  if (n.type === "follow") return `${basePath}profile.html?id=${n.actorId}`;
  if (n.type === "message" || n.targetType === "chat") return `${basePath}chat.html?with=${n.actorId}`;
  if (n.targetType === "recipe") return `${basePath}recipe-details.html?id=${n.targetId}`;
  return `${basePath}feed.html`;
}
