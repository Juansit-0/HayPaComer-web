import { api, freshAccess } from "./api.js";
import { reduced } from "./motion.js";
import { foodName, formatDay, formatMoney, formatNumber, placeName, plural, t } from "./i18n.js";
import { focusFood, shapeClass, takeFocusRequest, undoable } from "./stage.js";
import {
  busy,
  daysLeft,
  portions,
  esc,
  expiryText,
  formData,
  whenText,
  grams,
  numberField,
  openSheet,
  showError,
  statusPill,
  ticker,
  toast,
} from "./ui.js";

let selectedTray = null;

const CATEGORY_ORDER = [
  "POULTRY",
  "MEAT",
  "FISH",
  "DAIRY",
  "EGGS",
  "VEGETABLE",
  "FRUIT",
  "PREPARED",
  "GRAIN",
  "LEGUME",
  "BEVERAGE",
  "CONDIMENT",
  "OTHER",
];

function twinLine(twin) {
  const door =
    twin.doorOpen === null || twin.doorOpen === undefined
      ? `<span class="status quiet">${t("fridge.door-unknown")}</span>`
      : twin.doorOpen
        ? `<span class="status attention">${t("fridge.door-open")}</span>`
        : `<span class="status">${t("fridge.door-closed")}</span>`;
  const cold =
    twin.celsius === null || twin.celsius === undefined
      ? `<span class="status quiet">${t("fridge.no-temperature")}</span>`
      : `<span class="status"><span class="data">${formatNumber(twin.celsius, 1)} °C</span></span>`;
  return `<div class="twin" data-twin="${esc(twin.fridgeId)}">${door}${cold}</div>`;
}

function shelfChips(fridges) {
  return `<nav class="shelf-chips" aria-label="${esc(t("nav.fridge"))}">${fridges
    .flatMap((fridge) =>
      fridge.children.flatMap((zone) =>
        zone.children.map(
          (tray) => `<a href="#/fridge/${esc(tray.id)}" data-tray="${esc(tray.id)}" ${tray.id === selectedTray ? 'aria-current="true"' : ""}>
            <span>${esc(placeName(zone.name))}: ${esc(placeName(tray.name))}</span>
            <span class="data">${grams(tray.grams)}</span>
          </a>`,
        ),
      ),
    )
    .join("")}</nav>`;
}

// A shelf lists its food as rows: what it is, how much, and one line about when it goes off. Choosing a row unfolds its actions.
function foodRow(item) {
  const hidden = item.name === "Private food";
  const days = daysLeft(item.expiresOn);
  const notable = (item.statuses ?? []).filter((status) => status !== "AT_RISK");
  const actions = `actions-${esc(item.id)}`;
  return `<li class="food-row" data-food-id="${esc(item.id)}" data-key="${esc(item.id)}" tabindex="-1">
    <button class="food-row-head" type="button" ${item.usable ? `aria-expanded="false" aria-controls="${actions}"` : "disabled"}>
      <i class="${shapeClass(item.name)}" aria-hidden="true"></i>
      <span class="item-name">${esc(foodName(item.name))}</span>
      <span class="value">${grams(item.grams)}</span>
      <span class="row-expiry ${days !== null && 1 >= days ? "attention" : ""}">${hidden ? t("fridge.private") : expiryText(item)}</span>
      ${notable.length ? statusPill(notable) : ""}
    </button>
    ${
      item.usable
        ? `<div class="row-actions" id="${actions}" inert><div><form class="card-actions" data-item="${esc(item.id)}">
            ${portions(item.grams)}
            <label class="visually-hidden" for="use-${esc(item.id)}">${esc(t("fridge.grams-of", { food: foodName(item.name) }))}</label>
            <input id="use-${esc(item.id)}" class="grams" name="grams" type="number" inputmode="numeric" min="1" step="1" required value="${Math.max(1, Math.round(item.grams / 2))}">
            <button type="submit" name="action" value="consume">${t("fridge.use")}</button>
            ${item.openedOn ? "" : `<button class="ghost" type="submit" name="action" value="open" formnovalidate>${t("fridge.opened")}</button>`}
            <button class="ghost danger" type="submit" name="action" value="discard" formnovalidate data-hold aria-describedby="hold-hint">${t("fridge.discard")}</button>
          </form></div></div>`
        : ""
    }
  </li>`;
}

function shelfTile(tray, items) {
  return `<section class="tile w-12 shelf-tile" aria-labelledby="tray-title">
    <header>
      <div>
        <h2 id="tray-title">${esc(placeName(tray.name))}</h2>
        <p class="hint">${t("fridge.on-shelf", { grams: grams(tray.grams) })}</p>
      </div>
      <button class="primary" type="button" data-add-food>${t("fridge.add")}</button>
    </header>
    ${
      items.length
        ? `<ul class="food-rows">${items.map(foodRow).join("")}</ul>`
        : `<div class="empty"><p>${t("fridge.empty-shelf")}</p></div>`
    }
  </section>`;
}

function trayOptions(fridges) {
  return fridges.flatMap((fridge) =>
    fridge.children.flatMap((zone) =>
      zone.children.map((tray) => ({
        id: tray.id,
        fridgeId: fridge.id,
        zone: zone.kind ?? "SHELF",
        label: `${placeName(zone.name)}: ${placeName(tray.name)}`,
      })),
    ),
  );
}

function addFoodBody(catalog, trays, trayId, chosen = null) {
  const groups = new Map();
  catalog.forEach((food) => {
    const list = groups.get(food.category) ?? [];
    list.push(food);
    groups.set(food.category, list);
  });
  return `<form class="add-food" data-add-form novalidate>
    <div class="stepper-head"><span data-step-label aria-live="polite"></span><span class="stepper-bar" aria-hidden="true"><span data-step-bar></span></span></div>
    <fieldset class="step">
      <legend>${t("add.step.food")}</legend>
      <label for="add-search" class="visually-hidden">${t("add.search")}</label>
      <input id="add-search" type="search" data-food-search autocomplete="off" placeholder="${esc(t("add.search"))}">
      <button type="button" class="learn" data-learn hidden></button>
      <p class="hint" data-learn-status aria-live="polite"></p>
      <div class="food-groups" data-food-groups>${[...groups.entries()]
        .sort(([left], [right]) => CATEGORY_ORDER.indexOf(left) - CATEGORY_ORDER.indexOf(right))
        .map(
          ([category, foods]) => `<div class="food-group" data-group>
            <h3>${t(`category.${category}`)}</h3>
            <div class="chips">${foods
              .map(
                (food) => `<label class="chip" data-chip="${esc(`${food.name} ${foodName(food.name)}`.toLowerCase())}"><input type="radio" name="food" value="${esc(food.name)}" required ${food.name === chosen ? "checked" : ""}><span>${esc(foodName(food.name))}</span></label>`,
              )
              .join("")}</div>
          </div>`,
        )
        .join("")}</div>
    </fieldset>
    <fieldset class="step">
      <legend>${t("add.step.amount")}</legend>
      ${numberField({ name: "grams", label: t("field.grams"), unit: "g", min: 1, bigStep: 50, value: "" })}
    </fieldset>
    <fieldset class="step">
      <legend>${t("add.step.where")}</legend>
      <div class="chips">${trays
        .map(
          (tray) => `<label class="chip"><input type="radio" name="tray" value="${esc(tray.id)}" ${tray.id === trayId ? "checked" : ""}><span>${esc(tray.label)}</span></label>`,
        )
        .join("")}</div>
      <label class="check"><input type="checkbox" name="opened">${t("add.opened")}</label>
    </fieldset>
    <fieldset class="step">
      <legend>${t("add.step.expiry")}</legend>
      <div class="chips">
        <label class="chip"><input type="radio" name="expiryMode" value="estimate" checked><span>${t("add.expiry.estimate")}</span></label>
        <label class="chip"><input type="radio" name="expiryMode" value="known"><span>${t("add.expiry.known")}</span></label>
        <label class="chip"><input type="radio" name="expiryMode" value="photo"><span>${t("add.expiry.photo")}</span></label>
      </div>
      <div data-mode="known" hidden>
        <label>${t("fridge.expires")}<input type="date" name="expiresOn"></label>
      </div>
      <div data-mode="photo" hidden>
        <label>${t("add.photo")}<input type="file" name="photo" accept="image/jpeg,image/png,image/webp" capture="environment"></label>
      </div>
      <p class="expiry-preview" data-preview aria-live="polite"></p>
    </fieldset>
    <div class="stepper-nav">
      <button type="button" data-step-back>${t("action.back")}</button>
      <button class="primary" type="button" data-step-next>${t("chef.next")}</button>
      <button class="primary" type="submit">${t("fridge.add")}</button>
    </div>
  </form>`;
}

async function readLabel(base, values, file, tray) {
  const body = new FormData();
  body.append("photo", file);
  body.append("food", values.food);
  body.append("zone", tray.zone);
  body.append("opened", String(Boolean(values.opened)));
  const access = await freshAccess();
  const response = await fetch(`/api/v1${base}/items/expiry-from-photo`, {
    method: "POST",
    headers: { Authorization: `Bearer ${access}` },
    body,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.detail || payload.title || t("error.request"));
  return payload;
}

function wireAddFood(dialog, base, trays, onDone) {
  const form = dialog.querySelector("[data-add-form]");
  const preview = form.querySelector("[data-preview]");
  const search = form.querySelector("[data-food-search]");
  let proposal = null;

  search.addEventListener("input", () => {
    const query = search.value.trim().toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
    form.querySelectorAll("[data-chip]").forEach((chip) => {
      const text = chip.dataset.chip.normalize("NFD").replace(/\p{M}/gu, "");
      chip.hidden = Boolean(query) && !text.includes(query);
    });
    form.querySelectorAll("[data-group]").forEach((group) => {
      group.hidden = [...group.querySelectorAll("[data-chip]")].every((chip) => chip.hidden);
    });
    const none = [...form.querySelectorAll("[data-chip]")].every((chip) => chip.hidden);
    learn.hidden = !query || !none;
    learn.textContent = t("add.learn", { food: search.value.trim() });
  });

  const learn = form.querySelector("[data-learn]");
  const learnStatus = form.querySelector("[data-learn-status]");
  async function teach() {
    const name = search.value.trim();
    if (!name) return;
    learn.disabled = true;
    learnStatus.textContent = t("add.learning", { food: name });
    try {
      const food = await api(`${base}/foods`, { method: "POST", body: { name } });
      const groups = form.querySelector("[data-food-groups]");
      groups.insertAdjacentHTML(
        "afterbegin",
        `<div class="food-group" data-group><div class="chips"><label class="chip" data-chip="${esc(food.name.toLowerCase())}"><input type="radio" name="food" value="${esc(food.name)}" required checked><span>${esc(foodName(food.name))}</span></label></div></div>`,
      );
      search.value = "";
      search.dispatchEvent(new Event("input"));
      learnStatus.textContent = t("add.learned", { food: foodName(food.name) });
      await refresh();
    } catch (error) {
      learnStatus.textContent = error.message;
    } finally {
      learn.disabled = false;
    }
  }
  learn.addEventListener("click", teach);
  search.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      if (!learn.hidden) teach();
    }
  });

  // One step at a time: what, how much, where, until when. Each step enters from the side it comes from and is checked before moving on.
  const steps = [...form.querySelectorAll(".step")];
  const back = form.querySelector("[data-step-back]");
  const next = form.querySelector("[data-step-next]");
  const submit = form.querySelector("[type=submit]");
  let current = 0;
  const ready = [() => Boolean(formData(form).food), () => Number(formData(form).grams) > 0, () => Boolean(chosenTray()), () => true];
  const show = (index, focus = true) => {
    const direction = index > current ? "next" : "previous";
    current = index;
    steps.forEach((step, position) => {
      step.hidden = position !== index;
      step.dataset.enter = position === index ? direction : "";
    });
    back.hidden = index === 0;
    next.hidden = index === steps.length - 1;
    submit.hidden = index !== steps.length - 1;
    form.querySelector("[data-step-label]").textContent = t("chef.step-of", { step: index + 1, total: steps.length });
    form.querySelector("[data-step-bar]").style.setProperty("--progress", (index + 1) / steps.length);
    if (focus) steps[index].querySelector("input:checked, input:not([type=radio]):not([type=checkbox]), input")?.focus();
  };
  const forward = () => {
    if (!ready[current]()) {
      showError(form, { message: t("add.missing") });
      return;
    }
    form.querySelector(".error")?.remove();
    show(current + 1);
  };
  next.addEventListener("click", forward);
  back.addEventListener("click", () => show(current - 1));
  form.addEventListener("submit", (event) => {
    if (current === steps.length - 1) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    forward();
  }, true);
  show(formData(form).food ? 1 : 0, false);

  const mode = () => form.querySelector("[name=expiryMode]:checked").value;
  const chosenTray = () => trays.find((tray) => tray.id === form.querySelector("[name=tray]:checked")?.value);

  async function refresh() {
    const values = formData(form);
    form.querySelectorAll("[data-mode]").forEach((box) => {
      box.hidden = box.dataset.mode !== mode();
    });
    proposal = null;
    preview.textContent = "";
    const tray = chosenTray();
    if (mode() !== "estimate" || !values.food || !tray) return;
    try {
      const estimate = await api(
        `${base}/expiry-estimate?food=${encodeURIComponent(values.food)}&zone=${tray.zone}&opened=${Boolean(values.opened)}`,
      );
      preview.textContent = t("add.estimate-result", {
        date: formatDay(estimate.expiresOn, { day: "numeric", month: "long" }),
        days: estimate.shelfDays,
      });
    } catch (error) {
      preview.textContent = error.message;
    }
  }

  form.addEventListener("change", async (event) => {
    if (event.target.name === "photo" && event.target.files[0]) {
      const tray = chosenTray();
      const values = formData(form);
      if (!values.food || !tray) {
        preview.textContent = t("add.photo-needs-food");
        return;
      }
      preview.textContent = t("add.photo-reading");
      try {
        proposal = await readLabel(base, values, event.target.files[0], tray);
        preview.textContent = t("add.photo-result", {
          date: formatDay(proposal.expiresOn, { day: "numeric", month: "long" }),
          reason: proposal.reason,
        });
      } catch (error) {
        preview.textContent = error.message;
      }
      return;
    }
    if (event.target.name !== "expiresOn") await refresh();
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const values = formData(form);
    const tray = chosenTray();
    if (!values.food || !tray || !Number(values.grams)) {
      showError(form, { message: t("add.missing") });
      return;
    }
    const body = {
      fridgeId: tray.fridgeId,
      trayId: tray.id,
      food: values.food,
      grams: Number(values.grams),
      opened: Boolean(values.opened),
      expiresOn: null,
      expirySource: null,
    };
    if (mode() === "known" && values.expiresOn) {
      body.expiresOn = values.expiresOn;
      body.expirySource = "USER";
    }
    if (mode() === "photo" && proposal?.source === "LABEL") {
      body.expiresOn = proposal.expiresOn;
      body.expirySource = "LABEL";
    }
    try {
      await api(`${base}/items`, { method: "POST", body });
      dialog.close();
      toast(t("fridge.toast-added", { grams: grams(body.grams), food: foodName(body.food) }));
      onDone(tray.id);
    } catch (error) {
      showError(form, error);
    }
  });
}

export async function openAddFood(household, { food = null, trayId = null, onDone } = {}) {
  const base = `/households/${household.id}`;
  const [catalog, fridges] = await Promise.all([api("/foods?q=").catch(() => []), api(`${base}/fridges`)]);
  const trays = trayOptions(fridges);
  if (food && !catalog.some((entry) => entry.name === food)) catalog.unshift({ name: food, category: "OTHER" });
  openSheet(t("fridge.add-title"), addFoodBody(catalog, trays, trayId ?? trays[0]?.id, food), (dialog) => {
    wireAddFood(dialog, base, trays, (chosenTray) => onDone?.(chosenTray));
    dialog.querySelector("[name=food]:checked")?.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

export async function renderFridge(main, household) {
  const base = `/households/${household.id}`;
  const [fridges, inventory, prices] = await Promise.all([api(`${base}/fridges`), api(`${base}/inventory`), api(`${base}/prices`).catch(() => ({}))]);
  const twins = await Promise.all(fridges.map((fridge) => api(`${base}/fridges/${fridge.id}/twin`)));

  if (fridges.length === 0) {
    main.innerHTML = `<section class="empty" aria-labelledby="fridge-title">
      <h1 id="fridge-title">${t("fridge.setup-title")}</h1>
      <p>${t("fridge.setup-lead")}</p>
      <form class="row-form" data-setup>
        <label>${t("fridge.name")}<input name="name" required maxlength="60" value="${esc(t("fridge.name-default"))}"></label>
        <button class="primary" type="submit">${t("fridge.setup")}</button>
      </form>
    </section>`;
    main.querySelector("[data-setup]").addEventListener("submit", async (event) => {
      event.preventDefault();
      try {
        await api(`${base}/fridges`, {
          method: "POST",
          body: { name: formData(event.target).name, layout: "STANDARD" },
        });
        renderFridge(main, household);
      } catch (error) {
        showError(event.target, error);
      }
    });
    return;
  }

  const trays = trayOptions(fridges);
  const fromHash = location.hash.split("/")[2];
  if (fromHash) selectedTray = fromHash;
  if (!trays.some((tray) => tray.id === selectedTray)) selectedTray = trays[0]?.id ?? null;
  const tray = fridges
    .flatMap((fridge) => fridge.children.flatMap((zone) => zone.children))
    .find((candidate) => candidate.id === selectedTray);
  const total = fridges.reduce((sum, fridge) => sum + Number(fridge.grams), 0);

  main.innerHTML = `
    <header class="fridge-hero">
      <h1>${t("fridge.title")}</h1>
      <p class="hero-figure"><span class="data" data-total></span></p>
      <p class="lead">${t("fridge.lead", { grams: grams(total) })}</p>
      ${twins.map(twinLine).join("")}
    </header>
    ${shelfChips(fridges)}
    <div class="bento fridge-bento">
      ${tray ? shelfTile(tray, inventory.filter((item) => item.trayId === tray.id)) : ""}
    </div>`;

  // The total rolls its digits from the last figure shown, like the money on Mercado and Números.
  ticker(main.querySelector("[data-total]"), grams(total));
  const shown = main.querySelector(".fridge-bento");
  main.querySelectorAll("[data-food-id]").forEach((card) => {
    const on = () => focusFood(card.dataset.foodId);
    const off = () => focusFood(null);
    card.addEventListener("pointerenter", on);
    card.addEventListener("pointerleave", off);
    card.addEventListener("focusin", on);
    card.addEventListener("focusout", off);
  });
  // One row open at a time; its actions unfold and become reachable, the others fold and leave the tab order.
  shown.addEventListener("click", (event) => {
    const head = event.target.closest(".food-row-head");
    if (!head || head.disabled) return;
    const open = head.getAttribute("aria-expanded") !== "true";
    shown.querySelectorAll(".food-row-head[aria-expanded]").forEach((other) => {
      const opening = other === head && open;
      other.setAttribute("aria-expanded", String(opening));
      other.closest(".food-row").toggleAttribute("data-open", opening);
      other.nextElementSibling.inert = !opening;
    });
  });
  const reveal = () => {
    const itemId = takeFocusRequest();
    const card = itemId && main.querySelector(`[data-food-id="${CSS.escape(itemId)}"]`);
    if (!card) return;
    card.scrollIntoView({ block: "center", behavior: reduced() ? "auto" : "smooth" });
    card.classList.remove("picked");
    void card.offsetWidth;
    card.classList.add("picked");
    card.focus({ preventScroll: true });
    focusFood(itemId);
  };
  reveal();
  const onFocusItem = () => {
    if (!document.body.contains(shown)) {
      window.removeEventListener("hpc:focus-item", onFocusItem);
      return;
    }
    reveal();
  };
  window.addEventListener("hpc:focus-item", onFocusItem);
  let pending;
  const onLive = (event) => {
    if (!document.body.contains(shown)) {
      window.removeEventListener("hpc:live", onLive);
      return;
    }
    if (event.detail.kind === "alert" || event.detail.kind === "copilot") return;
    if (main.querySelector("form :focus") || document.querySelector("dialog[open]")) return;
    clearTimeout(pending);
    pending = setTimeout(() => {
      window.removeEventListener("hpc:live", onLive);
      renderFridge(main, household);
    }, 400);
  };
  window.addEventListener("hpc:live", onLive);


  main.querySelectorAll("[data-item]").forEach((form) =>
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const action = event.submitter?.value ?? "consume";
      const item = inventory.find((entry) => entry.id === form.dataset.item);
      const food = foodName(item.name);
      const done = busy(event.submitter ?? form.querySelector("button"), async () => {
        if (action === "discard") {
          // Say what the waste cost when the household has a price for that food.
          const perKg = Number(prices[item.name] ?? prices[item.name.toLowerCase()] ?? 0);
          const lost = perKg ? t("fridge.toast-discarded-value", { food, money: formatMoney((perKg * item.grams) / 1000, household.currency) }) : t("fridge.toast-discarded", { food });
          await undoable(() => api(`${base}/items/${item.id}/discard`, { method: "POST" }), lost);
          return;
        } else if (action === "open") {
          const opened = await api(`${base}/items/${item.id}/open`, { method: "POST" });
          toast(
            t("fridge.toast-opened", {
              food: foodName(item.name),
              date: formatDay(opened.expiresOn, { day: "numeric", month: "long" }),
            }),
          );
        } else {
          const amount = Number(new FormData(form).get("grams"));
          await undoable(() => api(`${base}/items/${item.id}/consume`, { method: "POST", body: { grams: amount } }), t("fridge.toast-used", { grams: grams(amount), food }));
          return;
        }
        renderFridge(main, household);
      });
      try {
        await done;
      } catch (error) {
        showError(form, error);
      }
    }),
  );

  main.querySelector("[data-add-food]")?.addEventListener("click", async () => {
    const catalog = await api("/foods?q=").catch(() => []);
    openSheet(t("fridge.add-title"), addFoodBody(catalog, trays, selectedTray), (dialog) => {
      wireAddFood(dialog, base, trays, (trayId) => {
        selectedTray = trayId;
        renderFridge(main, household);
      });
    });
  });
}
