import { t } from "./i18n.js";
import { toast } from "./ui.js";
import { page, reduced, token } from "./motion.js";
import { initialTier, webgl2 } from "./quality.js";
import { ambienceLevel, inkSweep, play, quiet } from "./sound.js";
import { createScroller } from "./story/scroller.js";

const SCENES = [
  { image: "entrada-pasto", width: 1800, height: 1117, captions: ["landing.story.arrive", "landing.story.market-day"] },
  { image: "mercado-bogota", width: 1800, height: 1231, captions: ["landing.story.heaps", "landing.story.oca"], label: "landing.story.bogota" },
  { image: "calle-pasto", width: 880, height: 1409, captions: ["landing.story.today", "landing.story.fridge"] },
  { still: "scale", width: 960, height: 960, captions: ["landing.story.weigh", "landing.story.knows"] },
  { still: "plate", width: 960, height: 960, captions: ["landing.story.cook"] },
];

const STORY_SCREENS = 3.2;
const HOLD_SECONDS = 3;
const REWIND = 3;
const TAP = 250;

function chapterName(id) {
  return {
    market: t("landing.story.chapter.market"),
    kitchen: t("landing.story.chapter.kitchen"),
    scale: t("landing.story.chapter.scale"),
    plate: t("landing.story.chapter.plate"),
  }[id];
}

function scene({ image, still, width, height, captions, label }, index) {
  const source = still ? `/app/stills/${still}.webp` : `/brand/engravings/${image}.jpg`;
  return `<figure class="story-frame${still ? " still" : ""}" data-frame="${index}">
    <img src="${source}" alt="" width="${width}" height="${height}" loading="lazy">
    ${captions.map((key, order) => `<p class="story-caption c${order}">${t(key)}</p>`).join("")}
    ${label ? `<figcaption class="story-label">${t(label)}</figcaption>` : ""}
  </figure>`;
}

function caption({ id, from, to, corner }) {
  const text = t(`landing.story.${id}`);
  const words = text.split(" ").map((word, index) => `<span style="--i:${index}">${word}</span>`).join(" ");
  return `<p class="story-caption c${corner}" data-from="${from}" data-to="${to}"><span class="visually-hidden">${text}</span><span class="caption-words" aria-hidden="true">${words}</span></p>`;
}

export function storyMarkup() {
  return `<section class="land-story" aria-labelledby="story-title" data-story>
    <div class="story-intro" data-intro>
      <h1 id="story-title">${t("landing.story.title")}</h1>
      <p>${t("landing.story.scroll")}</p>
      <a class="button" href="#land-answer" data-skip>${t("landing.story.skip")}</a>
    </div>
    <div class="story-stage">${SCENES.map(scene).join("")}</div>
    <p class="story-credit">${t("landing.story.credit")}</p>
  </section>`;
}

export function mountStory(main) {
  const story = main.querySelector("[data-story]");
  const answer = main.querySelector("#land-answer");
  let scroller = null;
  let film = null;
  let showProgress = () => {};
  let gates = [];

  const skip = () => {
    gates.forEach((gate) => (gate.open = true));
    scroller?.set(1, { jump: true });
    answer.scrollIntoView({ behavior: reduced() ? "auto" : "smooth" });
    answer.querySelector("h2").focus({ preventScroll: true });
  };
  story.querySelector("[data-skip]").addEventListener("click", (event) => {
    event.preventDefault();
    skip();
  });

  if (reduced() || !webgl2()) return;
  const signal = page.signal;
  story.classList.add("filming");
  const stage = story.querySelector(".story-stage");
  const canvas = document.createElement("canvas");
  canvas.className = "story-canvas";
  canvas.setAttribute("aria-hidden", "true");
  stage.prepend(canvas);

  const fallBack = () => {
    film?.dispose();
    film = null;
    scroller?.dispose();
    scroller = null;
    stage.querySelectorAll("[data-film]").forEach((element) => element.remove());
    canvas.remove();
    story.classList.remove("filming");
    story.removeAttribute("data-captured");
  };
  page.defer(fallBack);

  fetch("/app/story/story.json")
    .then((response) => response.json())
    .then((timeline) => {
      if (signal.aborted) return;
      gates = timeline.gates.map((gate) => ({ ...gate, open: false }));
      let blocked = 0;

      stage.insertAdjacentHTML(
        "beforeend",
        `<div class="film-captions" data-film>${timeline.captions.map(caption).join("")}</div>
        <div class="story-rail" data-film aria-hidden="true"><span></span></div>
        <nav class="story-chapters" data-film aria-label="${t("landing.story.chapters")}">${timeline.chapters
          .map((chapter, index) => `<button type="button" data-chapter="${index}">${chapterName(chapter.id)}</button>`)
          .join("")}</nav>
        <button class="button story-hold" type="button" data-film data-story-hold hidden>${t("landing.story.hold")}</button>`,
      );
      const captions = [...stage.querySelectorAll(".film-captions [data-from]")];
      const rail = stage.querySelector(".story-rail span");
      const chapterButtons = [...stage.querySelectorAll("[data-chapter]")];
      const holdButton = stage.querySelector("[data-story-hold]");
      const intro = story.querySelector("[data-intro]");
      const starts = [];
      timeline.chapters.reduce((from, chapter) => (starts.push(from), from + chapter.share), 0);

      const closedGate = () => gates.find((gate) => !gate.open);
      let heard = 0;
      let heardAt = performance.now();
      const listen = (value) => {
        const now = performance.now();
        const speed = Math.abs(value - heard) / Math.max(0.001, (now - heardAt) / 1000);
        const cutting = starts.slice(1).some((start) => timeline.cut.width > Math.abs(value - start));
        inkSweep(cutting ? speed * 2 : 0);
        ambienceLevel(Math.max(0, 1 - value / starts[1]));
        timeline.sounds.forEach((cue) => value >= cue.at && cue.at > heard && play(cue.name));
        heard = value;
        heardAt = now;
      };
      page.defer(quiet);
      showProgress = (value) => {
        rail.style.transform = `scaleX(${value.toFixed(4)})`;
        intro.classList.toggle("gone", value > 0.015);
        captions.forEach((element) => element.classList.toggle("on", value >= Number(element.dataset.from) && Number(element.dataset.to) > value));
        const active = starts.findLastIndex((start) => value >= start);
        chapterButtons.forEach((button, index) => (index === active ? button.setAttribute("aria-current", "step") : button.removeAttribute("aria-current")));
        const gate = closedGate();
        holdButton.hidden = !(gate && value > gate.at - 0.012);
        listen(value);
      };
      const syncCaptured = () => story.toggleAttribute("data-captured", Boolean(scroller?.captured()));

      scroller = createScroller({
        length: () => innerHeight * STORY_SCREENS,
        stops: timeline.captions.map((entry) => entry.from),
        gates,
        onGoal(goal) {
          if (film) film.seek(goal);
          else showProgress(goal);
          syncCaptured();
        },
        onBlocked() {
          holdButton.hidden = false;
          blocked += 1;
          if (blocked >= 2) {
            holdButton.animate([{ scale: 1 }, { scale: 1.08 }, { scale: 1 }], { duration: token("duration-slow"), easing: "ease-out" });
            if (blocked === 2) toast(t("landing.story.nudge"));
          }
          if (!document.activeElement || document.activeElement === document.body) holdButton.focus({ preventScroll: true });
        },
        onEnd: skip,
      });
      const onScroll = () => syncCaptured();
      window.addEventListener("scroll", onScroll, { passive: true });
      page.defer(() => window.removeEventListener("scroll", onScroll));
      syncCaptured();

      stage.querySelector(".story-chapters").addEventListener("click", (event) => {
        const button = event.target.closest("[data-chapter]");
        if (!button) return;
        const start = starts[Number(button.dataset.chapter)];
        gates.forEach((gate) => {
          if (start > gate.at) gate.open = true;
        });
        if (window.scrollY > 1) window.scrollTo({ top: 0, behavior: "auto" });
        scroller.set(start + (start ? 0.005 : 0), { jump: true });
      });

      let held = 0;
      let pressedAt = 0;
      let pressing = false;
      let frameId = 0;
      let last = 0;
      const openGate = () => {
        const gate = closedGate();
        if (!gate) return;
        gate.open = true;
        play("door");
        held = 0;
        holdButton.style.setProperty("--held", 0);
        holdButton.hidden = true;
        scroller.set(gate.at + 0.05, { jump: true });
      };
      const step = (now) => {
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        held = Math.min(1, Math.max(0, held + (pressing ? dt / HOLD_SECONDS : -dt * REWIND / HOLD_SECONDS)));
        holdButton.style.setProperty("--held", held.toFixed(4));
        film?.setHeld(held);
        if (held >= 1) {
          pressing = false;
          frameId = 0;
          openGate();
          return;
        }
        frameId = pressing || held > 0 ? requestAnimationFrame(step) : 0;
      };
      const press = () => {
        if (pressing) return;
        pressing = true;
        pressedAt = performance.now();
        if (!frameId) {
          last = pressedAt;
          frameId = requestAnimationFrame(step);
        }
      };
      const release = () => {
        if (!pressing) return;
        pressing = false;
        if (TAP > performance.now() - pressedAt) toast(t("landing.story.hold-hint"));
      };
      holdButton.addEventListener("pointerdown", (event) => {
        holdButton.setPointerCapture(event.pointerId);
        press();
      });
      ["pointerup", "pointercancel", "lostpointercapture"].forEach((type) => holdButton.addEventListener(type, release));
      holdButton.addEventListener("contextmenu", (event) => event.preventDefault());
      holdButton.addEventListener("keydown", (event) => {
        if (event.key !== " " && event.key !== "Enter") return;
        event.preventDefault();
        if (!event.repeat) press();
      });
      holdButton.addEventListener("keyup", (event) => {
        if (event.key === " " || event.key === "Enter") release();
      });
      page.defer(() => cancelAnimationFrame(frameId));

      showProgress(0);
      if (location.search.includes("dev")) {
        window.__hpc = Object.assign(window.__hpc ?? {}, {
          seek(value) {
            gates.forEach((gate) => (gate.open = value > gate.at));
            window.scrollTo(0, 0);
            scroller.set(value, { jump: true });
          },
        });
      }
      return Promise.all([import("./story3d.js"), Promise.resolve(timeline)]);
    })
    .then((loaded) => {
      if (!loaded || signal.aborted) return null;
      const [{ createStory }, timeline] = loaded;
      return createStory(canvas, timeline, {
        tier: initialTier(),
        onStills: fallBack,
        onProgress: (value) => showProgress(value),
      }).then((created) => [created, timeline]);
    })
    .then((made) => {
      if (!made) return;
      const [created, timeline] = made;
      if (signal.aborted) {
        created.dispose();
        return;
      }
      film = created;
      film.seek(scroller?.goal ?? 0);
      if (new URLSearchParams(location.search).get("dev") === "camera") import("./dev/editor.js").then(({ openEditor }) => openEditor(created, timeline));
    })
    .catch(fallBack);
}
