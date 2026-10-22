import { formatMoney, formatNumber, t } from "./i18n.js";
import { esc, ticker } from "./ui.js";
import { animate, easing, inView, page, reduced, scroll, SPRINGS, token } from "./motion.js";
import { mountStory, storyMarkup } from "./story.js";
import { createInkCursor } from "./story/ink-cursor.js";

const PRICE_PER_KG = 9750;
const RESCUED_SHARE = 0.5;
const WEEKS_PER_MONTH = 4.3;
const STAGES = ["weigh", "know", "warn", "cook"];
const WORDMARK = "HayPaComer";

const STAGE_SCENES = { weigh: "scale", know: "fridge", warn: "door", cook: "plate" };

function kitPart(key, vignette) {
  return `<li class="kit-part kit-${key}" style="--i:${["door", "probe", "brain", "scale"].indexOf(key)}">
    <span class="kit-medallion" aria-hidden="true"><img src="/app/stills/${vignette}.webp" alt="" width="960" height="960" loading="lazy"></span>
    <span class="kit-text"><b>${t(`landing.kit.${key}`)}</b><span>${t(`landing.kit.${key}-text`)}</span></span>
  </li>`;
}

function stageFragment(stage) {
  const fragments = {
    weigh: `<span class="ui-label">${t("landing.ui.scale")}</span><b class="ui-figure">842 g</b><span class="status">${t("landing.ui.stable")}</span>`,
    know: `<span class="ui-label">${t("landing.ui.chicken")}</span><b class="ui-figure">842 g</b><span class="status attention">${t("landing.ui.expires")}</span>`,
    warn: `<span class="ui-label">${t("now.today")}</span><b class="ui-figure">80 g</b><span>${t("landing.ui.chicken")}</span>`,
    cook: `<span class="ui-label">${t("landing.ui.dish")}</span><b class="ui-figure">${t("now.dish.minutes", { n: 35 })}</b><span class="status">${t("verdict.ENOUGH")}</span>`,
  };
  return fragments[stage];
}

// Each letter in its own span so the title can rise letter by letter; words stay unbroken.
function letters(text) {
  let index = 0;
  return text
    .split(" ")
    .map((word) => `<span class="title-word">${[...word].map((letter) => `<span style="--i:${index++}">${esc(letter)}</span>`).join("")}</span>`)
    .join(" ");
}

function monthly(kilos) {
  return kilos * RESCUED_SHARE * WEEKS_PER_MONTH * PRICE_PER_KG;
}

export function renderLanding(main) {
  main.innerHTML = `
    <div class="landing">
      ${storyMarkup()}

      <section class="chapter chapter-papa land-hero" id="land-answer" aria-labelledby="land-title" data-reveal>
        <div class="land-hero-text">
          <h2 id="land-title" tabindex="-1"><span class="visually-hidden">${t("now.question")}</span><span class="title-letters" aria-hidden="true">${letters(t("now.question"))}</span></h2>
          <p class="land-lead">${t("landing.lead")}</p>
          <div class="land-actions">
            <a class="button primary" href="#/register">${t("auth.create-account")}</a>
            <a class="button" href="#/signin">${t("auth.signin")}</a>
          </div>
        </div>
        <figure class="land-vignette" aria-hidden="true" data-reveal>
          <img src="/app/stills/fridge.webp" alt="" width="768" height="960" loading="lazy">
          <span class="land-label l1">842 g</span><span class="land-label l2">${t("landing.ui.expires")}</span><span class="land-label l3">4,2 °C</span>
        </figure>
      </section>

      <section class="chapter chapter-cilantro land-kit" aria-labelledby="kit-title">
        <h2 id="kit-title">${t("landing.kit.title")}</h2>
        <p class="land-text">${t("landing.kit.lead")}</p>
        <ul class="kit" data-reveal>${kitPart("door", "door")}${kitPart("probe", "probe")}${kitPart("brain", "board")}${kitPart("scale", "scale")}</ul>
      </section>

      <section class="chapter chapter-arroz land-how" aria-labelledby="how-title">
        <div class="how-left">
          <h2 id="how-title">${t("landing.how.title")}</h2>
          <p class="how-clause" data-clause aria-live="polite">${t(`landing.how.${STAGES[0]}`)}</p>
        </div>
        <div class="how-right" data-reveal>
          <img class="how-scene" src="/app/stills/${STAGE_SCENES[STAGES[0]]}.webp" data-how-scene alt="" width="960" height="960" loading="lazy" aria-hidden="true">
          <div class="how-fragment" data-ui data-fragment>${stageFragment(STAGES[0])}</div>
        </div>
        <div class="how-slider">
          <label class="visually-hidden" for="how-range">${t("landing.how.title")}</label>
          <input id="how-range" type="range" min="0" max="3" step="1" value="0" data-stage-range>
          <ol class="how-names">${STAGES.map((stage, index) => `<li data-name="${index}" ${index === 0 ? 'aria-current="step"' : ""}>${t(`landing.how.${stage}-name`)}</li>`).join("")}</ol>
        </div>
      </section>

      <section class="chapter chapter-mora land-calc" aria-labelledby="calc-title">
        <h2 id="calc-title">${t("landing.calc.question")}</h2>
        <label class="calc-control" for="calc-kilos">${t("landing.calc.label")}
          <span class="calc-row"><input id="calc-kilos" type="range" min="0.5" max="10" step="0.5" value="2" data-kilos><output class="data" data-kilos-out>${formatNumber(2, 1)} kg</output></span>
        </label>
        <p class="calc-figure"><span class="data" data-money></span><span>${t("landing.calc.unit")}</span></p>
        <p class="calc-how">${t("landing.calc.how", { price: formatMoney(PRICE_PER_KG, "COP") })}</p>
      </section>

      <section class="chapter chapter-tomate land-pasto" aria-labelledby="pasto-title">
        <figure class="pasto-photo" data-reveal>
          <img src="/brand/photos/potrerillo.jpg" alt="${esc(t("landing.pasto.alt"))}" loading="lazy" width="1200" height="900">
          <figcaption>${esc(t("photo.credit", { credit: "El Potrerillo, Pasto. Υ.Γ., CC BY-SA 4.0" }))}</figcaption>
        </figure>
        <div>
          <h2 id="pasto-title">${t("landing.pasto.title")}</h2>
          <p class="land-text">${t("landing.pasto.text")}</p>
        </div>
      </section>

      <section class="chapter chapter-tinta land-cta" aria-labelledby="cta-title">
        <h2 id="cta-title">${t("landing.cta.title")}</h2>
        <p class="land-text">${t("landing.cta.text")}</p>
        <div class="land-actions">
          <a class="button primary" href="#/register">${t("auth.create-account")}</a>
          <a class="button" href="#/signin">${t("auth.signin")}</a>
        </div>
      </section>

      <footer class="chapter chapter-papa land-footer">
        <p class="land-credits">${t("landing.credits")}</p>
        <p class="land-wordmark" aria-hidden="true" data-reveal>${[...WORDMARK].map((letter, index) => `<span style="--i:${index}">${letter}</span>`).join("")}</p>
      </footer>
    </div>`;

  main.querySelectorAll("[data-reveal]").forEach((element) => {
    const stop = inView(element, () => {
      element.classList.add("shown");
      stop();
    }, { amount: 0.25 });
    page.defer(stop);
  });

  const range = main.querySelector("[data-stage-range]");
  const picture = main.querySelector("[data-how-scene]");
  let blot = null;
  const showScene = (source) => {
    blot?.finish();
    if (reduced()) {
      picture.src = source;
      return;
    }
    const next = picture.cloneNode();
    next.classList.add("how-next");
    next.src = source;
    picture.after(next);
    // An in-out curve of its own: the blot has to start slowly to read as ink spreading, which none of the tokens does.
    const grow = next.decode().catch(() => null).then(() => next.animate([{ "--blot": "0%" }, { "--blot": "340%" }], { duration: token("duration-slow") * 1.8, easing: "cubic-bezier(.45,0,.25,1)" }));
    const current = { finish: () => grow.then((animation) => animation.finish()) };
    blot = current;
    grow.then((animation) => animation.finished).finally(() => {
      picture.src = source;
      next.remove();
      if (blot === current) blot = null;
    });
  };
  range.addEventListener("input", () => {
    const stage = STAGES[Number(range.value)];
    const fragment = main.querySelector("[data-fragment]");
    fragment.innerHTML = stageFragment(stage);
    fragment.animate([{ opacity: 0, translate: "0 var(--rise)" }, { opacity: 1, translate: "0 0" }], { duration: token("duration-base"), easing: easing("ease-emphasized") });
    main.querySelector("[data-clause]").textContent = t(`landing.how.${stage}`);
    showScene(`/app/stills/${STAGE_SCENES[stage]}.webp`);
    main.querySelectorAll("[data-name]").forEach((name) => {
      if (name.dataset.name === range.value) name.setAttribute("aria-current", "step");
      else name.removeAttribute("aria-current");
    });
  });

  const kilos = main.querySelector("[data-kilos]");
  const money = main.querySelector("[data-money]");
  ticker(money, formatMoney(monthly(Number(kilos.value)), "COP"));
  kilos.addEventListener("input", () => {
    const value = Number(kilos.value);
    main.querySelector("[data-kilos-out]").textContent = `${formatNumber(value, 1)} kg`;
    ticker(money, formatMoney(monthly(value), "COP"));
  });

  mountStory(main);
  if (reduced()) return;
  if (matchMedia("(hover: hover) and (pointer: fine)").matches) {
    page.defer(createInkCursor());
    main.querySelectorAll(".land-actions .button").forEach((button) => {
      const pull = (event) => {
        const box = button.getBoundingClientRect();
        animate(button, { x: (event.clientX - box.left - box.width / 2) * 0.25, y: (event.clientY - box.top - box.height / 2) * 0.35 }, SPRINGS.snappy);
      };
      const release = () => animate(button, { x: 0, y: 0 }, SPRINGS.surface);
      button.addEventListener("pointermove", pull);
      button.addEventListener("pointerleave", release);
    });
  }
  const linked = [
    [".land-vignette img", { y: [-36, 36] }],
    [".pasto-photo img", { scale: [1.16, 1] }],
    [".kit-medallion img", { rotate: [-8, 8] }],
    [".land-wordmark", { x: ["6%", "-6%"] }],
  ];
  linked.forEach(([selector, keyframes]) =>
    main.querySelectorAll(selector).forEach((element) => {
      const target = element.closest("section, footer") ?? element;
      page.defer(scroll(animate(element, keyframes, { ease: "linear" }), { target, offset: ["start end", "end start"] }));
    }),
  );
}
