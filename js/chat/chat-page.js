// ChopCircle — Chat page controller (Phase 8)
import { $ } from "../utils/dom.js";
import { initTheme } from "../utils/theme.js";
import { initMobileNav } from "../utils/mobileNav.js";
import { initAuthHeader } from "../utils/header.js";
import { registerServiceWorker, initInstallPrompt } from "../utils/pwa.js";
import { requireAuth } from "../auth/authGuard.js";
import { stripHtml } from "../utils/validation.js";
import { relativeTime } from "../utils/format.js";
import {
  getOrCreateChat,
  listenUserChats,
  listenMessages,
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
  const tick = mine ? (message.status === "seen" ? "✓✓ Seen" : "✓ Sent") : "";
  const mediaClass = message.imageURL ? " message__bubble--image" : message.audioURL ? " message__bubble--voice" : "";
  return `
    <div class="message ${mine ? "message--mine" : "message--theirs"}">
      <div>
        <div class="message__bubble${mediaClass}">${messageBubbleContent(message)}</div>
        <span class="message__meta">${relativeTime(message.createdAt)}${tick ? " · " + tick : ""}</span>
      </div>
    </div>`;
}

function renderMessages(messages) {
  const wasNearBottom = messageList.scrollTop + messageList.clientHeight >= messageList.scrollHeight - 40;
  messageList.innerHTML = messages.map((m) => messageHTML(m, currentUser.uid)).join("");
  if (wasNearBottom || messageList.dataset.firstRender !== "true") {
    messageList.scrollTop = messageList.scrollHeight;
  }
  messageList.dataset.firstRender = "true";
  markThreadSeen(openChatId, currentUser.uid, messages).catch((error) => console.error("Failed to mark seen:", error));
}

function openChat(chatId, peerHint) {
  if (openChatId === chatId) return;
  openChatId = chatId;
  messageList.dataset.firstRender = "false";
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

  chatList.addEventListener("click", (event) => {
    const item = event.target.closest(".chat-list__item");
    if (item) openChat(item.dataset.chatId);
  });
  threadBack.addEventListener("click", closeThreadOnMobile);

  messageForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const text = messageInput.value.trim();
    if (!text || !openChatId) return;
    messageInput.value = "";
    try {
      await sendMessage(openChatId, currentUser.uid, text);
    } catch (error) {
      console.error("Failed to send message:", error);
      messageInput.value = text;
    }
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
