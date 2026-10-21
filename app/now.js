import { api } from "./api.js";
import { dishPicture } from "./dishes.js";
import { liveFeed } from "./live.js";
import { foodName, formatTime, plural, recipeName, t } from "./i18n.js";
import { busy, esc, expiryText, grams, kpi, numberField, showError, statusPill, toast, wireSteppers } from "./ui.js";

const URGENT = ["EXPIRED", "UNDER_REVIEW", "AT_RISK", "LEFTOVER"];
const LABELS = { inventory: "live.kind.inventory", sensor: "live.kind.sensor", alert: "live.kind.alert", copilot: "live.kind.copilot" };
const ACTIONS = { STOCK_FOOD: "live.action.stock", CONSUME_FOOD: "live.action.consume", DISCARD_FOOD: "live.action.discard" };
const DISHES = 3;
const sentence = (text) => {
  const stock = text.match(/^([A-Z_]+) ([\d.]+) g left$/);
  if (stock) return t("live.stock-left", { action: t(ACTIONS[stock[1]] ?? "live.action.other"), grams: grams(stock[2]) });
  return text.charAt(0).toUpperCase() + text.slice(1).replace(/ C$/, " °C");
};

export function candidate(recipe) {
  return {
    name: recipe.name,
    servings: recipe.servings,
    minutes: recipe.minutes,
    requirements: recipe.requirements.map((requirement) => ({
      food: requirement.food,
      grams: requirement.grams,
      optional: requirement.optional,
    })),
    steps: recipe.steps.map((step) => ({
      instruction: step.instruction,
      timerSeconds: step.timerSeconds,
      weigh: step.weighFood ? { food: step.weighFood, grams: step.weighGrams } : null,
    })),
  };
}

const list = (foods) => foods.map((food) => esc(foodName(food))).join(", ");

export function dishCard(dish, index) {
  const requirements = dish.evaluation.requirements;
  const used = requirements.filter((requirement) => requirement.verdict === "ENOUGH" && Number(requirement.availableGrams) > 0);
  const swaps = requirements.filter((requirement) => requirement.substitute);
  const missing = requirements.filter((requirement) => !requirement.substitute && Number(requirement.shortfallGrams) > 0);
  return `<article class="dish-card" style="--i:${index}">
    ${dishPicture(dish.recipe, requirements.map((requirement) => requirement.food))}
    <div class="dish-body">
      <h2>${esc(recipeName(dish.recipe))}</h2>
      <p class="dish-meta">
        <span class="data">${esc(t("now.dish.minutes", { n: dish.minutes }))}</span>
        <span>${plural("now.servings", dish.evaluation.requestedServings)}</span>
        ${
          dish.evaluation.verdict === "ENOUGH"
            ? `<span class="status">${t("verdict.ENOUGH")}</span>`
            : `<span class="status attention">${esc(t(`verdict.${dish.evaluation.verdict}`))}</span>`
        }
      </p>
      ${dish.rescuedFoods?.length ? `<p class="dish-rescue">${esc(t("now.dish.rescues", { foods: dish.rescuedFoods.map(foodName).join(", ") }))}</p>` : ""}
      <p class="dish-foods">${[
        used.length ? esc(t("now.dish.uses", { foods: used.map((requirement) => foodName(requirement.food)).join(", ") })) : "",
        ...swaps.map((requirement) => esc(t("now.dish.swap", { from: foodName(requirement.food), to: foodName(requirement.substitute) }))),
        missing.length ? `<span class="missing">${missing.map((requirement) => esc(t("now.missing-food", { food: foodName(requirement.food) }))).join(", ")}</span>` : "",
      ]
        .filter(Boolean)
        .join(". ")}</p>
      <button class="primary" type="button" data-cook="${esc(dish.recipe)}">${t("now.dish.cook")}</button>
    </div>
  </article>`;
}

function skeletonCards() {
  return Array.from(
    { length: DISHES },
    (_, index) => `<div class="dish-card skel" style="--i:${index}" aria-hidden="true"><span class="skel-photo"></span><span class="skel-line big"></span><span class="skel-line mid"></span></div>`,
  ).join("");
}

function todayCard(item) {
  return `<li class="today-card">
    <span class="today-grams">${grams(item.grams)}</span>
    <span class="item-name">${esc(foodName(item.name))}</span>
    <span class="item-meta">${statusPill(item.statuses)}<span>${expiryText(item)}</span></span>
    <form class="today-use" data-consume="${esc(item.id)}">
      <label class="visually-hidden" for="use-${esc(item.id)}">${esc(t("now.grams-used"))}</label>
      <input id="use-${esc(item.id)}" class="grams" name="grams" type="number" inputmode="numeric" min="1" step="1" required value="${Math.round(item.grams)}">
      <button type="submit">${t("now.mark-used")}</button>
    </form>
  </li>`;
}

export async function kitchenRecipes(base) {
  const [saved, templates] = await Promise.all([api(`${base}/recipes`), api("/recipe-templates").catch(() => [])]);
  const known = new Set(saved.map((recipe) => recipe.name.trim().toLowerCase()));
  return [...saved, ...templates.filter((recipe) => !known.has(recipe.name.trim().toLowerCase()))];
}

export async function renderNow(main, household) {
  const base = `/households/${household.id}`;
  const [snapshot, inventory, recipes] = await Promise.all([
    api(`${base}/kitchen`),
    api(`${base}/inventory?rescueFirst=true`),
    kitchenRecipes(base),
  ]);
  const urgent = inventory.filter((item) => item.usable && item.statuses.some((status) => URGENT.includes(status)));

  main.innerHTML = `
    <header class="now-hero">
      <h1 id="now-title">${t("now.question")}</h1>
      <p class="lead" data-answer>${recipes.length ? t("now.answer.loading") : t("now.cook-empty")}</p>
    </header>

    ${
      recipes.length
        ? `<section class="dish-row" aria-labelledby="now-title" data-dishes aria-busy="true">${skeletonCards()}</section>
          <details class="adjust">
            <summary>${t("now.adjust")}</summary>
            <form class="row-form" data-suggest>
              ${numberField({ name: "servings", label: t("now.people"), value: 2, min: 1, max: 20 })}
              ${numberField({ name: "maxMinutes", label: t("now.max-minutes"), unit: "min", min: 1, bigStep: 10, required: false })}
              <button type="submit">${t("now.find")}</button>
            </form>
          </details>`
        : ""
    }

    <section class="today" aria-labelledby="today-title">
      <h2 id="today-title">${t("now.today")}</h2>
      ${urgent.length ? `<ul class="today-list">${urgent.map(todayCard).join("")}</ul>` : `<p class="lead">${t("now.today-empty")}</p>`}
    </section>

    <section class="summary-row" aria-labelledby="summary-title">
      <h2 id="summary-title">${t("now.summary")}</h2>
      <div class="summary-figures">
        ${kpi(grams(snapshot.totalGrams), t("now.kpi.measured"))}
        ${kpi(String(snapshot.items), t("now.kpi.items"))}
        ${kpi(String(snapshot.atRisk), t("now.kpi.at-risk"), snapshot.atRisk ? "attention" : "")}
        ${kpi(String(snapshot.expired), t("now.kpi.expired"), snapshot.expired ? "attention" : "")}
      </div>
    </section>

    <section class="tile feed-tile" aria-labelledby="live-title">
      <header><h2 id="live-title">${t("now.live")}</h2></header>
      <p class="hint">${t("now.live-hint")}</p>
      <ul class="list feed" data-feed aria-live="polite"></ul>
    </section>`;
  wireSteppers(main);

  const feed = main.querySelector("[data-feed]");
  const drawFeed = () => {
    const events = liveFeed();
    feed.innerHTML = events.length
      ? events
          .map(
            (event) => `<li>
              <div class="item-meta"><span class="status ${event.kind === "alert" ? "attention" : "quiet"}">${esc(LABELS[event.kind] ? t(LABELS[event.kind]) : event.kind)}</span><span>${esc(sentence(event.detail))}</span></div>
              <time class="data" datetime="${esc(event.at)}">${formatTime(event.at)}</time>
            </li>`,
          )
          .join("")
      : `<li><span class="lead">${t("now.live-empty")}</span></li>`;
  };
  drawFeed();
  const onLive = () => {
    if (!document.body.contains(feed)) {
      window.removeEventListener("hpc:live", onLive);
      return;
    }
    drawFeed();
  };
  window.addEventListener("hpc:live", onLive);

  main.querySelectorAll("[data-consume]").forEach((form) =>
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const item = urgent.find((entry) => entry.id === form.dataset.consume);
      const amount = Number(new FormData(form).get("grams"));
      try {
        await busy(event.submitter ?? form.querySelector("button"), () =>
          api(`${base}/items/${item.id}/consume`, { method: "POST", body: { grams: amount } }),
        );
        toast(t("now.toast-used", { grams: grams(amount), food: foodName(item.name) }));
        renderNow(main, household);
      } catch (error) {
        showError(form, error);
      }
    }),
  );

  const box = main.querySelector("[data-dishes]");
  const answer = main.querySelector("[data-answer]");
  const suggest = async (servings, maxMinutes) => {
    box.setAttribute("aria-busy", "true");
    box.innerHTML = skeletonCards();
    try {
      const result = await api(`${base}/suggestions`, {
        method: "POST",
        body: { servings, maxMinutes, candidates: recipes.slice(0, 50).map(candidate) },
      });
      const dishes = result.suggestions.slice(0, DISHES);
      answer.textContent = dishes.length ? plural("now.answer", dishes.length) : t("now.answer.none");
      box.innerHTML = dishes.length ? dishes.map(dishCard).join("") : "";
      box.querySelectorAll("[data-cook]").forEach((button) =>
        button.addEventListener("click", () => {
          try {
            sessionStorage.setItem("hpc.chef.cook", button.dataset.cook);
          } catch {
            /* the chef screen simply opens without a preselected dish */
          }
          location.hash = "#/chef";
        }),
      );
    } catch (error) {
      box.innerHTML = "";
      answer.textContent = t("now.answer.none");
      showError(box, error);
    } finally {
      box.setAttribute("aria-busy", "false");
    }
  };

  if (box) {
    suggest(2, null);
    main.querySelector("[data-suggest]").addEventListener("submit", (event) => {
      event.preventDefault();
      const values = new FormData(event.target);
      suggest(Number(values.get("servings")), values.get("maxMinutes") ? Number(values.get("maxMinutes")) : null);
    });
  }
}
