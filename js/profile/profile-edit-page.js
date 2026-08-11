// ChopCircle — Profile edit page controller (Phase 7)
import { $, setError, clearErrors, setLoading } from "../utils/dom.js";
import { initTheme } from "../utils/theme.js";
import { initMobileNav } from "../utils/mobileNav.js";
import { initAuthHeader } from "../utils/header.js";
import { registerServiceWorker, initInstallPrompt } from "../utils/pwa.js";
import { isNonEmpty } from "../utils/validation.js";
import { requireAuth } from "../auth/authGuard.js";
import { initImageUploadField } from "../utils/imageUpload.js";
import { getProfile, updateUserProfile } from "./profileService.js";

const form = $("#profile-edit-form");
const submitBtn = $("#form-submit");
const cancelLink = $("#cancel-link");

async function init() {
  initTheme();
  initMobileNav();
  registerServiceWorker();
  initInstallPrompt();

  const user = await requireAuth(); // redirects to login.html if signed out
  initAuthHeader(user, { basePath: "" });
  cancelLink.href = `profile.html?id=${user.uid}`;

  const photoUpload = initImageUploadField($("#photoURL-upload"), { folder: "users", uid: user.uid });
  const coverUpload = initImageUploadField($("#coverURL-upload"), { folder: "users", uid: user.uid });

  const profile = await getProfile(user.uid);
  if (profile) {
    $("#displayName").value = profile.displayName || "";
    $("#bio").value = profile.bio || "";
    photoUpload.setInitial(profile.photoURL);
    coverUpload.setInitial(profile.coverURL);
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearErrors("displayName", "bio", "form");

    const displayName = $("#displayName").value.trim();
    const bio = $("#bio").value.trim();

    if (!isNonEmpty(displayName)) {
      setError("displayName", "Enter your name.");
      return;
    }

    setLoading(submitBtn, true, "Uploading photos…");
    try {
      await Promise.all([photoUpload.waitForUpload(), coverUpload.waitForUpload()]);
    } catch {
      setLoading(submitBtn, false);
      return; // imageUpload.js already surfaced the error on the relevant field
    }

    const photoURL = photoUpload.getURL() || "";
    const coverURL = coverUpload.getURL() || "";

    setLoading(submitBtn, true, "Saving…");
    try {
      await updateUserProfile(user.uid, { displayName, bio, photoURL, coverURL });
      window.location.href = `profile.html?id=${user.uid}`;
    } catch (error) {
      console.error("Failed to update profile:", error);
      setError("form", "Something went wrong saving your profile. Please try again.");
    } finally {
      setLoading(submitBtn, false);
    }
  });
}

init().catch((error) => {
  // requireAuth() already redirects to login on its own; anything else
  // that reaches here is unexpected.
  console.error("Failed to load profile editor:", error);
});
