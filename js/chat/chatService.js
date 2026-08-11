// ChopCircle — Chat data service (Phase 8)
// The ONLY file that talks to `chats` and `chats/{chatId}/messages`, per
// firebase/firestore-schema.md. Page controllers call into this — never talk
// to Firestore directly, same boundary rule as recipeService.js/feedService.js.
//
// Unlike every earlier service in this codebase (all one-time getDocs()
// reads), chat needs live updates — a conversation is pointless if the
// other person's reply only shows up on manual refresh. listenUserChats()
// and listenMessages() are this app's first onSnapshot() listeners; callers
// own the returned unsubscribe function and MUST call it on teardown
// (chat-page.js does this when switching threads / leaving the page).
import { db } from "../firebase/firebase-init.js";
import {
  collection,
  doc,
  getDoc,
  setDoc,
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

const USERS = "users";
const CHATS = "chats";
const MESSAGES = "messages";
const MESSAGE_PAGE_SIZE = 50;

function chatDocId(uidA, uidB) {
  return [uidA, uidB].sort().join("_");
}

/** @returns the uid of the other person in a 1:1 chat. */
export function otherParticipant(chat, uid) {
  return chat.participantIds.find((id) => id !== uid);
}

/**
 * Gets the deterministic `${uidA}_${uidB}` (sorted) chat doc for this pair,
 * creating it on first contact. `participants` denormalizes both users'
 * displayName/photoURL onto the chat doc (one read per user, only on
 * creation) so the conversation list can render names/avatars without an
 * extra profile fetch per row — the same read-speed trade-off documented
 * for posts/recipes, applied here since chats/{chatId} didn't originally
 * carry it.
 */
export async function getOrCreateChat(uidA, uidB) {
  const chatId = chatDocId(uidA, uidB);
  const ref = doc(db, CHATS, chatId);
  const existing = await getDoc(ref);
  if (existing.exists()) return { id: existing.id, ...existing.data() };

  const [snapA, snapB] = await Promise.all([getDoc(doc(db, USERS, uidA)), getDoc(doc(db, USERS, uidB))]);
  const toParticipant = (snap) => ({
    displayName: snap.exists() ? snap.data().displayName || "ChopCircle cook" : "ChopCircle cook",
    photoURL: snap.exists() ? snap.data().photoURL || null : null,
  });

  const data = {
    participantIds: [uidA, uidB].sort(),
    participants: { [uidA]: toParticipant(snapA), [uidB]: toParticipant(snapB) },
    lastMessage: "",
    lastMessageAt: serverTimestamp(),
    lastSenderId: null,
    lastMessageStatus: null, // "sent" | "seen" — see sendMessage()/markThreadSeen() (Phase 10)
  };
  await setDoc(ref, data);
  return { id: chatId, ...data };
}

/**
 * Live list of `uid`'s conversations, most recent activity first. Matches
 * the `chats: participantIds ARRAY-CONTAINS, lastMessageAt DESC` composite
 * index documented in firestore-schema.md.
 * @returns {() => void} unsubscribe function
 */
export function listenUserChats(uid, callback) {
  const q = query(collection(db, CHATS), where("participantIds", "array-contains", uid), orderBy("lastMessageAt", "desc"));
  return onSnapshot(q, (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
}

/**
 * Live message list for one chat, oldest first, most recent
 * MESSAGE_PAGE_SIZE messages. No composite index needed — this is a
 * single-field orderBy scoped to a subcollection.
 * @returns {() => void} unsubscribe function
 */
export function listenMessages(chatId, callback) {
  const q = query(collection(db, CHATS, chatId, MESSAGES), orderBy("createdAt", "asc"), limit(MESSAGE_PAGE_SIZE));
  return onSnapshot(q, (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
}

/** Sends a message and updates the chat doc's denormalized "last message" preview. */
export async function sendMessage(chatId, senderId, text) {
  await addDoc(collection(db, CHATS, chatId, MESSAGES), {
    senderId,
    text,
    imageURL: null,
    status: "sent",
    createdAt: serverTimestamp(),
  });
  await updateDoc(doc(db, CHATS, chatId), {
    lastMessage: text,
    lastMessageAt: serverTimestamp(),
    lastSenderId: senderId,
    lastMessageStatus: "sent",
  });
}

/**
 * Marks any of the OTHER participant's messages in `messages` as seen, on
 * behalf of `uid`. Called whenever a thread is open and a new snapshot of
 * messages comes in — cheap no-op batch when there's nothing unseen.
 *
 * Also flips the chat doc's denormalized `lastMessageStatus` to "seen"
 * (Phase 10) so js/utils/header.js can show/hide the Messages nav badge
 * from listenUserChats() alone, without opening every thread just to
 * check for unread. Simplification: this always sets it to "seen" rather
 * than only when the newly-seen batch included the literal last message —
 * safe because this only runs while that thread is actually open, so by
 * definition everything in it, including the latest message, is being
 * seen right now.
 */
export async function markThreadSeen(chatId, uid, messages) {
  const unseen = messages.filter((m) => m.senderId !== uid && m.status !== "seen");
  if (unseen.length === 0) return;
  const batch = writeBatch(db);
  unseen.forEach((m) => batch.update(doc(db, CHATS, chatId, MESSAGES, m.id), { status: "seen" }));
  batch.update(doc(db, CHATS, chatId), { lastMessageStatus: "seen" });
  await batch.commit();
}
