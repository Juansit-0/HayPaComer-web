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
  item("i13", "Double cream cheese", 400, TRAYS.bottom, 18),
  item("i14", "Blackberries", 250, TRAYS.bottom, 3, ["AT_RISK"]),
  item("i15", "Beef steak", 500, TRAYS.bottom, 2),
  item("i16", "Green onion", 200, TRAYS.drawer, 8),
  item("i17", "Lime", 300, TRAYS.door, 18),
];
const sum = (trayId) => inventory.filter((entry) => entry.trayId === trayId).reduce((total, entry) => total + entry.grams, 0);
const tray = (id, name) => ({ id, type: "TRAY", kind: null, name, grams: sum(id), items: inventory.filter((entry) => entry.trayId === id).length, children: [] });
// The fridge's trays come from its shape, as the backend fits them; the first trays keep the ids the inventory above uses.
const SHAPE_EXAMPLES = [
  ["challenger-cr050", { type: "MINIBAR", shelves: 2, doorRacks: 3, drawers: 0, freezerShelves: 1, hinge: "LEFT", widthCm: 43, heightCm: 58, depthCm: 49 }],
  ["top-freezer", { type: "TOP_FREEZER", shelves: 3, doorRacks: 3, drawers: 1, freezerShelves: 1, hinge: "LEFT", widthCm: 60, heightCm: 165, depthCm: 65 }],
  ["bottom-freezer", { type: "BOTTOM_FREEZER", shelves: 3, doorRacks: 3, drawers: 1, freezerShelves: 2, hinge: "LEFT", widthCm: 60, heightCm: 185, depthCm: 65 }],
  ["side-by-side", { type: "SIDE_BY_SIDE", shelves: 4, doorRacks: 4, drawers: 2, freezerShelves: 4, hinge: "LEFT", widthCm: 90, heightCm: 178, depthCm: 70 }],
  ["single-door", { type: "SINGLE_DOOR", shelves: 3, doorRacks: 3, drawers: 1, freezerShelves: 1, hinge: "LEFT", widthCm: 55, heightCm: 145, depthCm: 60 }],
];
let shape = { type: "TOP_FREEZER", shelves: 3, doorRacks: 1, drawers: 1, freezerShelves: 1, hinge: "LEFT", widthCm: 72, heightCm: 170, depthCm: 66 };
const named = (count, first, names, more) => Array.from({ length: count }, (_, index) => [index < first.length ? first[index] : `${more}-${index + 1}`, names[index] ?? `${names.at(-1)} ${index + 1}`]);
// Litres per part, roughly the server's; the door rack is kept full so the "full" message can be seen.
const LITRES = { SHELF: 14, DRAWER: 9, DOOR: 2, FREEZER: 10 };
const rooms = () => fridges()[0].children.flatMap((zone) => zone.children.map((entry) => {
  const usedLiters = Math.round((sum(entry.id) / 600) * 10) / 10;
  return { trayId: entry.id, capacityLiters: zone.kind === "DOOR" ? Math.max(usedLiters, 0.2) : LITRES[zone.kind], usedLiters };
}));
const fridges = () => [{ id: F, type: "FRIDGE", kind: null, name: "Kitchen", grams: inventory.reduce((total, entry) => total + entry.grams, 0), items: inventory.length, children: [
  { id: "z1", type: "ZONE", kind: "SHELF", name: "Shelves", grams: 0, items: 0, children: named(shape.shelves, [TRAYS.top, TRAYS.middle, TRAYS.bottom], ["Top", "Middle", "Bottom"], "t-shelf").map(([id, name], index) => tray(id, index > 2 ? `Shelf ${index + 1}` : name)) },
  { id: "z2", type: "ZONE", kind: "DRAWER", name: "Drawer", grams: 0, items: 0, children: named(shape.drawers, [TRAYS.drawer], ["Vegetables"], "t-drawer").map(([id], index) => tray(id, index ? `Drawer ${index + 1}` : "Vegetables")) },
  { id: "z3", type: "ZONE", kind: "DOOR", name: "Door", grams: 0, items: 0, children: named(shape.doorRacks, [TRAYS.door], ["Rack"], "t-rack").map(([id], index) => tray(id, index ? `Rack ${index + 1}` : "Rack")) },
  { id: "z4", type: "ZONE", kind: "FREEZER", name: "Freezer", grams: 0, items: 0, children: named(shape.freezerShelves, [], ["Top"], "t-freezer").map(([id], index) => tray(id, ["Top", "Middle", "Bottom"][index] ?? `Shelf ${index + 1}`)) },
].filter((zone) => zone.children.length) }];
const requirement = (food, grams) => ({ food, grams, verdict: "ENOUGH", availableGrams: grams, shortfallGrams: 0, substitute: null });
const recipe = (name, minutes, foods) => ({ id: name, name, servings: 2, minutes, requirements: foods.map(([food, grams]) => ({ food, grams, optional: false })), steps: [{ instruction: "Cook", timerSeconds: null, weighFood: null, weighGrams: null }] });
const recipes = [recipe("Scrambled eggs with tomato", 10, [["Egg", 120], ["Tomato", 100]]), recipe("Pasta con tomate", 25, [["Tomato", 200], ["Cheese", 50]]), recipe("Arroz con pollo", 35, [["Chicken breast", 300], ["Carrot", 100]])];
const tally = (consumed, rescued, discarded) => ({ consumedGrams: consumed, rescuedGrams: rescued, discardedGrams: discarded, wasteRate: discarded / Math.max(1, consumed + discarded) });
const notifications = [
  { id: "n1", type: "DOOR_LEFT_OPEN", title: "Puerta abierta", body: "La puerta de la nevera lleva 2 minutos abierta.", at: new Date(Date.now() - 3600000).toISOString(), readAt: null },
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
  [/^\/households$/, () => [{ id: H, name: "Casa", currency: "COP", timezone: "America/Bogota", role: "OWNER", myRole: "OWNER" }]],
  [/^\/households\/[^/]+$/, () => ({ id: H, name: "Casa", currency: "COP", timezone: "America/Bogota", myRole: "OWNER", members: [{ userId: "u1", name: "Juan", role: "OWNER" }] })],
  [/^\/households\/[^/]+\/fridges$/, fridges],
  [/^\/households\/[^/]+\/fridges\/[^/]+\/shape$/, () => shape],
  [/^\/households\/[^/]+\/fridges\/[^/]+\/space$/, () => rooms()],
  [/^\/fridge-examples$/, () => SHAPE_EXAMPLES.map(([key, example]) => ({ key, shape: example }))],
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
    if (request.method === "PUT" && /\/fridges\/[^/]+\/shape$/.test(path)) {
      const chunks = [];
      request.on("data", (chunk) => chunks.push(chunk));
      request.on("end", () => {
        const wanted = JSON.parse(Buffer.concat(chunks).toString() || "{}");
        const held = (id) => inventory.some((entry) => entry.trayId === id);
        const shelves = [TRAYS.top, TRAYS.middle, TRAYS.bottom].slice(wanted.shelves);
        const blocked = [...shelves, ...(wanted.drawers ? [] : [TRAYS.drawer]), ...(wanted.doorRacks ? [] : [TRAYS.door])].find(held);
        if (blocked) {
          response.writeHead(409, { "content-type": "application/problem+json" });
          response.end(JSON.stringify({ title: "Tray holds food", detail: "Tray still holds food", trayId: blocked }));
          return;
        }
        shape = wanted;
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify(shape));
      });
      return;
    }
    if (request.method === "POST" && /^\/households\/[^/]+\/items$/.test(path)) {
      const chunks = [];
      request.on("data", (chunk) => chunks.push(chunk));
      request.on("end", () => {
        const { food, grams, trayId } = JSON.parse(Buffer.concat(chunks).toString() || "{}");
        const added = item(`i${inventory.length + 100}`, food, grams, trayId, 7);
        inventory.push(added);
        response.writeHead(201, { "content-type": "application/json" });
        response.end(JSON.stringify(added));
      });
      return;
    }
    const moving = request.method === "POST" && path.match(/\/items\/([^/]+)\/move$/);
    if (moving) {
      const chunks = [];
      request.on("data", (chunk) => chunks.push(chunk));
      request.on("end", () => {
        const { trayId } = JSON.parse(Buffer.concat(chunks).toString() || "{}");
        const room = rooms().find((candidate) => candidate.trayId === trayId);
        const entry = inventory.find((candidate) => candidate.id === moving[1]);
        if (room && 0.25 > room.capacityLiters - room.usedLiters) {
          response.writeHead(409, { "content-type": "application/problem+json" });
          response.end(JSON.stringify({ title: "Tray full", detail: "Tray full", trayId, freeLiters: 0 }));
          return;
        }
        if (entry) entry.trayId = trayId;
        response.writeHead(200, { "content-type": "application/json" });
        response.end("{}");
      });
      return;
    }
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
