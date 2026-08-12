// ChopCircle — Chat media upload helper (Phase 12: images + voice notes)
// js/utils/imageUpload.js's uploadImage() writes to `${folder}/${uid}/...`
// (users/recipes/posts) — chat media lives at `chats/{chatId}/{fileName}`
// instead (see firebase/storage.rules), keyed by the conversation, not the
// uploader, so BOTH participants can read every file in the thread. Kept
// as its own small module rather than generalizing imageUpload.js's folder
// param, since chat also needs to upload audio Blobs (voice notes), which
// that module was never built to validate or name.

import { ref, uploadBytesResumable, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-storage.js";
import { storage } from "../firebase/firebase-init.js";

const MAX_BYTES = 8 * 1024 * 1024; // matches storage.rules' isValidChatMedia()
const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const UPLOAD_TIMEOUT_MS = 25000;

function randomFileName(ext) {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
}

/**
 * Wraps uploadBytesResumable() with a hard timeout. Firebase's resumable
 * upload retries transient failures with its own exponential backoff and
 * has no built-in ceiling — on a genuinely stalled connection (network
 * drops mid-upload, tab backgrounded, captive portal, etc.) that means the
 * task can sit "in progress" indefinitely: no error, no resolution, the
 * mic/image button just never re-enables. That's indistinguishable from a
 * hang to whoever's waiting on it. Racing the task against a timer means
 * the button always recovers within UPLOAD_TIMEOUT_MS either way, and
 * task.cancel() stops the retries instead of leaving them running in the
 * background after we've already given up on them.
 */
function upload(blobOrFile, chatId, fileName, contentType, onProgress) {
  const storageRef = ref(storage, `chats/${chatId}/${fileName}`);
  const task = uploadBytesResumable(storageRef, blobOrFile, { contentType });

  const uploadPromise = new Promise((resolve, reject) => {
    task.on(
      "state_changed",
      (snapshot) => {
        if (snapshot.totalBytes > 0) {
          onProgress?.(Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100));
        }
      },
      reject,
      async () => {
        try {
          resolve(await getDownloadURL(task.snapshot.ref));
        } catch (e) {
          reject(e);
        }
      }
    );
  });

  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => {
      task.cancel();
      reject(new Error("That took too long to send — check your connection and try again."));
    }, UPLOAD_TIMEOUT_MS);
  });

  return Promise.race([uploadPromise, timeoutPromise]);
}

/**
 * Uploads a chat image and resolves with its download URL.
 * @param {File} file
 * @param {string} chatId
 * @param {(pct: number) => void} [onProgress]
 * @returns {Promise<string>}
 */
export function uploadChatImage(file, chatId, onProgress) {
  if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
    return Promise.reject(new Error("Please choose a JPG, PNG, WebP, or GIF image."));
  }
  if (file.size > MAX_BYTES) {
    return Promise.reject(new Error("That image is too large — please choose one under 8MB."));
  }
  const ext = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" }[file.type] || "jpg";
  return upload(file, chatId, randomFileName(ext), file.type, onProgress);
}

/**
 * Uploads a recorded voice-note Blob (see initVoiceRecorder() below) and
 * resolves with its download URL.
 * @param {Blob} blob
 * @param {string} chatId
 * @param {(pct: number) => void} [onProgress]
 * @returns {Promise<string>}
 */
export function uploadChatAudio(blob, chatId, onProgress) {
  if (blob.size > MAX_BYTES) {
    return Promise.reject(new Error("That voice note is too long — please keep it under 8MB."));
  }
  const ext = blob.type.includes("mp4") ? "m4a" : "webm";
  return upload(blob, chatId, randomFileName(ext), blob.type || "audio/webm", onProgress);
}

/**
 * Wraps the MediaRecorder API into start()/stop() calls a mic button can
 * drive directly. Each recorder instance is single-use (one recording);
 * chat-page.js creates a fresh one per tap of the mic button.
 * @returns {{
 *   start: () => Promise<void>,
 *   stop: () => Promise<{ blob: Blob, durationSec: number }>,
 *   cancel: () => void,
 * }}
 */
export function createVoiceRecorder() {
  let mediaRecorder = null;
  let stream = null;
  let chunks = [];
  let startedAt = 0;

  async function start() {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mimeType = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "audio/mp4";
    mediaRecorder = new MediaRecorder(stream, { mimeType });
    chunks = [];
    mediaRecorder.addEventListener("dataavailable", (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    });
    startedAt = Date.now();
    mediaRecorder.start();
  }

  function stopStream() {
    stream?.getTracks().forEach((track) => track.stop());
    stream = null;
  }

  function stop() {
    return new Promise((resolve, reject) => {
      if (!mediaRecorder) {
        reject(new Error("Recording was never started."));
        return;
      }
      // If the browser already stopped the recorder on its own (mic
      // permission revoked mid-recording, the track ending because another
      // app grabbed the mic, tab backgrounded on some mobile browsers,
      // etc.), its "stop" event already fired before we ever got here —
      // it won't fire again, and calling .stop() on an already-inactive
      // recorder throws synchronously. Finish from whatever chunks we did
      // capture instead of trying to stop an already-stopped recorder.
      if (mediaRecorder.state === "inactive") {
        const durationSec = Math.round((Date.now() - startedAt) / 1000);
        const blob = new Blob(chunks, { type: mediaRecorder.mimeType });
        stopStream();
        resolve({ blob, durationSec });
        return;
      }
      mediaRecorder.addEventListener(
        "stop",
        () => {
          const durationSec = Math.round((Date.now() - startedAt) / 1000);
          const blob = new Blob(chunks, { type: mediaRecorder.mimeType });
          stopStream();
          resolve({ blob, durationSec });
        },
        { once: true }
      );
      try {
        mediaRecorder.stop();
      } catch (error) {
        stopStream();
        reject(error);
      }
    });
  }

  function cancel() {
    if (mediaRecorder && mediaRecorder.state !== "inactive") mediaRecorder.stop();
    stopStream();
  }

  return { start, stop, cancel };
}
