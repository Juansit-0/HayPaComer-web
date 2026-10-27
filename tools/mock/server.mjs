// Local mock of the HayPaComer API so the web UI can be reviewed without Docker.
import { createServer } from "node:http";
import { readFileSync, readdirSync, existsSync, statSync, writeFileSync } from "node:fs";
import { join, extname } from "node:path";

const WEB = new URL("../..", import.meta.url).pathname.replace(/\/$/, "");
const MIGRATIONS = process.env.MIGRATIONS ?? new URL("../../../HayPaComer-backend/adapter-persistence/src/main/resources/db/migration", import.meta.url).pathname;
const H = "11111111-1111-4111-8111-111111111111";
const F = "22222222-2222-4222-8222-222222222222";
const TRAYS = { top: "t-top", middle: "t-mid", bottom: "t-bot", drawer: "t-drw", door: "t-door" };

const texts = { "es-CO": {}, en: {} };
for (const file of readdirSync(MIGRATIONS).filter((name) => name.endsWith(".sql")).sort((a, b) => parseInt(a.slice(1)) - parseInt(b.slice(1)))) {
  const sql = readFileSync(join(MIGRATIONS, file), "utf8");
  for (const match of sql.matchAll(/\('(es-CO|en)',\s*'((?:[^']|'')+)',\s*'((?:[^']|'')*)'\)/g)) texts[match[1]][match[2].replace(/''/g, "'")] = match[3].replace(/''/g, "'");
}

const day = (offset) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
const item = (id, name, grams, trayId, days, statuses = [], extra = {}) => ({ id, name, grams, trayId, fridgeId: F, expiresOn: days === null ? null : day(days), expirySource: "ESTIMATED", statuses, usable: true, openedOn: null, ...extra });
const inventory = [
  item("i1", "Tomato", 360, TRAYS.top, 1, ["AT_RISK"]),
  item("i2", "Tuna", 180, TRAYS.top, 2, ["AT_RISK"]),
  item("i3", "Milk", 842, TRAYS.top, 7),
  item("i4", "Yogurt", 125, TRAYS.top, 10),
  item("i5", "Egg", 360, TRAYS.middle, 21),
  item("i6", "Chicken breast", 400, TRAYS.middle, 1, ["AT_RISK"]),
  item("i7", "Cheese", 250, TRAYS.middle, 14),
  item("i8", "Carrot", 500, TRAYS.drawer, 12),
  item("i9", "Avocado", 400, TRAYS.drawer, 3),
  item("i10", "Potato", 1000, TRAYS.drawer, 30),
  item("i11", "Orange juice", 1000, TRAYS.door, 9),
  item("i12", "Butter", 250, TRAYS.door, 40),
];
const sum = (trayId) => inventory.filter((entry) => entry.trayId === trayId).reduce((total, entry) => total + entry.grams, 0);
const tray = (id, name) => ({ id, type: "TRAY", kind: null, name, grams: sum(id), items: inventory.filter((entry) => entry.trayId === id).length, children: [] });
const fridges = () => [{ id: F, type: "FRIDGE", kind: null, name: "Kitchen", grams: inventory.reduce((total, entry) => total + entry.grams, 0), items: inventory.length, children: [
  { id: "z1", type: "ZONE", kind: "SHELF", name: "Shelves", grams: 0, items: 0, children: [tray(TRAYS.top, "Top"), tray(TRAYS.middle, "Middle"), tray(TRAYS.bottom, "Bottom")] },
  { id: "z2", type: "ZONE", kind: "DRAWER", name: "Vegetable drawer", grams: 0, items: 0, children: [tray(TRAYS.drawer, "Drawer")] },
  { id: "z3", type: "ZONE", kind: "DOOR", name: "Door", grams: 0, items: 0, children: [tray(TRAYS.door, "Door shelf")] },
] }];
const requirement = (food, grams) => ({ food, grams, verdict: "ENOUGH", availableGrams: grams, shortfallGrams: 0, substitute: null });
const recipe = (name, minutes, foods) => ({ id: name, name, servings: 2, minutes, requirements: foods.map(([food, grams]) => ({ food, grams, optional: false })), steps: [{ instruction: "Cook", timerSeconds: null, weighFood: null, weighGrams: null }] });
const recipes = [recipe("Scrambled eggs with tomato", 10, [["Egg", 120], ["Tomato", 100]]), recipe("Pasta con tomate", 25, [["Tomato", 200], ["Cheese", 50]]), recipe("Arroz con pollo", 35, [["Chicken breast", 300], ["Carrot", 100]])];
const tally = (consumed, rescued, discarded) => ({ consumedGrams: consumed, rescuedGrams: rescued, discardedGrams: discarded, wasteRate: discarded / Math.max(1, consumed + discarded) });
const notifications = [
  { id: "n1", type: "ALERT", title: "Puerta abierta", body: "La puerta de la nevera lleva 2 minutos abierta.", at: new Date(Date.now() - 3600000).toISOString(), readAt: null },
  { id: "n2", type: "BRIEFING", title: "Usa primero el tomate", body: "Vence mañana: 360 g de tomate.", at: new Date(Date.now() - 86400000).toISOString(), readAt: new Date().toISOString() },
];

const market = [
  { id: "m1", food: "Onion", grams: 500, source: "MANUAL", category: "VEGETABLE", checked: false },
  { id: "m2", food: "Tomato", grams: 1000, source: "PLAN", category: "VEGETABLE", checked: false },
  { id: "m3", food: "Milk", grams: 1000, source: "RECIPE", category: "DAIRY", checked: false },
  { id: "m4", food: "Rice", grams: 1000, source: "MANUAL", category: "GRAIN", checked: true },
];

const routes = [
  [/^\/i18n$/, () => ({ available: [{ code: "es-CO", name: "Español", isDefault: true }, { code: "en", name: "English", isDefault: false }], current: "es-CO" })],
  [/^\/i18n\/(.+)$/, (m) => texts[decodeURIComponent(m[1])] ?? {}],
  [/^\/me$/, () => ({ id: "u1", email: "juan@example.test", displayName: "Juan", locale: "es-CO" })],
  [/^\/households$/, () => [{ id: H, name: "Casa", currency: "COP", timezone: "America/Bogota", role: "OWNER" }]],
  [/^\/households\/[^/]+$/, () => ({ id: H, name: "Casa", currency: "COP", timezone: "America/Bogota", members: [{ userId: "u1", name: "Juan", role: "OWNER" }] })],
  [/^\/households\/[^/]+\/fridges$/, fridges],
  [/^\/households\/[^/]+\/fridges\/[^/]+\/twin$/, () => ({ fridgeId: F, doorOpen: false, celsius: 4.2 })],
  [/^\/households\/[^/]+\/inventory/, () => inventory],
  [/^\/households\/[^/]+\/kitchen$/, () => ({ totalGrams: inventory.reduce((t, e) => t + e.grams, 0), items: inventory.length, atRisk: 3, expired: 0 })],
  [/^\/households\/[^/]+\/recipes$/, () => recipes],
  [/^\/recipe-templates$/, () => []],
  [/^\/households\/[^/]+\/suggestions$/, () => ({ suggestions: recipes.map((entry) => ({ recipe: entry.name, minutes: entry.minutes, rescuedFoods: ["Tomato"], score: 1, reason: "", evaluation: { requestedServings: 2, verdict: "ENOUGH", requirements: entry.requirements.map((r) => requirement(r.food, r.grams)) } })) })],
  [/^\/households\/[^/]+\/analytics\?/, () => ({ from: day(-29), to: day(0), currency: "COP", moneySaved: 6225, moneyWasted: 1760, unpriced: [], total: tally(520, 270, 80),
    days: Array.from({ length: 30 }, (_, index) => ({ day: day(index - 29), tally: tally(index % 4 ? 0 : 60, index % 6 ? 0 : 40, index === 20 ? 80 : 0) })),
    members: [{ userId: "u1", name: "Juan", tally: tally(320, 270, 0) }, { userId: "u2", name: "Jenifer", tally: tally(200, 0, 80) }],
    foods: [{ foodKey: "chicken breast", tally: tally(0, 0, 80) }, { foodKey: "tomato", tally: tally(150, 150, 0) }] })],
  [/^\/households\/[^/]+\/market-list$/, () => ({ pending: ["VEGETABLE", "DAIRY", "GRAIN"].map((category) => ({ category, items: market.filter((entry) => entry.category === category && !entry.checked) })).filter((group) => group.items.length), checked: market.filter((entry) => entry.checked) })],
  [/^\/households\/[^/]+\/agent\/chat$/, () => ({ conversationId: "c1", answer: "El **tomate** vence mañana y hay 360 g: úsalo hoy en unos huevos pericos o en una salsa para la pasta.\nLa pechuga de pollo también vence mañana.", runs: [{ specialist: "chef" }], evidence: [{ tool: "view_expiries", content: "Tomate 360 g, vence mañana" }, { tool: "query_inventory", content: "Pechuga de pollo 400 g, vence mañana" }] })],
  [/^\/households\/[^/]+\/prices$/, () => ({ Tomato: 4400, "Chicken breast": 18000, Tuna: 30000, Milk: 4200 })],
  [/^\/households\/[^/]+\/market-budget$/, () => ({ currency: "COP", monthly: 600000, spent: 210000, plannedCost: 48000, remaining: 342000, lines: [] })],
  [/^\/households\/[^/]+\/cooking-sessions\/active$/, () => null],
  [/^\/households\/[^/]+\/profiles$/, () => []],
  [/^\/households\/[^/]+\/settings$/, () => []],
  [/^\/me\/notification-preferences$/, () => ({ channels: ["INBOX"], telegramChatId: null })],
  [/^\/agent\/confirmations$/, () => []],
  [/^\/notifications$/, () => notifications],
  [/^\/status$/, () => ({ state: "OK", degraded: [] })],
  [/^\/foods\?/, () => inventory.map((entry) => ({ name: entry.name, category: "VEGETABLE" }))],
];

const TYPES = { ".js": "text/javascript", ".css": "text/css", ".html": "text/html", ".svg": "image/svg+xml", ".jpg": "image/jpeg", ".png": "image/png", ".woff2": "font/woff2", ".json": "application/json", ".glb": "model/gltf-binary" };
createServer((request, response) => {
  const url = request.url;
  if (url.startsWith("/__dev/save") && request.method === "PUT") {
    const target = new URL(url, "http://localhost").searchParams.get("path") ?? "";
    const allowed = target === "app/story/story.json" || target === "app/stage-views.json" || /^app\/stills\/[a-z]+\.webp$/.test(target);
    if (!allowed || !["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(request.socket.remoteAddress)) {
      response.writeHead(403);
      response.end();
      return;
    }
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => {
      writeFileSync(join(WEB, target), Buffer.concat(chunks));
      response.writeHead(204);
      response.end();
    });
    return;
  }
  if (url.startsWith("/api/v1/")) {
    const path = url.slice(7);
    if (path.includes("/stream")) { response.writeHead(200, { "content-type": "text/event-stream" }); return; }
    const marketItem = request.method !== "GET" && path.match(/\/market-list\/items\/([^/]+)(\/check)?$/);
    const failing = path.match(/\/items\/[^/]+\/(move|consume|discard)$/)?.[1] ?? (marketItem ? (marketItem[2] ? "check" : "remove") : null);
    if (failing && (request.headers.referer ?? "").includes(`fail=${failing}`)) { response.writeHead(500, { "content-type": "application/problem+json" }); response.end('{"title":"Mock failure"}'); return; }
    if (marketItem) {
      const entry = market.find((candidate) => candidate.id === marketItem[1]);
      if (entry && marketItem[2]) entry.checked = request.method === "POST";
      else if (entry) market.splice(market.indexOf(entry), 1);
      response.writeHead(204);
      response.end();
      return;
    }
    const route = routes.find(([pattern]) => pattern.test(path));
    if (!route && request.method === "GET") { response.writeHead(404, { "content-type": "application/problem+json" }); response.end('{"title":"Not found"}'); return; }
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify(route ? route[1](path.match(route[0])) : {}));
    return;
  }
  let file = url.split("?")[0].split("#")[0];
  if (file === "/") file = "/index.html";
  const local = file.startsWith("/brand/") ? join(WEB, "assets", file.slice(7)) : join(WEB, file);
  if (!existsSync(local) || statSync(local).isDirectory()) { response.writeHead(404); response.end(); return; }
  response.writeHead(200, { "content-type": TYPES[extname(local)] ?? "application/octet-stream", "cache-control": "no-store" });
  response.end(readFileSync(local));
}).listen(8091, "127.0.0.1", () => console.log("mock on 8091", Object.keys(texts["es-CO"]).length, "texts"));
