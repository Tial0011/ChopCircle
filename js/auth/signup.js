// ChopCircle — Signup page controller
import { auth, db } from "../firebase/firebase-init.js";
import {
  createUserWithEmailAndPassword,
  updateProfile,
  sendEmailVerification,
  GoogleAuthProvider,
  signInWithPopup,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import { doc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { isValidEmail, isValidPassword, isNonEmpty, friendlyAuthError } from "../utils/validation.js";
import { $, setError, clearErrors, setLoading } from "../utils/dom.js";
import { registerServiceWorker, initInstallPrompt } from "../utils/pwa.js";

// Same reasoning as login.js: auth-layout has no header, so no initTheme()/
// initMobileNav() here, but the app should still install/work offline
// starting from this page.
registerServiceWorker();
initInstallPrompt();

const form = $("#signup-form");
const submitBtn = $("#signup-submit");
const togglePasswordBtn = $("#toggle-password");
const googleBtn = $("#google-signup");

togglePasswordBtn?.addEventListener("click", () => {
  const input = $("#password");
  const isHidden = input.type === "password";
  input.type = isHidden ? "text" : "password";
  togglePasswordBtn.textContent = isHidden ? "Hide" : "Show";
});

/**
 * Creates the user's Firestore profile document. Mirrors the schema in
 * firebase/firestore-schema.md — keep both in sync when this shape changes.
 */
async function createUserProfileDoc(user, displayName) {
  await setDoc(doc(db, "users", user.uid), {
    displayName,
    email: user.email,
    photoURL: user.photoURL || null,
    bio: "",
    coverURL: null,
    followerCount: 0,
    followingCount: 0,
    recipeCount: 0,
    postCount: 0,
    createdAt: serverTimestamp(),
  });
}

form?.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearErrors("displayName", "email", "password", "form");

  const displayName = $("#displayName").value.trim();
  const email = $("#email").value.trim();
  const password = $("#password").value;
  const agreedToTerms = form.terms.checked;

  let hasError = false;
  if (!isNonEmpty(displayName)) { setError("displayName", "Enter your name."); hasError = true; }
  if (!isValidEmail(email)) { setError("email", "Enter a valid email address."); hasError = true; }
  if (!isValidPassword(password)) { setError("password", "Password must be at least 8 characters."); hasError = true; }
  if (!agreedToTerms) { setError("form", "Please agree to the Terms and Privacy Policy."); hasError = true; }
  if (hasError) return;

  setLoading(submitBtn, true, "Creating account…");
  try {
    const { user } = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(user, { displayName });
    await createUserProfileDoc(user, displayName);
    await sendEmailVerification(user);
    window.location.href = "verify-email.html";
  } catch (error) {
    setError("form", friendlyAuthError(error));
  } finally {
    setLoading(submitBtn, false);
  }
});

googleBtn?.addEventListener("click", async () => {
  setLoading(googleBtn, true, "Connecting…");
  try {
    const provider = new GoogleAuthProvider();
    const { user } = await signInWithPopup(auth, provider);
    // Google accounts are pre-verified; only create the profile doc if new.
    await createUserProfileDoc(user, user.displayName || "New Cook").catch(() => {
      /* doc likely already exists for a returning Google user — ignore */
    });
    window.location.href = "feed.html";
  } catch (error) {
    setError("form", friendlyAuthError(error));
  } finally {
    setLoading(googleBtn, false);
  }
});
