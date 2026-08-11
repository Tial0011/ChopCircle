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
  onSnapshot,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { createNotification } from "../notifications/notificationService.js";

const POSTS = "posts";
const COMMENTS = "comments";
const LIKES = "likes";
const REPOSTS = "reposts";
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
 * Live-subscribes to just the single newest post in the feed. feed-page.js
 * uses this to show a "New posts" banner when someone else's post lands
 * while the page is open, without re-subscribing to (and re-rendering) the
 * whole paginated feed list on every write. Fires once immediately with
 * whatever's currently newest, then again each time a new post outranks it.
 * @returns {() => void} unsubscribe
 */
export function listenNewestPost(callback) {
  const q = query(collection(db, POSTS), orderBy("createdAt", "desc"), limit(1));
  return onSnapshot(q, (snap) => {
    if (!snap.empty) callback({ id: snap.docs[0].id, ...snap.docs[0].data() });
  });
}

/**
 * Live-subscribes to one post's own doc — its denormalized `likeCount`/
 * `commentCount`/`shareCount` — so a post card reflects OTHER users'
 * likes/comments without a page refresh. NOTE: toggleLikePost()'s write
 * goes through runTransaction(), which (unlike a plain updateDoc()) does
 * NOT get Firestore's local-cache optimistic echo — a listener here only
 * fires once the server confirms. That's fine for seeing other people's
 * likes land, but postCard.js gates rendering THIS callback's likeCount
 * while its own toggle is in flight, to avoid a stale value from this
 * listener visibly overwriting the immediate optimistic update on your
 * own tap and then "correcting" a moment later.
 * @returns {() => void} unsubscribe
 */
export function listenPost(postId, callback) {
  return onSnapshot(doc(db, POSTS, postId), (snap) => {
    if (snap.exists()) callback({ id: snap.id, ...snap.data() });
  });
}

/**
 * Live-subscribes to whether `uid` currently likes this post — keeps the
 * heart icon in sync if the same account likes/unlikes this post from
 * another tab or device. Same "gate while your own toggle is pending"
 * caveat as listenPost() above, for the same reason.
 * @returns {() => void} unsubscribe
 */
export function listenUserLikedPost(postId, uid, callback) {
  return onSnapshot(doc(db, LIKES, likeDocId(uid, "post", postId)), (snap) => callback(snap.exists()));
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

function repostDocId(uid, postId) {
  return `${uid}_post_${postId}`;
}

/** @returns {Promise<boolean>} whether `uid` has already reposted this post. */
export async function hasUserReposted(postId, uid) {
  if (!uid) return false;
  const snap = await getDoc(doc(db, REPOSTS, repostDocId(uid, postId)));
  return snap.exists();
}

/**
 * Live-subscribes to whether `uid` currently has this post reposted — same
 * "gate while your own toggle is pending" shape as listenUserLikedPost().
 * @returns {() => void} unsubscribe
 */
export function listenUserRepostedPost(postId, uid, callback) {
  return onSnapshot(doc(db, REPOSTS, repostDocId(uid, postId)), (snap) => callback(snap.exists()));
}

/**
 * Reposts (or un-reposts) `postId` to `uid`'s own feed. A `reposts` doc
 * (deterministic id `${uid}_post_${postId}`, same trick as `likes`) tracks
 * the toggle state and points at the actual repost — a real doc in `posts`
 * (authorId: uid) carrying `sharedPostId`/`sharedPost` (a denormalized
 * snapshot of the original at repost time, same read-speed trade-off as
 * authorName/authorPhotoURL elsewhere in this schema) — so it shows up in
 * the reposter's own feed and profile grid like anything else they've
 * posted. postCard.js renders a post with `sharedPostId` set as a "🔁
 * reposted" card instead of the normal caption/media.
 * Un-reposting deletes that repost post doc again (found via the
 * `reposts` doc's `repostPostId`) — if the original post itself was
 * deleted in between, the transaction still cleans up the repost and its
 * tracking doc, it just can't decrement a shareCount that's already gone.
 * Raises a "share" notification (already in firestore-schema.md's `type`
 * enum) for the original author on a new repost only — never on removing
 * one, and never when reposting your own post.
 * @returns {Promise<boolean>} the resulting "reposted" state
 */
export async function toggleRepostPost(postId, uid) {
  const repostRef = doc(db, REPOSTS, repostDocId(uid, postId));
  const originalRef = doc(db, POSTS, postId);
  const newPostRef = doc(collection(db, POSTS)); // pre-generated id; only written to if we're creating
  const userSnap = await getDoc(doc(db, USERS, uid));
  const user = userSnap.exists() ? userSnap.data() : {};
  let originalAuthorId = null;

  const reposted = await runTransaction(db, async (tx) => {
    const [repostSnap, originalSnap] = await Promise.all([tx.get(repostRef), tx.get(originalRef)]);

    if (repostSnap.exists()) {
      const existingPostId = repostSnap.data().repostPostId;
      tx.delete(repostRef);
      if (existingPostId) tx.delete(doc(db, POSTS, existingPostId));
      if (originalSnap.exists()) tx.update(originalRef, { shareCount: increment(-1) });
      return false;
    }

    if (!originalSnap.exists()) throw new Error("This post no longer exists.");
    const original = originalSnap.data();
    originalAuthorId = original.authorId;

    tx.set(newPostRef, {
      authorId: uid,
      authorName: user.displayName || "ChopCircle cook",
      authorPhotoURL: user.photoURL || null,
      caption: "",
      imageURLs: [],
      mentions: [],
      hashtags: [],
      likeCount: 0,
      commentCount: 0,
      shareCount: 0,
      createdAt: serverTimestamp(),
      sharedPostId: postId,
      sharedPost: {
        authorId: original.authorId,
        authorName: original.authorName || "ChopCircle cook",
        authorPhotoURL: original.authorPhotoURL || null,
        caption: original.caption || "",
        imageURLs: original.imageURLs || [],
        createdAt: original.createdAt || null,
      },
    });
    tx.set(repostRef, { uid, postId, repostPostId: newPostRef.id, createdAt: serverTimestamp() });
    tx.update(originalRef, { shareCount: increment(1) });
    return true;
  });

  if (reposted && originalAuthorId && originalAuthorId !== uid) {
    await createNotification({
      recipientId: originalAuthorId,
      actorId: uid,
      actorName: user.displayName,
      actorPhotoURL: user.photoURL,
      type: "share",
      targetType: "post",
      targetId: postId,
    });
  }
  return reposted;
}

/**
 * Lists comments for a recipe or a post, oldest first, matching the
 * `parentType ASC, parentId ASC, createdAt ASC` composite index. One-time
 * fetch — kept for any future non-live use case; postCard.js's comment
 * panel uses listenComments() below instead so new comments from other
 * users appear without reopening the panel.
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
 * Live-subscribes to a post/recipe's comments, oldest first. addComment()
 * writes via a plain addDoc()+updateDoc() (not a transaction), so unlike
 * the like listeners above, this one DOES get Firestore's local-cache
 * optimistic echo — your own new comment appears instantly, no gating
 * needed.
 * @returns {() => void} unsubscribe
 */
export function listenComments(parentType, parentId, callback) {
  const q = query(
    collection(db, COMMENTS),
    where("parentType", "==", parentType),
    where("parentId", "==", parentId),
    orderBy("createdAt", "asc")
  );
  return onSnapshot(q, (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
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
