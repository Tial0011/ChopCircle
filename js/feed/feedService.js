// ChopCircle — Feed data service (Phase 6)
// Every function here reads/writes the `posts`, `comments`, and (post-scoped)
// `likes` collections exactly per firebase/firestore-schema.md. Page
// controllers (feed-page.js, postCard.js) call into this — they never talk
// to Firestore directly, same boundary rule as js/recipes/recipeService.js.
import { db } from "../firebase/firebase-init.js";
import {
  collection,
  doc,
  addDoc,
  getDoc,
  getDocs,
  deleteDoc,
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

const POSTS = "posts";
const COMMENTS = "comments";
const LIKES = "likes";
const USERS = "users";
export const PAGE_SIZE = 10;

/**
 * Fetches one page of posts, newest first, matching the composite index
 * documented in firestore-schema.md (`createdAt DESC`, no filter needed
 * for the main feed today — per-author filtering can reuse the
 * `authorId ASC, createdAt DESC` index later for a profile's post grid).
 */
export async function listPosts({ cursor = null } = {}) {
  const clauses = [orderBy("createdAt", "desc")];
  if (cursor) clauses.push(startAfter(cursor));
  clauses.push(limit(PAGE_SIZE));

  const snap = await getDocs(query(collection(db, POSTS), ...clauses));
  return {
    posts: snap.docs.map((d) => ({ id: d.id, ...d.data() })),
    lastDoc: snap.docs[snap.docs.length - 1] || null,
  };
}

/**
 * Creates a post owned by `uid`. Author name/photo are denormalized onto
 * the post at write time (one extra read here, not one per feed card) —
 * the same trade-off HANDOFF.md flagged for recipes, applied up front
 * since a feed without visible authors defeats the point of a feed.
 */
export async function createPost(uid, { caption, imageURLs = [] }) {
  const userSnap = await getDoc(doc(db, USERS, uid));
  const user = userSnap.exists() ? userSnap.data() : {};

  const ref = await addDoc(collection(db, POSTS), {
    authorId: uid,
    authorName: user.displayName || "ChopCircle cook",
    authorPhotoURL: user.photoURL || null,
    caption,
    imageURLs,
    mentions: [],
    hashtags: (caption.match(/#\w+/g) || []).map((h) => h.toLowerCase()),
    likeCount: 0,
    commentCount: 0,
    shareCount: 0,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function deletePost(postId) {
  await deleteDoc(doc(db, POSTS, postId));
}

function likeDocId(uid, parentType, parentId) {
  return `${uid}_${parentType}_${parentId}`;
}

/** @returns {Promise<boolean>} whether `uid` currently likes this post/comment. */
export async function hasUserLiked(parentType, parentId, uid) {
  if (!uid) return false;
  const snap = await getDoc(doc(db, LIKES, likeDocId(uid, parentType, parentId)));
  return snap.exists();
}

/**
 * Likes or unlikes a post on behalf of `uid`, keeping `likeCount` in sync
 * via a transaction — the exact pattern proven in recipeService.js's
 * toggleLikeRecipe(), reused here per the Phase 5 handoff note.
 * On a new like (not an unlike), also raises a "like" notification for the
 * post's author (Phase 10) — done AFTER the transaction commits, using the
 * authorId the transaction itself just read, so a failed/retried
 * transaction can never raise a notification for a like that didn't stick.
 * @returns {Promise<boolean>} the resulting liked state
 */
export async function toggleLikePost(postId, uid) {
  const likeRef = doc(db, LIKES, likeDocId(uid, "post", postId));
  const postRef = doc(db, POSTS, postId);
  let authorId = null;

  const liked = await runTransaction(db, async (tx) => {
    const [likeSnap, postSnap] = await Promise.all([tx.get(likeRef), tx.get(postRef)]);
    authorId = postSnap.data()?.authorId || null;
    if (likeSnap.exists()) {
      tx.delete(likeRef);
      tx.update(postRef, { likeCount: increment(-1) });
      return false;
    }
    tx.set(likeRef, { uid, parentType: "post", parentId: postId, createdAt: serverTimestamp() });
    tx.update(postRef, { likeCount: increment(1) });
    return true;
  });

  if (liked && authorId) {
    const actorSnap = await getDoc(doc(db, USERS, uid));
    const actor = actorSnap.exists() ? actorSnap.data() : {};
    await createNotification({
      recipientId: authorId,
      actorId: uid,
      actorName: actor.displayName,
      actorPhotoURL: actor.photoURL,
      type: "like",
      targetType: "post",
      targetId: postId,
    });
  }
  return liked;
}

/**
 * Lists comments for a recipe or a post, oldest first, matching the
 * `parentType ASC, parentId ASC, createdAt ASC` composite index.
 */
export async function listComments(parentType, parentId) {
  const snap = await getDocs(
    query(
      collection(db, COMMENTS),
      where("parentType", "==", parentType),
      where("parentId", "==", parentId),
      orderBy("createdAt", "asc")
    )
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/**
 * Adds a comment and increments the parent's denormalized `commentCount`.
 * Also raises a notification (Phase 10) for either the comment's parent
 * post author ("comment") or the comment being replied to's author
 * ("reply") — never both, matching the `type` enum in
 * firestore-schema.md, which models a reply as notifying the comment
 * author, not the post author a second time.
 */
export async function addComment(parentType, parentId, uid, text, replyToCommentId = null) {
  const userSnap = await getDoc(doc(db, USERS, uid));
  const user = userSnap.exists() ? userSnap.data() : {};
  const parentCollection = parentType === "post" ? POSTS : "recipes";

  const ref = await addDoc(collection(db, COMMENTS), {
    parentType,
    parentId,
    authorId: uid,
    authorName: user.displayName || "ChopCircle cook",
    authorPhotoURL: user.photoURL || null,
    text,
    replyToCommentId,
    createdAt: serverTimestamp(),
  });
  await updateDoc(doc(db, parentCollection, parentId), { commentCount: increment(1) });

  const actorFields = { actorId: uid, actorName: user.displayName, actorPhotoURL: user.photoURL };
  if (replyToCommentId) {
    const replyToSnap = await getDoc(doc(db, COMMENTS, replyToCommentId));
    if (replyToSnap.exists()) {
      await createNotification({
        recipientId: replyToSnap.data().authorId,
        ...actorFields,
        type: "reply",
        targetType: "comment",
        targetId: replyToCommentId,
        targetPreview: text.slice(0, 80),
      });
    }
  } else {
    const parentSnap = await getDoc(doc(db, parentCollection, parentId));
    if (parentSnap.exists()) {
      await createNotification({
        recipientId: parentSnap.data().authorId,
        ...actorFields,
        type: "comment",
        targetType: parentType,
        targetId: parentId,
        targetPreview: text.slice(0, 80),
      });
    }
  }
  return ref.id;
}

export async function deleteComment(commentId, parentType, parentId) {
  const parentCollection = parentType === "post" ? POSTS : "recipes";
  await deleteDoc(doc(db, COMMENTS, commentId));
  await updateDoc(doc(db, parentCollection, parentId), { commentCount: increment(-1) });
}
