// ChopCircle — Profile data service (Phase 7)
// The ONLY file that talks to `users` (beyond auth signup's initial doc
// creation in js/auth/signup.js) or writes `follows` docs. Matches
// firebase/firestore-schema.md exactly. Page controllers should call into
// this — never talk to Firestore directly for profile/follow data.
import { db } from "../firebase/firebase-init.js";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  updateDoc,
  runTransaction,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  serverTimestamp,
  increment,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { createNotification } from "../notifications/notificationService.js";

const USERS = "users";
const FOLLOWS = "follows";
const RECIPES = "recipes";
const POSTS = "posts";
export const PAGE_SIZE = 12;

/** @returns {Promise<object|null>} the user's profile (with `id`), or null if it doesn't exist. */
export async function getProfile(uid) {
  const snap = await getDoc(doc(db, USERS, uid));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

/**
 * Updates the editable fields of `uid`'s own profile. Firestore rules
 * already enforce that only the profile owner can do this — this function
 * assumes that check has passed. displayName/photoURL are NOT synced back
 * to Firebase Auth here — call updateProfile() from firebase-auth
 * separately if that's ever needed (out of scope for Phase 7 start).
 */
export async function updateUserProfile(uid, { displayName, bio, photoURL, coverURL }) {
  await updateDoc(doc(db, USERS, uid), {
    displayName,
    bio,
    photoURL: photoURL || null,
    coverURL: coverURL || null,
  });
}

function followDocId(followerId, followingId) {
  return `${followerId}_${followingId}`;
}

/** @returns {Promise<boolean>} whether `followerId` currently follows `followingId`. */
export async function isFollowing(followerId, followingId) {
  if (!followerId) return false;
  const snap = await getDoc(doc(db, FOLLOWS, followDocId(followerId, followingId)));
  return snap.exists();
}

/**
 * Follows or unfollows `followingId` on behalf of `followerId`, keeping
 * both users' denormalized followerCount/followingCount in sync via a
 * transaction (same client-side-counter pattern as recipe/post likes —
 * see recipeService.js / feedService.js). On a new follow (not an
 * unfollow), also raises a "follow" notification (Phase 10) for
 * `followingId` — nobody gets notified about being unfollowed.
 * @returns {Promise<boolean>} the resulting "is following" state
 */
export async function toggleFollow(followerId, followingId) {
  if (followerId === followingId) throw new Error("Can't follow yourself.");
  const followRef = doc(db, FOLLOWS, followDocId(followerId, followingId));
  const followerRef = doc(db, USERS, followerId);
  const followingRef = doc(db, USERS, followingId);
  let follower = {};

  const nowFollowing = await runTransaction(db, async (tx) => {
    const [followSnap, followerSnap] = await Promise.all([tx.get(followRef), tx.get(followerRef)]);
    follower = followerSnap.data() || {};
    if (followSnap.exists()) {
      tx.delete(followRef);
      tx.update(followerRef, { followingCount: increment(-1) });
      tx.update(followingRef, { followerCount: increment(-1) });
      return false;
    }
    tx.set(followRef, { followerId, followingId, createdAt: serverTimestamp() });
    tx.update(followerRef, { followingCount: increment(1) });
    tx.update(followingRef, { followerCount: increment(1) });
    return true;
  });

  if (nowFollowing) {
    await createNotification({
      recipientId: followingId,
      actorId: followerId,
      actorName: follower.displayName,
      actorPhotoURL: follower.photoURL,
      type: "follow",
      targetType: "user", // the actor themselves; see firestore-schema.md's Phase 10 note
      targetId: followerId,
    });
  }
  return nowFollowing;
}

/**
 * One page of a user's recipes, newest first. Matches the
 * `category ASC, createdAt DESC` composite already in place — this query
 * only filters on authorId + orderBy createdAt, which uses Firestore's
 * automatic composite (no new index needed) same as feedService.js's
 * author-free queries. NOTE: needs `recipes: authorId ASC, createdAt DESC`
 * added to the composite index list before shipping (see HANDOFF.md).
 */
export async function listUserRecipes(uid, { cursor = null } = {}) {
  const clauses = [where("authorId", "==", uid), orderBy("createdAt", "desc")];
  if (cursor) clauses.push(startAfter(cursor));
  clauses.push(limit(PAGE_SIZE));

  const snap = await getDocs(query(collection(db, RECIPES), ...clauses));
  return {
    recipes: snap.docs.map((d) => ({ id: d.id, ...d.data() })),
    lastDoc: snap.docs[snap.docs.length - 1] || null,
  };
}

/**
 * One page of a user's posts, newest first. Matches the `posts: authorId
 * ASC, createdAt DESC` composite already documented in
 * firebase/firestore-schema.md.
 */
export async function listUserPosts(uid, { cursor = null } = {}) {
  const clauses = [where("authorId", "==", uid), orderBy("createdAt", "desc")];
  if (cursor) clauses.push(startAfter(cursor));
  clauses.push(limit(PAGE_SIZE));

  const snap = await getDocs(query(collection(db, POSTS), ...clauses));
  return {
    posts: snap.docs.map((d) => ({ id: d.id, ...d.data() })),
    lastDoc: snap.docs[snap.docs.length - 1] || null,
  };
}
