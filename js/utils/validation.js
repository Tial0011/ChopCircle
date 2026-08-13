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
 * Stricter than a plain `Number(value)`/`|| 0` fallback: rejects anything
 * that isn't a single finite number greater than 0 — including a range
 * like "5-7". Matters specifically for `<input type="number">` fields:
 * per spec, typing something the browser can't parse as one number (a
 * range, stray letters, etc.) leaves `.value` as an EMPTY STRING while
 * still showing what was typed on screen — so `Number(el.value)` silently
 * becomes `Number("")`, which is `0`, not an error. A plain `!amount`
 * check catches that 0, but gives no reason why; this is meant to be
 * paired with elementHasBadInput() below for the "why" (a badInput input
 * still visually holds "5-7" even though `.value` reads "").
 * @param {string|number} value
 * @returns {number|null} the parsed number, or null if it's not usable
 */
export function parsePositiveNumber(value) {
  if (value === null || value === undefined) return null;
  const str = String(value).trim();
  if (!str) return null;
  const num = Number(str);
  return Number.isFinite(num) && num > 0 ? num : null;
}

/**
 * True if a number input currently holds text the browser couldn't parse
 * as a number at all (e.g. "5-7", "abc") — as opposed to just being
 * empty. Distinguishes "you typed something, but it wasn't one valid
 * number" from "you didn't fill this in", so the error message can say
 * which one actually happened instead of a generic "required" for both.
 * @param {HTMLInputElement} input
 */
export function elementHasBadInput(input) {
  return Boolean(input && input.validity && input.validity.badInput);
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
