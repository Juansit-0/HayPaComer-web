// Drag a food in the 3D fridge with real mouse input and watch it come home after a failed or cancelled drop.
// usage: node tools/review/drop.mjs <move|use> [fail]   (fail adds ?fail=move so the mock answers 500)
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const [kind = "move", fail = ""] = process.argv.slice(2);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const profile = mkdtempSync(join(tmpdir(), "hpc-drop-"));
const port = 9300 + Math.floor(Math.random() * 600);
const chrome = spawn("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "--use-angle=metal", "--enable-webgl", "--ignore-gpu-blocklist", "--no-first-run", "--window-size=1440,900", "about:blank"], { stdio: "ignore" });
const done = () => { chrome.kill(); setTimeout(() => rmSync(profile, { recursive: true, force: true }), 500); };
setTimeout(() => { console.log("timed out"); done(); setTimeout(() => process.exit(2), 600); }, 90000).unref();

try {
  let target;
  for (let attempt = 0; 50 > attempt && !target; attempt++) {
    await sleep(200);
    target = await fetch(`http://127.0.0.1:${port}/json`).then((r) => r.json()).then((list) => list.find((entry) => entry.type === "page")).catch(() => null);
  }
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve) => (ws.onopen = resolve));
  let id = 0;
  const waiting = new Map();
  ws.onmessage = ({ data }) => {
    const message = JSON.parse(data);
    if (message.id && waiting.has(message.id)) { waiting.get(message.id)(message); waiting.delete(message.id); }
  };
  const send = (method, params = {}) => new Promise((resolve) => { const n = ++id; waiting.set(n, resolve); ws.send(JSON.stringify({ id: n, method, params })); });
  const evaluate = async (expression) => (await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true })).result.result?.value;
  const mouse = (type, x, y) => send("Input.dispatchMouseEvent", { type, x, y, button: "left", buttons: type === "mouseReleased" ? 0 : 1, clickCount: 1 });
  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: "http://localhost:8091/" });
  await sleep(800);
  const jwt = "x." + Buffer.from(JSON.stringify({ exp: 4102444800, sub: "u1" })).toString("base64").replace(/=+$/, "") + ".y";
  await evaluate(`localStorage.setItem("hpc.access", "${jwt}"); localStorage.setItem("hpc.refresh", "mock"); localStorage.setItem("hpc.household", "11111111-1111-4111-8111-111111111111"); localStorage.setItem("hpc.locale", "es-CO")`);
  await send("Page.navigate", { url: `http://localhost:8091/?dev=drop${fail ? `&fail=${kind === "use" ? "consume" : "move"}` : ""}#/fridge/t-top` });
  await sleep(7000);
  const where = await evaluate(`(() => {
    const { items, camera, canvas, shelves } = window.__hpc.fridge;
    const box = canvas.getBoundingClientRect();
    const screen = (object) => { const v = object.getWorldPosition(object.position.clone()).project(camera); return { x: box.left + (v.x + 1) / 2 * box.width, y: box.top + (1 - v.y) / 2 * box.height }; };
    const { pick } = window.__hpc.fridge;
    const shelf = shelves()[2];
    for (const model of items.children.filter((m) => m.userData.item?.trayId === "t-top" && m.userData.item.usable)) {
      const base = screen(model);
      for (let dy = 0; 60 >= dy; dy += 4) {
        for (const dx of [0, -6, 6]) {
          const hit = pick(base.x + dx, base.y - dy);
          if (hit?.object.userData.item?.id === model.userData.item.id) {
            window.__dropModel = model;
            return { from: { x: base.x + dx, y: base.y - dy }, to: screen(shelf), key: model.userData.key };
          }
        }
      }
    }
    return null;
  })()`);
  console.log("probe", JSON.stringify(await evaluate(`(() => { const p = ${JSON.stringify(where.from)}; const el = document.elementFromPoint(p.x, p.y); const hit = window.__hpc.fridge.pick(p.x, p.y); return { el: el?.className, route: window.__hpc.fridge.state.route, hit: hit?.object.userData.item?.id ?? hit?.object.userData.part ?? null, door: window.__hpc.fridge.state.door.toFixed(2) }; })()`)));
  await evaluate(`(() => { window.__frames = []; let last = 0; const tick = (now) => { if (last) window.__frames.push(now - last); last = now; if (window.__frames.length < 2000) requestAnimationFrame(tick); }; requestAnimationFrame(tick); })()`);
  await send("Profiler.enable");
  await send("Profiler.start");
  await mouse("mouseMoved", where.from.x, where.from.y);
  if (process.env.HOVER) {
    for (let step = 1; 24 >= step; step++) { await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: where.from.x + step * 8, y: where.from.y + step * 6 }); await sleep(30); }
    console.log("hover frames", JSON.stringify(await evaluate(`(() => { const f = [...window.__frames].sort((a, b) => a - b); return { n: f.length, p50: Number(f[Math.floor(f.length * 0.5)].toFixed(1)), p95: Number(f[Math.floor(f.length * 0.95)].toFixed(1)) }; })()`)));
    window.__frames = [];
  }
  await mouse("mousePressed", where.from.x, where.from.y);
  let to = where.to;
  for (let step = 1; 12 >= step; step++) {
    if (kind === "use" && step === 6) {
      const zone = await evaluate(`(() => { const z = document.querySelector('[data-zone="use"]'); if (!z) return null; const r = z.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
      if (zone) to = zone;
    }
    await mouse("mouseMoved", where.from.x + ((to.x - where.from.x) * step) / 12, where.from.y + ((to.y - where.from.y) * step) / 12);
    await sleep(30);
  }
  const frames = await evaluate(`(() => { const f = [...window.__frames].sort((a, b) => a - b); return { n: f.length, p95: Number(f[Math.floor(f.length * 0.95)].toFixed(1)), max: Number(f.at(-1).toFixed(1)) }; })()`);
  console.log("drag frames", JSON.stringify(frames));
  const { result } = await send("Profiler.stop");
  if (process.env.PROFILE) {
    const self = new Map();
    const nodes = new Map(result.profile.nodes.map((node) => [node.id, node]));
    const counts = new Map();
    result.profile.samples.forEach((sample) => counts.set(sample, (counts.get(sample) ?? 0) + 1));
    counts.forEach((count, nodeId) => { const f = nodes.get(nodeId).callFrame; const key = `${f.functionName || "(anon)"} ${f.url.split("/").pop()}:${f.lineNumber + 1}`; self.set(key, (self.get(key) ?? 0) + count); });
    console.log([...self].sort((a, b) => b[1] - a[1]).slice(0, 15).map(([k, v]) => `${v} ${k}`).join("\n"));
  }
  const during = await evaluate(`({ dragging: window.__hpc.fridge.flights.size, x: window.__dropModel.position.x.toFixed(3) })`);
  await mouse("mouseReleased", to.x, to.y);
  const released = Date.now();
  const atRelease = await evaluate(`({ flying: window.__hpc.fridge.flights.has(window.__dropModel), visible: window.__dropModel.visible })`);
  console.log("from", JSON.stringify(where), "during", JSON.stringify(during), "atRelease", JSON.stringify(atRelease));
  if (kind === "use") {
    await sleep(900);
    const sheet = await evaluate(`Boolean(document.querySelector("dialog.sheet[open]"))`);
    await evaluate(`document.querySelector("dialog.sheet [data-close]")?.click()`);
    console.log("sheet opened:", sheet);
  }
  const closed = Date.now();
  const samples = [];
  for (let n = 0; 30 > n; n++) {
    samples.push([Date.now() - closed, await evaluate(`(() => { const m = window.__dropModel; return { visible: m.visible, attached: Boolean(m.parent), scale: Number(m.scale.x.toFixed(3)), flying: window.__hpc.fridge.flights.has(m) }; })()`)]);
    await sleep(60);
  }
  const home = samples.find(([, s]) => s.visible && s.attached && !s.flying);
  console.log("toast:", await evaluate(`document.querySelector("[data-toast]").textContent`));
  console.log(JSON.stringify({ kind, fail: Boolean(fail), sinceRelease: closed - released, homeAfterMs: home ? home[0] : null, last: samples.at(-1)[1], first: samples[0][1] }));
} finally {
  done();
}
