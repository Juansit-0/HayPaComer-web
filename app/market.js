import { api } from "./api.js";
import { foodName, formatMoney, plural, t } from "./i18n.js";
import { easing, page, reduced, token } from "./motion.js";
import {
  esc,
  foodOptions,
  formData,
  grams,
  kpi,
  moneyField,
  moneyValue,
  numberField,
  showError,
  swap,
  ticker,
  toast,
  wireFoodSearch,
  wireSteppers,
} from "./ui.js";

function perKilo(line, currency) {
  if (line?.estimatedCost === null || line?.estimatedCost === undefined || !Number(line.grams)) return "";
  return t("market.per-kilo", {
    price: formatMoney((Number(line.estimatedCost) / Number(line.grams)) * 1000, currency),
  });
}

function row(item, bought, line, currency) {
  return `<li class="market-row ${bought ? "bought" : ""}" data-key="${esc(item.id)}">
    <label class="check">
      <input type="checkbox" id="check-${esc(item.id)}" data-check="${esc(item.id)}" ${bought ? "checked" : ""}>
      <svg class="tick" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7"/></svg>
      <span class="item-name">${esc(foodName(item.food))}</span>
    </label>
    <span class="market-amount"><span class="data">${grams(item.grams)}</span>${
      line?.estimatedCost !== null && line?.estimatedCost !== undefined
        ? `<span class="hint">${formatMoney(line.estimatedCost, currency)}</span><span class="hint">${perKilo(line, currency)}</span>`
        : ""
    }${
      item.source === "PLAN" || item.source === "RECIPE"
        ? `<span class="status quiet">${item.source === "PLAN" ? t("market.from-plan") : t("market.from-recipe")}</span>`
        : ""
    }</span>
    <span class="item-actions"><button class="icon-button" type="button" data-remove="${esc(item.id)}" aria-label="${esc(t("market.remove-food", { food: foodName(item.food) }))}"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></span>
  </li>`;
}

function budgetRing(spent, planned, monthly) {
  const r = 52;
  const length = 2 * Math.PI * r;
  const part = (value) => (monthly > 0 ? Math.min(1, Math.max(0, value / monthly)) : 0);
  const arc = (kind, from, size) =>
    `<circle class="ring ${kind}" data-ring="${kind}" cx="64" cy="64" r="${r}" style="--len:${length.toFixed(1)};--to:${(length * (1 - size)).toFixed(1)};rotate:${(from * 360).toFixed(1)}deg"/>`;
  return `<svg class="budget-ring" viewBox="0 0 128 128" aria-hidden="true"><circle class="ring-bg" cx="64" cy="64" r="${r}"/>${arc("spent", 0, part(spent))}${arc("planned", part(spent), part(planned))}</svg>`;
}

function budgetTile(budget, currency) {
  if (!budget) {
    return `<section class="tile" aria-labelledby="budget-title">
      <h2 id="budget-title">${t("market.budget")}</h2>
      <p class="hint">${t("market.budget-hint")}</p>
      <form class="stack" data-budget>
        ${moneyField({ name: "monthly", label: t("market.budget"), currency })}
        <button class="primary" type="submit">${t("market.set-budget")}</button>
      </form>
    </section>`;
  }
  const monthly = Number(budget.monthly);
  const spent = Number(budget.spent);
  const planned = Number(budget.plannedCost);
  const remaining = Number(budget.remaining);
  const over = budget.lines.filter((line) => line.estimatedCost !== null && !line.withinBudget);
  return `<section class="tile budget-tile" aria-labelledby="budget-title">
    <h2 id="budget-title">${t("market.budget")}</h2>
    <div class="budget-head">${budgetRing(spent, planned, monthly)}${kpi(formatMoney(remaining, budget.currency), t("market.left"), remaining > 0 ? "positive" : "attention")}</div>
    <dl class="budget-figures">
      <div><dt><span class="key spent"></span>${t("market.spent")}</dt><dd class="data">${formatMoney(spent, budget.currency)}</dd></div>
      <div><dt><span class="key planned"></span>${t("market.planned")}</dt><dd class="data">${formatMoney(planned, budget.currency)}</dd></div>
      <div><dt>${t("market.monthly")}</dt><dd class="data">${formatMoney(monthly, budget.currency)}</dd></div>
    </dl>
    ${
      over.length
        ? `<ul class="list cheaper-list">${over
            .map(
              (line) => `<li>
                <span class="item-name">${esc(t("market.does-not-fit", { food: foodName(line.food), cost: formatMoney(line.estimatedCost, budget.currency) }))}</span>
                ${
                  line.cheaper
                    ? `<span class="status">${esc(t("market.cheaper", { food: foodName(line.cheaper.food), grams: grams(line.cheaper.grams), cost: formatMoney(line.cheaper.estimatedCost, budget.currency) }))}</span>`
                    : ""
                }
              </li>`,
            )
            .join("")}</ul>`
        : `<p class="hint">${t("market.fits")}</p>`
    }
    <details>
      <summary>${t("market.change-budget")}</summary>
      <form class="stack" data-budget>
        ${moneyField({ name: "monthly", label: t("market.budget"), currency: budget.currency, value: Math.round(monthly) })}
        <button type="submit">${t("market.update-budget")}</button>
      </form>
    </details>
  </section>`;
}

// Moves an item between the aisles and the cart in the local copy, so a check shows before the server answers.
function moveLocally(list, id, bought, categories) {
  const pendingItem = list.pending.flatMap((group) => group.items).find((item) => item.id === id);
  const checkedItem = list.checked.find((item) => item.id === id);
  const item = pendingItem ?? checkedItem;
  if (!item) return;
  list.pending = list.pending.map((group) => ({ ...group, items: group.items.filter((entry) => entry.id !== id) })).filter((group) => group.items.length);
  list.checked = list.checked.filter((entry) => entry.id !== id);
  if (bought === null) return;
  if (bought) {
    list.checked.push(item);
    return;
  }
  const category = categories.get(id) ?? item.category ?? "OTHER";
  const group = list.pending.find((entry) => entry.category === category);
  if (group) group.items.push(item);
  else list.pending.push({ category, items: [item] });
}

export async function renderMarket(main, household) {
  const base = `/households/${household.id}/market-list`;
  let list;
  let budget;
  const categories = new Map();
  const shown = new Map();
  const load = async () => {
    [list, budget] = await Promise.all([api(base), api(`/households/${household.id}/market-budget`).catch(() => null)]);
    list.pending.forEach((group) => group.items.forEach((item) => categories.set(item.id, group.category)));
  };
  await load();

  function draw() {
  const pending = list.pending.reduce((sum, group) => sum + group.items.length, 0);
  const currency = budget?.currency ?? household.currency ?? "COP";
  const lines = new Map((budget?.lines ?? []).map((line) => [line.itemId, line]));
  const first = !main.querySelector(".market-bento");

  main.innerHTML = `
    <header class="market-hero">
      <h1 id="market-title">${t("market.title")}</h1>
      <p class="lead">${pending ? plural("market.pending", pending) : t("market.empty")}</p>
      ${budget ? `<p class="hero-figure"><span class="data" data-remaining></span><span>${t("market.left")}</span></p>` : ""}
    </header>    <div class="bento market-bento">
      <section class="tile w-7 notepad" aria-labelledby="aisles-title">
        <h2 id="aisles-title">${t("market.aisles")}</h2>
        ${
          list.pending.length
            ? list.pending
                .map(
                  (group) => `<div class="market-group">
                    <h3>${t(`category.${group.category}`)}</h3>
                    <ul class="list">${group.items.map((item) => row(item, false, lines.get(item.id), currency)).join("")}</ul>
                  </div>`,
                )
                .join("")
            : `<figure class="market-empty">
                <img src="/brand/photos/tomate-de-arbol.jpg" alt="" loading="lazy" width="900" height="1125">
                <figcaption><span>${t("market.empty")}</span><small>${esc(t("photo.credit", { credit: "michael clarke stuff, CC BY-SA 2.0" }))}</small></figcaption>
              </figure>`
        }
        <h3 id="add-title" class="notepad-add">${t("market.add-title")}</h3>
        <form class="row-form market-add" data-add aria-labelledby="add-title">
          <label class="grow">${t("field.food")}<input name="food" list="market-foods" required autocomplete="off" placeholder="${esc(t("market.food-example"))}"></label>
          ${numberField({ name: "grams", label: t("field.grams"), unit: "g", min: 1, bigStep: 250, value: 500 })}
          ${foodOptions("market-foods")}
          <button class="primary" type="submit">${t("market.add")}</button>
        </form>
        <button type="button" data-plan>${t("market.add-plan")}</button>
      </section>
      <div class="w-5 stack">
      ${budgetTile(budget, currency)}
      ${
        list.checked.length
          ? `<section class="tile" aria-labelledby="bought-title">
              <header><h2 id="bought-title">${t("market.cart")}</h2><button class="ghost" type="button" data-clear>${t("market.clear")}</button></header>
              <ul class="list">${list.checked.map((item) => row(item, true, lines.get(item.id), currency)).join("")}</ul>
            </section>`
          : ""
      }
      </div>
    </div>`;

  wireSteppers(main);
  const remaining = main.querySelector("[data-remaining]");
  if (remaining) ticker(remaining, formatMoney(Number(budget.remaining), budget.currency));
  main.querySelectorAll("[data-ring]").forEach((circle) => {
    const to = circle.style.getPropertyValue("--to");
    const from = shown.get(circle.dataset.ring);
    shown.set(circle.dataset.ring, to);
    if (first || from === undefined || from === to) return;
    circle.style.animation = "none";
    if (!reduced()) circle.animate([{ strokeDashoffset: from }, { strokeDashoffset: to }], { duration: token("duration-shutter"), easing: easing("ease-emphasized") });
  });
  main.querySelectorAll("[data-budget]").forEach((budgetForm) =>
    budgetForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const monthly = moneyValue(formData(budgetForm).monthly);
      if (!monthly) {
        showError(budgetForm, { message: t("market.budget-missing") });
        return;
      }
      try {
        await api(`/households/${household.id}/market-budget`, { method: "PUT", body: { monthly } });
        toast(t("market.toast-budget"));
        refresh();
      } catch (error) {
        showError(budgetForm, error);
      }
    }),
  );

  const add = main.querySelector("[data-add]");
  wireFoodSearch(add.querySelector("[name=food]"), api);
  add.addEventListener("submit", async (event) => {
    event.preventDefault();
    const values = formData(add);
    try {
      await api(`${base}/items`, { method: "POST", body: { food: values.food, grams: Number(values.grams) } });
      toast(t("market.toast-added", { food: foodName(values.food) }));
      refresh();
    } catch (error) {
      showError(add, error);
    }
  });

  main.querySelector("[data-plan]").addEventListener("click", async () => {
    try {
      const delta = await api(`${base}/from-plan`, { method: "POST" });
      const added = delta.filter((item) => Number(item.addedGrams) > 0).length;
      toast(added ? plural("market.toast-plan", added) : t("market.plan-covered"));
      refresh();
    } catch (error) {
      toast(error.status === 404 ? t("market.no-plan") : error.message);
    }
  });

  main.querySelector("[data-clear]")?.addEventListener("click", async () => {
    await api(`${base}/checked`, { method: "DELETE" });
    toast(t("market.toast-cleared"));
    refresh();
  });
  }

  const refresh = () => swap(main, async () => {
    await load();
    draw();
  });

  // Optimistic: the row moves at once; if the server says no, it moves back and the error is shown.
  async function optimistic(id, bought, request) {
    const before = structuredClone(list);
    if (bought && !reduced()) await new Promise((resolve) => setTimeout(resolve, token("duration-slow") + 120));
    moveLocally(list, id, bought, categories);
    await swap(main, draw);
    try {
      await request();
      refresh();
    } catch (error) {
      list = before;
      await swap(main, draw);
      toast(error.message);
    }
  }

  const signal = page.signal;
  main.addEventListener(
    "change",
    (event) => {
      const box = event.target.closest("[data-check]");
      if (box) optimistic(box.dataset.check, box.checked, () => api(`${base}/items/${box.dataset.check}/check`, { method: box.checked ? "POST" : "DELETE" }));
    },
    { signal },
  );
  main.addEventListener(
    "click",
    (event) => {
      const button = event.target.closest("[data-remove]");
      if (button) optimistic(button.dataset.remove, null, () => api(`${base}/items/${button.dataset.remove}`, { method: "DELETE" }));
    },
    { signal },
  );

  draw();
}
