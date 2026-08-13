// ChopCircle — Shared image upload helper
// Wires a "image upload field" (drop zone + file input + live preview) to
// Firebase Storage, with per-file progress and validation. Used by the
// recipe form (cover image), profile editor (avatar + cover), and the feed
// composer (post image) — anywhere a plain "paste an image URL" field used
// to live.
//
// Storage path convention matches firebase/storage.rules exactly:
//   users/{uid}/{fileName}    — avatars & profile covers
//   recipes/{uid}/{fileName}  — recipe cover images
//   posts/{uid}/{fileName}    — feed post images
// Rules cap uploads at 8MB and require an image/* contentType — this module
// enforces the same limits client-side first so users get an instant,
// friendly error instead of waiting on a round trip to be rejected.

import {
  ref,
  uploadBytesResumable,
  getDownloadURL,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-storage.js";
import { storage } from "../firebase/firebase-init.js";

const MAX_BYTES = 8 * 1024 * 1024; // matches storage.rules' isValidImage()
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

/**
 * @param {File} file
 * @returns {string|null} an error message, or null if the file is fine.
 */
function validateFile(file) {
  if (!ACCEPTED_TYPES.includes(file.type)) {
    return "Please choose a JPG, PNG, WebP, or GIF image.";
  }
  if (file.size > MAX_BYTES) {
    return "That image is too large — please choose one under 8MB.";
  }
  return null;
}

function extFromType(type) {
  return { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" }[type] || "jpg";
}

/**
 * Uploads a single image file to Storage under `${folder}/${uid}/...` and
 * resolves with its public download URL. `onProgress(pct)` (0-100) is
 * called throughout, if provided.
 * @param {File} file
 * @param {"users"|"recipes"|"posts"} folder
 * @param {string} uid
 * @param {(pct: number) => void} [onProgress]
 * @returns {Promise<string>}
 */
export function uploadImage(file, folder, uid, onProgress) {
  const err = validateFile(file);
  if (err) return Promise.reject(new Error(err));

  const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extFromType(file.type)}`;
  const storageRef = ref(storage, `${folder}/${uid}/${fileName}`);
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
 * Wires an "image upload field" widget: a drop zone / click target showing
 * either an empty prompt or a live preview, a hidden file input, and a
 * remove (✕) button. Selecting or dropping a file immediately shows a
 * local preview (via a blob URL) and starts uploading in the background;
 * the returned controller's `waitForUpload()` resolves once any in-flight
 * upload finishes, so form submission can await it rather than racing it.
 *
 * Expected markup (see recipe-form.html / profile-edit.html / feed.html
 * for concrete examples):
 *   <div class="image-upload" data-empty-label="Add a cover photo">
 *     <input type="file" accept="image/*" hidden />
 *     <div class="image-upload__dropzone">
 *       <img class="image-upload__preview hidden" alt="" />
 *       <div class="image-upload__prompt">...</div>
 *       <div class="image-upload__progress hidden"><div></div></div>
 *     </div>
 *     <button type="button" class="image-upload__remove hidden">✕</button>
 *   </div>
 *
 * @param {HTMLElement} root the `.image-upload` container
 * @param {{ folder: "users"|"recipes"|"posts", uid: string, initialURL?: string|null, onChange?: (url: string|null) => void }} opts
 */
export function initImageUploadField(root, { folder, uid, initialURL = null, onChange } = {}) {
  const input = root.querySelector("input[type=file]");
  const dropzone = root.querySelector(".image-upload__dropzone");
  const preview = root.querySelector(".image-upload__preview");
  const prompt = root.querySelector(".image-upload__prompt");
  const progressWrap = root.querySelector(".image-upload__progress");
  const progressBar = progressWrap ? progressWrap.firstElementChild : null;
  const removeBtn = root.querySelector(".image-upload__remove");
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
      preview.src = "";
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

    if (objectURL) URL.revokeObjectURL(objectURL);
    objectURL = URL.createObjectURL(file);
    showPreview(objectURL);
    setProgress(0);
    dropzone?.classList.add("image-upload__dropzone--busy");

    uploadPromise = uploadImage(file, folder, uid, setProgress)
      .then((url) => {
        currentURL = url;
        setProgress(null);
        dropzone?.classList.remove("image-upload__dropzone--busy");
        if (onChange) onChange(currentURL);
        return url;
      })
      .catch((error) => {
        console.error("Image upload failed:", error);
        setError(error.message || "Upload failed — please try again.");
        setProgress(null);
        dropzone?.classList.remove("image-upload__dropzone--busy");
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
    dropzone.classList.add("image-upload__dropzone--drag");
  });
  dropzone?.addEventListener("dragleave", () => dropzone.classList.remove("image-upload__dropzone--drag"));
  dropzone?.addEventListener("drop", (e) => {
    e.preventDefault();
    dropzone.classList.remove("image-upload__dropzone--drag");
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
    /** The current image's download URL (or null if none selected yet). */
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
