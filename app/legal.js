import { t } from "./i18n.js";
import { esc } from "./ui.js";

export const LEGAL = {
  privacy: ["who", "data", "health", "use", "ai", "where", "shared", "browser", "time", "rights", "minors", "changes"],
  terms: ["what", "account", "household", "food", "chef", "kit", "conduct", "liability", "end", "law"],
};

// A section's text keeps its line breaks: lines that start with "- " form a list, the rest are paragraphs.
function body(text) {
  const blocks = [];
  for (const line of text.split("\n").map((entry) => entry.trim()).filter(Boolean)) {
    const item = line.startsWith("- ");
    const last = blocks.at(-1);
    if (item && last?.list) last.lines.push(line.slice(2));
    else blocks.push({ list: item, lines: [item ? line.slice(2) : line] });
  }
  return blocks.map((block) => (block.list ? `<ul>${block.lines.map((line) => `<li>${esc(line)}</li>`).join("")}</ul>` : `<p>${esc(block.lines[0])}</p>`)).join("");
}

export function legalLinks() {
  return `<a href="#/privacy">${t("legal.privacy.link")}</a><a href="#/terms">${t("legal.terms.link")}</a>`;
}

export function renderLegal(main, kind, back) {
  const other = kind === "privacy" ? "terms" : "privacy";
  main.innerHTML = `<article class="legal" aria-labelledby="legal-title">
    <header>
      <h1 id="legal-title">${t(`legal.${kind}.title`)}</h1>
      <p class="lead">${t(`legal.${kind}.lead`)}</p>
      <p class="legal-updated">${t("legal.updated")}</p>
    </header>
    ${LEGAL[kind].map((section) => `<section aria-labelledby="legal-${section}"><h2 id="legal-${section}">${t(`legal.${kind}.${section}.title`)}</h2>${body(t(`legal.${kind}.${section}.text`))}</section>`).join("")}
    <nav class="legal-nav" aria-label="${esc(t("legal.nav"))}">
      <a class="button primary" href="${back}">${t("legal.back")}</a>
      <a class="button" href="#/${other}">${t(`legal.${other}.link`)}</a>
    </nav>
  </article>`;
  main.querySelector("h1").focus?.();
  scrollTo(0, 0);
}
