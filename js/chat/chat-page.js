// ChopCircle — Chat page controller (Phase 8)
import { $, $$ } from "../utils/dom.js";
import { initTheme } from "../utils/theme.js";
import { initMobileNav } from "../utils/mobileNav.js";
import { initAuthHeader, initHeaderSearch } from "../utils/header.js";
import { registerServiceWorker, initInstallPrompt } from "../utils/pwa.js";
import { requireAuth } from "../auth/authGuard.js";
import { stripHtml } from "../utils/validation.js";
import { relativeTime } from "../utils/format.js";
import {
  getOrCreateChat,
  listenUserChats,
  listenMessages,
  loadOlderMessages,
  MESSAGE_PAGE_SIZE,
  sendMessage,
  markThreadSeen,
  otherParticipant,
} from "./chatService.js";
import { uploadChatImage, uploadChatAudio, createVoiceRecorder } from "./chatMedia.js";
import { avatarSrc } from "../utils/avatar.js";

const layout = $("#chat-layout");
const chatList = $("#chat-list");
const chatListEmpty = $("#chat-list-empty");
const threadEmpty = $("#chat-thread-empty");
const thread = $("#chat-thread");
const threadBack = $("#chat-thread-back");
const threadAvatar = $("#chat-thread-avatar");
const threadName = $("#chat-thread-name");
const threadProfileLink = $("#chat-thread-profile-link");
const messageList = $("#message-list");
const messageForm = $("#message-form");
const messageInput = $("#message-input");
const imageInput = $("#message-image-input");
const imageBtn = $("#message-image-btn");
const voiceBtn = $("#message-voice-btn");

let currentUser = null;
let openChatId = null;
let unsubscribeMessages = null;
let chatsById = new Map();
let voiceRecorder = null;
let isRecording = false;

// ---- Message list state ----
// listenMessages() only keeps the newest MESSAGE_PAGE_SIZE messages live;
// olderMessages holds everything paged in on top of that via scroll-up
// (see loadOlderBatch). Combined + re-sorted on every render so the two
// sources never fight over ordering.
let liveMessages = [];
let olderMessages = [];
let hasMoreOlder = true;
let loadingOlder = false;

// ---- Optimistic send ----
// A message you just sent shouldn't wait on Firestore's round trip (write +
// server-timestamp resolution + the onSnapshot re-fetch) to appear — that
// gap is exactly what was making people tap "send" twice, since nothing on
// screen changed the first time. Each send paints a local placeholder into
// pendingMessages immediately; allMessages() folds it in at the bottom and
// drops it again the instant the real doc — matched by the clientId we
// stamped it with in chatService.js's sendMessage() — shows up in
// liveMessages. Content never round-trips through Firestore before the
// user sees it; the write underneath is what catches up.
let pendingMessages = [];

function allMessages() {
  const confirmedClientIds = new Set(liveMessages.map((m) => m.clientId).filter(Boolean));
  const visiblePending = pendingMessages.filter((m) => !confirmedClientIds.has(m.clientId));
  return [...olderMessages, ...liveMessages, ...visiblePending];
}

function chatListItemHTML(chat, uid) {
  const peerId = otherParticipant(chat, uid);
  const peer = chat.participants?.[peerId] || { displayName: "ChopCircle cook", photoURL: null };
  const prefix = chat.lastSenderId === uid ? "You: " : "";
  return `
    <button class="chat-list__item" data-chat-id="${chat.id}" aria-current="false">
      <img src="${avatarSrc(peer.photoURL)}" alt="" />
      <div class="chat-list__info">
        <div class="chat-list__row">
          <span class="chat-list__name">${stripHtml(peer.displayName)}</span>
          <span class="chat-list__time">${chat.lastMessageAt ? relativeTime(chat.lastMessageAt) : ""}</span>
        </div>
        <p class="chat-list__preview">${chat.lastMessage ? stripHtml(prefix + chat.lastMessage) : "Say hello 👋"}</p>
      </div>
    </button>`;
}

function renderChatList(chats) {
  chatsById = new Map(chats.map((c) => [c.id, c]));
  chatList.innerHTML = chats.map((c) => chatListItemHTML(c, currentUser.uid)).join("");
  chatListEmpty.classList.toggle("hidden", chats.length > 0);
  if (openChatId) {
    $(`[data-chat-id="${openChatId}"]`, chatList)?.setAttribute("aria-current", "true");
  }
}

function formatDuration(sec) {
  if (!sec && sec !== 0) return "";
  const m = Math.floor(sec / 60);
  const s = String(sec % 60).padStart(2, "0");
  return `${m}:${s}`;
}

function messageBubbleContent(message) {
  if (message.imageURL) {
    return `<a href="${message.imageURL}" target="_blank" rel="noopener"><img class="message__image" src="${message.imageURL}" alt="Photo" loading="lazy" /></a>`;
  }
  if (message.audioURL) {
    return `
      <div class="message__voice">
        <audio controls src="${message.audioURL}"></audio>
        ${message.audioDurationSec != null ? `<span class="message__voice-duration">${formatDuration(message.audioDurationSec)}</span>` : ""}
      </div>`;
  }
  return stripHtml(message.text || "");
}

function messageHTML(message, uid) {
  const mine = message.senderId === uid;
  const tick = mine
    ? message.status === "sending"
      ? "Sending…"
      : message.status === "failed"
      ? "⚠️ Not sent — tap to retry"
      : message.status === "seen"
      ? "✓✓ Seen"
      : "✓ Sent"
    : "";
  const mediaClass = message.imageURL ? " message__bubble--image" : message.audioURL ? " message__bubble--voice" : "";
  const stateClass = message.status === "sending" ? " message--pending" : message.status === "failed" ? " message--failed" : "";
  return `
    <div class="message ${mine ? "message--mine" : "message--theirs"}${stateClass}" ${message.status === "failed" ? `data-retry-id="${message.id}"` : ""}>
      <div>
        <div class="message__bubble${mediaClass}">${messageBubbleContent(message)}</div>
        <span class="message__meta">${relativeTime(message.createdAt)}${tick ? " · " + tick : ""}</span>
      </div>
    </div>`;
}

// Pins the list to the bottom, robust to images that are still loading.
// A plain `scrollTop = scrollHeight` right after innerHTML is set reads
// scrollHeight before an <img> in the new content has decoded — the image
// has no height yet, so the pin lands short of the true bottom. On PC this
// showed up as new messages "stuck" just out of view until something else
// forced a relayout. Re-pinning on rAF (post-layout) and again on each
// image's load event closes that gap.
function scrollToBottom() {
  requestAnimationFrame(() => {
    messageList.scrollTop = messageList.scrollHeight;
  });
  $$("img", messageList).forEach((img) => {
    if (img.complete) return;
    img.addEventListener(
      "load",
      () => {
        const stillNearBottom = messageList.scrollTop + messageList.clientHeight >= messageList.scrollHeight - img.clientHeight - 40;
        if (stillNearBottom) messageList.scrollTop = messageList.scrollHeight;
      },
      { once: true }
    );
  });
}

function renderMessageList() {
  const wasNearBottom = messageList.scrollTop + messageList.clientHeight >= messageList.scrollHeight - 40;
  const shouldStick = messageList.dataset.firstRender !== "true" || wasNearBottom;
  messageList.innerHTML = allMessages()
    .map((m) => messageHTML(m, currentUser.uid))
    .join("");
  messageList.dataset.firstRender = "true";
  if (shouldStick) scrollToBottom();
}

function renderMessages(messages) {
  liveMessages = messages;
  renderMessageList();
  markThreadSeen(openChatId, currentUser.uid, messages).catch((error) => console.error("Failed to mark seen:", error));
}

// Paints a text message locally the instant it's submitted, then fires the
// real write in the background. See the pendingMessages comment above for
// why: the placeholder IS the "message sent" feedback — sendMessage()'s
// promise settling is not something the person needs to wait on or see.
function sendTextMessage(chatId, text) {
  const clientId = `local-${currentUser.uid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const pending = {
    id: clientId,
    clientId,
    senderId: currentUser.uid,
    text,
    imageURL: null,
    audioURL: null,
    status: "sending",
    createdAt: new Date(),
  };
  pendingMessages.push(pending);
  renderMessageList();
  dispatchMessage(chatId, pending);
}

// The actual Firestore write for a pending bubble (first attempt or retry).
// On failure the bubble flips to "failed" in place — the text isn't lost,
// and the meta line becomes a tap target (see the messageList click
// handler in init()) instead of silently reverting to the input box, which
// would just recreate the "did that go through?" doubt this whole thing is
// meant to remove.
async function dispatchMessage(chatId, pending) {
  try {
    await sendMessage(chatId, pending.senderId, pending.text, {}, pending.clientId);
    // No manual status flip to "sent" here — once the real doc lands in
    // liveMessages, allMessages() drops this placeholder entirely in favor
    // of it (which already carries status: "sent" from chatService.js).
  } catch (error) {
    console.error("Failed to send message:", error);
    pending.status = "failed";
    renderMessageList();
  }
}

// Fired on scroll; pages in the next batch of history once the user nears
// the top of what's currently loaded. Previously there was no code path
// to fetch anything older than listenMessages()'s live 50, so a thread
// past that length simply had nowhere further to scroll up to.
async function loadOlderBatch() {
  if (!openChatId || loadingOlder || !hasMoreOlder) return;
  const oldest = allMessages()[0];
  if (!oldest) return;
  loadingOlder = true;
  try {
    const older = await loadOlderMessages(openChatId, oldest);
    if (older.length < MESSAGE_PAGE_SIZE) hasMoreOlder = false;
    if (older.length === 0) return;
    olderMessages = [...older, ...olderMessages];
    const prevScrollHeight = messageList.scrollHeight;
    const prevScrollTop = messageList.scrollTop;
    messageList.innerHTML = allMessages()
      .map((m) => messageHTML(m, currentUser.uid))
      .join("");
    // Keep whatever the user was looking at in place instead of yanking
    // them to the new top now that older content was prepended above it.
    messageList.scrollTop = prevScrollTop + (messageList.scrollHeight - prevScrollHeight);
  } catch (error) {
    console.error("Failed to load older messages:", error);
  } finally {
    loadingOlder = false;
  }
}

function openChat(chatId, peerHint) {
  if (openChatId === chatId) return;
  openChatId = chatId;
  messageList.dataset.firstRender = "false";
  liveMessages = [];
  olderMessages = [];
  pendingMessages = [];
  hasMoreOlder = true;
  loadingOlder = false;
  unsubscribeMessages?.();

  const chat = chatsById.get(chatId);
  const peerId = peerHint || (chat ? otherParticipant(chat, currentUser.uid) : null);
  const peer = chat?.participants?.[peerId];
  threadAvatar.src = avatarSrc(peer?.photoURL);
  threadName.textContent = peer?.displayName || "ChopCircle cook";
  threadProfileLink.href = `profile.html?id=${peerId}`;

  threadEmpty.classList.add("hidden");
  thread.classList.remove("hidden");
  layout.dataset.view = "thread";

  $$allChatItems().forEach((el) => el.setAttribute("aria-current", String(el.dataset.chatId === chatId)));
  unsubscribeMessages = listenMessages(chatId, renderMessages);
}

function $$allChatItems() {
  return Array.from(chatList.querySelectorAll(".chat-list__item"));
}

function closeThreadOnMobile() {
  layout.dataset.view = "list";
}

async function openChatWithUser(peerId) {
  const chat = await getOrCreateChat(currentUser.uid, peerId);
  chatsById.set(chat.id, chat);
  openChat(chat.id, peerId);
}

async function init() {
  initTheme();
  initMobileNav();
  registerServiceWorker();
  initInstallPrompt();
  currentUser = await requireAuth();
  initAuthHeader(currentUser, { basePath: "" });
  initHeaderSearch("");

  chatList.addEventListener("click", (event) => {
    const item = event.target.closest(".chat-list__item");
    if (item) openChat(item.dataset.chatId);
  });
  threadBack.addEventListener("click", closeThreadOnMobile);
  messageList.addEventListener("scroll", () => {
    if (messageList.scrollTop < 80) loadOlderBatch();
  });

  messageForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const text = messageInput.value.trim();
    if (!text || !openChatId) return;
    // Cleared synchronously, before anything async — a second submit fired
    // in the same instant (double-tap/double-enter) reads an empty field
    // and bails on the `!text` guard above, so this alone rules out an
    // actual duplicate write reaching Firestore.
    messageInput.value = "";
    sendTextMessage(openChatId, text);
  });

  // Tapping a failed bubble resends the same text under the same clientId,
  // so the retry replaces the failed placeholder rather than stacking a
  // second one next to it.
  messageList.addEventListener("click", (event) => {
    const failed = event.target.closest("[data-retry-id]");
    if (!failed || !openChatId) return;
    const pending = pendingMessages.find((m) => m.id === failed.dataset.retryId);
    if (!pending) return;
    pending.status = "sending";
    renderMessageList();
    dispatchMessage(openChatId, pending);
  });

  // ---- Image messages ----
  imageBtn?.addEventListener("click", () => imageInput.click());
  imageInput?.addEventListener("change", async () => {
    const file = imageInput.files?.[0];
    imageInput.value = "";
    if (!file || !openChatId) return;
    imageBtn.disabled = true;
    try {
      const imageURL = await uploadChatImage(file, openChatId);
      await sendMessage(openChatId, currentUser.uid, null, { imageURL });
    } catch (error) {
      console.error("Failed to send image:", error);
      alert(error.message || "Couldn't send that image — please try again.");
    } finally {
      imageBtn.disabled = false;
    }
  });

  // ---- Voice notes ----
  voiceBtn?.addEventListener("click", async () => {
    if (!openChatId) return;
    if (!isRecording) {
      try {
        voiceRecorder = createVoiceRecorder();
        await voiceRecorder.start();
        isRecording = true;
        voiceBtn.classList.add("is-recording");
        voiceBtn.setAttribute("aria-label", "Stop recording and send voice note");
      } catch (error) {
        console.error("Microphone access failed:", error);
        alert("Couldn't access your microphone — check your browser's permission for this site.");
        voiceRecorder = null;
      }
      return;
    }

    isRecording = false;
    voiceBtn.classList.remove("is-recording");
    voiceBtn.setAttribute("aria-label", "Record a voice note");
    voiceBtn.disabled = true;
    try {
      const { blob, durationSec } = await voiceRecorder.stop();
      if (durationSec < 1) return; // tap without holding — nothing worth sending
      const audioURL = await uploadChatAudio(blob, openChatId);
      await sendMessage(openChatId, currentUser.uid, null, { audioURL, audioDurationSec: durationSec });
    } catch (error) {
      console.error("Failed to send voice note:", error);
      alert(error.message || "Couldn't send that voice note — please try again.");
    } finally {
      voiceRecorder = null;
      voiceBtn.disabled = false;
    }
  });

  listenUserChats(currentUser.uid, renderChatList);

  const withUid = new URLSearchParams(window.location.search).get("with");
  if (withUid && withUid !== currentUser.uid) {
    await openChatWithUser(withUid).catch((error) => console.error("Failed to open chat:", error));
  }
}

init().catch((error) => console.error("Failed to load messages:", error));
