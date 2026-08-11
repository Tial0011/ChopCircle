// ChopCircle — DOM helpers

export const $ = (selector, scope = document) => scope.querySelector(selector);
export const $$ = (selector, scope = document) => Array.from(scope.querySelectorAll(selector));

export function setError(fieldId, message) {
  const el = document.getElementById(`${fieldId}-error`);
  const input = document.getElementById(fieldId);
  if (el) el.textContent = message || "";
  if (input) input.setAttribute("aria-invalid", message ? "true" : "false");
}

export function clearErrors(...fieldIds) {
  fieldIds.forEach((id) => setError(id, ""));
}

export function setLoading(button, isLoading, loadingText = "Please wait…") {
  if (!button) return;
  if (isLoading) {
    button.dataset.originalText = button.dataset.originalText || button.textContent;
    button.textContent = loadingText;
    button.disabled = true;
  } else {
    button.textContent = button.dataset.originalText || button.textContent;
    button.disabled = false;
  }
}
