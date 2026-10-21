import { formatMoney, formatNumber, t } from "./i18n.js";
import { esc } from "./ui.js";
import { mountStory, storyMarkup } from "./story.js";

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

function monthly(kilos) {
  return kilos * RESCUED_SHARE * WEEKS_PER_MONTH * PRICE_PER_KG;
}

export function renderLanding(main) {
  main.innerHTML = `
    <div class="landing">
      ${storyMarkup()}

      <section class="chapter chapter-papa land-hero" id="land-answer" aria-labelledby="land-title">
        <div class="land-hero-text">
          <h2 id="land-title" tabindex="-1">${t("now.question")}</h2>
          <p class="land-lead">${t("landing.lead")}</p>
          <div class="land-actions">
            <a class="button primary" href="#/register">${t("auth.create-account")}</a>
            <a class="button" href="#/signin">${t("auth.signin")}</a>
          </div>
        </div>
        <figure class="land-vignette" aria-hidden="true">
          <img src="/app/stills/fridge.webp" alt="" width="768" height="960" loading="lazy">
          <span class="land-label l1">842 g</span><span class="land-label l2">${t("landing.ui.expires")}</span><span class="land-label l3">4,2 °C</span>
        </figure>
      </section>

      <section class="chapter chapter-cilantro land-kit" aria-labelledby="kit-title" data-explode>
        <h2 id="kit-title">${t("landing.kit.title")}</h2>
        <p class="land-text">${t("landing.kit.lead")}</p>
        <ul class="kit">${kitPart("door", "door")}${kitPart("probe", "probe")}${kitPart("brain", "board")}${kitPart("scale", "scale")}</ul>
      </section>

      <section class="chapter chapter-arroz land-how" aria-labelledby="how-title">
        <div class="how-left">
          <h2 id="how-title">${t("landing.how.title")}</h2>
          <p class="how-clause" data-clause aria-live="polite">${t(`landing.how.${STAGES[0]}`)}</p>
        </div>
        <div class="how-right">
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
        <p class="calc-figure"><span class="data" data-money>${esc(formatMoney(monthly(2), "COP"))}</span><span>${t("landing.calc.unit")}</span></p>
        <p class="calc-how">${t("landing.calc.how", { price: formatMoney(PRICE_PER_KG, "COP") })}</p>
      </section>

      <section class="chapter chapter-tomate land-pasto" aria-labelledby="pasto-title">
        <figure class="pasto-photo">
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
        <p class="land-wordmark" aria-hidden="true">${WORDMARK}</p>
      </footer>
    </div>`;

  main.querySelector(".landing").classList.add("drawn");

  const range = main.querySelector("[data-stage-range]");
  range.addEventListener("input", () => {
    const stage = STAGES[Number(range.value)];
    const fragment = main.querySelector("[data-fragment]");
    fragment.classList.remove("swap");
    void fragment.offsetWidth;
    fragment.classList.add("swap");
    fragment.innerHTML = stageFragment(stage);
    main.querySelector("[data-clause]").textContent = t(`landing.how.${stage}`);
    const picture = main.querySelector("[data-how-scene]");
    picture.src = `/app/stills/${STAGE_SCENES[stage]}.webp`;
    main.querySelectorAll("[data-name]").forEach((name) => {
      if (name.dataset.name === range.value) name.setAttribute("aria-current", "step");
      else name.removeAttribute("aria-current");
    });
  });

  const kilos = main.querySelector("[data-kilos]");
  kilos.addEventListener("input", () => {
    const value = Number(kilos.value);
    main.querySelector("[data-kilos-out]").textContent = `${formatNumber(value, 1)} kg`;
    main.querySelector("[data-money]").textContent = formatMoney(monthly(value), "COP");
  });

  mountStory(main);

  const kit = main.querySelector("[data-explode]");
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const onScroll = () => {
    if (!document.body.contains(kit)) {
      window.removeEventListener("scroll", onScroll);
      return;
    }
    const box = kit.getBoundingClientRect();
    const progress = Math.min(1, Math.max(0, (innerHeight - box.top) / (innerHeight * 0.9)));
    kit.style.setProperty("--open", reduced ? 1 : progress.toFixed(3));
  };
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();
}
