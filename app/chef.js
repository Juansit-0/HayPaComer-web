import { art } from "./art/drawings.js";
import { api } from "./api.js";
import { currentLocale, foodName, foodWord, formatDay, formatMoney, formatTime, locales, placeName, plural, recipeName, stepText, t, theFood } from "./i18n.js";
import { candidate, dishCard, kitchenRecipes } from "./now.js";
import { highlightFoods, shapeClass } from "./stage.js";
import { busy, daysLeft, esc, formData, grams, showError, toast, whenText } from "./ui.js";
import { easing, page, reduced, token } from "./motion.js";
import { commandOf, defaultLanguage, listen, speak, speechSupported, voiceSupported } from "./voice.js";

const state = { busy: false, currency: "COP", cooking: false, restored: false, conversationId: null, messages: [], lang: null, handsFree: false, recognition: null, dishes: null, recipes: null, offered: new Set(), shown: null, leftover: null };

// A module outlives a sign-out, and one person's chat must never reach the next.
window.addEventListener("hpc:signed-out", () => Object.assign(state, { restored: false, conversationId: null, messages: [], dishes: null, recipes: null, offered: new Set(), shown: null, leftover: null }));

const arrive = (element) => element?.animate([{ opacity: 0, translate: "0 var(--rise)" }, { opacity: 1, translate: "0 0" }], { duration: token("duration-slow"), easing: easing("ease-emphasized") });
const scrollBehavior = () => (reduced() ? "auto" : "smooth");
const TOOLS = ["query_inventory", "view_expiries", "view_market_list", "view_cold_chain", "view_weekly_plan", "recall_memory", "review_budget", "investigate_cold", "waste_patterns"];
const SOON_DAYS = 2;

function voiceLanguage() {
  return state.lang ?? (currentLocale().startsWith("es") ? "es-CO" : currentLocale().startsWith("en") ? "en-US" : defaultLanguage());
}

const SPECIALISTS = { chef: "chef.specialist.chef", market: "chef.specialist.market", cold: "chef.specialist.cold", coach: "chef.specialist.coach" };

// With no AI the agent only reads, and its answer is a raw list of what it read: that list stays under "checked", and the person gets this.
function offlineText(answer) {
  if (/^(Offline answer based on measured data|Respuesta sin IA con los datos medidos)/.test(answer)) return t("chef.offline-answer");
  if (/^(No evidence available right now|Ahora no hay datos disponibles)/.test(answer)) return t("chef.offline-none");
  return localized(answer);
}

const G = "([\\d.]+) g";
const gm = (value) => grams(Number(value));
const known = (key, fallback) => (t(key) === key ? fallback : t(key));
const when = (iso) => (iso.length > 10 ? `${formatDay(iso.slice(0, 10))} ${formatTime(iso)}` : formatDay(iso));
const statusText = (list) => list.split(", ").map((status) => known(`status.${status.toLowerCase().replace(/_/g, "-")}`, status)).join(", ");
const food = (name) => foodWord(name);

// The agent's tools answer in English unless the server already translated them; each rule rebuilds one English sentence in the person's language. Unknown lines pass through.
const RULES = [
  [new RegExp(`^Used ${G} of (.+); ${G} left$`), "chef.r.used", (m) => ({ grams: gm(m[1]), food: food(m[2]), left: gm(m[3]) })],
  [/^Undid the last change: (.+) at (\S+)$/, "chef.r.undid", (m) => ({ what: known(`chef.r.reason.${m[1].replace(/ /g, "_")}`, m[1]), when: when(m[2]) })],
  [new RegExp(`^Added ${G} of (.+) to the market list; ${G} pending in total$`), "chef.r.market-added-total", (m) => ({ grams: gm(m[1]), food: food(m[2]), total: gm(m[3]) })],
  [new RegExp(`^Added ${G} of (.+) to the market list$`), "chef.r.market-added", (m) => ({ grams: gm(m[1]), food: food(m[2]) })],
  [new RegExp(`^Removed ${G} of (.+) from the market list$`), "chef.r.market-removed", (m) => ({ grams: gm(m[1]), food: food(m[2]) })],
  [new RegExp(`^Marked ${G} of (.+) as bought$`), "chef.r.market-bought", (m) => ({ grams: gm(m[1]), food: food(m[2]) })],
  [new RegExp(`^Put ${G} of (.+) back on the market list$`), "chef.r.market-back", (m) => ({ grams: gm(m[1]), food: food(m[2]) })],
  [/^Cleared (\d+) bought foods from the cart$/, "chef.r.cart-cleared", (m) => ({ n: m[1] })],
  [/^Marked (.+) as opened; now expires (\S+)$/, "chef.r.opened-expires", (m) => ({ food: food(m[1]), date: when(m[2]) })],
  [/^Marked (.+) as opened$/, "chef.r.opened", (m) => ({ food: food(m[1]) })],
  [/^Monthly market budget set to (\d+)$/, "chef.r.budget-set", (m) => ({ amount: formatMoney(m[1], state.currency) })],
  [new RegExp(`^Threw away ${G} of (.+)$`), "chef.r.threw", (m) => ({ grams: gm(m[1]), food: food(m[2]) })],
  [new RegExp(`^Stocked ${G} of (.+) in (.+?); expires (\\S+)$`), "chef.r.stocked-expires", (m) => ({ grams: gm(m[1]), food: food(m[2]), place: placeName(m[3]), date: when(m[4]) })],
  [new RegExp(`^Stocked ${G} of (.+) in (.+)$`), "chef.r.stocked", (m) => ({ grams: gm(m[1]), food: food(m[2]), place: placeName(m[3]) })],
  [/^(Started )?(.+) for (\d+), ([A-Z]+)(?:, (\d+) steps; next starts step 1|, step (\d+) of (\d+): (.*?)(?: \(timer (\d+) min\))?)?$/, (m) => {
    const head = t("chef.r.session", { recipe: recipeName(m[2]), n: m[3], phase: known(`chef.phase.${m[4]}`, m[4]) });
    const body = m[5] ? t("chef.r.session-prepare", { head, steps: m[5] }) : m[6] ? t("chef.r.session-step", { head, step: m[6], steps: m[7], text: stepText(m[8]) }) + (m[9] ? t("chef.r.session-timer", { min: m[9] }) : "") : head;
    return m[1] ? t("chef.r.started", { what: body }) : body;
  }],
  [/^Nothing was changed: (.+)$/, (m) => t("chef.r.nothing", { reason: localized(m[1]) })],
  [/^No cooking session is active; start a recipe first$/, "chef.r.no-session-start", () => ({})],
  [/^No cooking session is active$/, "chef.r.no-session", () => ({})],
  [/^(.+) is not on the market list$/, "chef.r.not-on-list", (m) => ({ food: food(m[1]) })],
  [/^(.+) is not pending on the market list$/, "chef.r.not-pending", (m) => ({ food: food(m[1]) })],
  [/^(.+) is not in the cart$/, "chef.r.not-in-cart", (m) => ({ food: food(m[1]) })],
  [/^The cart is already empty$/, "chef.r.cart-empty", () => ({})],
  [/^Unknown food (.+); use a catalog name$/, "chef.r.unknown-food", (m) => ({ food: m[1] })],
  [/^No (.+) in stock$/, "chef.r.no-stock", (m) => ({ food: food(m[1]) })],
  [new RegExp(`^Only ${G} of (.+) in one piece; use at most that$`), "chef.r.only", (m) => ({ grams: gm(m[1]), food: food(m[2]) })],
  [/^No saved recipe called (.+); no recipes are saved yet$/, "chef.r.no-recipe-none", (m) => ({ name: m[1] })],
  [/^No saved recipe called (.+); saved recipes: (.+)$/, "chef.r.no-recipe-list", (m) => ({ name: m[1], list: m[2].split(", ").map(recipeName).join(", ") })],
  [/^No recipes are saved yet; save one before planning the week$/, "chef.r.no-recipes-plan", () => ({})],
  [/^No recipes are saved yet; save one to get suggestions$/, "chef.r.no-recipes-suggest", () => ({})],
  [/^No recipes are saved yet$/, "chef.r.no-recipes", () => ({})],
  [/^No plan for this week; make the weekly plan first$/, "chef.r.no-plan-make", () => ({})],
  [/^No plan for this week$/, "chef.r.no-plan", () => ({})],
  [/^The household has no fridge yet$/, "chef.r.no-fridge", () => ({})],
  [/^No place called (.+); places: (.+)$/, "chef.r.no-place", (m) => ({ name: m[1], places: m[2] })],
  [/^No saved recipe fits the stock right now$/, "chef.r.no-fit", () => ({})],
  [/^No food found$/, "chef.r.no-food", () => ({})],
  [/^No temperature readings yet$/, "chef.r.no-temperature", () => ({})],
  [/^No temperature readings in the last (\d+) h$/, "chef.r.no-temperature-hours", (m) => ({ n: m[1] })],
  [/^No monthly market budget yet$/, "chef.r.no-budget", () => ({})],
  [/^No fridge to investigate$/, "chef.r.no-fridge-investigate", () => ({})],
  [/^The stock at home covers the plan; nothing added$/, "chef.r.plan-covered", () => ({})],
  [/^Nothing is missing for (.+)$/, "chef.r.nothing-missing", (m) => ({ recipe: recipeName(m[1]) })],
  [/^No food was thrown away twice in the last (\d+) days$/, "chef.r.no-waste", (m) => ({ n: m[1] })],
  [/^Private food \(not yours to use\)$/, "chef.r.private", () => ({})],
  [/^\.\.\. (\d+) more$/, "chef.r.more", (m) => ({ n: m[1] })],
  [/^(.+): (\d+) servings, (\d+) min$/, "chef.r.recipe-line", (m) => ({ recipe: recipeName(m[1]), n: m[2], min: m[3] })],
  [/^Budget (\d+) (\w+), spent (\d+), left (-?\d+), the list in budget costs (\d+)$/, "chef.r.budget", (m) => ({ monthly: formatMoney(m[1], m[2]), spent: formatMoney(m[3], m[2]), left: formatMoney(m[4], m[2]), cost: formatMoney(m[5], m[2]) })],
  [new RegExp(`^(.+?) ${G}(?:, expires (\\d{4}-\\d\\d-\\d\\d))?(?:, \\[([A-Z_, ]+)\\])?(, not edible)?$`), (m) => [`${foodName(m[1])} ${gm(m[2])}`, m[3] && t("chef.r.expires", { date: when(m[3]) }), m[4] && statusText(m[4]), m[5] && t("chef.r.not-edible")].filter(Boolean).join(", ")],
];

function localizedLine(line) {
  for (const [pattern, key, params] of RULES) {
    const match = pattern.exec(line);
    if (match) return typeof key === "function" ? key(match) : t(key, params(match));
  }
  return line;
}

function localized(text) {
  return String(text ?? "").split("\n").map(localizedLine).join("\n");
}

function spoken(answer) {
  return answer.replace(/^(Offline answer based on measured data|Respuesta sin IA con los datos medidos):\s*/i, "").replace(/\b[a-z_]+: /g, "");
}

function formatted(text) {
  return esc(text).replace(/\*\*(.+?)\*\*|\n/g, (match, bold) => (bold ? `<b>${bold}</b>` : "<br>"));
}

function checked(evidence) {
  const tools = [...new Set(evidence.map((item) => item.tool))];
  return tools.map((tool) => (TOOLS.includes(tool) ? t(`chef.tool.${tool}`) : tool)).join(", ");
}

// Questions the Chef asks come with their answers as buttons: what to cook, what is missing, a change to confirm, or what to ask next.
const FOLLOW_UPS = { chef: ["chef.follow.quick", "chef.follow.expiring"], market: ["chef.follow.buy", "chef.follow.budget"], cold: ["chef.follow.cold"], coach: ["chef.follow.coach"] };

function followUps(runs) {
  const keys = [...new Set((runs ?? []).flatMap((run) => FOLLOW_UPS[run.specialist] ?? []))];
  return (keys.length ? keys : FOLLOW_UPS.chef).slice(0, 3).map((key) => ({ label: t(key), action: "ask", text: t(key) }));
}

function replies(entry, index) {
  if (!entry.replies?.length) return "";
  return `<div class="quick-replies" role="group" aria-label="${esc(t("chef.replies"))}">${entry.replies
    .map((reply, choice) => `<button type="button" class="chip-button${reply.main ? " primary" : ""}" data-reply="${index}:${choice}"${reply.action === "approve" ? ' data-hold aria-describedby="hold-hint"' : ""}>${esc(reply.label)}</button>`)
    .join("")}</div>`;
}

function message(entry, index) {
  if (entry.role === "user") return `<li class="said"><span class="who">${t("chef.you")}</span><p>${esc(entry.text)}</p></li>`;
  const runs = (entry.runs || []).map((run) => (SPECIALISTS[run.specialist] ? t(SPECIALISTS[run.specialist]) : run.specialist)).join(", ");
  return `<li class="answer" data-message="${index}">
    <span class="who">${esc(runs || t("chef.kitchen"))}</span>
    <p>${formatted(entry.text)}</p>
    ${entry.dishes?.length ? `<div class="chef-dishes">${entry.dishes.map(dishCard).join("")}</div>` : ""}
    ${
      entry.evidence?.length
        ? `<details class="evidence"><summary>${esc(t("chef.checked", { what: checked(entry.evidence) }))}</summary><ul>${entry.evidence
            .map((item) => `<li>${esc(item.content)}</li>`)
            .join("")}</ul></details>`
        : ""
    }
    ${replies(entry, index)}
  </li>`;
}

// The same foods the server adds to the market: everything mandatory that falls short.
const missingOf = (dish) => dish.evaluation.requirements.filter((requirement) => !requirement.optional && Number(requirement.shortfallGrams) > 0);

function offer(dish) {
  state.offered.add(dish.recipe);
  const options = [...(state.cooking ? [] : [{ label: t("chef.offer.yes"), action: "cook", dish, main: true }]), { label: t("chef.offer.other"), action: "other" }];
  if (missingOf(dish).length) options.push({ label: t("chef.offer.missing"), action: "missing", dish });
  return { role: "assistant", text: t("chef.offer.cook", { recipe: recipeName(dish.recipe) }), runs: [{ specialist: "chef" }], dishes: [dish], replies: options };
}

function mentioned(text, inventory) {
  const said = text.toLowerCase();
  return inventory.filter((item) => said.includes(foodName(item.name).toLowerCase()) || said.includes(item.name.toLowerCase())).map((item) => item.name);
}

function sees(inventory) {
  const usable = inventory.filter((item) => item.usable);
  const soon = usable.filter((item) => item.days !== null && SOON_DAYS >= item.days);
  return `<section class="chef-sees" aria-labelledby="sees-title">
    <h2 id="sees-title">${t("chef.sees.title")}</h2>
    ${usable.length ? "" : art("pot")}
    <p class="lead">${usable.length ? `${plural("chef.sees.foods", usable.length)} ${soon.length ? plural("chef.sees.soon", soon.length) : t("chef.sees.calm")}` : t("chef.sees.empty")}</p>
    <ul class="sees-list">${usable
      .slice(0, 6)
      .map(
        (item) => `<li class="${item.days !== null && SOON_DAYS >= item.days ? "soon" : ""}"><span class="food ${shapeClass(item.name)}" aria-hidden="true"></span><span class="item-name">${esc(foodName(item.name))}</span><span class="data">${grams(item.grams)}</span>${
          item.expiresOn ? `<span class="sees-when">${esc(whenText(item.expiresOn))}</span>` : ""
        }</li>`,
      )
      .join("")}</ul>
  </section>`;
}

function prompts(inventory) {
  const first = inventory.find((item) => item.usable && item.days !== null && SOON_DAYS >= item.days);
  return [first ? t("chef.prompt.use", { food: theFood(first.name) }) : t("chef.prompt.first"), t("chef.prompt.dinner"), t("chef.prompt.buy")];
}

function stepCard(session) {
  if (!session) return "";
  const step = session.step;
  const ready = session.phase === "PREPARING";
  return `<article class="tile cooking" aria-label="${esc(t("chef.cooking", { recipe: recipeName(session.recipe) }))}">
    <p class="cooking-step">${ready ? t("chef.steps-ready", { total: session.totalSteps }) : t("chef.step-of", { step: session.currentStep, total: session.totalSteps })}</p>
    <div class="item-meta"><span class="item-name">${esc(recipeName(session.recipe))}</span><span class="status">${esc(t(`chef.phase.${session.phase}`))}</span></div>
    <p class="step-text">${step ? esc(stepText(step.instruction)) : ready ? t("chef.ready") : t("chef.all-done")}</p>
    ${step?.timerSeconds ? `<p class="cooking-timer" role="timer" aria-label="${esc(t("chef.timer"))}" data-timer></p>` : ""}
    ${
      step?.weighFood
        ? `<form class="row-form" data-weigh="${step.position}">
            <label>${esc(t("chef.weigh-target", { grams: grams(step.weighGrams), food: foodName(step.weighFood) }))}<input class="grams" name="grams" type="number" inputmode="decimal" min="0" step="any" required value="${session.measuredGrams ?? ""}"></label>
            <button type="submit">${t("chef.weigh")}</button>
          </form>`
        : ""
    }
    <div class="row-form">
      <button class="primary" type="button" data-cook="next">${ready ? t("chef.begin") : t("chef.next")}</button>
      ${ready ? "" : `<button type="button" data-cook="${session.phase === "PAUSED" ? "resume" : "pause"}">${session.phase === "PAUSED" ? t("chef.resume") : t("chef.pause")}</button>`}
      <button type="button" data-cook="repeat">${t("chef.read-aloud")}</button>
      <button type="button" class="ghost" data-cook="abandon">${t("chef.abandon")}</button>
    </div>
    <p class="hint">${t("chef.voice-hint")}</p>
  </article>`;
}

function leftoverCard(recipe) {
  if (!recipe) return "";
  return `<section class="tile" aria-labelledby="leftover-title">
    <h2 id="leftover-title">${esc(t("chef.leftover.title", { recipe: recipeName(recipe) }))}</h2>
    <p>${t("chef.leftover.lead")}</p>
    <div class="row-form">
      <button class="primary" type="button" data-leftover="save">${t("chef.leftover.save")}</button>
      <button type="button" class="ghost" data-leftover="none">${t("chef.leftover.none")}</button>
    </div>
  </section>`;
}

// What the Chef asks to do, said in the person's language from the tool and its arguments; the server's English summary only as a fallback.
const amount = (args) => grams(Number(args.grams) || 0);
const CONFIRMATIONS = {
  add_to_market: (args) => args.food && t("chef.confirm.add_to_market", { grams: amount(args), food: foodWord(args.food) }),
  remember: (args) => args.subject && t("chef.confirm.remember", { subject: args.subject, value: args.value ?? "" }),
  stock_food: (args) => args.food && t("chef.confirm.stock_food", { grams: amount(args), food: foodWord(args.food), place: args.place ? placeName(args.place) : t("chef.confirm.place-default") }),
  use_food: (args) => args.food && t("chef.confirm.use_food", { grams: amount(args), food: foodWord(args.food) }),
  discard_food: (args) => args.food && t("chef.confirm.discard_food", { food: foodWord(args.food) }),
  mark_opened: (args) => args.food && t("chef.confirm.mark_opened", { food: foodWord(args.food) }),
  undo_last_change: () => t("chef.confirm.undo_last_change"),
  update_market: (args) => args.food && ["check", "uncheck", "remove"].includes(String(args.action).toLowerCase()) && t(`chef.confirm.update_market.${String(args.action).toLowerCase()}`, { food: foodWord(args.food) }),
  clear_checked_market: () => t("chef.confirm.clear_checked_market"),
  set_market_budget: (args) => Number(args.amount) > 0 && t("chef.confirm.set_market_budget", { amount: formatMoney(Number(args.amount), state.currency) }),
  missing_to_market: (args) => args.recipe && Number(args.servings) > 0 && plural("chef.confirm.missing_to_market", Number(args.servings), { recipe: recipeName(args.recipe) }),
  plan_to_market: () => t("chef.confirm.plan_to_market"),
  start_cooking: (args) => args.recipe && Number(args.servings) > 0 && plural("chef.confirm.start_cooking", Number(args.servings), { recipe: recipeName(args.recipe) }),
  cooking_step: (args) => ["next", "pause", "resume", "abandon"].includes(String(args.action).toLowerCase()) && t(`chef.confirm.cooking_step.${String(args.action).toLowerCase()}`),
  generate_week_plan: (args) => Number(args.servings) > 0 && plural("chef.confirm.generate_week_plan", Number(args.servings)),
};
const COOKING_TOOLS = new Set(["start_cooking", "cooking_step"]);

export function confirmationText(pending) {
  return CONFIRMATIONS[pending.tool]?.(pending.arguments ?? {}) || pending.summary;
}

function confirmations(list) {
  if (!list.length) return "";
  return `<section class="tile" aria-labelledby="confirm-title">
    <h2 id="confirm-title">${t("chef.waiting")}</h2>
    <ul class="list">${list
      .map(
        (pending) => `<li data-pending data-tool="${esc(pending.tool)}"><span class="item-name">${esc(confirmationText(pending))}</span>
          <span class="item-actions"><button class="primary" type="button" data-approve="${esc(pending.id)}" data-hold aria-describedby="hold-hint">${t("chef.approve")}</button><button type="button" data-reject="${esc(pending.id)}">${t("chef.reject")}</button></span></li>`,
      )
      .join("")}</ul>
  </section>`;
}

// The server keeps the time; this only counts down between its answers, and stops by itself when the card is gone.
async function runTimer(box, read) {
  const status = await read().catch(() => null);
  if (!status || !box.isConnected) return;
  let left = status.remainingSeconds;
  const show = () => {
    box.textContent = 0 >= left ? t("chef.timer-done") : `${String(Math.floor(left / 60)).padStart(2, "0")}:${String(left % 60).padStart(2, "0")}`;
  };
  show();
  if (status.paused) return;
  const ticking = setInterval(() => {
    left -= 1;
    if (!box.isConnected || 0 >= left) clearInterval(ticking);
    if (box.isConnected) show();
  }, 1000);
}

// The server keeps the conversation, so a reload picks it up where it was.
async function restoreChat(household) {
  if (state.restored === household.id) return;
  Object.assign(state, { restored: household.id, conversationId: null, messages: [], dishes: null, recipes: null, offered: new Set(), shown: null });
  const conversations = `/households/${household.id}/agent/conversations`;
  const [latest] = await api(conversations).catch(() => []);
  if (!latest) return;
  const messages = await api(`${conversations}/${latest.id}`).catch(() => []);
  state.conversationId = latest.id;
  state.messages = messages.map((entry) => ({ role: entry.role === "USER" ? "user" : "assistant", text: offlineText(entry.text), runs: [] }));
}

const withDays = (listed) => listed.map((item) => ({ ...item, days: daysLeft(item.expiresOn) })).sort((a, b) => (a.days ?? Infinity) - (b.days ?? Infinity));

export async function renderChef(main, household) {
  await restoreChat(household);
  state.currency = household.currency ?? "COP";
  const base = `/households/${household.id}`;
  const [session, pending, listed] = await Promise.all([
    api(`${base}/cooking-sessions/active`).catch(() => null),
    api("/agent/confirmations").then((list) => list.filter((pending) => pending.householdId === household.id), () => []),
    api(`${base}/inventory`).catch(() => []),
  ]);
  const inventory = withDays(listed);

  state.cooking = Boolean(session);
  if (session) state.leftover = null;
  const side = stepCard(session) + leftoverCard(state.leftover) + confirmations(pending);
  if (main.dataset.route !== "chef") return;
  main.innerHTML = `
    <header>
      <h1 id="chef-title">${t("chef.title")}</h1>
      <p class="lead">${t("chef.lead")}</p>
    </header>
    ${side ? `<div class="chef-side">${side}</div>` : ""}
    ${sees(inventory)}
    <section class="chef-tile" aria-labelledby="chef-title">
        <ol class="chat" aria-live="polite" data-chat>${state.messages.map((entry, index) => message(entry, index)).join("")}</ol>
        ${
          state.messages.length
            ? ""
            : `<div class="prompts">${prompts(inventory)
                .map((text) => `<button type="button" class="chip-button" data-prompt="${esc(text)}">${esc(text)}</button>`)
                .join("")}</div>`
        }
        <form class="ask" data-ask>
          <label class="grow"><span class="visually-hidden">${t("chef.question")}</span><input name="message" autocomplete="off" maxlength="1000" required placeholder="${esc(t("chef.question-example"))}"></label>
          <button class="round" type="button" data-mic aria-pressed="false" aria-label="${esc(t("chef.speak"))}" ${voiceSupported ? "" : "disabled"}>${t("chef.speak")}</button>
          <button class="primary round" type="submit" ${state.busy ? 'disabled aria-busy="true"' : ""}>${t("chef.ask")}</button>
        </form>
        <details class="voice-options">
          <summary>${t("chef.voice")}</summary>
          <div class="row-form">
          <label class="check"><input type="checkbox" data-hands-free ${state.handsFree ? "checked" : ""} ${voiceSupported ? "" : "disabled"}> ${t("chef.hands-free")}</label>
          <label>${t("chef.voice-language")}<select data-lang>${locales()
            .map((option) => {
              const value = option.code.startsWith("en") ? "en-US" : option.code;
              return `<option value="${esc(value)}" ${voiceLanguage() === value ? "selected" : ""}>${esc(option.name)}</option>`;
            })
            .join("")}</select></label>
          </div>
          ${voiceSupported ? "" : `<p class="hint">${t("chef.no-voice")}</p>`}
        </details>
    </section>`;

  const form = main.querySelector("[data-ask]");
  const input = form.querySelector("[name=message]");
  // The ask bar floats over the bottom of the screen: a new answer stops above it, with its buttons in sight.
  const roomForAsk = () => main.style.setProperty("--ask-space", `${form.offsetHeight + (parseFloat(getComputedStyle(form).bottom) || 0) + 16}px`);
  roomForAsk();
  addEventListener("resize", roomForAsk);
  page.defer(() => removeEventListener("resize", roomForAsk));
  const mic = main.querySelector("[data-mic]");

  const timer = main.querySelector("[data-timer]");
  if (timer) runTimer(timer, () => api(`${base}/cooking-sessions/${session.id}/timer`));
  main.querySelector("[data-weigh]")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    await busy(form.querySelector("button[type=submit]"), async () => {
      try {
        const weighed = await api(`${base}/cooking-sessions/${session.id}/steps/${form.dataset.weigh}/weigh`, { method: "POST", body: { grams: Number(formData(form).grams) } });
        toast(t(`chef.weigh-status.${weighed.status}`, { grams: grams(weighed.remainingGrams) }));
        await renderChef(main, household);
      } catch (error) {
        showError(form, error);
      }
    });
  });

  async function cook(action) {
    if (!session) return false;
    if (action === "repeat") {
      speak(stepText(session.step?.instruction) ?? (session.phase === "PREPARING" ? t("chef.ready") : t("chef.all-done")), voiceLanguage());
      return true;
    }
    const updated = await api(`${base}/cooking-sessions/${session.id}/${action}`, { method: "POST" }).catch((error) => {
      toast(error.message);
      return null;
    });
    if (updated) {
      if (updated.phase === "FINISHED") state.leftover = session.recipe;
      if (action === "next") speak(stepText(updated.step?.instruction) ?? t("chef.last-step"), voiceLanguage());
      await renderChef(main, household);
    }
    return true;
  }

  async function dishesWith(foods) {
    try {
      state.dishes ??= await kitchenRecipes(base).then((recipes) => {
        state.recipes = recipes;
        return recipes.length ? api(`${base}/suggestions`, { method: "POST", body: { servings: 2, candidates: recipes.slice(0, 50).map(candidate) } }).then((result) => result.suggestions) : [];
      });
    } catch {
      return [];
    }
    const wanted = foods.map((food) => food.toLowerCase());
    // Once every dish was offered, the round starts again.
    if (state.dishes.every((dish) => state.offered.has(dish.recipe))) state.offered.clear();
    const fresh = state.dishes.filter((dish) => !state.offered.has(dish.recipe));
    const matching = fresh.filter((dish) => dish.evaluation.requirements.some((requirement) => wanted.includes(requirement.food.toLowerCase())));
    return (matching.length ? matching : fresh).slice(0, 1);
  }

  async function ask(text, spoken = false) {
    if (!text) return;
    // Spoken commands drive the session; typed words like "ya" or "listo" are just a message.
    const command = spoken ? commandOf(text) : null;
    if (command && (await cook(command))) return;
    if (state.busy) return;
    clearReplies();
    state.messages.push({ role: "user", text });
    input.value = "";
    const chat = main.querySelector("[data-chat]");
    chat.insertAdjacentHTML("beforeend", `${message(state.messages.at(-1))}<li class="answer typing" role="status"><span class="thinking-art">${art("pot")}</span><span class="dots" aria-hidden="true"><span></span><span></span><span></span></span><span class="thinking-text">${t("chef.thinking-now")}</span></li>`);
    state.shown = state.messages.length;
    arrive(chat.lastElementChild.previousElementSibling);
    const typing = chat.lastElementChild;
    typing.scrollIntoView({ block: "nearest", behavior: scrollBehavior() });
    // An AI answer can take a while: say so in the Chef's words, and only after a long wait say the server may be the slow one.
    const label = typing.querySelector(".thinking-text");
    const waits = [[6000, "chef.still-thinking"], [12000, "net.slow"]].map(([at, key]) => setTimeout(() => (label.textContent = t(key)), at));
    setBusy(true);
    try {
      const reply = await api(`${base}/agent/chat`, {
        method: "POST",
        body: { message: text, conversationId: state.conversationId },
        quiet: true,
      });
      state.conversationId = reply.conversationId;
      const foods = mentioned(reply.answer, inventory);
      const cooking = reply.runs?.some((run) => run.specialist === "chef");
      const dishes = cooking ? await dishesWith(foods) : [];
      // A run that only proposes a change answers with its English summary; say it in the person's language instead.
      const pending = reply.confirmation;
      const said = pending && /^(Waiting for your confirmation|Esperando tu confirmación)/.test(reply.answer) ? t("chef.confirm.ask", { what: confirmationText(pending) }) : offlineText(reply.answer);
      const options = pending
        ? [
            { label: t("chef.confirm.yes"), action: "approve", id: pending.id, pending, main: true },
            { label: t("chef.confirm.no"), action: "reject", id: pending.id },
          ]
        : dishes.length
          ? []
          : followUps(reply.runs);
      state.messages.push({ role: "assistant", text: said, runs: reply.runs, evidence: reply.evidence, foods, dishes: [], replies: options });
      if (dishes.length) state.followUp = offer(dishes[0]);
      if (state.handsFree || mic.getAttribute("aria-pressed") === "true") speak(spoken(said), voiceLanguage());
    } catch (error) {
      state.messages.push({ role: "assistant", text: error.message, runs: [] });
    }
    waits.forEach(clearTimeout);
    setBusy(false);
    // Only the new answer is added: the thinking row gives way to it and it is written in from the top, the rest of the screen stays put.
    if (!typing.isConnected) return;
    typing.outerHTML = message(state.messages.at(-1), state.messages.length - 1);
    const answer = chat.lastElementChild;
    state.shown = state.messages.length;
    if (!reduced()) answer.classList.add("fresh");
    highlightFoods(state.messages.at(-1).foods ?? []);
    (answer.querySelector(".quick-replies") ?? answer).scrollIntoView({ block: "nearest", behavior: scrollBehavior() });
    if (state.followUp) {
      const next = state.followUp;
      state.followUp = null;
      say(next);
    }
  }

  // One question at a time: the send button rests while the Chef answers, and the field stays free for the next one.
  function setBusy(on) {
    state.busy = on;
    const send = main.querySelector("[data-ask] [type=submit]");
    if (!send) return;
    send.disabled = on;
    if (on) send.setAttribute("aria-busy", "true");
    else send.removeAttribute("aria-busy");
  }

  // What an approved change touched: the stage and other screens hear of it, and the Chef's side shows the new stock or session.
  async function refreshAfter(tool) {
    window.dispatchEvent(new CustomEvent("hpc:inventory-changed"));
    if (COOKING_TOOLS.has(tool)) return renderChef(main, household);
    const listed = await api(`${base}/inventory`).catch(() => null);
    const box = main.querySelector(".chef-sees");
    if (listed && box) box.outerHTML = sees(withDays(listed));
  }

  // Older buttons go once the talk moves on, except a change still waiting for its yes or no.
  function clearReplies() {
    state.messages.forEach((earlier, index) => {
      if (!earlier.replies?.length || earlier.replies.some((reply) => reply.action === "approve")) return;
      earlier.replies = [];
      main.querySelector(`[data-message="${index}"] .quick-replies`)?.remove();
    });
  }

  function say(entry) {
    const chat = main.querySelector("[data-chat]");
    if (!chat) return;
    clearReplies();
    state.messages.push(entry);
    chat.insertAdjacentHTML("beforeend", message(entry, state.messages.length - 1));
    state.shown = state.messages.length;
    const added = chat.lastElementChild;
    if (!reduced()) added.classList.add("fresh");
    (added.querySelector(".quick-replies") ?? added).scrollIntoView({ block: "nearest", behavior: scrollBehavior() });
    if (entry.role === "assistant" && (state.handsFree || mic.getAttribute("aria-pressed") === "true")) speak(spoken(entry.text), voiceLanguage());
  }

  const recipeFor = (name) => state.recipes?.find((recipe) => recipe.name === name);

  async function choose(reply) {
    if (reply.action === "ask") return ask(reply.text);
    say({ role: "user", text: reply.label });
    if (reply.action === "go") {
      location.hash = reply.href;
      return;
    }
    if (reply.action === "approve" || reply.action === "reject") {
      const entry = state.messages.find((earlier) => earlier.replies?.some((option) => option.id === reply.id));
      if (entry) {
        main.querySelector(`[data-message="${state.messages.indexOf(entry)}"] .quick-replies`)?.remove();
        entry.replies = [];
      }
      const row = main.querySelector(`[data-approve="${CSS.escape(reply.id)}"]`);
      if (reply.action === "approve") {
        try {
          const result = await api(`/agent/confirmations/${reply.id}/approve`, { method: "POST" });
          const args = reply.pending?.arguments ?? {};
          const done = reply.pending?.tool === "add_to_market" && args.food ? t("chef.offer.added", { foods: t("chef.offer.missing-item", { grams: grams(Number(args.grams) || 0), food: foodWord(args.food) }) }) : localized(result.result);
          if (row) settle(row, done, true);
          say({ role: "assistant", text: done, runs: [], replies: followUps([{ specialist: "market" }]) });
          refreshAfter(reply.pending?.tool);
        } catch (error) {
          say({ role: "assistant", text: error.message, runs: [] });
        }
      } else {
        await api(`/agent/confirmations/${reply.id}/reject`, { method: "POST" }).catch(() => null);
        if (row) settle(row, t("chef.nothing-changed"), false);
        say({ role: "assistant", text: t("chef.nothing-changed"), runs: [], replies: followUps([{ specialist: "chef" }]) });
      }
      return;
    }
    if (reply.action === "other") {
      const next = (state.dishes ?? []).find((dish) => !state.offered.has(dish.recipe));
      say(next ? offer(next) : { role: "assistant", text: t("chef.offer.no-more"), runs: [{ specialist: "chef" }], replies: followUps([{ specialist: "chef" }]) });
      return;
    }
    const dish = reply.dish;
    const recipe = recipeFor(dish.recipe);
    if (reply.action === "missing") {
      const missing = missingOf(dish);
      say({
        role: "assistant",
        text: t("chef.offer.missing-list", { recipe: recipeName(dish.recipe), foods: missing.map((requirement) => t("chef.offer.missing-item", { grams: grams(Number(requirement.shortfallGrams)), food: foodWord(requirement.food) })).join(", ") }),
        runs: [{ specialist: "market" }],
        replies: [
          { label: t("chef.offer.add"), action: "add-missing", dish, main: true },
          { label: t("chef.offer.no"), action: "decline" },
        ],
      });
      return;
    }
    if (reply.action === "decline") {
      say({ role: "assistant", text: t("chef.nothing-changed"), runs: [], replies: followUps([{ specialist: "chef" }]) });
      return;
    }
    if (!recipe) {
      say({ role: "assistant", text: t("error.generic"), runs: [] });
      return;
    }
    const body = { ...candidate(recipe), targetServings: dish.evaluation.requestedServings || 2 };
    if (reply.action === "add-missing") {
      try {
        const added = (await api(`${base}/recipes/missing-to-market`, { method: "POST", body })).filter((item) => Number(item.addedGrams) > 0);
        say({
          role: "assistant",
          text: added.length ? t("chef.offer.added", { foods: added.map((item) => t("chef.offer.missing-item", { grams: grams(Number(item.addedGrams)), food: foodWord(item.food) })).join(", ") }) : t("chef.offer.already"),
          runs: [{ specialist: "market" }],
          replies: [
            { label: t("chef.offer.see-market"), action: "go", href: "#/market" },
            { label: t("chef.offer.yes"), action: "cook", dish, main: true },
          ],
        });
      } catch (error) {
        say({ role: "assistant", text: error.message, runs: [] });
      }
      return;
    }
    try {
      const started = await api(`${base}/cooking-sessions`, { method: "POST", body: { name: body.name, servings: body.servings, minutes: body.minutes, requirements: body.requirements, steps: body.steps, targetServings: body.targetServings } });
      state.messages.push({ role: "assistant", text: t("chef.offer.started", { recipe: recipeName(dish.recipe), step: stepText(started.step?.instruction) ?? "" }).trim(), runs: [{ specialist: "chef" }] });
      if (state.handsFree || mic.getAttribute("aria-pressed") === "true") speak(stepText(started.step?.instruction) ?? "", voiceLanguage());
      await renderChef(main, household);
      main.querySelector(".tile.cooking")?.scrollIntoView({ block: "center", behavior: scrollBehavior() });
    } catch (error) {
      say({ role: "assistant", text: error.message, runs: [] });
    }
  }

  main.querySelectorAll("[data-prompt]").forEach((button) => button.addEventListener("click", () => ask(button.dataset.prompt)));

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    ask(input.value.trim());
  });

  function startListening(continuous) {
    state.recognition?.stop();
    const recognition = listen({
      lang: voiceLanguage(),
      continuous,
      onText: (text) => ask(text.trim(), true),
      onState: (now) => {
        mic.setAttribute("aria-pressed", String(now === "listening"));
        mic.textContent = now === "listening" ? t("chef.listening") : t("chef.speak");
        if (now === "blocked") {
          toast(t("chef.mic-blocked"));
          state.handsFree = false;
          const toggle = main.querySelector("[data-hands-free]");
          if (toggle) toggle.checked = false;
        }
        // Browsers end listening after a silence; hands-free carries on until it is turned off.
        const goesOn = () => now === "idle" && state.handsFree && state.recognition === recognition && main.dataset.route === "chef";
        if (goesOn()) setTimeout(() => goesOn() && startListening(true), 400);
      },
    });
    state.recognition = recognition;
  }

  mic.addEventListener("click", () => {
    if (mic.getAttribute("aria-pressed") === "true") {
      state.recognition?.stop();
      return;
    }
    startListening(false);
  });

  main.querySelector("[data-hands-free]").addEventListener("change", (event) => {
    state.handsFree = event.target.checked;
    if (state.handsFree) startListening(true);
    else state.recognition?.stop();
  });

  if (state.handsFree && voiceSupported) startListening(true);

  main.querySelector("[data-lang]").addEventListener("change", (event) => {
    state.lang = event.target.value;
  });

  main.querySelectorAll("[data-leftover]").forEach((button) =>
    button.addEventListener("click", async () => {
      const done = () => {
        state.leftover = null;
        return renderChef(main, household);
      };
      if (button.dataset.leftover === "none") return done();
      const { openAddFood } = await import("./fridge.js");
      openAddFood(household, { food: "Leftovers", onDone: done });
    }),
  );
  main.querySelectorAll(".cooking [data-cook]").forEach((button) => button.addEventListener("click", () => cook(button.dataset.cook)));
  main.querySelector("[data-chat]").addEventListener("click", (event) => {
    const dish = event.target.closest(".dish-card [data-cook]");
    if (dish) return ask(t("chef.how-to", { recipe: recipeName(dish.dataset.cook) }));
    const button = event.target.closest("[data-reply]");
    if (!button) return;
    const [index, choice] = button.dataset.reply.split(":").map(Number);
    const reply = state.messages[index]?.replies?.[choice];
    if (!reply) return;
    button.closest(".quick-replies").querySelectorAll("button").forEach((other) => (other.disabled = true));
    choose(reply);
  });
  highlightFoods(state.messages.findLast((entry) => entry.role === "assistant")?.foods ?? []);

  // An answered confirmation keeps its place as a quiet line saying what happened, so the list still reads as a history.
  function settle(target, text, done) {
    const row = target.closest("[data-pending]");
    row.classList.add("resolved", done ? "done" : "declined");
    row.innerHTML = `<p class="resolved-line"><span class="item-name">${row.querySelector(".item-name").innerHTML}</span><span>${esc(text)}</span></p>`;
    if (!reduced()) arrive(row);
  }
  main.querySelectorAll("[data-approve]").forEach((button) =>
    button.addEventListener("click", async () => {
      try {
        await api(`/agent/confirmations/${button.dataset.approve}/approve`, { method: "POST" });
        settle(button, t("chef.done"), true);
        refreshAfter(button.closest("[data-pending]").dataset.tool);
      } catch (error) {
        toast(error.message);
      }
    }),
  );

  main.querySelectorAll("[data-reject]").forEach((button) =>
    button.addEventListener("click", async () => {
      await api(`/agent/confirmations/${button.dataset.reject}/reject`, { method: "POST" }).catch(() => null);
      settle(button, t("chef.nothing-changed"), false);
    }),
  );

  const chat = main.querySelector("[data-chat]");
  const grew = state.shown !== null && state.messages.length > state.shown;
  if (grew) arrive(chat.lastElementChild);
  state.shown = state.messages.length;
  chat.lastElementChild?.scrollIntoView({ block: "nearest", behavior: grew ? scrollBehavior() : "auto" });
  let wanted = null;
  try {
    wanted = sessionStorage.getItem("hpc.chef.cook");
    sessionStorage.removeItem("hpc.chef.cook");
  } catch {
    wanted = null;
  }
  if (wanted) ask(t("chef.how-to", { recipe: recipeName(wanted) }));

  if (session && navigator.wakeLock) {
    const lock = navigator.wakeLock.request("screen").catch(() => null);
    page.defer(() => lock.then((held) => held?.release()));
  }

  if (state.handsFree && !state.recognition) startListening(true);
  if (!speechSupported) state.handsFree = false;
}
