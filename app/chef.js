import { art } from "./art/drawings.js";
import { api } from "./api.js";
import { currentLocale, foodName, foodWord, locales, plural, recipeName, t, theFood } from "./i18n.js";
import { candidate, dishCard, kitchenRecipes } from "./now.js";
import { highlightFoods, shapeClass } from "./stage.js";
import { daysLeft, esc, grams, toast, whenText } from "./ui.js";
import { easing, page, reduced, token } from "./motion.js";
import { commandOf, defaultLanguage, listen, speak, speechSupported, voiceSupported } from "./voice.js";

const state = { conversationId: null, messages: [], lang: null, handsFree: false, recognition: null, dishes: null, recipes: null, offered: new Set(), shown: null };

// A module outlives a sign-out, and one person's chat must never reach the next.
window.addEventListener("hpc:signed-out", () => Object.assign(state, { conversationId: null, messages: [], dishes: null, recipes: null, offered: new Set(), shown: null }));

const arrive = (element) => element?.animate([{ opacity: 0, translate: "0 var(--rise)" }, { opacity: 1, translate: "0 0" }], { duration: token("duration-slow"), easing: easing("ease-emphasized") });
const scrollBehavior = () => (reduced() ? "auto" : "smooth");
const TOOLS = ["query_inventory", "view_expiries", "view_market_list", "view_cold_chain", "view_weekly_plan", "recall_memory", "review_budget", "investigate_cold", "waste_patterns"];
const SOON_DAYS = 2;

function voiceLanguage() {
  return state.lang ?? (currentLocale().startsWith("es") ? "es-CO" : currentLocale().startsWith("en") ? "en-US" : defaultLanguage());
}

const SPECIALISTS = { chef: "chef.specialist.chef", market: "chef.specialist.market", cold: "chef.specialist.cold", coach: "chef.specialist.coach" };

function spoken(answer) {
  return answer.replace(/^Offline answer based on measured data:\s*/i, "").replace(/\b[a-z_]+: /g, "");
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
    .map((reply, choice) => `<button type="button" class="chip-button${reply.main ? " primary" : ""}" data-reply="${index}:${choice}">${esc(reply.label)}</button>`)
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
  const options = [
    { label: t("chef.offer.yes"), action: "cook", dish, main: true },
    { label: t("chef.offer.other"), action: "other" },
  ];
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
    <p class="step-text">${step ? esc(step.instruction) : ready ? t("chef.ready") : t("chef.all-done")}</p>
    <div class="row-form">
      <button class="primary" type="button" data-cook="next">${ready ? t("chef.begin") : t("chef.next")}</button>
      <button type="button" data-cook="${session.phase === "PAUSED" ? "resume" : "pause"}">${session.phase === "PAUSED" ? t("chef.resume") : t("chef.pause")}</button>
      <button type="button" data-cook="repeat">${t("chef.read-aloud")}</button>
    </div>
    <p class="hint">${t("chef.voice-hint")}</p>
  </article>`;
}

// What the Chef asks to do, said in the person's language from the tool and its arguments; the server's English summary only as a fallback.
export function confirmationText(pending) {
  const args = pending.arguments ?? {};
  if (pending.tool === "add_to_market" && args.food) return t("chef.confirm.add_to_market", { grams: grams(Number(args.grams) || 0), food: foodWord(args.food) });
  if (pending.tool === "remember" && args.subject) return t("chef.confirm.remember", { subject: args.subject, value: args.value ?? "" });
  return pending.summary;
}

function confirmations(list) {
  if (!list.length) return "";
  return `<section class="tile" aria-labelledby="confirm-title">
    <h2 id="confirm-title">${t("chef.waiting")}</h2>
    <ul class="list">${list
      .map(
        (pending) => `<li data-pending><span class="item-name">${esc(confirmationText(pending))}</span>
          <span class="item-actions"><button class="primary" type="button" data-approve="${esc(pending.id)}" data-hold aria-describedby="hold-hint">${t("chef.approve")}</button><button type="button" data-reject="${esc(pending.id)}">${t("chef.reject")}</button></span></li>`,
      )
      .join("")}</ul>
  </section>`;
}

export async function renderChef(main, household) {
  const base = `/households/${household.id}`;
  const [session, pending, listed] = await Promise.all([
    api(`${base}/cooking-sessions/active`).catch(() => null),
    api("/agent/confirmations").catch(() => []),
    api(`${base}/inventory`).catch(() => []),
  ]);
  const inventory = listed
    .map((item) => ({ ...item, days: daysLeft(item.expiresOn) }))
    .sort((a, b) => (a.days ?? Infinity) - (b.days ?? Infinity));

  const side = stepCard(session) + confirmations(pending);
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
          <button class="primary round" type="submit">${t("chef.ask")}</button>
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

  async function cook(action) {
    if (!session) return false;
    if (action === "repeat") {
      speak(session.step?.instruction ?? (session.phase === "PREPARING" ? t("chef.ready") : t("chef.all-done")), voiceLanguage());
      return true;
    }
    const updated = await api(`${base}/cooking-sessions/${session.id}/${action}`, { method: "POST" }).catch((error) => {
      toast(error.message);
      return null;
    });
    if (updated) {
      if (action === "next") speak(updated.step?.instruction ?? t("chef.last-step"), voiceLanguage());
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

  async function ask(text) {
    const command = commandOf(text);
    if (command && (await cook(command))) return;
    clearReplies();
    state.messages.push({ role: "user", text });
    input.value = "";
    const chat = main.querySelector("[data-chat]");
    chat.insertAdjacentHTML("beforeend", `${message(state.messages.at(-1))}<li class="answer typing" aria-label="${esc(t("chef.thinking"))}"><span></span><span></span><span></span></li>`);
    state.shown = state.messages.length;
    arrive(chat.lastElementChild.previousElementSibling);
    chat.lastElementChild.scrollIntoView({ block: "nearest", behavior: scrollBehavior() });
    try {
      const reply = await api(`${base}/agent/chat`, {
        method: "POST",
        body: { message: text, conversationId: state.conversationId },
      });
      state.conversationId = reply.conversationId;
      const foods = mentioned(reply.answer, inventory);
      const cooking = reply.runs?.some((run) => run.specialist === "chef");
      const dishes = cooking ? await dishesWith(foods) : [];
      // A run that only proposes a change answers with its English summary; say it in the person's language instead.
      const pending = reply.confirmation;
      const said = pending && /^Waiting for your confirmation/.test(reply.answer) ? t("chef.confirm.ask", { what: confirmationText(pending) }) : reply.answer;
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
    // Only the new answer is added: the typing dots give way to it and it is written in from the top, the rest of the screen stays put.
    const typing = chat.querySelector(".typing");
    if (!typing || !document.body.contains(chat)) return;
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
          const done = reply.pending?.tool === "add_to_market" && args.food ? t("chef.offer.added", { foods: t("chef.offer.missing-item", { grams: grams(Number(args.grams) || 0), food: foodWord(args.food) }) }) : result.result;
          if (row) settle(row, done, true);
          say({ role: "assistant", text: done, runs: [], replies: followUps([{ specialist: "market" }]) });
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
      state.messages.push({ role: "assistant", text: t("chef.offer.started", { recipe: recipeName(dish.recipe), step: started.step?.instruction ?? "" }).trim(), runs: [{ specialist: "chef" }] });
      if (state.handsFree || mic.getAttribute("aria-pressed") === "true") speak(started.step?.instruction ?? "", voiceLanguage());
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
    state.recognition = listen({
      lang: voiceLanguage(),
      continuous,
      onText: (text) => ask(text.trim()),
      onState: (now) => {
        mic.setAttribute("aria-pressed", String(now === "listening"));
        mic.textContent = now === "listening" ? t("chef.listening") : t("chef.speak");
        if (now === "blocked") toast(t("chef.mic-blocked"));
      },
    });
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

  main.querySelector("[data-lang]").addEventListener("change", (event) => {
    state.lang = event.target.value;
  });

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
        const result = await api(`/agent/confirmations/${button.dataset.approve}/approve`, { method: "POST" });
        settle(button, result.result, true);
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
