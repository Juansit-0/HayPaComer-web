import { api, session } from "./api.js";
import { soundOn } from "./sound.js";
import { currentLocale, foodName, formatNumber, loadLocale, locales, t } from "./i18n.js";
import { canonicalFood, errorText, esc, formData, grams, numberField, openSheet, rememberFocus, showError, toast, wireSteppers } from "./ui.js";
import { reduced } from "./motion.js";
import { openFridgeShape, shapeDrawing } from "./fridge-shape.js";
import { legalLinks } from "./legal.js";

const DIETS = ["OMNIVORE", "PESCATARIAN", "VEGETARIAN", "VEGAN"];
const ALLERGENS = [
  "GLUTEN",
  "CRUSTACEANS",
  "EGGS",
  "FISH",
  "PEANUTS",
  "SOY",
  "MILK",
  "TREE_NUTS",
  "CELERY",
  "MUSTARD",
  "SESAME",
  "SULPHITES",
  "LUPIN",
  "MOLLUSCS",
];
const UNITS = { seconds: "s", celsius: "°C", minutes: "min", grams: "g", days: "settings.unit.days", hour: "h" };

function unitOf(key) {
  if (key.endsWith("seconds")) return UNITS.seconds;
  if (key.endsWith("celsius")) return UNITS.celsius;
  if (key.endsWith("minutes")) return UNITS.minutes;
  if (key.endsWith("grams")) return UNITS.grams;
  if (key.endsWith("days")) return t(UNITS.days);
  if (key.endsWith("hour")) return UNITS.hour;
  return "";
}

function languageTile() {
  return `<section class="tile" aria-labelledby="language-title">
    <h2 id="language-title">${t("settings.language")}</h2>
    <p class="hint">${t("settings.language-hint")}</p>
    <form data-language-form>
      <fieldset class="chips"><legend class="visually-hidden">${t("settings.language")}</legend>${locales()
        .map(
          (option) => `<label class="chip"><input type="radio" name="locale" value="${esc(option.code)}" ${
            option.code === currentLocale() ? "checked" : ""
          }><span>${esc(option.name)}</span></label>`,
        )
        .join("")}</fieldset>
    </form>
    <button class="ghost sound-setting" type="button" data-sound aria-pressed="${soundOn()}">${t("sound.toggle")}</button>
  </section>`;
}

function profileTile(profile, me) {
  const diet = profile?.diet ?? "OMNIVORE";
  const allergies = new Set(profile?.allergies ?? []);
  return `<section class="tile w-7" aria-labelledby="profile-title">
    <h2 id="profile-title">${t("settings.profile")}</h2>
    <p class="hint">${t("settings.profile-hint")}</p>
    ${
      me.emailVerified
        ? ""
        : `<div class="row-form" data-verify>
            <p class="hint grow">${esc(t("settings.verify-hint", { email: me.email ?? "" }))}</p>
            <button type="button" class="ghost" data-resend-verification>${t("settings.verify-resend")}</button>
          </div>`
    }
    <form class="stack" data-profile-form>
      <fieldset class="chips"><legend>${t("settings.diet")}</legend>${DIETS.map(
        (value) => `<label class="chip"><input type="radio" name="diet" value="${value}" ${value === diet ? "checked" : ""}><span>${t(`diet.${value}`)}</span></label>`,
      ).join("")}</fieldset>
      <fieldset class="chips"><legend>${t("settings.allergies")}</legend>${ALLERGENS.map(
        (value) => `<label class="chip"><input type="checkbox" name="allergies" value="${value}" ${allergies.has(value) ? "checked" : ""}><span>${t(`allergen.${value}`)}</span></label>`,
      ).join("")}</fieldset>
      <label>${t("settings.avoided")}<input name="avoided" autocomplete="off" value="${esc([...(profile?.avoidedFoods ?? [])].join(", "))}" placeholder="${esc(t("settings.avoided-example"))}"></label>
      <button class="primary" type="submit">${t("settings.save-profile")}</button>
    </form>
  </section>`;
}

function notificationsTile(preferences) {
  const channels = new Set(preferences?.channels ?? ["WEB"]);
  return `<section class="tile" aria-labelledby="alerts-title">
    <h2 id="alerts-title">${t("settings.alerts")}</h2>
    <p class="hint">${t("settings.alerts-hint")}</p>
    <form class="stack" data-alerts-form>
      <fieldset class="chips"><legend class="visually-hidden">${t("settings.alerts")}</legend>
        <label class="chip"><input type="checkbox" name="channels" value="WEB" checked disabled><span>${t("channel.WEB")}</span></label>
        ${preferences?.telegramReady ? `<label class="chip"><input type="checkbox" name="channels" value="TELEGRAM" ${channels.has("TELEGRAM") ? "checked" : ""}><span>${t("channel.TELEGRAM")}</span></label>` : ""}
      </fieldset>
      ${preferences?.telegramReady ? `<label>${t("settings.telegram")}<input name="telegramChatId" inputmode="numeric" autocomplete="off" value="${esc(preferences.telegramChatId ?? "")}"></label>` : ""}
      <button type="submit">${t("settings.save-alerts")}</button>
    </form>
  </section>`;
}

function householdTile(settings, owner) {
  return `<section class="tile w-12" aria-labelledby="household-settings-title">
    <h2 id="household-settings-title">${t("settings.household")}</h2>
    <p class="hint">${owner ? t("settings.household-hint") : t("settings.household-readonly")}</p>
    <ul class="settings-list">${settings
      .map((setting) => {
        const step = setting.kind === "DECIMAL" ? 0.1 : 1;
        return `<li>
          <form class="setting-row" data-setting="${esc(setting.key)}">
            <div class="setting-text">
              ${owner ? "" : `<span class="item-name">${esc(setting.description)}</span>`}
              <span class="hint">${t("settings.default", { value: `${formatNumber(setting.defaultValue, 1)} ${unitOf(setting.key)}` })}${
                setting.overridden ? ` <span class="status">${t("settings.changed")}</span>` : ""
              }</span>
            </div>
            ${
              owner
                ? `${numberField({
                    name: "value",
                    label: setting.description,
                    unit: unitOf(setting.key),
                    value: setting.value,
                    min: setting.min,
                    max: setting.max,
                    step,
                  })}
                  <div class="row-form">
                    <button type="submit" name="action" value="save">${t("settings.save")}</button>
                    ${setting.overridden ? `<button class="ghost" type="submit" name="action" value="reset" formnovalidate>${t("settings.reset")}</button>` : ""}
                  </div>`
                : `<span class="data setting-value">${formatNumber(setting.value, 1)} ${unitOf(setting.key)}</span>`
            }
          </form>
        </li>`;
      })
      .join("")}</ul>
  </section>`;
}

// Each group confirms its own save with a stamp beside its button, where the eye already is.
// Removing someone, handing over the household, or leaving it cannot be undone from here, so each asks first.
export function confirmSheet(title, text, label, action) {
  const sheet = openSheet(title, `<div class="stack"><p>${esc(text)}</p><button type="button" class="primary" data-yes>${esc(label)}</button></div>`, (dialog) => {
    dialog.querySelector("[data-yes]").addEventListener("click", async (event) => {
      event.currentTarget.disabled = true;
      try {
        await action();
      } catch (error) {
        toast(errorText(error));
      }
      sheet.close();
    });
  });
}

const DEVICE_KINDS = ["ESP32_DOOR_TEMP", "ESP32_SCALE", "SIMULATOR"];

const SCALE_MODES = ["FRIDGE", "COOKING"];

// Tare with the plate empty, then calibrate with something whose weight is known; both only talk to the scale endpoints.
// In fridge mode the food resting on the plate loses stock as it gets lighter; in cooking mode readings never touch stock.
function scaleTools(device, items) {
  return `<div class="row-form scale-tools" data-scale="${esc(device.id)}">
    <button type="button" data-scale-tare>${t("settings.scale-tare")}</button>
    <label class="grow">${t("settings.scale-known")}<input name="knownGrams" type="number" inputmode="decimal" min="1" max="20000" step="any" value="206"></label>
    <button type="button" data-scale-calibrate>${t("settings.scale-calibrate")}</button>
    <button type="button" class="ghost" data-scale-read>${t("settings.scale-read")}</button>
    <label class="grow">${t("settings.scale-item")}<select name="itemId">${items
      .map((item) => `<option value="${esc(item.id)}">${esc(foodName(item.name))} · ${grams(item.grams)}</option>`)
      .join("")}</select></label>
    <button type="button" data-scale-assign ${items.length ? "" : "disabled"}>${t("settings.scale-assign")}</button>
    <button type="button" class="ghost" data-scale-unassign>${t("settings.scale-unassign")}</button>
    <label>${t("settings.scale-mode")}<select name="mode">${SCALE_MODES.map((mode) => `<option value="${mode}">${t(`settings.scale-mode.${mode}`)}</option>`).join("")}</select></label>
    <button type="button" class="ghost" data-scale-mode>${t("settings.scale-mode-set")}</button>
    <p class="hint" data-scale-status aria-live="polite"></p>
  </div>`;
}

function devicesTile(devices, items) {
  const when = (at) => new Date(at).toLocaleString(currentLocale(), { dateStyle: "medium", timeStyle: "short" });
  return `<section class="tile w-12" aria-labelledby="devices-title">
    <h2 id="devices-title">${t("settings.devices")}</h2>
    <p class="hint">${t("settings.devices-hint")}</p>
    <ul class="list">${devices
      .map(
        (device) => `<li class="member-row">
          <span class="item-name">${esc(device.name)} <small>${t(`device.kind.${device.kind}`)}</small></span>
          <span class="hint">${!device.active ? t("settings.device-off") : device.lastSeenAt ? esc(t("settings.device-seen", { when: when(device.lastSeenAt) })) : t("settings.device-never")}</span>
          <span class="item-actions">${device.active ? `<button type="button" class="ghost" data-revoke-device="${esc(device.id)}" data-name="${esc(device.name)}">${t("settings.device-revoke")}</button>` : ""}</span>
          ${device.active && device.kind === "ESP32_SCALE" ? scaleTools(device, items) : ""}
        </li>`,
      )
      .join("")}</ul>
    <form class="row-form" data-device>
      <label class="grow">${t("settings.device-name")}<input name="name" required maxlength="60"></label>
      <label>${t("settings.device-kind")}<select name="kind">${DEVICE_KINDS.map((kind) => `<option value="${kind}">${t(`device.kind.${kind}`)}</option>`).join("")}</select></label>
      <button class="primary" type="submit">${t("settings.device-add")}</button>
    </form>
    <div class="invite-link" data-device-key hidden>
      <p class="hint">${t("settings.device-key-hint")}</p>
      <div class="row-form"><input class="grow" readonly aria-label="${esc(t("settings.device-key"))}"><button type="button" data-copy-key>${t("settings.copy")}</button></div>
    </div>
  </section>`;
}

// shortcut: new sensors go to the first fridge, add a fridge choice when a household can have several.
function wireDevices(main, base, fridgeId, rerender) {
  const tile = main.querySelector("#devices-title")?.closest("section");
  if (!tile) return;
  tile.addEventListener("click", async (event) => {
    const button = event.target.closest("button");
    if (button?.dataset.revokeDevice) {
      const { revokeDevice, name } = button.dataset;
      confirmSheet(t("settings.device-revoke"), t("settings.device-revoke-ask", { device: name }), t("settings.device-revoke"), async () => {
        await api(`${base}/devices/${revokeDevice}`, { method: "DELETE" });
        rerender();
      });
    } else if (button?.closest("[data-scale]")) {
      const box = button.closest("[data-scale]");
      const path = `${base}/devices/${box.dataset.scale}/scale`;
      const status = box.querySelector("[data-scale-status]");
      button.disabled = true;
      try {
        if ("scaleTare" in button.dataset) {
          await api(`${path}/tare`, { method: "POST" });
          status.textContent = t("settings.scale-tared");
        } else if ("scaleAssign" in button.dataset) {
          await api(`${path}/item`, { method: "PUT", body: { itemId: box.querySelector("[name=itemId]").value } });
          status.textContent = t("settings.scale-assigned");
        } else if ("scaleUnassign" in button.dataset) {
          await api(`${path}/item`, { method: "DELETE" });
          status.textContent = t("settings.scale-unassigned");
        } else if ("scaleMode" in button.dataset) {
          const mode = box.querySelector("[name=mode]").value;
          await api(`${path}/mode`, { method: "PUT", body: { mode } });
          status.textContent = t("settings.scale-mode-done", { mode: t(`settings.scale-mode.${mode}`) });
        } else if ("scaleCalibrate" in button.dataset) {
          await api(`${path}/calibrate`, { method: "POST", body: { knownGrams: Number(box.querySelector("[name=knownGrams]").value) } });
          status.textContent = t("settings.scale-calibrated");
        } else {
          const reading = await api(`${path}/reading`);
          status.textContent = reading.calibrated && reading.grams !== null ? t("settings.scale-now", { grams: grams(Number(reading.grams)) }) : t("settings.scale-uncalibrated");
        }
      } catch (error) {
        status.textContent = errorText(error);
      } finally {
        button.disabled = false;
      }
    } else if (button && "copyKey" in button.dataset) {
      const input = tile.querySelector("[data-device-key] input");
      await navigator.clipboard?.writeText(input.value).catch(() => input.select());
      toast(t("settings.copied"));
    }
  });
  tile.querySelector("[data-device]").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.target;
    const button = form.querySelector("button[type=submit]");
    button.disabled = true;
    try {
      const created = await api(`${base}/devices`, { method: "POST", body: { ...formData(form), fridgeId } });
      form.reset();
      const box = tile.querySelector("[data-device-key]");
      box.querySelector("input").value = created.apiKey;
      box.hidden = false;
    } catch (error) {
      showError(form, error);
    } finally {
      button.disabled = false;
    }
  });
}

// What the Chef remembers about this home; anyone can drop one note, only the owner wipes them all.
function memoryTile(notes, creator) {
  return `<section class="tile w-12" aria-labelledby="memory-title">
    <h2 id="memory-title">${t("settings.memory")}</h2>
    <p class="hint">${t("settings.memory-hint")}</p>
    ${
      notes.length
        ? `<ul class="list">${notes
            .map(
              (note) => `<li class="member-row">
                <span class="item-name">${esc(note.subject)}${note.value ? ` <small>${esc(note.value)}</small>` : ""}</span>
                <span class="hint">${t(`settings.memory-topic.${note.topic}`)}</span>
                <span class="item-actions"><button type="button" class="ghost" data-forget="${esc(note.topic)}" data-subject="${esc(note.subject)}">${t("settings.memory-forget")}</button></span>
              </li>`,
            )
            .join("")}</ul>
          ${creator ? `<button type="button" class="ghost danger" data-forget-all>${t("settings.memory-clear")}</button>` : ""}`
        : `<p class="hint">${t("settings.memory-none")}</p>`
    }
  </section>`;
}

function saved(form, text = t("settings.saved")) {
  form.querySelector(".saved-stamp")?.remove();
  form.querySelector(".error")?.remove();
  const stamp = document.createElement("span");
  stamp.className = "saved-stamp";
  stamp.setAttribute("role", "status");
  stamp.textContent = text;
  form.querySelector("button[type=submit]:last-of-type, button[type=submit]")?.after(stamp);
  setTimeout(() => stamp.remove(), 4000);
}

function fridgeTile(shape, canChange) {
  return `<section class="tile w-12" aria-labelledby="fridge-shape-title">
    <h2 id="fridge-shape-title">${t("fridge-shape.title")}</h2>
    <p class="hint">${t("fridge-shape.lead")}</p>
    ${shape ? `<div class="shape-summary">${shapeDrawing(shape)}<p><b>${t(`fridge-type.${shape.type}`)}</b></p></div>` : ""}
    ${canChange ? `<button type="button" class="primary" data-fridge-shape>${t("fridge-shape.open")}</button>` : ""}
  </section>`;
}

export async function renderSettings(main, household, rerender) {
  const base = `/households/${household.id}`;
  const fridges = await api(`${base}/fridges`).catch(() => []);
  const shape = fridges[0] ? await api(`${base}/fridges/${fridges[0].id}/shape`).catch(() => null) : null;
  const [me, detail, profiles, preferences, settings, households] = await Promise.all([
    api("/me"),
    api(base),
    api(`${base}/profiles`).catch(() => []),
    api("/me/notification-preferences").catch(() => null),
    api(`${base}/settings`).catch(() => []),
    api("/households").catch(() => []),
  ]);
  const membership = detail.members.find((member) => member.userId === me.id);
  const profile = profiles.find((candidate) => candidate.memberId === membership?.memberId);
  const owner = detail.myRole !== "GUEST";
  const devices = owner && fridges[0] ? await api(`${base}/devices`).catch(() => []) : null;
  const scaleItems = devices?.some((device) => device.active && device.kind === "ESP32_SCALE") ? await api(`${base}/inventory`).catch(() => []) : [];
  const notes = await api(`${base}/agent/memory`).catch(() => null);

  if (main.dataset.route !== "settings") return;
  main.innerHTML = `
    <header>
      <h1>${t("settings.title")}</h1>
      <p class="lead">${t("settings.lead")}</p>
    </header>
    <nav class="settings-index" aria-label="${esc(t("settings.title"))}">${[
      ["profile-title", "settings.profile"],
      ["language-title", "settings.language"],
      ["alerts-title", "settings.alerts"],
      ...(devices ? [["devices-title", "settings.devices"]] : []),
      ...(notes ? [["memory-title", "settings.memory"]] : []),
      ["household-settings-title", "settings.household"],
      ...(fridges[0] ? [["fridge-shape-title", "fridge-shape.title"]] : []),
    ]
      .map(([target, key]) => `<button type="button" class="chip-button" data-goto="${target}">${t(key)}</button>`)
      .join("")}</nav>
    <div class="bento">
      ${profileTile(profile, me)}
      <div class="w-5 stack">
        ${languageTile()}
        ${notificationsTile(preferences)}
      </div>
      ${devices ? devicesTile(devices, scaleItems.filter((item) => item.usable)) : ""}
      ${notes ? memoryTile(notes, detail.myRole === "OWNER") : ""}
      ${householdTile(settings, owner)}
      ${fridges[0] ? fridgeTile(shape, owner) : ""}
    </div>
    <nav class="legal-links" aria-label="${esc(t("legal.nav"))}">${legalLinks()}</nav>`;
  main.querySelector("[data-fridge-shape]")?.addEventListener("click", () => openFridgeShape(household, fridges[0], rerender));
  wireSteppers(main);
  wireDevices(main, base, fridges[0]?.id, rerender);

  // The index scrolls to a group; the route stays on Ajustes, so these are buttons, not hash links.
  main.querySelector(".settings-index").addEventListener("click", (event) => {
    const heading = main.querySelector(`#${event.target.closest("[data-goto]")?.dataset.goto}`);
    heading?.scrollIntoView({ block: "start", behavior: reduced() ? "auto" : "smooth" });
  });

  main.querySelector("[data-language-form]").addEventListener("change", async (event) => {
    await loadLocale(event.target.value);
    await api("/me/locale", { method: "PUT", body: { locale: currentLocale() } }).catch(() => null);
    toast(t("settings.toast-language"));
    rerender();
  });

  main.querySelector("[data-resend-verification]")?.addEventListener("click", async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    try {
      await api("/me/email-verification", { method: "POST" });
      toast(t("settings.verify-sent"));
    } catch (error) {
      toast(errorText(error));
    } finally {
      button.disabled = false;
    }
  });

  main.querySelector("#memory-title")?.closest("section").addEventListener("click", async (event) => {
    const button = event.target.closest("[data-forget], [data-forget-all]");
    if (!button) return;
    const forget = async () => {
      await api(`${base}/agent/memory`, button.dataset.forget ? { method: "PATCH", body: { forget: [{ topic: button.dataset.forget, subject: button.dataset.subject }] } } : { method: "DELETE" });
      rerender();
    };
    if (button.dataset.forget) {
      button.disabled = true;
      await forget().catch((error) => {
        button.disabled = false;
        toast(errorText(error));
      });
    } else {
      confirmSheet(t("settings.memory-clear"), t("settings.memory-clear-ask"), t("settings.memory-clear"), forget);
    }
  });

  const profileForm = main.querySelector("[data-profile-form]");
  profileForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = new FormData(profileForm);
    try {
      await api(`${base}/profile`, {
        method: "PUT",
        body: {
          diet: data.get("diet"),
          allergies: data.getAll("allergies"),
          avoidedFoods: await Promise.all(
            String(data.get("avoided") ?? "")
              .split(",")
              .map((food) => food.trim())
              .filter(Boolean)
              .map((food) => canonicalFood(food, api)),
          ),
        },
      });
      saved(profileForm);
    } catch (error) {
      showError(profileForm, error);
    }
  });

  const alertsForm = main.querySelector("[data-alerts-form]");
  alertsForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = new FormData(alertsForm);
    try {
      await api("/me/notification-preferences", {
        method: "PUT",
        body: { channels: data.getAll("channels"), telegramChatId: (preferences?.telegramReady ? formData(alertsForm).telegramChatId?.trim() : preferences?.telegramChatId) || null },
      });
      saved(alertsForm);
    } catch (error) {
      showError(alertsForm, error);
    }
  });

  main.querySelectorAll("[data-setting]").forEach((form) =>
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const reset = event.submitter?.value === "reset";
      try {
        await api(`${base}/settings`, {
          method: "PUT",
          body: { key: form.dataset.setting, value: reset ? null : String(new FormData(form).get("value")) },
        });
        const back = rememberFocus(main);
        await renderSettings(main, household, rerender);
        back();
        saved(main.querySelector(`[data-setting="${CSS.escape(form.dataset.setting)}"]`), reset ? t("settings.toast-reset") : t("settings.saved"));
      } catch (error) {
        showError(form, error);
      }
    }),
  );
}
