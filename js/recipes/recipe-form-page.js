// ChopCircle — Recipe create/edit form controller
// Same page handles both create (no ?id=) and edit (?id=<recipeId>, author-only).
import { $, $$, setError, clearErrors, setLoading } from "../utils/dom.js";
import { initTheme } from "../utils/theme.js";
import { initMobileNav } from "../utils/mobileNav.js";
import { initAuthHeader, initHeaderSearch } from "../utils/header.js";
import { registerServiceWorker, initInstallPrompt } from "../utils/pwa.js";
import { isNonEmpty, parsePositiveNumber, elementHasBadInput } from "../utils/validation.js";
import { requireAuth } from "../auth/authGuard.js";
import { initImageUploadField } from "../utils/imageUpload.js";
import { initVideoUploadField } from "../utils/videoUpload.js";
import { CATEGORIES, getRecipe, createRecipe, updateRecipe } from "./recipeService.js";

const form = $("#recipe-form");
const submitBtn = $("#form-submit");
const ingredientRows = $("#ingredient-rows");
const stepRows = $("#step-rows");
const categorySelect = $("#category");

const editId = new URLSearchParams(window.location.search).get("id");
let rowSeq = 0;
const nextRowId = () => `row${++rowSeq}`;
let coverUpload = null; // set in init(), once we have the signed-in user's uid
let videoUpload = null; // ditto — the optional 20-30s cook-along clip

function populateCategories() {
  categorySelect.innerHTML = CATEGORIES.map((c) => `<option value="${c.slug}">${c.name}</option>`).join("");
}

function addIngredientRow(values = { name: "", amount: "", unit: "" }) {
  const id = nextRowId();
  const row = document.createElement("div");
  row.className = "dynamic-row";
  row.dataset.rowId = id;
  row.innerHTML = `
    <input type="text" placeholder="Ingredient name" class="ing-name" value="${values.name}" required />
    <input type="number" step="any" min="0.001" placeholder="Amount" class="ing-amount" value="${values.amount}" required />
    <input type="text" placeholder="Unit (cups, g…)" class="ing-unit" value="${values.unit}" />
    <button type="button" class="btn btn--ghost dynamic-row__remove" aria-label="Remove ingredient">✕</button>`;
  row.querySelector(".dynamic-row__remove").addEventListener("click", () => row.remove());
  // Real-time feedback the moment typing produces something unusable (a
  // range like "5-7", letters, 0) rather than only finding out at submit —
  // see paintIngredientAmount()'s comment for why this can't just be
  // `Number(value) || 0` at collection time.
  row.querySelector(".ing-amount").addEventListener("input", (e) => paintIngredientAmount(e.target));
  ingredientRows.appendChild(row);
}

function addStepRow(text = "") {
  const id = nextRowId();
  const row = document.createElement("div");
  row.className = "dynamic-row dynamic-row--step";
  row.dataset.rowId = id;
  row.innerHTML = `
    <textarea placeholder="Describe this step" class="step-text" rows="2" required>${text}</textarea>
    <button type="button" class="btn btn--ghost dynamic-row__remove" aria-label="Remove step">✕</button>`;
  row.querySelector(".dynamic-row__remove").addEventListener("click", () => row.remove());
  stepRows.appendChild(row);
}

/**
 * One ingredient amount input's current state:
 *  - "bad"     the browser couldn't parse it as a number at all (e.g. the
 *              user typed a range like "5-7") — `.value` reads as "" even
 *              though "5-7" is still what's visibly sitting in the box.
 *  - "empty"   genuinely blank, nothing typed yet.
 *  - "invalid" parsed, but not usable (0, negative).
 *  - "valid"   a real, positive number.
 */
function ingredientAmountState(input) {
  if (elementHasBadInput(input)) return "bad";
  const raw = input.value.trim();
  if (!raw) return "empty";
  return parsePositiveNumber(raw) !== null ? "valid" : "invalid";
}

/**
 * Paints one ingredient row's amount input red + shows a specific reason
 * the moment typing produces something unusable, rather than waiting
 * until submit. `requireFilled` additionally flags a still-empty amount —
 * only turned on at submit time, so a brand-new blank row doesn't show
 * red before the person has even started typing an ingredient.
 * @returns {boolean} true if this row's amount is fine to submit
 */
function paintIngredientAmount(input, { requireFilled = false } = {}) {
  const state = ingredientAmountState(input);
  const nameFilled = isNonEmpty(input.closest(".dynamic-row").querySelector(".ing-name").value);
  const messages = {
    bad: "Enter one number, not a range — e.g. 6, not 5-7.",
    invalid: "Amount must be greater than 0.",
    empty: nameFilled ? "Add an amount." : "",
  };
  const flagEmpty = requireFilled && nameFilled && state === "empty";
  const invalid = state === "bad" || state === "invalid" || flagEmpty;
  input.setAttribute("aria-invalid", invalid ? "true" : "false");
  input.title = invalid ? messages[state] || "" : "";
  return !invalid;
}

function collectIngredients() {
  return $$(".dynamic-row", ingredientRows)
    .map((row, i) => ({
      id: `ing${i}`,
      name: row.querySelector(".ing-name").value.trim(),
      amount: parsePositiveNumber(row.querySelector(".ing-amount").value) || 0,
      unit: row.querySelector(".ing-unit").value.trim(),
    }))
    .filter((i) => isNonEmpty(i.name));
}

/**
 * Runs paintIngredientAmount() (with requireFilled on, unlike the
 * real-time per-keystroke calls) across every row and reports whether any
 * of them are unusable — the actual gate validate() uses before letting
 * "5-7" or a blank amount reach collectIngredients()/Firestore as a
 * silent 0.
 * @returns {boolean} true if every filled-in ingredient row's amount is valid
 */
function validateIngredientAmounts() {
  const rows = $$(".dynamic-row", ingredientRows);
  const results = rows.map((row) => paintIngredientAmount(row.querySelector(".ing-amount"), { requireFilled: true }));
  return results.every(Boolean);
}

function collectSteps() {
  return $$(".dynamic-row--step", stepRows)
    .map((row, i) => ({ id: `step${i}`, order: i, text: row.querySelector(".step-text").value.trim() }))
    .filter((s) => isNonEmpty(s.text));
}

function collectNutrition() {
  const calories = $("#calories").value;
  const protein = $("#protein").value;
  const carbs = $("#carbs").value;
  const fat = $("#fat").value;
  if (!calories && !protein && !carbs && !fat) return null;
  return {
    calories: Number(calories) || 0,
    protein: Number(protein) || 0,
    carbs: Number(carbs) || 0,
    fat: Number(fat) || 0,
  };
}

function populateNutrition(nutrition) {
  if (!nutrition) return;
  $("#calories").value = nutrition.calories ?? "";
  $("#protein").value = nutrition.protein ?? "";
  $("#carbs").value = nutrition.carbs ?? "";
  $("#fat").value = nutrition.fat ?? "";
}

async function loadForEdit(uid) {
  const recipe = await getRecipe(editId);
  if (!recipe || recipe.authorId !== uid) {
    window.location.href = "recipes.html";
    return;
  }
  $("#page-title").textContent = `Edit ${recipe.title} — ChopCircle`;
  $("#form-heading").textContent = "Edit recipe";
  submitBtn.textContent = "Save changes";
  $("#title").value = recipe.title;
  $("#description").value = recipe.description;
  coverUpload.setInitial(recipe.coverImageURL);
  videoUpload.setInitial(recipe.videoURL);
  categorySelect.value = recipe.category;
  $("#difficulty").value = recipe.difficulty;
  $("#cookTimeMinutes").value = recipe.cookTimeMinutes;
  $("#servings").value = recipe.servings;
  recipe.ingredients.forEach((i) => addIngredientRow(i));
  [...recipe.steps].sort((a, b) => a.order - b.order).forEach((s) => addStepRow(s.text));
  populateNutrition(recipe.nutrition);
}

function paintNumberField(fieldId, { requireFilled = false } = {}) {
  const input = $(`#${fieldId}`);
  if (!input) return true;
  const badInput = elementHasBadInput(input);
  const raw = input.value.trim();
  const parsed = parsePositiveNumber(raw);
  if (badInput) {
    setError(fieldId, "Enter one number, not a range — e.g. 30, not 25-30.");
    return false;
  }
  if (!raw) {
    if (requireFilled) setError(fieldId, fieldId === "cookTimeMinutes" ? "Enter a cook time." : "Enter a serving size.");
    else setError(fieldId, "");
    return !requireFilled;
  }
  if (parsed === null) {
    setError(fieldId, "Must be greater than 0.");
    return false;
  }
  setError(fieldId, "");
  return true;
}

function validate({ title, description, coverImageURL, ingredients, steps }) {
  clearErrors("title", "description", "coverImageURL", "category", "cookTimeMinutes", "servings", "ingredients", "form");
  let hasError = false;
  if (!isNonEmpty(title)) { setError("title", "Give your recipe a title."); hasError = true; }
  if (!isNonEmpty(description)) { setError("description", "Add a short description."); hasError = true; }
  if (!isNonEmpty(coverImageURL)) { setError("coverImageURL", "Add a cover photo for your recipe."); hasError = true; }
  if (!paintNumberField("cookTimeMinutes", { requireFilled: true })) hasError = true;
  if (!paintNumberField("servings", { requireFilled: true })) hasError = true;
  if (ingredients.length === 0) { setError("ingredients", "Add at least one ingredient."); hasError = true; }
  else if (!validateIngredientAmounts()) { setError("ingredients", "Fix the highlighted amount above — one number per ingredient, not a range."); hasError = true; }
  if (steps.length === 0) { setError("steps", "Add at least one step."); hasError = true; }
  return !hasError;
}

async function init() {
  initTheme();
  initMobileNav();
  registerServiceWorker();
  initInstallPrompt();
  populateCategories();

  const user = await requireAuth(); // redirects to login.html if signed out
  initAuthHeader(user, { basePath: "" });
  initHeaderSearch("");

  coverUpload = initImageUploadField($("#coverImageURL-upload"), {
    folder: "recipes",
    uid: user.uid,
    onChange: () => setError("coverImageURL", ""),
  });

  videoUpload = initVideoUploadField($("#video-upload"), {
    uid: user.uid,
    onChange: () => setError("video", ""),
  });

  if (editId) {
    await loadForEdit(user.uid);
  } else {
    addIngredientRow();
    addStepRow();
  }

  $("#add-ingredient").addEventListener("click", () => addIngredientRow());
  $("#add-step").addEventListener("click", () => addStepRow());

  // Real-time feedback on cook time/servings too — same "5-7" range
  // problem can happen here, not just in the ingredient rows.
  $("#cookTimeMinutes").addEventListener("input", () => paintNumberField("cookTimeMinutes"));
  $("#servings").addEventListener("input", () => paintNumberField("servings"));

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    setLoading(submitBtn, true, "Uploading photo…");
    try {
      // Let any in-flight cover/video uploads finish before we read their
      // URLs. Awaited together (not one after the other) so a slow video
      // upload doesn't sit blocked behind an already-finished photo one.
      await Promise.all([coverUpload.waitForUpload(), videoUpload.waitForUpload()]);
    } catch {
      setLoading(submitBtn, false);
      return; // imageUpload.js/videoUpload.js already surfaced the error on the relevant field
    }

    const data = {
      title: $("#title").value.trim(),
      description: $("#description").value.trim(),
      coverImageURL: coverUpload.getURL() || "",
      videoURL: videoUpload.getURL() || null,
      category: categorySelect.value,
      difficulty: $("#difficulty").value,
      cookTimeMinutes: parsePositiveNumber($("#cookTimeMinutes").value) || 0,
      servings: parsePositiveNumber($("#servings").value) || 0,
      ingredients: collectIngredients(),
      steps: collectSteps(),
      nutrition: collectNutrition(),
    };

    if (!validate(data)) {
      setLoading(submitBtn, false);
      return;
    }

    setLoading(submitBtn, true, editId ? "Saving…" : "Publishing…");
    try {
      const id = editId ? editId : await createRecipe(user.uid, data);
      if (editId) await updateRecipe(editId, data);
      window.location.href = `recipe-details.html?id=${id}`;
    } catch (error) {
      console.error("Failed to save recipe:", error);
      setError("form", "Something went wrong saving your recipe. Please try again.");
    } finally {
      setLoading(submitBtn, false);
    }
  });
}

init();
