// ChopCircle — Route guard for pages that require authentication.
// Import and call requireAuth() at the top of any protected page's
// entry script (feed.html, chat.html, settings.html, etc).
import { auth } from "../firebase/firebase-init.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";

/**
 * Resolves with the current user, or redirects to the login page (preserving
 * the intended destination) if no one is signed in.
 * @returns {Promise<import("firebase/auth").User>}
 */
export function requireAuth() {
  return new Promise((resolve, reject) => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      unsubscribe();
      if (user) {
        resolve(user);
      } else {
        const redirectTo = encodeURIComponent(window.location.pathname);
        window.location.href = `login.html?redirect=${redirectTo}`;
        reject(new Error("Not authenticated"));
      }
    });
  });
}

/** Resolves with the current user or null, without redirecting. Useful for
 * pages like the public home feed that render differently when logged in. */
export function getCurrentUser() {
  return new Promise((resolve) => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      unsubscribe();
      resolve(user);
    });
  });
}
