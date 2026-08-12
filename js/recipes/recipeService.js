// ChopCircle — Recipe data service
// Every function here reads/writes the `recipes` (and `likes`) collections
// exactly per firebase/firestore-schema.md. Page controllers (recipes-page.js,
// recipe-details-page.js, recipe-form-page.js) call into this — they never
// talk to Firestore directly.
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

const RECIPES = "recipes";
const USERS = "users";
const LIKES = "likes";
export const PAGE_SIZE = 12;

/** Categories seeded per PLANNING.md / the home page chip row. Keeping this
 * list here (rather than a live `categories` read) until Phase 6 seeds the
 * `categories` collection for real — swap for a Firestore read then. */
export const CATEGORIES = [
  { slug: "local-dishes", name: "Local Dishes" },
  { slug: "rice", name: "Rice" },
  { slug: "soups", name: "Soups" },
  { slug: "swallow", name: "Swallow" },
  { slug: "breakfast", name: "Breakfast" },
  { slug: "small-chops", name: "Small Chops" },
  { slug: "drinks", name: "Drinks" },
  { slug: "healthy-meals", name: "Healthy Meals" },
  { slug: "continental", name: "Continental" },
];

/**
 * Fetches one page of recipes, newest or most-liked first, optionally
 * filtered by category. Matches the composite indexes documented in
 * firestore-schema.md (`category ASC, createdAt DESC` / `likeCount DESC`).
 * @param {{category?: string, sortBy?: "newest"|"trending", cursor?: import("firebase/firestore").QueryDocumentSnapshot}} opts
 * @returns {Promise<{recipes: Array<object>, lastDoc: import("firebase/firestore").QueryDocumentSnapshot|null}>}
 */
export async function listRecipes({ category = null, sortBy = "newest", cursor = null } = {}) {
  const clauses = [];
  if (category) clauses.push(where("category", "==", category));
  clauses.push(orderBy(sortBy === "trending" ? "likeCount" : "createdAt", "desc"));
  if (cursor) clauses.push(startAfter(cursor));
  clauses.push(limit(PAGE_SIZE));

  const snap = await getDocs(query(collection(db, RECIPES), ...clauses));
  return {
    recipes: snap.docs.map((d) => ({ id: d.id, ...d.data() })),
    lastDoc: snap.docs[snap.docs.length - 1] || null,
  };
}

/** @returns {Promise<object|null>} the recipe (with `id`), or null if it doesn't exist. */
export async function getRecipe(recipeId) {
  const snap = await getDoc(doc(db, RECIPES, recipeId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

/**
 * Creates a recipe owned by `uid`. `data` should already match the schema's
 * ingredients/steps shape — form controllers are responsible for that.
 * Also bumps `users/{uid}.recipeCount` (profile-page.js's recipe count was
 * reading this field, but nothing ever wrote to it — every profile showed
 * 0 recipes regardless of how many the user actually had).
 * @returns {Promise<string>} the new recipe's id
 */
export async function createRecipe(uid, data) {
  const ref = await addDoc(collection(db, RECIPES), {
    authorId: uid,
    title: data.title,
    description: data.description,
    coverImageURL: data.coverImageURL,
    galleryURLs: data.galleryURLs || [],
    ingredients: data.ingredients,
    steps: data.steps,
    cookTimeMinutes: data.cookTimeMinutes,
    difficulty: data.difficulty,
    servings: data.servings,
    nutrition: data.nutrition || null,
    category: data.category,
    likeCount: 0,
    commentCount: 0,
    saveCount: 0,
    isSponsored: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  await updateDoc(doc(db, USERS, uid), { recipeCount: increment(1) });
  return ref.id;
}

/** Updates an existing recipe. Firestore rules already enforce that only
 * the author can do this — this function assumes that check has passed. */
export async function updateRecipe(recipeId, data) {
  await updateDoc(doc(db, RECIPES, recipeId), {
    title: data.title,
    description: data.description,
    coverImageURL: data.coverImageURL,
    galleryURLs: data.galleryURLs || [],
    ingredients: data.ingredients,
    steps: data.steps,
    cookTimeMinutes: data.cookTimeMinutes,
    difficulty: data.difficulty,
    servings: data.servings,
    nutrition: data.nutrition || null,
    category: data.category,
    updatedAt: serverTimestamp(),
  });
}

/** Deletes a recipe and gives back the one recipeCount slot it was taking
 * up on its author's profile — the corresponding decrement to
 * createRecipe()'s increment above. Reads the recipe first only to get
 * authorId; Firestore rules already enforce that only the author can
 * delete it, this function assumes that check has passed. */
export async function deleteRecipe(recipeId) {
  const snap = await getDoc(doc(db, RECIPES, recipeId));
  const authorId = snap.exists() ? snap.data().authorId : null;
  await deleteDoc(doc(db, RECIPES, recipeId));
  if (authorId) {
    await updateDoc(doc(db, USERS, authorId), { recipeCount: increment(-1) });
  }
}

function likeDocId(uid, recipeId) {
  return `${uid}_recipe_${recipeId}`;
}

/** @returns {Promise<boolean>} whether `uid` currently likes `recipeId`. */
export async function hasUserLikedRecipe(recipeId, uid) {
  if (!uid) return false;
  const snap = await getDoc(doc(db, LIKES, likeDocId(uid, recipeId)));
  return snap.exists();
}

/**
 * Live-subscribes to one recipe's own doc — so its like/save/comment counts
 * (and any edits) update on this page without a refresh if another tab, or
 * another viewer, changes them. Same pattern as feedService.js's
 * listenPost(), applied to recipes for parity.
 * @returns {() => void} unsubscribe
 */
export function listenRecipe(recipeId, callback) {
  return onSnapshot(doc(db, RECIPES, recipeId), (snap) => {
    if (snap.exists()) callback({ id: snap.id, ...snap.data() });
  });
}

/**
 * Live-subscribes to whether `uid` currently likes this recipe — keeps the
 * heart icon in sync across tabs/devices for the same account. Like
 * feedService.js's listenUserLikedPost(), toggleLikeRecipe() writes via a
 * transaction, so this listener only reflects a like/unlike once the
 * server confirms it — recipe-details-page.js gates rendering on this
 * while its own optimistic click is in flight, same as the feed does.
 * @returns {() => void} unsubscribe
 */
export function listenUserLikedRecipe(recipeId, uid, callback) {
  return onSnapshot(doc(db, LIKES, likeDocId(uid, recipeId)), (snap) => callback(snap.exists()));
}

/**
 * Likes or unlikes a recipe on behalf of `uid`, keeping the recipe's
 * denormalized `likeCount` in sync via a transaction (per the "Known
 * Issues" note in HANDOFF.md — client-side counters until Cloud Functions).
 * On a new like, also raises a "like" notification (Phase 10) for the
 * recipe's author — see feedService.js's toggleLikePost() for why this
 * happens after the transaction commits rather than inside it.
 * @returns {Promise<boolean>} the resulting liked state
 */
export async function toggleLikeRecipe(recipeId, uid) {
  const likeRef = doc(db, LIKES, likeDocId(uid, recipeId));
  const recipeRef = doc(db, RECIPES, recipeId);
  let authorId = null;
  let title = "";

  const liked = await runTransaction(db, async (tx) => {
    const [likeSnap, recipeSnap] = await Promise.all([tx.get(likeRef), tx.get(recipeRef)]);
    authorId = recipeSnap.data()?.authorId || null;
    title = recipeSnap.data()?.title || "";
    if (likeSnap.exists()) {
      tx.delete(likeRef);
      tx.update(recipeRef, { likeCount: increment(-1) });
      return false;
    }
    tx.set(likeRef, {
      uid,
      parentType: "recipe",
      parentId: recipeId,
      createdAt: serverTimestamp(),
    });
    tx.update(recipeRef, { likeCount: increment(1) });
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
      targetType: "recipe",
      targetId: recipeId,
      targetPreview: title,
    });
  }
  return liked;
}

export function categoryName(slug) {
  return CATEGORIES.find((c) => c.slug === slug)?.name || slug;
}
