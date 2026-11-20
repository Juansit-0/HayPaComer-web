// What a food comes in, read from its name: "lata de cerveza" is a can and "cerveza en vidrio" a glass bottle, in Spanish or English.
// The drawing follows the container, so two beers in different packs never look the same, and the drink tints it.

const plain = (text) =>
  String(text ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

const has = (text, words) => new RegExp(`(^|[^a-z])(${words})([^a-z]|$)`).test(text);

const DRINKS = [
  ["beer", "cerveza|cervezas|cerveceria|pola|polas|beer|beers|lager|ipa|stout|ale|pilsen|pilsener|chela"],
  ["wine", "vino|vinos|wine|tinto|rose|champana|champagne|cava|espumoso"],
  ["soda", "gaseosa|gaseosas|soda|sodas|cola|refresco|refrescos|coca|pepsi|sprite|ginger|tonica|tonic|pony|colombiana|malta"],
  ["energy", "energizante|energetica|energy|redbull|monster|vive"],
  ["water", "agua|aguas|water|soda water|agua con gas"],
  ["juice", "jugo|jugos|zumo|zumos|juice|nectar|limonada|lemonade"],
  ["milk", "leche|milk|kumis|yogur liquido|avena liquida"],
];

const CONTAINERS = [
  ["can", "lata|latas|latica|enlatado|enlatada|enlatados|can|cans|canned|tin|tinned"],
  ["glass", "vidrio|glass|botellin|porron|envase retornable|retornable"],
  ["plastic", "plastico|plastica|plastic|pet|garrafa|garrafon|botellon"],
  ["bottle", "botella|botellas|bottle|bottles|bottled|embotellada|embotellado"],
  ["carton", "carton|caja|cajita|tetra|tetrapak|brik|box|boxed"],
  ["jar", "frasco|frascos|tarro|tarros|jar|jars|pote"],
  ["bag", "bolsa|bolsita|bag|bagged|sachet|pouch|paquete"],
];

const SIX_PACK = /(six ?pack|sixpack|pack de 6|paca de 6|x ?6([^0-9]|$)|6 ?(latas|cans|botellas|bottles|pack))/;

// The usual size of one unit, so 710 g of canned beer draws two cans.
const UNIT_GRAMS = { can: 360, glass: 340, plastic: 600, bottle: 600, carton: 1000, jar: 400, bag: 500 };

export function packagingOf(name, category) {
  const text = plain(name);
  if (!text) return null;
  const drink = DRINKS.find(([, words]) => has(text, words))?.[0] ?? null;
  let container = CONTAINERS.find(([, words]) => has(text, words))?.[0] ?? null;
  if (!container && !drink) return null;
  if (!container) container = { beer: "glass", wine: "glass", juice: "carton", milk: "carton" }[drink] ?? "plastic";
  if (container === "bottle") container = drink === "beer" || drink === "wine" ? "glass" : "plastic";
  if (container === "carton" && !drink && category !== "BEVERAGE" && category !== "DAIRY") container = "box";
  return { container, drink, sixPack: SIX_PACK.test(text) };
}

export function unitGrams(name, category) {
  const pack = packagingOf(name, category);
  return pack ? (UNIT_GRAMS[pack.container] ?? null) : null;
}

// How many units to draw. Food added by units carries what one weighs, so 2 cans are 2, never more or fewer.
export function packagingCount(pack, grams, pieceGrams) {
  if (Number(pieceGrams) > 0 && Number(grams) > 0) return Math.max(1, Math.min(24, Math.round(Number(grams) / Number(pieceGrams))));
  if (pack.sixPack) return 6;
  const each = UNIT_GRAMS[pack.container];
  if (!each || !Number(grams)) return 1;
  return Math.max(1, Math.min(6, Math.round(Number(grams) / each)));
}

// Colours per drink: the can's paint, the glass, and the label.
export const DRINK_COLORS = {
  beer: { can: "#c9a23a", band: "#1f3f7a", glass: "#6b3d10", liquid: "#d89a2a", label: "#f2e3b8", cap: "#c8a640" },
  wine: { can: "#6a1f2e", band: "#e8d9c0", glass: "#1f3a24", liquid: "#5a1424", label: "#efe6d2", cap: "#6a1f2e" },
  soda: { can: "#c8302c", band: "#f4f1ea", glass: "#2a5a3a", liquid: "#3a1a12", label: "#c8302c", cap: "#c8302c" },
  energy: { can: "#20242a", band: "#3fb0d8", glass: "#20242a", liquid: "#e8d23a", label: "#3fb0d8", cap: "#20242a" },
  water: { can: "#7fb6d8", band: "#ffffff", glass: "#9ec9e0", liquid: "#d8ecf6", label: "#2f7ab0", cap: "#2f7ab0" },
  juice: { can: "#f39a33", band: "#2f7a4a", glass: "#f3b24a", liquid: "#f39a33", label: "#2f7a4a", cap: "#2f7a4a" },
  milk: { can: "#f4f1ea", band: "#3f6f8f", glass: "#f4f1ea", liquid: "#f8f6f0", label: "#3f6f8f", cap: "#3f6f8f" },
  other: { can: "#8c969c", band: "#c8432a", glass: "#2f7a4a", liquid: "#c9a23a", label: "#efe7d6", cap: "#c8432a" },
};
