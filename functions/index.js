/**
 * ChopCircle — Cloud Functions (Phase 11+ scaffold)
 * ==================================================
 * NOT YET DEPLOYED. This folder exists so the Phase 11+ move from
 * "counters updated via client-side transactions" to "counters updated by
 * a trusted backend" (documented as the plan in firebase/firestore-schema.md
 * and firebase/firestore.rules) has somewhere to live — every function
 * below is written and ready to review, but exporting it turns it on, and
 * turning it on WHILE the client-side equivalent in js/*Service.js files
 * is still running will double-count (a like would increment likeCount
 * twice: once from the client transaction, once from this trigger).
 *
 * Do not `firebase deploy --only functions` until:
 *   1. You've decided which counters/notifications move server-side (can
 *      be gradual — e.g. just likes first), and
 *   2. You've removed the matching client-side increment/createNotification
 *      call from the corresponding js/*Service.js file so the two don't
 *      both fire.
 * See functions/README.md for the fuller checklist.
 */

const { onDocumentCreated, onDocumentDeleted } = require("firebase-functions/v2/firestore");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();
const FieldValue = admin.firestore.FieldValue;

// ---------------------------------------------------------------------------
// Counter maintenance (mirrors the client-side transactions in
// js/feed/feedService.js, js/recipes/recipeService.js, and
// js/profile/profileService.js — see those files' toggleLike*()/
// toggleFollow() for the logic being moved here). Commented out (not
// exported) until step 2 above is done for each one.
// ---------------------------------------------------------------------------

/**
 * Increments recipes/{recipeId}.likeCount when a `likes` doc with
 * parentType "recipe" is created. Mirror function for posts/comments would
 * follow the same shape — kept as one example rather than three near-
 * identical exports until this is actually being turned on.
 */
// exports.onRecipeLikeCreated = onDocumentCreated("likes/{likeId}", async (event) => {
//   const like = event.data?.data();
//   if (!like || like.parentType !== "recipe") return;
//   await db.doc(`recipes/${like.parentId}`).update({ likeCount: FieldValue.increment(1) });
// });

// exports.onRecipeLikeDeleted = onDocumentDeleted("likes/{likeId}", async (event) => {
//   const like = event.data?.data();
//   if (!like || like.parentType !== "recipe") return;
//   await db.doc(`recipes/${like.parentId}`).update({ likeCount: FieldValue.increment(-1) });
// });

// ---------------------------------------------------------------------------
// Server-side notification creation (mirrors js/notifications/
// notificationService.js's createNotification(), currently called
// client-side from feedService.js/recipeService.js/profileService.js after
// a like/follow/comment write succeeds). Moving this server-side means a
// client can no longer spoof `actorId`/`actorName` on someone else's
// behalf — the main reason to eventually make this move.
// ---------------------------------------------------------------------------

// exports.onFollowCreated = onDocumentCreated("follows/{followId}", async (event) => {
//   const follow = event.data?.data();
//   if (!follow || follow.followerId === follow.followingId) return;
//   const actor = await db.doc(`users/${follow.followerId}`).get();
//   await db.collection("notifications").add({
//     recipientId: follow.followingId,
//     actorId: follow.followerId,
//     actorName: actor.data()?.displayName || "ChopCircle cook",
//     actorPhotoURL: actor.data()?.photoURL || null,
//     type: "follow",
//     targetType: "user",
//     targetId: follow.followerId,
//     targetPreview: "",
//     isRead: false,
//     createdAt: FieldValue.serverTimestamp(),
//   });
// });

// ---------------------------------------------------------------------------
// Account deletion (referenced but not implemented in
// firebase/firestore.rules: "allow delete: if false; // account deletion
// goes through a Cloud Function (future)"). A callable, not a trigger,
// since it needs to also delete the Firebase Auth user — something no
// Firestore trigger can do on its own.
// ---------------------------------------------------------------------------

// Deliberately left commented out, unlike the counter/notification
// examples above, this one isn't blocked on double-firing with client
// code — it's blocked on being INCOMPLETE: it deletes the users/{uid} doc
// and the Auth account but does NOT cascade-delete the caller's recipes/
// posts/comments/likes/follows/chats (Firestore has no cascading deletes;
// that needs a batched cleanup written first). Uncomment only after that
// cleanup is added — shipping this as-is would silently orphan data.
// exports.deleteAccount = onCall(async (request) => {
//   const uid = request.auth?.uid;
//   if (!uid) throw new HttpsError("unauthenticated", "Sign in required.");
//   logger.warn(`deleteAccount called for ${uid} — cascade cleanup not implemented yet`);
//   await db.doc(`users/${uid}`).delete();
//   await admin.auth().deleteUser(uid);
//   return { deleted: true };
// });
