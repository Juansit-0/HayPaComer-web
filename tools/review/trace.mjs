// Measure a screen of the mock: frame intervals, long tasks, layout shift and live WebGL contexts.
// usage: node tools/review/trace.mjs <route> <out.json> [width] [seconds]
// env: OUT_SIGNED=1 signed out, WHEEL=<px per step,steps> scripted wheel, CPU=<throttle rate>, SETTLE=<ms before measuring>
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const [route = "now", out = "trace.json", width = "1440", seconds = "6"] = process.argv.slice(2);
const height = Number(width) < 700 ? 844 : 900;
const mobile = 700 > Number(width);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const profile = mkdtempSync(join(tmpdir(), "hpc-trace-"));
const port = 9300 + Math.floor(Math.random() * 600);
const chrome = spawn("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "--use-angle=metal", "--enable-webgl", "--ignore-gpu-blocklist", "--no-first-run", `--window-size=${width},${height}`, "about:blank"], { stdio: "ignore" });

const PROBE = `(() => {
  const live = new Set();
  const getContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, options) {
    const context = getContext.call(this, type, options);
    if (context && /webgl/.test(type)) {
      live.add(context);
      const getExtension = context.getExtension.bind(context);
      context.getExtension = (name) => {
        const extension = getExtension(name);
        if (extension && name === "WEBGL_lose_context") {
          const lose = extension.loseContext.bind(extension);
          extension.loseContext = () => { live.delete(context); lose(); };
        }
        return extension;
      };
      this.addEventListener("webglcontextlost", () => live.delete(context));
    }
    return context;
  };
  const probe = { frames: [], long: [], shift: 0, live: () => [...live].filter((gl) => !gl.isContextLost()).length, created: () => live.size };
  new PerformanceObserver((list) => list.getEntries().forEach((entry) => probe.long.push(entry.duration))).observe({ type: "longtask", buffered: true });
  new PerformanceObserver((list) => list.getEntries().forEach((entry) => { if (!entry.hadRecentInput) probe.shift += entry.value; })).observe({ type: "layout-shift", buffered: true });
  window.__probe = probe;
})();`;

try {
  let target;
  for (let attempt = 0; 50 > attempt && !target; attempt++) {
    await sleep(200);
    target = await fetch(`http://127.0.0.1:${port}/json`).then((response) => response.json()).then((list) => list.find((entry) => entry.type === "page")).catch(() => null);
  }
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve) => (ws.onopen = resolve));
  let id = 0;
  const waiting = new Map();
  ws.onmessage = ({ data }) => {
    const message = JSON.parse(data);
    if (message.id && waiting.has(message.id)) {
      waiting.get(message.id)(message);
      waiting.delete(message.id);
    }
  };
  const send = (method, params = {}) => new Promise((resolve) => { const n = ++id; waiting.set(n, resolve); ws.send(JSON.stringify({ id: n, method, params })); });
  const evaluate = async (expression) => (await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true })).result.result?.value;
  await send("Page.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: Number(width), height, deviceScaleFactor: mobile ? 3 : 1, mobile });
  if (process.env.CPU) await send("Emulation.setCPUThrottlingRate", { rate: Number(process.env.CPU) });
  await send("Page.addScriptToEvaluateOnNewDocument", { source: PROBE });
  await send("Page.navigate", { url: "http://localhost:8091/" });
  await sleep(800);
  const jwt = "x." + Buffer.from(JSON.stringify({ exp: 4102444800, sub: "u1" })).toString("base64").replace(/=+$/, "") + ".y";
  await evaluate(process.env.OUT_SIGNED ? "localStorage.clear()" : `localStorage.setItem("hpc.access", "${jwt}"); localStorage.setItem("hpc.refresh", "mock"); localStorage.setItem("hpc.household", "11111111-1111-4111-8111-111111111111")`);
  await evaluate(`localStorage.setItem("hpc.locale", "es-CO")`);
  await send("Page.navigate", { url: `http://localhost:8091/#/${route}` });
  await sleep(Number(process.env.SETTLE ?? 5000));
  await evaluate(`(() => { const probe = window.__probe; probe.frames = []; probe.long = []; probe.shift = 0; let last = 0; const tick = (now) => { if (last) probe.frames.push(now - last); last = now; requestAnimationFrame(tick); }; requestAnimationFrame(tick); })()`);
  const [step = 0, steps = 0] = (process.env.WHEEL ?? "").split(",").map(Number);
  const start = Date.now();
  for (let index = 0; steps > index; index++) {
    await send("Input.dispatchMouseEvent", { type: "mouseWheel", x: Number(width) / 2, y: height / 2, deltaX: 0, deltaY: step });
    await sleep(Math.max(16, (Number(seconds) * 1000) / steps));
  }
  const left = Number(seconds) * 1000 - (Date.now() - start);
  if (left > 0) await sleep(left);
  const raw = await evaluate(`({ frames: window.__probe.frames, long: window.__probe.long, shift: window.__probe.shift, live: window.__probe.live(), created: window.__probe.created(), hpc: window.__hpc ?? null })`);
  const sorted = [...raw.frames].sort((a, b) => a - b);
  const at = (q) => Number((sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))] ?? 0).toFixed(2));
  const interval = at(0.5);
  const metrics = {
    route,
    width: Number(width),
    cpu: Number(process.env.CPU ?? 1),
    frames: sorted.length,
    p50: interval,
    p95: at(0.95),
    max: at(1),
    dropped: Number((raw.frames.filter((value) => value > interval * 1.5).length / Math.max(1, raw.frames.length)).toFixed(3)),
    longTasks: raw.long.length,
    longest: Number(Math.max(0, ...raw.long).toFixed(1)),
    cls: Number(raw.shift.toFixed(4)),
    webglLive: raw.live,
    webglCreated: raw.created,
    hpc: raw.hpc,
  };
  writeFileSync(out, JSON.stringify(metrics, null, 2));
  console.log(JSON.stringify(metrics));
} finally {
  chrome.kill();
  setTimeout(() => rmSync(profile, { recursive: true, force: true }), 500);
}
