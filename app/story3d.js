import * as THREE from "./vendor/three.module.min.js";
import { boil, filmTone, inkBias, setHatchScale } from "./engrave.js";
import { createTrack } from "./camerapath.js";
import { damp, loop, reduced } from "./motion.js";
import { TIERS, createGovernor, pixelRatioFor } from "./quality.js";
import { homeScene, kitchen, market, PAPER, plateScene, scaleScene, setDensity, streetScene, tableScene } from "./story/scenes.js";
import { createInkPass } from "./story/ink.js";
import { createWind } from "./story/wind.js";
import { loadFigures } from "./story/figures.js";

const BUILDERS = { streets: streetScene, market, home: homeScene, kitchen, scale: scaleScene, plate: plateScene, table: tableScene };
const WINDS = {
  market: { origin: [-2, 2.4, -2], spread: [5, 1.6, 4], length: 3.2, rise: 0.4, width: 0.012, jitter: 0.02, share: 1 },
  table: { origin: [0, 0.98, 0], spread: [0.12, 0.01, 0.08], length: 0.02, rise: 0.22, width: 0.002, jitter: 0.0015, share: 0.15 },
  plate: { origin: [-0.06, 0.84, 0], spread: [0.1, 0.01, 0.06], length: 0.015, rise: 0.12, width: 0.0018, jitter: 0.0012, share: 0.125 },
};

export async function createStory(canvas, story, { tier = "high", onStills, onProgress } = {}) {
  await Promise.all([document.fonts.load("700 64px 'Hanken Grotesk'").catch(() => null), loadFigures().catch(() => null)]);
  const settings = TIERS[tier];
  setDensity(settings.instances);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: settings.antialias, powerPreference: "high-performance" });
  const applyPixelRatio = (name) => {
    const ratio = pixelRatioFor(name);
    renderer.setPixelRatio(ratio);
    setHatchScale(ratio);
  };
  applyPixelRatio(tier);
  renderer.setClearColor(PAPER);
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.autoClear = false;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(PAPER, 18, 46);
  scene.add(new THREE.HemisphereLight("#ffffff", "#b9b19c", 1.0));
  const sun = new THREE.DirectionalLight("#ffffff", 1.4);
  scene.add(sun);

  let start = 0;
  const winds = [];
  const chapters = story.chapters.map((chapter, index) => {
    const offset = index * 100;
    const world = BUILDERS[chapter.id]();
    world.position.x = offset;
    world.visible = false;
    scene.add(world);
    const wind = WINDS[chapter.id] ? createWind({ ...WINDS[chapter.id], count: Math.max(3, Math.round(settings.windLines * WINDS[chapter.id].share)), seed: index + 1 }) : null;
    if (wind) {
      world.add(wind.group);
      winds.push(wind);
    }
    const keys = chapter.camera.map((key) => ({ ...key, pos: [key.pos[0] + offset, key.pos[1], key.pos[2]], look: [key.look[0] + offset, key.look[1], key.look[2]] }));
    const entry = { id: chapter.id, world, wind, light: chapter.light, film: chapter.film ?? 0, track: createTrack(keys), from: start, to: start + chapter.share };
    start += chapter.share;
    return entry;
  });
  const last = chapters.length - 1;
  await renderer.compileAsync(scene, new THREE.PerspectiveCamera()).catch(() => null);

  const ink = createInkPass({ cover: matchMedia("(pointer: coarse)").matches ? 1.5 : 2 });
  const camera = new THREE.PerspectiveCamera(38, 1, 0.05, 120);
  const look = new THREE.Vector3();
  const fine = matchMedia("(pointer: fine)").matches;
  const state = { goal: 0, progress: 0, speed: 0, pitch: 0, pointerX: 0, pointerY: 0, gazeX: 0, gazeY: 0, override: null };
  const follow = fine ? 7 : 16;
  let film = null;

  const onPointer = (event) => {
    state.pointerX = (event.clientX / innerWidth) * 2 - 1;
    state.pointerY = (event.clientY / innerHeight) * 2 - 1;
    film?.wake();
  };
  const onLeave = () => {
    state.pointerX = 0;
    state.pointerY = 0;
    film?.wake();
  };
  if (fine) {
    window.addEventListener("pointermove", onPointer, { passive: true });
    document.addEventListener("pointerleave", onLeave);
  }

  function resize() {
    const { clientWidth, clientHeight } = canvas;
    if (!clientWidth || !clientHeight) return;
    renderer.setSize(clientWidth, clientHeight, false);
    camera.aspect = clientWidth / clientHeight;
    camera.updateProjectionMatrix();
    ink.uniforms.uAspect.value = camera.aspect;
    film?.wake();
  }
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);

  const lost = (event) => {
    event.preventDefault();
    onStills?.();
  };
  canvas.addEventListener("webglcontextlost", lost);

  const governor = createGovernor({
    tier,
    onChange(next) {
      if (next === "stills") onStills?.();
      else applyPixelRatio(next);
    },
  });

  const PAPER_COLOR = new THREE.Color(PAPER);
  const AGED_PAPER = new THREE.Color("#e6d3ad");
  const paper = new THREE.Color();
  const stage = canvas.parentElement;
  let shownTone = -1;
  let shownRoll = -2;
  let shownGrain = -1;
  let shownSeam = -1;

  function tick(dt, now) {
    const before = state.progress;
    state.progress = damp(state.progress, state.goal, follow, dt);
    if (0.00002 > Math.abs(state.progress - state.goal)) state.progress = state.goal;
    if (state.progress !== before) onProgress?.(state.progress);
    state.speed = dt > 0 ? (state.progress - before) / dt : 0;
    const still = reduced();
    state.pitch = damp(state.pitch, still ? 0 : Math.max(-0.2, Math.min(0.2, state.speed * 0.6)), 3, dt);
    state.gazeX = damp(state.gazeX, still ? 0 : state.pointerX, 3, dt);
    state.gazeY = damp(state.gazeY, still ? 0 : state.pointerY, 3, dt);

    const share = Math.max(0, Math.min(0.9999, state.progress));
    let index = 0;
    while (last > index && share >= chapters[index].to) index += 1;
    const chapter = chapters[index];
    const k = (share - chapter.from) / (chapter.to - chapter.from);

    const width = story.cut.width;
    let sweep = 0;
    let neighbour = -1;
    let tone = chapter.film;
    let roll = -1;
    for (let cut = 1; last >= cut; cut += 1) {
      const distance = (share - chapters[cut].from) / width;
      if (1 > Math.abs(distance)) {
        sweep = (distance + 1) / 2;
        neighbour = distance >= 0 ? cut - 1 : cut;
        const [before, after] = [chapters[cut - 1].film, chapters[cut].film];
        tone = before + (after - before) * THREE.MathUtils.smoothstep(sweep, 0.15, 0.85);
        if (before !== after) roll = sweep;
      }
    }
    for (let other = 0; last >= other; other += 1) chapters[other].world.visible = other === index || other === neighbour;
    // The table is two worlds, 1876 and today; once the cut has passed, a torn seam crosses from the right edge to the left, 1876 on its
    // left and today on its right, until today holds the whole screen.
    const split = chapter.world.userData.split;
    const seam = split && neighbour === -1 ? 1 - THREE.MathUtils.smoothstep(k, 0.1, 0.75) : 1;
    if (split) {
      split.then.visible = seam > 0;
      split.today.visible = 0 >= seam;
      if (0 >= seam) tone = 0;
    }

    if (state.override) {
      camera.position.fromArray(state.override.pos);
      look.fromArray(state.override.look);
      camera.fov = state.override.fov;
      camera.position.x += index * 100;
      look.x += index * 100;
      camera.lookAt(look);
    } else {
      camera.fov = chapter.track.sample(k, camera.position, look);
      const pull = Math.max(1, 0.95 / camera.aspect);
      camera.position.sub(look).multiplyScalar(pull).add(look);
      // A tall frame pulls the camera back along its view; one looking up would sink below the street, so it stops at eye height.
      if (pull > 1) camera.position.y = Math.max(camera.position.y, 1.2);
      camera.position.x += state.gazeX * 0.04;
      camera.position.y += -state.gazeY * 0.025;
      camera.lookAt(look);
      camera.rotateX(state.pitch * 0.05);
    }
    camera.updateProjectionMatrix();
    chapter.world.userData.play?.(k, still ? 0 : now);
    if (chapter.wind) {
      chapter.wind.uniforms.uDraw.value = Math.min(1, k * 1.6);
      chapter.wind.uniforms.uFade.value = 1 - Math.max(0, k - 0.75) * 4;
    }
    sun.position.fromArray(chapter.light.sun);
    inkBias.value = chapter.light.inkBias;

    // The old footage: sepia in the shader, aged paper behind it, and over the canvas a vignette, scanlines and grain that jumps with the
    // 8 Hz ink boil; leaving 1876 a tuning band rolls down the screen with the scroll.
    if (tone !== shownTone || roll !== shownRoll) {
      shownTone = tone;
      shownRoll = roll;
      filmTone.value = tone;
      paper.copy(PAPER_COLOR).lerp(AGED_PAPER, tone);
      renderer.setClearColor(paper);
      scene.fog.color.copy(paper);
      stage.style.setProperty("--film", tone.toFixed(3));
      stage.style.setProperty("--roll", roll.toFixed(3));
    }
    if (seam !== shownSeam) {
      shownSeam = seam;
      stage.style.setProperty("--seam", seam.toFixed(4));
      stage.style.setProperty("--tear", seam > 0 && 1 > seam ? "1" : "0");
    }
    const stepped = Math.floor(now * 8) / 8;
    if (tone > 0 && stepped !== shownGrain) {
      shownGrain = stepped;
      const jump = Math.round(stepped * 8);
      stage.style.setProperty("--grain", `${((jump * 37) % 100) - 50}px ${((jump * 61) % 100) - 50}px`);
    }
    boil(now * 1000);
    for (const wind of winds) wind.uniforms.uTime.value = stepped;
    ink.uniforms.uSweep.value = sweep;
    ink.uniforms.uScroll.value = share;
    ink.uniforms.uTime.value = stepped;

    renderer.clear();
    if (seam > 0 && 1 > seam) {
      const width = canvas.clientWidth;
      const edge = Math.round(width * seam);
      const pass = (show, hide, value, x, span) => {
        show.visible = true;
        hide.visible = false;
        filmTone.value = value;
        paper.copy(PAPER_COLOR).lerp(AGED_PAPER, value);
        renderer.setClearColor(paper);
        scene.fog.color.copy(paper);
        renderer.setScissor(x, 0, span, canvas.clientHeight);
        renderer.clear();
        renderer.render(scene, camera);
      };
      renderer.setScissorTest(true);
      pass(split.then, split.today, 1, 0, edge);
      pass(split.today, split.then, 0, edge, width - edge);
      renderer.setScissorTest(false);
      shownTone = -1;
    } else {
      renderer.render(scene, camera);
    }
    if (sweep > 0) renderer.render(ink.scene, ink.camera);
    return state.progress !== state.goal || Math.abs(state.gazeX - state.pointerX) + Math.abs(state.gazeY - state.pointerY) > 0.001;
  }

  // Idle ticks at 24 a second keep people at rest breathing and talking for the few seconds the loop stays awake after the last input.
  film = loop(canvas, tick, { gpu: true, idleHz: 24, onFrameTime: (dt) => governor.sample(dt) });
  resize();

  if (location.search.includes("dev")) window.__hpc = Object.assign(window.__hpc ?? {}, { story: { tier, renderer } });

  return {
    seek(progress) {
      state.goal = progress;
      film.wake();
    },
    chapterAt(progress) {
      let index = 0;
      while (last > index && progress >= chapters[index].to) index += 1;
      const chapter = chapters[index];
      return { index, id: chapter.id, from: chapter.from, to: chapter.to };
    },
    setTrack(index, keys) {
      const offset = index * 100;
      chapters[index].track = createTrack(keys.map((key) => ({ ...key, pos: [key.pos[0] + offset, key.pos[1], key.pos[2]], look: [key.look[0] + offset, key.look[1], key.look[2]] })));
      film.wake();
    },
    override(pose) {
      state.override = pose;
      film.wake();
    },
    hold(seconds) {
      governor.hold(seconds);
    },
    setHeld(value) {
      const kitchen = chapters.find((chapter) => chapter.id === "kitchen");
      if (!kitchen) return;
      kitchen.world.userData.held = value;
      film.wake();
    },
    dispose() {
      film.stop();
      observer.disconnect();
      window.removeEventListener("pointermove", onPointer);
      document.removeEventListener("pointerleave", onLeave);
      canvas.removeEventListener("webglcontextlost", lost);
      inkBias.value = 0;
      scene.traverse((object) => {
        object.geometry?.dispose();
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach((material) => {
          material?.map?.dispose();
          material?.dispose?.();
        });
      });
      winds.forEach((wind) => wind.dispose());
      ink.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
