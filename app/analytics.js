import { api, freshAccess } from "./api.js";
import { foodName, formatDay, formatMoney, formatNumber, t } from "./i18n.js";
import { esc, foodOptions, formData, grams, moneyField, moneyValue, showError, toast, wireFoodSearch, wireSteppers } from "./ui.js";

const PERIODS = [7, 30, 90];
let chosenDays = 30;
let me = null;

function money(value, currency) {
  return formatMoney(value, currency);
}

function percent(rate) {
  return `${formatNumber(rate * 100, 0 < rate && rate < 0.1 ? 1 : 0)}\u2009%`;
}

function isoDay(date) {
  const pad = (number) => String(number).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function shortDay(iso) {
  return formatDay(iso);
}

function chart(days) {
  const width = 640;
  const height = 220;
  const middle = 140;
  const gap = days.length > 40 ? 1 : 3;
  const step = width / days.length;
  const bar = Math.max(step - gap, 1);
  const top = Math.max(1, ...days.map((day) => Number(day.tally.consumedGrams)));
  const bottom = Math.max(1, ...days.map((day) => Number(day.tally.discardedGrams)));
  const scale = Math.max(top / (middle - 12), bottom / (height - middle - 8));
  const bars = days
    .map((day, index) => {
      const x = (index * step).toFixed(1);
      const eaten = Number(day.tally.consumedGrams) / scale;
      const rescued = Number(day.tally.rescuedGrams) / scale;
      const wasted = Number(day.tally.discardedGrams) / scale;
      return `<g>
        ${eaten ? `<rect class="eaten" x="${x}" y="${(middle - eaten).toFixed(1)}" width="${bar.toFixed(1)}" height="${eaten.toFixed(1)}"/>` : ""}
        ${rescued ? `<rect class="rescued" x="${x}" y="${(middle - rescued).toFixed(1)}" width="${bar.toFixed(1)}" height="${rescued.toFixed(1)}"/>` : ""}
        ${wasted ? `<rect class="wasted" x="${x}" y="${middle}" width="${bar.toFixed(1)}" height="${wasted.toFixed(1)}"/>` : ""}
      </g>`;
    })
    .join("");
  const active = days.filter((day) => Number(day.tally.consumedGrams) || Number(day.tally.discardedGrams));
  return `<figure class="chart">
    <svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="img" aria-labelledby="chart-caption">
      ${bars}
      <line class="axis" x1="0" x2="${width}" y1="${middle}" y2="${middle}"/>
    </svg>
    <div class="chart-scale"><span>${shortDay(days[0].day)}</span><span>${shortDay(days[days.length - 1].day)}</span></div>
    <figcaption id="chart-caption">
      <span class="key rescued">${t("numbers.key.rescued")}</span>
      <span class="key eaten">${t("numbers.key.eaten")}</span>
      <span class="key wasted">${t("numbers.key.wasted")}</span>
    </figcaption>
    <table class="visually-hidden">
      <caption>${t("numbers.table.caption")}</caption>
      <thead><tr><th>${t("numbers.table.day")}</th><th>${t("numbers.table.eaten")}</th><th>${t("numbers.table.rescued")}</th><th>${t("numbers.table.wasted")}</th></tr></thead>
      <tbody>${active
        .map(
          (day) => `<tr><td>${day.day}</td><td>${grams(day.tally.consumedGrams)}</td><td>${grams(day.tally.rescuedGrams)}</td><td>${grams(day.tally.discardedGrams)}</td></tr>`,
        )
        .join("")}</tbody>
    </table>
  </figure>`;
}

function ranking(members) {
  const best = Math.max(1, ...members.map((member) => Number(member.tally.rescuedGrams)));
  return `<ol class="ranking">${members
    .map(
      (member) => `<li>
        <span class="item-name">${esc(member.name)}${member.userId === me ? ` <span class="status quiet">${t("numbers.you")}</span>` : ""}</span>
        <span class="meter" aria-hidden="true"><span style="width:${((Number(member.tally.rescuedGrams) / best) * 100).toFixed(0)}%"></span></span>
        <span class="data">${t("numbers.rescued-grams", { grams: grams(member.tally.rescuedGrams) })}</span>
        <span class="item-meta">${t("numbers.member-detail", { eaten: grams(member.tally.consumedGrams), wasted: grams(member.tally.discardedGrams) })}</span>
      </li>`,
    )
    .join("")}</ol>`;
}

function foods(list) {
  return `<ul class="list">${list
    .slice(0, 8)
    .map(
      (food) => `<li>
        <span class="item-name">${food.foodKey === "unknown" ? t("numbers.unknown-food") : esc(foodName(food.foodKey) === food.foodKey ? food.foodKey.charAt(0).toUpperCase() + food.foodKey.slice(1) : foodName(food.foodKey))}</span>
        <span class="item-meta">${
          Number(food.tally.consumedGrams) ? t("numbers.eaten-grams", { grams: `<span class="data">${grams(food.tally.consumedGrams)}</span>` }) : ""
        }${
          Number(food.tally.discardedGrams) ? `<span class="status attention">${t("numbers.wasted-grams", { grams: grams(food.tally.discardedGrams) })}</span>` : ""
        }</span>
      </li>`,
    )
    .join("")}</ul>`;
}

function ring({ key, grams: amount, rate }) {
  const length = 2 * Math.PI * 42;
  return `<figure class="ring ring-${key}">
    <svg viewBox="0 0 100 100" aria-hidden="true">
      <circle class="ring-track" cx="50" cy="50" r="42"/>
      <circle class="ring-fill" cx="50" cy="50" r="42" stroke-dasharray="${(Math.min(1, rate) * length).toFixed(1)} ${length.toFixed(1)}"/>
    </svg>
    <figcaption>
      <span class="ring-name">${t(`numbers.ring.${key}`)}</span>
      <span class="ring-grams data">${grams(amount)}</span>
      <span class="ring-hint">${t(`numbers.ring.${key}-hint`, { rate: percent(rate) })}</span>
    </figcaption>
  </figure>`;
}

async function download(base, format, from, to) {
  const response = await fetch(`/api/v1${base}/analytics/report?format=${format}&from=${from}&to=${to}`, {
    headers: { Authorization: `Bearer ${await freshAccess()}` },
  });
  if (!response.ok) {
    toast(t("numbers.report-failed"));
    return;
  }
  const name = /filename="([^"]+)"/.exec(response.headers.get("Content-Disposition") ?? "")?.[1] ?? `report.${format}`;
  const link = document.createElement("a");
  link.href = URL.createObjectURL(await response.blob());
  link.download = name;
  link.click();
  URL.revokeObjectURL(link.href);
}

export async function renderAnalytics(main, household) {
  const base = `/households/${household.id}`;
  const to = new Date();
  const from = new Date(to);
  from.setDate(from.getDate() - (chosenDays - 1));
  const [metrics, profile] = await Promise.all([
    api(`${base}/analytics?from=${isoDay(from)}&to=${isoDay(to)}`),
    me ? Promise.resolve(null) : api("/me").catch(() => null),
  ]);
  if (profile) me = profile.id;
  const total = metrics.total;
  const moved = Number(total.consumedGrams) + Number(total.discardedGrams);

  const share = (part, whole) => (Number(whole) > 0 ? Number(part) / Number(whole) : 0);
  const rings = [
    { key: "eaten", grams: total.consumedGrams, rate: share(total.consumedGrams, moved) },
    { key: "rescued", grams: total.rescuedGrams, rate: share(total.rescuedGrams, total.consumedGrams) },
    { key: "wasted", grams: total.discardedGrams, rate: share(total.discardedGrams, moved) },
  ];
  const wasted = [...metrics.foods].sort((a, b) => Number(b.tally.discardedGrams) - Number(a.tally.discardedGrams))[0];
  const rescuer = [...metrics.members].sort((a, b) => Number(b.tally.rescuedGrams) - Number(a.tally.rescuedGrams))[0];
  const foodLabel = (food) => (food.foodKey === "unknown" ? t("numbers.unknown-food") : esc(foodName(food.foodKey)));

  main.innerHTML = `
    <header class="numbers-head">
      <div>
        <h1 id="numbers-title">${t("numbers.title")}</h1>
        <p class="lead">${t("numbers.lead", { from: shortDay(metrics.from), to: shortDay(metrics.to) })}</p>
      </div>
      <div class="segmented" role="group" aria-label="${esc(t("numbers.period"))}">${PERIODS.map(
        (days) => `<button type="button" data-days="${days}" aria-pressed="${days === chosenDays}">${t("numbers.days", { n: days })}</button>`,
      ).join("")}</div>
    </header>

    <section class="numbers-hero" aria-label="${esc(t("numbers.saved"))}">
      <p class="numbers-money">${esc(money(metrics.moneySaved, metrics.currency))}</p>
      <p class="numbers-line">${
        moved === 0 ? t("numbers.empty-lead") : t("numbers.hero-line", { grams: `<b>${grams(total.rescuedGrams)}</b>` })
      }</p>
      ${moved === 0 ? `<a class="button primary" href="#/fridge">${t("numbers.empty-link")}</a>` : ""}
    </section>

    <section class="numbers-rings" aria-label="${esc(t("numbers.period"))}">
      ${rings.map(ring).join("")}
    </section>

    ${
      moved === 0
        ? ""
        : `<section class="numbers-facts">
            <article class="fact">
              <h2>${t("numbers.most-wasted")}</h2>
              ${
                wasted && Number(wasted.tally.discardedGrams)
                  ? `<p class="fact-value">${foodLabel(wasted)} <span class="data">${grams(wasted.tally.discardedGrams)}</span></p>`
                  : `<p class="fact-value">${t("numbers.nothing-wasted")}</p>`
              }
              ${Number(metrics.moneyWasted) ? `<p class="hint">${t("numbers.money-lost", { money: esc(money(metrics.moneyWasted, metrics.currency)) })}</p>` : ""}
            </article>
            ${
              rescuer
                ? `<article class="fact">
                    <h2>${t("numbers.top-rescuer")}</h2>
                    <p class="fact-value">${esc(rescuer.name)}${rescuer.userId === me ? ` <span class="status quiet">${t("numbers.you")}</span>` : ""} <span class="data">${grams(rescuer.tally.rescuedGrams)}</span></p>
                  </article>`
                : ""
            }
          </section>
          <section class="tile" aria-labelledby="daily-title">
            <h2 id="daily-title">${t("numbers.daily")}</h2>
            ${chart(metrics.days)}
          </section>
          ${
            metrics.members.length > 1
              ? `<section class="tile" aria-labelledby="ranking-title"><h2 id="ranking-title">${t("numbers.ranking")}</h2>${ranking(metrics.members)}</section>`
              : ""
          }
          ${
            metrics.foods.length
              ? `<section class="tile" aria-labelledby="foods-title"><h2 id="foods-title">${t("numbers.foods")}</h2>${foods(metrics.foods)}</section>`
              : ""
          }`
    }

    <details class="numbers-more">
      <summary>${t("numbers.more")}</summary>
      <section aria-labelledby="prices-title">
        <h2 id="prices-title">${t("numbers.prices")}</h2>
        <p class="hint">${
          metrics.unpriced.length
            ? t("numbers.unpriced", { foods: metrics.unpriced.map((food) => esc(foodName(food))).join(", ") })
            : t("numbers.reference-prices")
        }</p>
        <form class="row-form" data-price>
          <label class="grow">${t("field.food")}<input name="food" list="price-foods" required autocomplete="off" value="${esc(metrics.unpriced[0] ?? "")}"></label>
          ${moneyField({ name: "price", label: t("numbers.price-per-kg"), currency: metrics.currency, step: 1000 })}
          ${foodOptions("price-foods")}
          <button class="primary" type="submit">${t("numbers.save-price")}</button>
        </form>
        <div class="row-form">
          <button type="button" data-download="markdown">${t("numbers.download-report")}</button>
          <button type="button" data-download="csv">${t("numbers.download-csv")}</button>
        </div>
      </section>
    </details>`;
  wireSteppers(main);

  main.querySelectorAll("[data-days]").forEach((button) =>
    button.addEventListener("click", () => {
      chosenDays = Number(button.dataset.days);
      renderAnalytics(main, household);
    }),
  );
  main.querySelectorAll("[data-download]").forEach((button) =>
    button.addEventListener("click", () => download(base, button.dataset.download, metrics.from, metrics.to)),
  );
  const price = main.querySelector("[data-price]");
  wireFoodSearch(price.querySelector("[name=food]"), api);
  price.addEventListener("submit", async (event) => {
    event.preventDefault();
    const values = formData(price);
    try {
      await api(`${base}/prices`, { method: "PUT", body: { food: values.food, pricePerKg: moneyValue(values.price) } });
      toast(t("numbers.toast-price", { food: foodName(values.food) }));
      renderAnalytics(main, household);
    } catch (error) {
      showError(price, error);
    }
  });
}
