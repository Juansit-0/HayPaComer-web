// Node copy of the backend WebTextsTest, plus a rule that subfolders of app/ never ask for texts.
// Enum-derived keys (verdicts, phases, categories, diets, allergens, channels) are only checked by the Java test.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const WEB = new URL("..", import.meta.url).pathname;
const MIGRATIONS = process.env.MIGRATIONS ?? new URL("../../HayPaComer-backend/adapter-persistence/src/main/resources/db/migration", import.meta.url).pathname;
const ROW = /\('(es-CO|en)', '((?:[^']|'')+)', '(?:[^']|'')+'\)/g;
const CALL = /\b(t|plural)\("([a-z0-9.-]+)"/g;
const ATTRIBUTE = /data-i18n(?:-label)?="([a-z0-9.-]+)"/g;
const VISIBLE = />([^<>${}`]*[A-Za-z]{2,}[^<>${}`]*)</g;

const keys = { "es-CO": new Set(), en: new Set() };
for (const file of readdirSync(MIGRATIONS).filter((name) => name.endsWith(".sql"))) {
  for (const match of readFileSync(join(MIGRATIONS, file), "utf8").matchAll(ROW)) keys[match[1]].add(match[2].replace(/''/g, "'"));
}

const app = join(WEB, "app");
const scripts = readdirSync(app).filter((name) => name.endsWith(".js")).sort();
const plain = new Set();
const counted = new Set();
for (const name of scripts) {
  for (const match of readFileSync(join(app, name), "utf8").matchAll(CALL)) (match[1] === "plural" ? counted : plain).add(match[2]);
}
for (const match of readFileSync(join(WEB, "index.html"), "utf8").matchAll(ATTRIBUTE)) plain.add(match[1]);
for (const caption of JSON.parse(readFileSync(join(app, "story", "story.json"), "utf8")).captions) plain.add(`landing.story.${caption.id}`);

const problems = [];
for (const locale of ["es-CO", "en"]) {
  for (const key of plain) if (!keys[locale].has(key)) problems.push(`missing ${locale} ${key}`);
  for (const key of counted) for (const form of [".one", ".other"]) if (!keys[locale].has(key + form)) problems.push(`missing ${locale} ${key}${form}`);
}
for (const name of scripts.filter((script) => script !== "i18n.js")) {
  for (const match of readFileSync(join(app, name), "utf8").matchAll(VISIBLE)) {
    if (match[1].trim()) problems.push(`visible literal in ${name}: ${match[1].trim().slice(0, 80)}`);
  }
}

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}
for (const dir of readdirSync(app).map((name) => join(app, name)).filter((path) => statSync(path).isDirectory() && !path.endsWith("vendor"))) {
  for (const file of walk(dir).filter((path) => path.endsWith(".js"))) {
    if (CALL.test(readFileSync(file, "utf8"))) problems.push(`texts asked for outside top-level app/: ${file.slice(WEB.length)}`);
    CALL.lastIndex = 0;
  }
}

if (problems.length) {
  console.error(problems.join("\n"));
  process.exit(1);
}
console.log(`texts ok: ${plain.size} keys, ${counted.size} plurals, ${scripts.length} scripts`);
