import { api } from "./api.js";
import { currentLocale, foodName, locales, plural, recipeName, t } from "./i18n.js";
import { candidate, dishCard, kitchenRecipes } from "./now.js";
import { highlightFoods, shapeClass } from "./stage.js";
import { daysLeft, esc, grams, toast, whenText } from "./ui.js";
import { easing, reduced, token } from "./motion.js";
import { commandOf, defaultLanguage, listen, speak, speechSupported, voiceSupported } from "./voice.js";

const state = { conversationId: null, messages: [], lang: null, handsFree: false, recognition: null, dishes: null, shown: null };

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

function message(entry) {
  if (entry.role === "user") return `<li class="said"><span class="who">${t("chef.you")}</span><p>${esc(entry.text)}</p></li>`;
  const runs = (entry.runs || []).map((run) => (SPECIALISTS[run.specialist] ? t(SPECIALISTS[run.specialist]) : run.specialist)).join(", ");
  return `<li class="answer">
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
  </li>`;
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
  return [first ? t("chef.prompt.use", { food: foodName(first.name).toLowerCase() }) : t("chef.prompt.first"), t("chef.prompt.dinner"), t("chef.prompt.buy")];
}

function stepCard(session) {
  if (!session) return "";
  const step = session.step;
  return `<article class="tile cooking" aria-label="${esc(t("chef.cooking", { recipe: recipeName(session.recipe) }))}">
    <p class="cooking-step">${t("chef.step-of", { step: session.currentStep, total: session.totalSteps })}</p>
    <div class="item-meta"><span class="item-name">${esc(recipeName(session.recipe))}</span><span class="status">${esc(t(`chef.phase.${session.phase}`))}</span></div>
    <p class="step-text">${step ? esc(step.instruction) : t("chef.all-done")}</p>
    <div class="row-form">
      <button class="primary" type="button" data-cook="next">${t("chef.next")}</button>
      <button type="button" data-cook="${session.phase === "PAUSED" ? "resume" : "pause"}">${session.phase === "PAUSED" ? t("chef.resume") : t("chef.pause")}</button>
      <button type="button" data-cook="repeat">${t("chef.read-aloud")}</button>
    </div>
    <p class="hint">${t("chef.voice-hint")}</p>
  </article>`;
}

function confirmations(list) {
  if (!list.length) return "";
  return `<section class="tile" aria-labelledby="confirm-title">
    <h2 id="confirm-title">${t("chef.waiting")}</h2>
    <ul class="list">${list
      .map(
        (pending) => `<li><span class="item-name">${esc(pending.summary)}</span>
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
  main.innerHTML = `
    <header>
      <h1 id="chef-title">${t("chef.title")}</h1>
      <p class="lead">${t("chef.lead")}</p>
    </header>
    ${side ? `<div class="chef-side">${side}</div>` : ""}
    ${sees(inventory)}
    <section class="chef-tile" aria-labelledby="chef-title">
        <ol class="chat" aria-live="polite" data-chat>${state.messages.map(message).join("")}</ol>
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
  const mic = main.querySelector("[data-mic]");

  async function cook(action) {
    if (!session) return false;
    if (action === "repeat") {
      speak(session.step?.instruction ?? t("chef.all-done"), voiceLanguage());
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
      state.dishes ??= await kitchenRecipes(base).then((recipes) =>
        recipes.length ? api(`${base}/suggestions`, { method: "POST", body: { servings: 2, candidates: recipes.slice(0, 50).map(candidate) } }).then((result) => result.suggestions) : [],
      );
    } catch {
      return [];
    }
    const wanted = foods.map((food) => food.toLowerCase());
    return state.dishes.filter((dish) => dish.evaluation.requirements.some((requirement) => wanted.includes(requirement.food.toLowerCase()))).slice(0, 2);
  }

  async function ask(text) {
    const command = commandOf(text);
    if (command && (await cook(command))) return;
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
      const dishes = cooking && foods.length ? await dishesWith(foods) : [];
      state.messages.push({ role: "assistant", text: reply.answer, runs: reply.runs, evidence: reply.evidence, foods, dishes });
      if (state.handsFree || mic.getAttribute("aria-pressed") === "true") speak(spoken(reply.answer), voiceLanguage());
    } catch (error) {
      state.messages.push({ role: "assistant", text: error.message, runs: [] });
    }
    await renderChef(main, household);
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
  main.querySelectorAll(".dish-card [data-cook]").forEach((button) => button.addEventListener("click", () => ask(t("chef.how-to", { recipe: recipeName(button.dataset.cook) }))));
  highlightFoods(state.messages.findLast((entry) => entry.role === "assistant")?.foods ?? []);

  main.querySelectorAll("[data-approve]").forEach((button) =>
    button.addEventListener("click", async () => {
      try {
        const result = await api(`/agent/confirmations/${button.dataset.approve}/approve`, { method: "POST" });
        toast(result.result);
      } catch (error) {
        toast(error.message);
      }
      renderChef(main, household);
    }),
  );

  main.querySelectorAll("[data-reject]").forEach((button) =>
    button.addEventListener("click", async () => {
      await api(`/agent/confirmations/${button.dataset.reject}/reject`, { method: "POST" }).catch(() => null);
      toast(t("chef.nothing-changed"));
      renderChef(main, household);
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

  if (state.handsFree && !state.recognition) startListening(true);
  if (!speechSupported) state.handsFree = false;
}
