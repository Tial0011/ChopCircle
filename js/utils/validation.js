// ChopCircle — Shared validation helpers
// Keep validation logic here so auth, recipes, and profile forms never
// duplicate the same regex/rules.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(value) {
  return EMAIL_RE.test(String(value).trim());
}

export function isValidPassword(value) {
  return typeof value === "string" && value.length >= 8;
}

export function isNonEmpty(value) {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Basic sanitizer for any user-generated text rendered back into the DOM
 * via innerHTML (captions, comments, bios). Strips tags entirely — this
 * app renders user text as plain text via textContent wherever possible;
 * this helper is a defense-in-depth backstop, not the primary XSS control.
 */
export function stripHtml(value) {
  const div = document.createElement("div");
  div.textContent = String(value ?? "");
  return div.innerHTML;
}

/**
 * Maps common Firebase Auth error codes to friendly, actionable copy.
 * Never surface raw Firebase error messages to end users.
 */
export function friendlyAuthError(error) {
  const code = error?.code || "";
  const map = {
    "auth/email-already-in-use": "That email is already registered. Try logging in instead.",
    "auth/invalid-email": "That email address doesn't look right.",
    "auth/weak-password": "Choose a password with at least 8 characters.",
    "auth/user-not-found": "We couldn't find an account with that email.",
    "auth/wrong-password": "That password doesn't match. Try again or reset it.",
    "auth/invalid-credential": "Email or password is incorrect.",
    "auth/too-many-requests": "Too many attempts. Please wait a moment and try again.",
    "auth/popup-closed-by-user": "Sign-in was cancelled.",
    "auth/network-request-failed": "Network error — check your connection and try again.",
  };
  return map[code] || "Something went wrong. Please try again.";
}
