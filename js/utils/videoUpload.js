// ChopCircle — Shared recipe video upload helper
// Wires a "cook-along video" field (drop zone + file input + live preview)
// to Firebase Storage, mirroring js/utils/imageUpload.js's pattern.
//
// This clip is meant to be short: a fast-forwarded or well-edited 20-30s
// cook-along, not a raw phone recording. So on top of the plain size/type
// check imageUpload.js does, this module also reads the file's own
// duration (via a throwaway <video>) and rejects anything outside a
// generous 15-35s window before it ever reaches Storage — matching
// firebase/storage.rules' isValidRecipeVideo() size ceiling server-side.
//
// Storage path: recipes/{uid}/{fileName} (same folder as the cover image —
// storage.rules' isValidRecipeVideo() distinguishes it by contentType).

import {
  ref,
  uploadBytesResumable,
  getDownloadURL,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-storage.js";
import { storage } from "../firebase/firebase-init.js";

const MAX_BYTES = 25 * 1024 * 1024; // matches storage.rules' isValidRecipeVideo()
const MIN_DURATION_S = 15;
const MAX_DURATION_S = 35;
const ACCEPTED_TYPES = ["video/mp4", "video/webm", "video/quicktime"];

function extFromType(type) {
  return { "video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov" }[type] || "mp4";
}

/** @param {File} file @returns {string|null} an error message, or null if the file is fine. */
function validateFile(file) {
  if (!ACCEPTED_TYPES.includes(file.type)) {
    return "Please choose an MP4, WebM, or MOV video.";
  }
  if (file.size > MAX_BYTES) {
    return "That video is too large — trim or compress it to under 25MB.";
  }
  return null;
}

/**
 * Reads a video file's duration client-side by loading it into a detached
 * <video> element. Resolves with seconds, or rejects if the browser can't
 * read it (corrupt file, unsupported codec).
 * @param {File} file
 * @returns {Promise<number>}
 */
function readDuration(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(video.duration);
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Couldn't read that video — please try a different file."));
    };
    video.src = url;
  });
}

/**
 * Uploads a single recipe video to Storage under `recipes/${uid}/...` and
 * resolves with its public download URL. `onProgress(pct)` (0-100) is
 * called throughout, if provided.
 * @param {File} file
 * @param {string} uid
 * @param {(pct: number) => void} [onProgress]
 * @returns {Promise<string>}
 */
export async function uploadRecipeVideo(file, uid, onProgress) {
  const err = validateFile(file);
  if (err) throw new Error(err);

  const duration = await readDuration(file);
  if (duration < MIN_DURATION_S || duration > MAX_DURATION_S) {
    throw new Error(
      `This clip is ${Math.round(duration)}s long — fast-forward or trim it down to roughly 20-30s before uploading.`
    );
  }

  const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extFromType(file.type)}`;
  const storageRef = ref(storage, `recipes/${uid}/${fileName}`);
  const task = uploadBytesResumable(storageRef, file, { contentType: file.type });

  return new Promise((resolve, reject) => {
    task.on(
      "state_changed",
      (snapshot) => {
        if (onProgress) onProgress(Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100));
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
}

/**
 * Wires a "video upload field" widget — same shape/behavior as
 * imageUpload.js's initImageUploadField(), but for one optional recipe
 * video. Expected markup (see pages/recipe-form.html):
 *   <div class="video-upload" id="video-upload">
 *     <input type="file" accept="video/mp4,video/webm,video/quicktime" hidden />
 *     <div class="video-upload__dropzone" tabindex="0" role="button">
 *       <video class="video-upload__preview hidden" muted playsinline controls></video>
 *       <div class="video-upload__prompt">...</div>
 *       <div class="video-upload__progress hidden"><div></div></div>
 *     </div>
 *     <button type="button" class="video-upload__remove hidden">✕</button>
 *   </div>
 *
 * @param {HTMLElement} root the `.video-upload` container
 * @param {{ uid: string, initialURL?: string|null, onChange?: (url: string|null) => void }} opts
 */
export function initVideoUploadField(root, { uid, initialURL = null, onChange } = {}) {
  const input = root.querySelector("input[type=file]");
  const dropzone = root.querySelector(".video-upload__dropzone");
  const preview = root.querySelector(".video-upload__preview");
  const prompt = root.querySelector(".video-upload__prompt");
  const progressWrap = root.querySelector(".video-upload__progress");
  const progressBar = progressWrap ? progressWrap.firstElementChild : null;
  const removeBtn = root.querySelector(".video-upload__remove");
  const errorEl = root.closest(".field")?.querySelector(".field__error") || root.querySelector(".field__error");

  let currentURL = initialURL || null;
  let uploadPromise = Promise.resolve();
  let objectURL = null;

  function setError(msg) {
    if (errorEl) errorEl.textContent = msg || "";
  }

  function showPreview(src) {
    if (!preview) return;
    preview.src = src;
    preview.classList.remove("hidden");
    if (prompt) prompt.classList.add("hidden");
    if (removeBtn) removeBtn.classList.remove("hidden");
  }

  function clearPreview() {
    if (preview) {
      preview.removeAttribute("src");
      preview.load();
      preview.classList.add("hidden");
    }
    if (prompt) prompt.classList.remove("hidden");
    if (removeBtn) removeBtn.classList.add("hidden");
  }

  function setProgress(pct) {
    if (!progressWrap) return;
    if (pct == null) {
      progressWrap.classList.add("hidden");
      return;
    }
    progressWrap.classList.remove("hidden");
    if (progressBar) progressBar.style.width = `${pct}%`;
  }

  if (currentURL) showPreview(currentURL);

  function handleFile(file) {
    if (!file) return;
    setError("");

    const preErr = validateFile(file);
    if (preErr) {
      setError(preErr);
      return;
    }

    if (objectURL) URL.revokeObjectURL(objectURL);
    objectURL = URL.createObjectURL(file);
    showPreview(objectURL);
    setProgress(0);
    dropzone?.classList.add("video-upload__dropzone--busy");

    uploadPromise = uploadRecipeVideo(file, uid, setProgress)
      .then((url) => {
        currentURL = url;
        setProgress(null);
        dropzone?.classList.remove("video-upload__dropzone--busy");
        if (onChange) onChange(currentURL);
        return url;
      })
      .catch((error) => {
        console.error("Video upload failed:", error);
        setError(error.message || "Upload failed — please try again.");
        setProgress(null);
        dropzone?.classList.remove("video-upload__dropzone--busy");
        clearPreview();
        currentURL = initialURL || null;
        if (onChange) onChange(currentURL);
        throw error;
      });
  }

  input.addEventListener("change", () => handleFile(input.files[0]));

  dropzone?.addEventListener("click", () => input.click());
  dropzone?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      input.click();
    }
  });
  dropzone?.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropzone.classList.add("video-upload__dropzone--drag");
  });
  dropzone?.addEventListener("dragleave", () => dropzone.classList.remove("video-upload__dropzone--drag"));
  dropzone?.addEventListener("drop", (e) => {
    e.preventDefault();
    dropzone.classList.remove("video-upload__dropzone--drag");
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  });

  removeBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    input.value = "";
    if (objectURL) URL.revokeObjectURL(objectURL);
    objectURL = null;
    currentURL = null;
    uploadPromise = Promise.resolve();
    clearPreview();
    setProgress(null);
    setError("");
    if (onChange) onChange(null);
  });

  return {
    /** Resolves once any in-flight upload settles; rejects if it failed. */
    waitForUpload: () => uploadPromise,
    /** The current video's download URL (or null if none selected yet). */
    getURL: () => currentURL,
    /** Populates the field with an existing URL (e.g. once an edit-mode
     * record finishes loading, after the field itself was already wired). */
    setInitial: (url) => {
      currentURL = url || null;
      if (currentURL) showPreview(currentURL);
      else clearPreview();
    },
  };
}
