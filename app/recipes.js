import { api, freshAccess, patiently } from "./api.js";
import { foodName, formatDay, plural, recipeName, stepText, t } from "./i18n.js";
import { page } from "./motion.js";
import { candidate } from "./now.js";
import { busy, canonicalFood, chips, esc, foodOptions, formData, grams, numberField, openSheet, showError, swap, toast, wireFoodSearch, wireSteppers } from "./ui.js";

const mealName = (meal) => (meal === "LUNCH" ? t("recipes.lunch") : t("recipes.dinner"));
const verdictTone = (verdict) => (verdict === "ENOUGH" ? "" : "attention");
const lines = (text) => String(text ?? "").split("\n").map((line) => line.trim()).filter(Boolean).slice(0, 50).map((line) => line.slice(0, 500));
const after = (iso) => {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
};

function recipeRow(recipe, template) {
  return `<li class="recipe-row" data-key="${esc(recipe.id)}">
    <div class="item-meta">
      <span class="item-name">${esc(recipeName(recipe.name))}</span>
      <span class="hint">${esc(plural("recipes.meta", recipe.servings, { minutes: recipe.minutes, foods: recipe.requirements.length }))}</span>
    </div>
    <span class="item-actions">
      <button type="button" data-evaluate="${esc(recipe.id)}">${t("recipes.evaluate")}</button>
      <button type="button" class="ghost" data-clone="${esc(recipe.id)}">${template ? t("recipes.use-template") : t("recipes.clone")}</button>
    </span>
  </li>`;
}

function planTile(plan) {
  if (!plan) {
    return `<section class="tile w-7" aria-labelledby="plan-title">
      <h2 id="plan-title">${t("recipes.plan")}</h2>
      <p class="hint">${t("recipes.no-plan")}</p>
      <form class="row-form" data-generate>
        ${numberField({ name: "servings", label: t("recipes.servings"), min: 1, max: 20, value: 2 })}
        <button class="primary" type="submit">${t("recipes.generate")}</button>
      </form>
    </section>`;
  }
  const days = new Map();
  [...plan.entries].sort((a, b) => a.date.localeCompare(b.date) || (a.meal === "LUNCH" ? -1 : 1) - (b.meal === "LUNCH" ? -1 : 1)).forEach((entry) => days.set(entry.date, [...(days.get(entry.date) ?? []), entry]));
  return `<section class="tile w-7 plan-tile" aria-labelledby="plan-title">
    <header><h2 id="plan-title">${t("recipes.plan")}</h2><span class="hint">${esc(t("recipes.week", { from: formatDay(plan.weekStart), to: formatDay(plan.weekEnd) }))}</span></header>
    ${[...days]
      .map(
        ([date, entries]) => `<div class="plan-day">
          <h3>${esc(formatDay(date, { weekday: "long", day: "numeric", month: "short" }))}</h3>
          <ul class="list">${entries
            .map(
              (entry) => `<li data-key="${esc(entry.id)}">
                <div class="item-meta">
                  <span class="status quiet">${esc(mealName(entry.meal))}</span>
                  <span class="item-name">${esc(recipeName(entry.recipe))}</span>
                  <span class="hint">${esc(plural("recipes.servings-count", entry.servings))}</span>
                  ${entry.needsShopping ? `<span class="status attention">${t("recipes.needs-shopping")}</span>` : ""}
                </div>
                <span class="item-actions"><button type="button" class="ghost" data-change="${esc(entry.id)}">${t("recipes.change")}</button></span>
              </li>`,
            )
            .join("")}</ul>
        </div>`,
      )
      .join("")}
    <div class="row-form">
      <button class="primary" type="button" data-plan-market>${t("recipes.plan-to-market")}</button>
      <button type="button" data-clone-plan>${t("recipes.clone-plan")}</button>
    </div>
  </section>`;
}

let rowCount = 0;
function ingredientRow({ food = "", value = 100, optional = false } = {}) {
  const list = `recipe-foods-${++rowCount}`;
  return `<div class="row-form ingredient-row" data-ingredient>
    <label class="grow">${t("field.food")}<input name="food" list="${list}" required autocomplete="off" value="${esc(food)}"></label>
    ${numberField({ name: "grams", label: t("field.grams"), unit: "g", min: 1, bigStep: 50, value })}
    <label class="check"><input type="checkbox" name="optional" ${optional ? "checked" : ""}>${t("recipes.optional")}</label>
    ${foodOptions(list)}
    <button type="button" class="ghost" data-remove-row>${t("recipes.remove")}</button>
  </div>`;
}

function addRow(rows, values) {
  rows.insertAdjacentHTML("beforeend", ingredientRow(values));
  const row = rows.lastElementChild;
  wireSteppers(row);
  wireFoodSearch(row.querySelector("[name=food]"), api);
  return row;
}

function openCreate(base, onSaved) {
  openSheet(
    t("recipes.new"),
    `<form class="stack" data-recipe-form>
      <label>${t("recipes.name")}<input name="name" required maxlength="120" autocomplete="off" placeholder="${esc(t("recipes.name-example"))}"></label>
      <div class="row-form">
        ${numberField({ name: "servings", label: t("recipes.servings"), min: 1, max: 100, value: 2 })}
        ${numberField({ name: "minutes", label: t("recipes.minutes"), unit: "min", min: 1, bigStep: 5, value: 20 })}
      </div>
      <fieldset class="stack"><legend>${t("recipes.ingredients")}</legend><div class="stack" data-rows></div><button type="button" data-add-row>${t("recipes.add-ingredient")}</button></fieldset>
      <label>${t("recipes.steps")}<textarea name="steps" rows="5" placeholder="${esc(t("recipes.steps-hint"))}"></textarea></label>
      <button class="primary" type="submit">${t("recipes.save")}</button>
    </form>`,
    (dialog) => {
      const form = dialog.querySelector("form");
      const rows = form.querySelector("[data-rows]");
      addRow(rows);
      form.querySelector("[data-add-row]").addEventListener("click", () => addRow(rows).querySelector("[name=food]").focus());
      rows.addEventListener("click", (event) => event.target.closest("[data-remove-row]")?.closest("[data-ingredient]").remove());
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const values = formData(form);
        const ingredients = [...rows.querySelectorAll("[data-ingredient]")];
        if (!ingredients.length) return showError(form, { message: t("recipes.needs-ingredient") });
        await busy(form.querySelector("button[type=submit]"), async () => {
          try {
            const requirements = await Promise.all(
              ingredients.map(async (row) => ({
                food: await canonicalFood(row.querySelector("[name=food]").value, api),
                grams: Number(row.querySelector("[name=grams]").value),
                optional: row.querySelector("[name=optional]").checked,
              })),
            );
            const body = { name: values.name.trim(), servings: Number(values.servings), minutes: Number(values.minutes), requirements, steps: lines(values.steps).map((instruction) => ({ instruction })) };
            await api(`${base}/recipes`, { method: "POST", body });
            dialog.close();
            toast(t("recipes.toast-saved", { recipe: body.name }));
            onSaved();
          } catch (error) {
            showError(form, error);
          }
        });
      });
    },
  );
}

function evaluation(result) {
  const missing = result.requirements.some((requirement) => !requirement.optional && Number(requirement.shortfallGrams) > 0);
  return `<p class="item-meta"><span class="status ${verdictTone(result.verdict)}">${esc(t(`verdict.${result.verdict}`))}</span><span>${esc(plural("recipes.achievable", result.achievableServings, { wanted: result.requestedServings }))}</span></p>
    <ul class="list">${result.requirements
      .map(
        (requirement) => `<li>
          <div class="item-meta">
            <span class="item-name">${esc(foodName(requirement.food))}</span>
            ${requirement.optional ? `<span class="status quiet">${t("recipes.optional")}</span>` : ""}
            <span class="hint">${esc(t("recipes.have-need", { have: grams(requirement.availableGrams), need: grams(requirement.requiredGrams) }))}</span>
            ${Number(requirement.shortfallGrams) > 0 ? `<span class="hint">${esc(t("recipes.short", { grams: grams(requirement.shortfallGrams) }))}</span>` : ""}
            ${requirement.substitute ? `<span class="hint">${esc(t("recipes.substitute", { grams: grams(requirement.substituteGrams), food: foodName(requirement.substitute) }))}</span>` : ""}
          </div>
          <span class="status ${verdictTone(requirement.verdict)}">${esc(t(`verdict.${requirement.verdict}`))}</span>
        </li>`,
      )
      .join("")}</ul>
    ${missing ? `<button type="button" data-missing>${t("recipes.missing-to-market")}</button>` : ""}`;
}

function openEvaluate(base, recipe) {
  openSheet(
    recipeName(recipe.name),
    `<form class="stack" data-evaluate-form>
      ${chips("strategy", t("recipes.strategy"), [["STRICT", t("recipes.strategy-strict")], ["FLEXIBLE", t("recipes.strategy-flexible")], ["RESCUE", t("recipes.strategy-rescue")]], "STRICT")}
      ${numberField({ name: "servings", label: t("recipes.servings"), min: 1, max: 100, value: recipe.servings })}
      <button class="primary" type="submit">${t("recipes.check")}</button>
    </form>
    <div class="stack" data-result aria-live="polite"></div>`,
    (dialog) => {
      const form = dialog.querySelector("form");
      const result = dialog.querySelector("[data-result]");
      let targetServings = recipe.servings;
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const values = formData(form);
        targetServings = Number(values.servings);
        await busy(form.querySelector("button[type=submit]"), async () => {
          try {
            const answer = await api(`${base}/recipes/evaluate`, { method: "POST", body: { ...candidate(recipe), targetServings, strategy: values.strategy } });
            result.innerHTML = evaluation(answer);
          } catch (error) {
            showError(form, error);
          }
        });
      });
      result.addEventListener("click", (event) => {
        const button = event.target.closest("[data-missing]");
        if (!button) return;
        busy(button, async () => {
          try {
            const added = (await api(`${base}/recipes/missing-to-market`, { method: "POST", body: { ...candidate(recipe), targetServings } })).filter((item) => Number(item.addedGrams) > 0).length;
            toast(added ? plural("recipes.toast-missing", added) : t("recipes.missing-covered"));
          } catch (error) {
            toast(error.message);
          }
        });
      });
      form.requestSubmit();
    },
  );
}

async function readPhoto(base, file) {
  const body = new FormData();
  body.append("photo", file);
  const access = await freshAccess();
  const response = await patiently(`/api/v1${base}/recipes/from-photo`, { method: "POST", headers: { Authorization: `Bearer ${access}` }, body, quiet: true });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.detail || payload.title || t("error.request"));
  return payload;
}

// The photo only proposes: nothing is saved until the person reads the verified draft and presses save.
function openDraft(base, draft, onSaved) {
  const usable = draft.ingredients.filter((ingredient) => ingredient.verified && ingredient.catalogFood && Number(ingredient.grams) > 0);
  openSheet(
    t("recipes.draft-title"),
    `<form class="stack" data-draft>
      <p class="hint">${draft.verified ? t("recipes.draft-verified") : t("recipes.draft-check")}</p>
      <label>${t("recipes.name")}<input name="name" required maxlength="120" value="${esc(draft.name)}"></label>
      <p class="hint">${esc(plural("recipes.meta", draft.servings, { minutes: draft.minutes, foods: draft.ingredients.length }))}</p>
      <h3>${t("recipes.ingredients")}</h3>
      <ul class="list">${draft.ingredients
        .map(
          (ingredient) => `<li>
            <div class="item-meta">
              <span class="item-name">${esc(ingredient.catalogFood ? foodName(ingredient.catalogFood) : ingredient.readFood)}</span>
              <span class="hint">${esc(t("recipes.read-as", { text: [ingredient.readQuantity, ingredient.readFood].filter(Boolean).join(" ") }))}</span>
            </div>
            ${
              usable.includes(ingredient)
                ? `<span class="data">${grams(ingredient.grams)}</span>`
                : `<span class="status attention">${t("recipes.unverified")}</span>`
            }
          </li>`,
        )
        .join("")}</ul>
      ${draft.steps.length ? `<h3>${t("recipes.steps")}</h3><ol class="draft-steps">${draft.steps.map((step) => `<li>${esc(stepText(step))}</li>`).join("")}</ol>` : ""}
      ${usable.length < draft.ingredients.length ? `<p class="hint">${t("recipes.draft-skips")}</p>` : ""}
      <button class="primary" type="submit" ${usable.length ? "" : "disabled"}>${t("recipes.save-draft")}</button>
    </form>`,
    (dialog) => {
      const form = dialog.querySelector("form");
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        await busy(form.querySelector("button[type=submit]"), async () => {
          try {
            const name = formData(form).name.trim();
            const body = {
              name,
              servings: Math.min(100, Math.max(1, draft.servings)),
              minutes: Math.max(1, draft.minutes),
              requirements: usable.map((ingredient) => ({ food: ingredient.catalogFood, grams: Number(ingredient.grams), optional: false })),
              steps: lines(draft.steps.join("\n")).map((instruction) => ({ instruction })),
            };
            await api(`${base}/recipes`, { method: "POST", body });
            dialog.close();
            toast(t("recipes.toast-saved", { recipe: name }));
            onSaved();
          } catch (error) {
            showError(form, error);
          }
        });
      });
    },
  );
}

function openChange(base, entry, recipes, onSaved) {
  openSheet(
    t("recipes.change-title", { day: formatDay(entry.date, { weekday: "long" }), meal: mealName(entry.meal) }),
    `<form class="stack" data-change-form>
      <label>${t("recipes.recipe")}<select name="recipeId" required>${recipes
        .map((recipe) => `<option value="${esc(recipe.id)}" ${recipe.id === entry.recipeId ? "selected" : ""}>${esc(recipeName(recipe.name))}</option>`)
        .join("")}</select></label>
      ${numberField({ name: "servings", label: t("recipes.servings"), min: 1, max: 20, value: entry.servings })}
      <button class="primary" type="submit">${t("recipes.save-change")}</button>
    </form>`,
    (dialog) => {
      const form = dialog.querySelector("form");
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const values = formData(form);
        await busy(form.querySelector("button[type=submit]"), async () => {
          try {
            await api(`${base}/plan-entries/${entry.id}`, { method: "PATCH", body: { recipeId: values.recipeId, servings: Number(values.servings) } });
            dialog.close();
            toast(t("recipes.toast-changed"));
            onSaved();
          } catch (error) {
            showError(form, error);
          }
        });
      });
    },
  );
}

export async function renderRecipes(main, household) {
  const base = `/households/${household.id}`;
  let recipes;
  let templates;
  let plan;
  const load = async () => {
    [recipes, templates, plan] = await Promise.all([
      api(`${base}/recipes`),
      api("/recipe-templates").catch(() => []),
      api(`${base}/weekly-plans/current`).catch((error) => {
        if (error.status === 404) return null;
        throw error;
      }),
    ]);
  };
  await load();

  function draw() {
    if (main.dataset.route !== "recipes") return;
    main.innerHTML = `
      <header class="recipes-hero">
        <h1>${t("recipes.title")}</h1>
        <p class="lead">${recipes.length ? esc(plural("recipes.count", recipes.length)) : t("recipes.empty")}</p>
        <div class="row-form">
          <button class="primary" type="button" data-new>${t("recipes.new")}</button>
          <label class="button photo-button">${t("recipes.from-photo")}<input class="visually-hidden" type="file" accept="image/jpeg,image/png,image/webp" data-photo></label>
        </div>
      </header>
      <div class="bento recipes-bento">
        ${planTile(plan)}
        <div class="w-5 stack">
          <section class="tile" aria-labelledby="saved-title">
            <h2 id="saved-title">${t("recipes.saved")}</h2>
            ${recipes.length ? `<ul class="list">${recipes.map((recipe) => recipeRow(recipe, false)).join("")}</ul>` : `<p class="hint">${t("recipes.empty-hint")}</p>`}
          </section>
          ${
            templates.length
              ? `<section class="tile" aria-labelledby="templates-title">
                  <h2 id="templates-title">${t("recipes.templates")}</h2>
                  <ul class="list">${templates.map((recipe) => recipeRow(recipe, true)).join("")}</ul>
                </section>`
              : ""
          }
        </div>
      </div>`;
    wireSteppers(main);
  }

  const refresh = () => swap(main, async () => {
    await load();
    draw();
  });
  const find = (id) => recipes.find((recipe) => recipe.id === id) ?? templates.find((recipe) => recipe.id === id);
  const signal = page.signal;

  main.addEventListener(
    "click",
    (event) => {
      const button = event.target.closest("button");
      if (!button) return;
      if (button.matches("[data-new]")) openCreate(base, refresh);
      else if (button.dataset.evaluate) openEvaluate(base, find(button.dataset.evaluate));
      else if (button.dataset.change) {
        if (!recipes.length) return toast(t("recipes.empty-hint"));
        openChange(base, plan.entries.find((entry) => entry.id === button.dataset.change), recipes, refresh);
      } else if (button.dataset.clone)
        busy(button, async () => {
          try {
            const copy = await api(`${base}/recipes/${button.dataset.clone}/clone`, { method: "POST" });
            toast(t("recipes.toast-cloned", { recipe: recipeName(copy.name) }));
            refresh();
          } catch (error) {
            toast(error.message);
          }
        });
      else if (button.matches("[data-plan-market]"))
        busy(button, async () => {
          try {
            const added = (await api(`${base}/market-list/from-plan`, { method: "POST" })).filter((item) => Number(item.addedGrams) > 0).length;
            toast(added ? plural("market.toast-plan", added) : t("market.plan-covered"));
          } catch (error) {
            toast(error.status === 404 ? t("market.no-plan") : error.message);
          }
        });
      else if (button.matches("[data-clone-plan]"))
        busy(button, async () => {
          try {
            const copy = await api(`${base}/weekly-plans/${plan.id}/clone`, { method: "POST", body: { weekStart: after(plan.weekEnd) } });
            toast(t("recipes.toast-plan-cloned", { from: formatDay(copy.weekStart) }));
          } catch (error) {
            toast(error.message);
          }
        });
    },
    { signal },
  );

  main.addEventListener(
    "submit",
    (event) => {
      if (!event.target.matches("[data-generate]")) return;
      event.preventDefault();
      const form = event.target;
      busy(form.querySelector("button[type=submit]"), async () => {
        try {
          await api(`${base}/weekly-plans`, { method: "POST", body: { servings: Number(formData(form).servings) } });
          toast(t("recipes.toast-generated"));
          refresh();
        } catch (error) {
          showError(form, error);
        }
      });
    },
    { signal },
  );

  main.addEventListener(
    "change",
    (event) => {
      const input = event.target.closest("[data-photo]");
      const file = input?.files[0];
      if (!file) return;
      const label = input.closest("label");
      label.setAttribute("aria-busy", "true");
      toast(t("recipes.photo-reading"));
      readPhoto(base, file)
        .then((draft) => openDraft(base, draft, refresh), (error) => toast(error.message))
        .finally(() => {
          label.removeAttribute("aria-busy");
          input.value = "";
        });
    },
    { signal },
  );

  draw();
}
