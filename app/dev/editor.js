// Dev only: keyframe editor for the story cameras. Open the landing with ?dev=camera on the mock.
// Scrub the story, fly the camera (drag to orbit, shift-drag to pan, wheel to dolly), add or edit keys, save story.json.
const round = (value) => Math.round(value * 1000) / 1000;

export function openEditor(film, story) {
  const panel = document.createElement("aside");
  panel.dataset.nativeScroll = "";
  panel.style.cssText = "position:fixed;top:0;right:0;bottom:0;width:360px;z-index:100;overflow:auto;background:#fbf6ec;border-left:2px solid #1c1712;font:13px/1.4 ui-monospace,monospace;padding:12px;color:#1c1712";
  document.body.append(panel);

  const fly = { on: false, yaw: 0, pitch: 0, distance: 2, look: [0, 1, 0], fov: 38 };
  let progress = 0;

  const chapterNow = () => film.chapterAt(progress);
  const local = () => {
    const chapter = chapterNow();
    return round((progress - chapter.from) / (chapter.to - chapter.from));
  };
  const keysNow = () => story.chapters[chapterNow().index].camera;

  const pose = () => {
    const x = fly.look[0] + Math.sin(fly.yaw) * Math.cos(fly.pitch) * fly.distance;
    const y = fly.look[1] + Math.sin(fly.pitch) * fly.distance;
    const z = fly.look[2] + Math.cos(fly.yaw) * Math.cos(fly.pitch) * fly.distance;
    return { pos: [round(x), round(y), round(z)], look: fly.look.map(round), fov: fly.fov };
  };
  const applyFly = () => film.override(fly.on ? pose() : null);

  const startFrom = (key) => {
    const dx = key.pos[0] - key.look[0];
    const dy = key.pos[1] - key.look[1];
    const dz = key.pos[2] - key.look[2];
    fly.distance = Math.hypot(dx, dy, dz);
    fly.yaw = Math.atan2(dx, dz);
    fly.pitch = Math.asin(dy / fly.distance);
    fly.look = [...key.look];
    fly.fov = key.fov ?? 38;
  };

  function render() {
    const chapter = chapterNow();
    const keys = keysNow();
    panel.innerHTML = `
      <strong>Story cameras</strong>
      <p>Progress <input data-progress type="range" min="0" max="0.9999" step="0.0005" value="${progress}" style="width:100%"></p>
      <p>Chapter <b>${chapter.id}</b>, local t <b>${local()}</b></p>
      <p><label><input type="checkbox" data-fly ${fly.on ? "checked" : ""}> Fly camera (drag, shift-drag, wheel)</label></p>
      <p>FOV <input data-fov type="number" step="1" value="${fly.fov}" style="width:60px"></p>
      <p><button data-add>Add key here</button> <button data-save>Save story.json</button> <button data-download>Download</button></p>
      <table style="width:100%;border-collapse:collapse">${keys
        .map(
          (key, index) => `<tr style="border-top:1px solid #1c1712">
            <td>${key.t}</td><td>${key.pos.join(", ")}<br>${key.look.join(", ")}<br>fov ${key.fov ?? 38} ${key.ease ?? "linear"}</td>
            <td><button data-go="${index}">go</button><button data-edit="${index}">fly</button><button data-ease="${index}">ease</button><button data-drop="${index}">x</button></td>
          </tr>`,
        )
        .join("")}</table>
      <p data-status></p>`;
  }

  const status = (text) => {
    const line = panel.querySelector("[data-status]");
    if (line) line.textContent = text;
  };

  const update = () => {
    film.setTrack(chapterNow().index, keysNow());
    render();
  };

  panel.addEventListener("input", (event) => {
    if (event.target.matches("[data-progress]")) {
      progress = Number(event.target.value);
      film.seek(progress);
      panel.querySelector("p:nth-of-type(2)").innerHTML = `Chapter <b>${chapterNow().id}</b>, local t <b>${local()}</b>`;
    }
    if (event.target.matches("[data-fov]")) {
      fly.fov = Number(event.target.value);
      applyFly();
    }
  });

  panel.addEventListener("change", (event) => {
    if (event.target.matches("[data-progress]")) render();
    if (event.target.matches("[data-fly]")) {
      fly.on = event.target.checked;
      if (fly.on && keysNow().length) startFrom(keysNow()[0]);
      applyFly();
    }
  });

  const EASES = ["linear", "in", "out", "inOut"];
  panel.addEventListener("click", async (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    const keys = keysNow();
    if (button.matches("[data-add]")) {
      const t = local();
      const existing = keys.findIndex((key) => key.t === t);
      const key = { t, ...pose(), ease: "linear" };
      if (existing >= 0) keys[existing] = key;
      else keys.push(key);
      keys.sort((a, b) => a.t - b.t);
      update();
    } else if (button.dataset.go) {
      const key = keys[Number(button.dataset.go)];
      const chapter = chapterNow();
      progress = chapter.from + key.t * (chapter.to - chapter.from);
      film.seek(progress);
      render();
    } else if (button.dataset.edit) {
      startFrom(keys[Number(button.dataset.edit)]);
      fly.on = true;
      applyFly();
      render();
    } else if (button.dataset.ease) {
      const key = keys[Number(button.dataset.ease)];
      key.ease = EASES[(EASES.indexOf(key.ease ?? "linear") + 1) % EASES.length];
      update();
    } else if (button.dataset.drop) {
      if (keys.length > 2) keys.splice(Number(button.dataset.drop), 1);
      update();
    } else if (button.matches("[data-save]")) {
      const response = await fetch("/__dev/save?path=app/story/story.json", { method: "PUT", body: JSON.stringify(story, null, 2) + "\n" }).catch(() => null);
      status(response?.ok ? "Saved app/story/story.json" : "Save failed: use Download");
    } else if (button.matches("[data-download]")) {
      const link = document.createElement("a");
      link.href = URL.createObjectURL(new Blob([JSON.stringify(story, null, 2) + "\n"], { type: "application/json" }));
      link.download = "story.json";
      link.click();
    }
  });

  let drag = null;
  window.addEventListener("pointerdown", (event) => {
    if (!fly.on || panel.contains(event.target)) return;
    drag = { x: event.clientX, y: event.clientY, pan: event.shiftKey };
  });
  window.addEventListener("pointermove", (event) => {
    if (!drag) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    drag.x = event.clientX;
    drag.y = event.clientY;
    if (drag.pan) {
      const scale = fly.distance * 0.0015;
      fly.look[0] -= (Math.cos(fly.yaw) * dx) * scale;
      fly.look[2] += (Math.sin(fly.yaw) * dx) * scale;
      fly.look[1] += dy * scale;
    } else {
      fly.yaw -= dx * 0.005;
      fly.pitch = Math.max(-1.4, Math.min(1.4, fly.pitch + dy * 0.005));
    }
    applyFly();
  });
  window.addEventListener("pointerup", () => (drag = null));
  window.addEventListener(
    "wheel",
    (event) => {
      if (!fly.on || panel.contains(event.target)) return;
      event.preventDefault();
      fly.distance = Math.max(0.05, fly.distance * (1 + event.deltaY * 0.001));
      applyFly();
    },
    { passive: false },
  );

  render();
}
