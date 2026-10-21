import { formatMoney, formatNumber, t } from "./i18n.js";
import { esc } from "./ui.js";
import { page } from "./motion.js";
import { initialTier, webgl2 } from "./quality.js";

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

const SCENES = [
  { image: "entrada-pasto", width: 1800, height: 1117, captions: ["landing.story.arrive", "landing.story.market-day"] },
  { image: "mercado-bogota", width: 1800, height: 1231, captions: ["landing.story.heaps", "landing.story.oca"], label: "landing.story.bogota" },
  { image: "calle-pasto", width: 880, height: 1409, captions: ["landing.story.today", "landing.story.fridge"] },
];

const FILM = [
  ["landing.story.arrive", 0.02, 0.15, 0],
  ["landing.story.market-day", 0.07, 0.15, 1],
  ["landing.story.heaps", 0.17, 0.32, 0],
  ["landing.story.oca", 0.22, 0.32, 1],
  ["landing.story.today", 0.37, 0.5, 0],
  ["landing.story.fridge", 0.48, 0.63, 1],
  ["landing.story.weigh", 0.67, 0.81, 0],
  ["landing.story.knows", 0.72, 0.81, 1],
  ["landing.story.cook", 0.84, 0.99, 0],
];

function scene({ image, width, height, captions, label }, index) {
  return `<figure class="story-frame" data-frame="${index}" style="--frame:${index}">
    <img src="/brand/engravings/${image}.jpg" alt="" width="${width}" height="${height}" ${index ? 'loading="lazy"' : ""}>
    ${captions.map((key, order) => `<p class="story-caption c${order}">${t(key)}</p>`).join("")}
    ${label ? `<figcaption class="story-label">${t(label)}</figcaption>` : ""}
  </figure>`;
}

function monthly(kilos) {
  return kilos * RESCUED_SHARE * WEEKS_PER_MONTH * PRICE_PER_KG;
}

export function renderLanding(main) {
  main.innerHTML = `
    <div class="landing">
      <section class="land-story" aria-labelledby="story-title" data-story>
        <div class="story-intro" data-intro>
          <h1 id="story-title">${t("landing.story.title")}</h1>
          <p>${t("landing.story.scroll")}</p>
          <a class="button" href="#land-answer" data-skip>${t("landing.story.skip")}</a>
        </div>
        <div class="story-stage">${SCENES.map(scene).join("")}</div>
        <p class="story-credit">${t("landing.story.credit")}</p>
      </section>

      <section class="chapter chapter-papa land-hero" id="land-answer" aria-labelledby="land-title">
        <div class="land-hero-text">
          <h2 id="land-title">${t("now.question")}</h2>
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

  main.querySelector("[data-skip]").addEventListener("click", (event) => {
    event.preventDefault();
    main.querySelector("#land-answer").scrollIntoView({ behavior: still ? "auto" : "smooth" });
  });

  const kilos = main.querySelector("[data-kilos]");
  kilos.addEventListener("input", () => {
    const value = Number(kilos.value);
    main.querySelector("[data-kilos-out]").textContent = `${formatNumber(value, 1)} kg`;
    main.querySelector("[data-money]").textContent = formatMoney(monthly(value), "COP");
  });

  const story = main.querySelector("[data-story]");
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let film = null;
  if (!still && webgl2()) {
    const canvas = document.createElement("canvas");
    canvas.className = "story-canvas";
    canvas.setAttribute("aria-hidden", "true");
    story.querySelector(".story-stage").prepend(canvas);
    canvas.insertAdjacentHTML(
      "afterend",
      `<div class="film-captions">${FILM.map(([key, from, to, corner]) => `<p class="story-caption c${corner}" data-from="${from}" data-to="${to}">${t(key)}</p>`).join("")}</div>`,
    );
    story.classList.add("filming");
    const signal = page.signal;
    const fallBack = () => {
      film?.dispose();
      film = null;
      canvas.remove();
      story.classList.remove("filming");
    };
    Promise.all([import("./story3d.js"), fetch("/app/story/story.json").then((response) => response.json())])
      .then(([{ createStory }, timeline]) => createStory(canvas, timeline, { tier: initialTier(), onStills: fallBack }).then((created) => [created, timeline]))
      .then(([created, timeline]) => {
        if (signal.aborted) {
          created.dispose();
          return;
        }
        film = created;
        page.defer(() => created.dispose());
        playStory();
        if (new URLSearchParams(location.search).get("dev") === "camera") import("./dev/editor.js").then(({ openEditor }) => openEditor(created, timeline));
      })
      .catch(fallBack);
  }
  const frames = [...story.querySelectorAll("[data-frame]")];
  const playStory = () => {
    if (!document.body.contains(story)) {
      window.removeEventListener("scroll", playStory);
      return;
    }
    const box = story.getBoundingClientRect();
    const travel = Math.max(1, box.height - innerHeight);
    const share = Math.min(0.9999, Math.max(0, -box.top / travel));
    film?.seek(share);
    story.querySelector("[data-intro]").classList.toggle("gone", share > 0.015);
    story.querySelectorAll(".film-captions [data-from]").forEach((caption) =>
      caption.classList.toggle("on", share >= Number(caption.dataset.from) && Number(caption.dataset.to) > share),
    );
    const progress = share * frames.length;
    frames.forEach((frame, index) => {
      const local = progress - index;
      const reveal = index === 0 ? 1 : Math.min(1, Math.max(0, (local + 0.18) / 0.36));
      frame.style.setProperty("--reveal", `${(reveal * 112).toFixed(1)}%`);
      frame.style.setProperty("--zoom", (1 + Math.min(1, Math.max(0, local)) * 0.14).toFixed(4));
      frame.classList.toggle("shown", local > -0.2);
      frame.querySelectorAll(".story-caption").forEach((caption, order) => caption.classList.toggle("on", local - order * 0.32 >= 0.08 && 1.1 >= local));
    });
  };
  if (!still) {
    story.classList.add("playing");
    window.addEventListener("scroll", playStory, { passive: true });
    playStory();
  }

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
