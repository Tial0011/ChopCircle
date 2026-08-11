// ChopCircle — Login page controller
import { auth } from "../firebase/firebase-init.js";
import {
  signInWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import { isValidEmail, isNonEmpty, friendlyAuthError } from "../utils/validation.js";
import { $, setError, clearErrors, setLoading } from "../utils/dom.js";
import { registerServiceWorker, initInstallPrompt } from "../utils/pwa.js";

// auth-layout has no header/theme-toggle, so this page skips initTheme()/
// initMobileNav() (see index.html-family pages for that pair) — but it's
// still a real entry point, so it still gets the app installable/offline.
registerServiceWorker();
initInstallPrompt();

const form = $("#login-form");
const submitBtn = $("#login-submit");
const togglePasswordBtn = $("#toggle-password");
const googleBtn = $("#google-login");

togglePasswordBtn?.addEventListener("click", () => {
  const input = $("#password");
  const isHidden = input.type === "password";
  input.type = isHidden ? "text" : "password";
  togglePasswordBtn.textContent = isHidden ? "Hide" : "Show";
});

form?.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearErrors("email", "password", "form");

  const email = $("#email").value.trim();
  const password = $("#password").value;
  const remember = form.remember.checked;

  let hasError = false;
  if (!isValidEmail(email)) { setError("email", "Enter a valid email address."); hasError = true; }
  if (!isNonEmpty(password)) { setError("password", "Enter your password."); hasError = true; }
  if (hasError) return;

  setLoading(submitBtn, true, "Logging in…");
  try {
    await setPersistence(auth, remember ? browserLocalPersistence : browserSessionPersistence);
    await signInWithEmailAndPassword(auth, email, password);
    window.location.href = "feed.html";
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
    await signInWithPopup(auth, provider);
    window.location.href = "feed.html";
  } catch (error) {
    setError("form", friendlyAuthError(error));
  } finally {
    setLoading(googleBtn, false);
  }
});
