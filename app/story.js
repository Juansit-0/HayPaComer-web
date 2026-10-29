import { t } from "./i18n.js";
import { toast } from "./ui.js";
import { page, reduced, token } from "./motion.js";
import { initialTier, webgl2 } from "./quality.js";
import { ambienceLevel, inkSweep, play, quiet } from "./sound.js";
import { createScroller } from "./story/scroller.js";

const SCENES = [
  { image: "entrada-pasto", width: 1800, height: 1117, captions: ["landing.story.arrive", "landing.story.market-day"] },
  { image: "mercado-bogota", width: 1800, height: 1231, captions: ["landing.story.heaps", "landing.story.oca", "landing.story.people"], label: "landing.story.bogota" },
  { image: "calle-pasto", width: 880, height: 1409, captions: ["landing.story.today", "landing.story.fridge"] },
  { still: "scale", width: 960, height: 960, captions: ["landing.story.weigh", "landing.story.knows"] },
  { still: "plate", width: 960, height: 960, captions: ["landing.story.cook", "landing.story.table"] },
];

const STORY_SCREENS = 3.61;
// The fridge opens by pulling its door: the hand keeps the handle up to OPEN_AT of the swing, as far as the arm reaches; there the door
// is let go by itself and swings the rest of the way. Let go sooner and it springs back shut.
const OPEN_AT = 0.4;
const SPRING_BACK = 3;
const TAP = 6;

function chapterName(id) {
  return {
    streets: t("landing.story.chapter.streets"),
    market: t("landing.story.chapter.market"),
    kitchen: t("landing.story.chapter.kitchen"),
    scale: t("landing.story.chapter.scale"),
    plate: t("landing.story.chapter.plate"),
    home: t("landing.story.chapter.home"),
    table: t("landing.story.chapter.table"),
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

// Captions read like the news of their time: clippings from an 1876 paper in the market, printed receipts at home today, and app notifications
// once the fridge knows. The year is a numeral, so it needs no translation.
const ERA_YEARS = { press: 1876, note: 2026 };

function caption({ id, from, to, corner, era = "app" }) {
  const text = t(`landing.story.${id}`);
  const words = text.split(" ").map((word, index) => `<span style="--i:${index}">${word}</span>`).join(" ");
  const year = ERA_YEARS[era] ? ` data-year="${ERA_YEARS[era]}"` : "";
  return `<p class="story-caption c${corner} era-${era}" data-from="${from}" data-to="${to}"${year}><span class="visually-hidden">${text}</span><span class="caption-words" aria-hidden="true">${words}</span></p>`;
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
        `<div class="film-grain" data-film aria-hidden="true"></div>
        <div class="film-roll" data-film aria-hidden="true"></div>
        <div class="film-tear" data-film aria-hidden="true"></div>
        <div class="film-captions" data-film>${timeline.captions.map(caption).join("")}</div>
        <div class="story-rail" data-film aria-hidden="true"><span></span></div>
        <nav class="story-chapters" data-film aria-label="${t("landing.story.chapters")}">${timeline.chapters
          .map((chapter, index) => `<button type="button" data-chapter="${index}">${chapterName(chapter.id)}</button>`)
          .join("")}</nav>
        <div class="story-hold" data-film data-story-hold hidden role="slider" tabindex="0" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" aria-label="${t("landing.story.drag")}"><span class="drag-hand" aria-hidden="true"></span><span class="drag-label">${t("landing.story.drag")}</span></div>`,
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
      // Once open, the door is held open until the story has caught up with it, so it never falls shut while the scroll eases forward.
      let settle = null;
      showProgress = (value) => {
        if (settle && value > settle.at) {
          settle.done();
          settle = null;
        }
        rail.style.transform = `scaleX(${value.toFixed(4)})`;
        intro.classList.toggle("gone", value > 0.015);
        captions.forEach((element) => {
          const on = value >= Number(element.dataset.from) && Number(element.dataset.to) > value;
          element.classList.toggle("on", on);
          element.classList.toggle("gone", !on && value >= Number(element.dataset.to));
        });
        const active = starts.findLastIndex((start) => value >= start);
        chapterButtons.forEach((button, index) => (index === active ? button.setAttribute("aria-current", "step") : button.removeAttribute("aria-current")));
        const gate = closedGate();
        holdButton.hidden = !(gate && value > gate.at - 0.012);
        // No ink trail while the door is in hand or swinging open.
        document.documentElement.toggleAttribute("data-quiet-pointer", !holdButton.hidden || timeline.gates.some((entry) => value > entry.at - 0.012 && entry.at + 0.06 > value));
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
      let drag = null;
      let releasing = false;
      let frameId = 0;
      let last = 0;
      const show = (value) => {
        held = Math.min(1, Math.max(0, value));
        holdButton.style.setProperty("--held", held.toFixed(4));
        holdButton.setAttribute("aria-valuenow", String(Math.round(held * 100)));
        film?.setHeld(held);
      };
      const openGate = () => {
        const gate = closedGate();
        if (!gate) return;
        gate.open = true;
        play("door");
        show(1);
        settle = { at: gate.at + 0.045, done: () => show(0) };
        holdButton.hidden = true;
        scroller.set(gate.at + 0.05, { jump: true });
      };
      // Let go: past the mark the door swings the rest of the way and opens; short of it the door springs back shut.
      const step = (now) => {
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        const opening = held >= OPEN_AT;
        show(held + (opening ? dt * 2.2 : -dt * SPRING_BACK));
        if (opening && held >= 1) {
          releasing = false;
          frameId = 0;
          openGate();
          return;
        }
        frameId = held > 0 ? requestAnimationFrame(step) : 0;
        if (!frameId) releasing = false;
      };
      const letGo = () => {
        releasing = true;
        if (!frameId) {
          last = performance.now();
          frameId = requestAnimationFrame(step);
        }
      };
      // The door itself is the handle: press on it and pull it toward the left, the way it swings. The note below only says so; it is
      // also the keyboard control.
      const onDoor = (event) => !holdButton.hidden && film?.doorAt(event.clientX, event.clientY);
      canvas.addEventListener("pointerdown", (event) => {
        if (!onDoor(event)) return;
        canvas.setPointerCapture(event.pointerId);
        cancelAnimationFrame(frameId);
        frameId = 0;
        releasing = false;
        drag = { x: event.clientX, from: held, moved: 0, width: film.doorWidth() };
        story.classList.add("pulling");
      });
      const endDrag = () => {
        if (!drag) return;
        if (TAP > drag.moved) toast(t("landing.story.drag-hint"));
        drag = null;
        story.classList.remove("pulling");
        canvas.style.cursor = "";
        letGo();
      };
      canvas.addEventListener("pointermove", (event) => {
        if (!drag) {
          canvas.style.cursor = onDoor(event) ? "grab" : "";
          return;
        }
        drag.moved = Math.max(drag.moved, Math.abs(event.clientX - drag.x));
        show(drag.from + (OPEN_AT * (drag.x - event.clientX)) / drag.width);
        if (held >= OPEN_AT) endDrag();
      });
      // A touch that starts on the door belongs to the door, not to the story's scroll.
      canvas.addEventListener("touchstart", (event) => {
        if (event.touches.length === 1 && onDoor(event.touches[0])) event.stopPropagation();
      }, { passive: true });
      ["pointerup", "pointercancel", "lostpointercapture"].forEach((type) => canvas.addEventListener(type, endDrag));
      holdButton.addEventListener("contextmenu", (event) => event.preventDefault());
      holdButton.addEventListener("keydown", (event) => {
        const nudge = { ArrowRight: 0.1, ArrowUp: 0.1, ArrowLeft: -0.1, ArrowDown: -0.1, End: 1, Home: -1 }[event.key];
        if (nudge === undefined && event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        cancelAnimationFrame(frameId);
        frameId = 0;
        show(nudge === undefined ? 1 : held + nudge);
        if (held >= OPEN_AT) letGo();
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
          door: (x, y) => Boolean(film?.doorAt(x, y)),
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
