// ChopCircle — Recipe create/edit form controller
// Same page handles both create (no ?id=) and edit (?id=<recipeId>, author-only).
import { $, $$, setError, clearErrors, setLoading } from "../utils/dom.js";
import { initTheme } from "../utils/theme.js";
import { initMobileNav } from "../utils/mobileNav.js";
import { initAuthHeader } from "../utils/header.js";
import { registerServiceWorker, initInstallPrompt } from "../utils/pwa.js";
import { isNonEmpty } from "../utils/validation.js";
import { requireAuth } from "../auth/authGuard.js";
import { initImageUploadField } from "../utils/imageUpload.js";
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
    <input type="number" step="any" placeholder="Amount" class="ing-amount" value="${values.amount}" required />
    <input type="text" placeholder="Unit (cups, g…)" class="ing-unit" value="${values.unit}" />
    <button type="button" class="btn btn--ghost dynamic-row__remove" aria-label="Remove ingredient">✕</button>`;
  row.querySelector(".dynamic-row__remove").addEventListener("click", () => row.remove());
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

function collectIngredients() {
  return $$(".dynamic-row", ingredientRows)
    .map((row, i) => ({
      id: `ing${i}`,
      name: row.querySelector(".ing-name").value.trim(),
      amount: Number(row.querySelector(".ing-amount").value),
      unit: row.querySelector(".ing-unit").value.trim(),
    }))
    .filter((i) => isNonEmpty(i.name));
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
  categorySelect.value = recipe.category;
  $("#difficulty").value = recipe.difficulty;
  $("#cookTimeMinutes").value = recipe.cookTimeMinutes;
  $("#servings").value = recipe.servings;
  recipe.ingredients.forEach((i) => addIngredientRow(i));
  [...recipe.steps].sort((a, b) => a.order - b.order).forEach((s) => addStepRow(s.text));
  populateNutrition(recipe.nutrition);
}

function validate({ title, description, coverImageURL, cookTimeMinutes, servings, ingredients, steps }) {
  clearErrors("title", "description", "coverImageURL", "category", "cookTimeMinutes", "servings", "form");
  let hasError = false;
  if (!isNonEmpty(title)) { setError("title", "Give your recipe a title."); hasError = true; }
  if (!isNonEmpty(description)) { setError("description", "Add a short description."); hasError = true; }
  if (!isNonEmpty(coverImageURL)) { setError("coverImageURL", "Add a cover photo for your recipe."); hasError = true; }
  if (!cookTimeMinutes || cookTimeMinutes < 1) { setError("cookTimeMinutes", "Enter a cook time."); hasError = true; }
  if (!servings || servings < 1) { setError("servings", "Enter a serving size."); hasError = true; }
  if (ingredients.length === 0) { setError("ingredients", "Add at least one ingredient."); hasError = true; }
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

  coverUpload = initImageUploadField($("#coverImageURL-upload"), {
    folder: "recipes",
    uid: user.uid,
    onChange: () => setError("coverImageURL", ""),
  });

  if (editId) {
    await loadForEdit(user.uid);
  } else {
    addIngredientRow();
    addStepRow();
  }

  $("#add-ingredient").addEventListener("click", () => addIngredientRow());
  $("#add-step").addEventListener("click", () => addStepRow());

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    setLoading(submitBtn, true, "Uploading photo…");
    try {
      await coverUpload.waitForUpload(); // let any in-flight cover upload finish before we read its URL
    } catch {
      setLoading(submitBtn, false);
      return; // imageUpload.js already surfaced the error on the field itself
    }

    const data = {
      title: $("#title").value.trim(),
      description: $("#description").value.trim(),
      coverImageURL: coverUpload.getURL() || "",
      category: categorySelect.value,
      difficulty: $("#difficulty").value,
      cookTimeMinutes: Number($("#cookTimeMinutes").value),
      servings: Number($("#servings").value),
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
