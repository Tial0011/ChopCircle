// ChopCircle — Verify-email page controller
// Reached right after signup (js/auth/signup.js redirects here after
// sendEmailVerification()). Firebase doesn't push emailVerified changes to
// an open tab — the user has to click the link in their inbox, then come
// back and either reload manually or click "I've verified", which calls
// user.reload() to pick up the change.
import { auth } from "../firebase/firebase-init.js";
import {
  onAuthStateChanged,
  sendEmailVerification,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import { $, setError, setLoading } from "../utils/dom.js";
import { friendlyAuthError } from "../utils/validation.js";
import { registerServiceWorker, initInstallPrompt } from "../utils/pwa.js";

registerServiceWorker();
initInstallPrompt();

const lede = $("#verify-email-lede");
const statusEl = $("#verify-status");
const verifiedBtn = $("#ive-verified-btn");
const resendBtn = $("#resend-btn");
const signoutLink = $("#signout-link");

let currentUser = null;
let resendCooldownUntil = 0;

onAuthStateChanged(auth, (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }
  if (user.emailVerified) {
    window.location.href = "feed.html";
    return;
  }
  currentUser = user;
  lede.textContent = `We sent a verification link to ${user.email}. Click it, then come back here.`;
});

verifiedBtn?.addEventListener("click", async () => {
  if (!currentUser) return;
  setError("verify", "");
  setLoading(verifiedBtn, true, "Checking…");
  try {
    await currentUser.reload();
    if (currentUser.emailVerified) {
      statusEl.style.display = "block";
      setTimeout(() => { window.location.href = "feed.html"; }, 800);
    } else {
      setError("verify", "Not verified yet — check your inbox (and spam folder) for the link.");
    }
  } catch (error) {
    setError("verify", friendlyAuthError(error));
  } finally {
    setLoading(verifiedBtn, false);
  }
});

resendBtn?.addEventListener("click", async () => {
  if (!currentUser) return;
  if (Date.now() < resendCooldownUntil) return; // guards against auth/too-many-requests
  setError("verify", "");
  setLoading(resendBtn, true, "Sending…");
  try {
    await sendEmailVerification(currentUser);
    resendCooldownUntil = Date.now() + 60_000; // Firebase itself rate-limits this; a soft client-side cooldown avoids relying on that error alone
    setLoading(resendBtn, false);
    resendBtn.disabled = true;
    resendBtn.textContent = "Sent! You can resend again in a minute.";
    setTimeout(() => {
      resendBtn.disabled = false;
      resendBtn.textContent = "Resend email";
    }, 60_000);
  } catch (error) {
    setLoading(resendBtn, false);
    setError("verify", friendlyAuthError(error));
  }
});

signoutLink?.addEventListener("click", async (event) => {
  event.preventDefault();
  await signOut(auth).catch(() => {});
  window.location.href = "login.html";
});
