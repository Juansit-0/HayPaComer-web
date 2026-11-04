import { api, session } from "./api.js";
import { soundOn } from "./sound.js";
import { currentLocale, formatNumber, loadLocale, locales, t } from "./i18n.js";
import { canonicalFood, errorText, esc, formData, numberField, openSheet, showError, toast, wireSteppers } from "./ui.js";
import { reduced } from "./motion.js";
import { openFridgeShape, shapeDrawing } from "./fridge-shape.js";

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

function profileTile(profile) {
  const diet = profile?.diet ?? "OMNIVORE";
  const allergies = new Set(profile?.allergies ?? []);
  return `<section class="tile w-7" aria-labelledby="profile-title">
    <h2 id="profile-title">${t("settings.profile")}</h2>
    <p class="hint">${t("settings.profile-hint")}</p>
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
        <label class="chip"><input type="checkbox" name="channels" value="WEB" ${channels.has("WEB") ? "checked" : ""}><span>${t("channel.WEB")}</span></label>
        <label class="chip"><input type="checkbox" name="channels" value="TELEGRAM" ${channels.has("TELEGRAM") ? "checked" : ""}><span>${t("channel.TELEGRAM")}</span></label>
      </fieldset>
      <label>${t("settings.telegram")}<input name="telegramChatId" inputmode="numeric" autocomplete="off" value="${esc(preferences?.telegramChatId ?? "")}"></label>
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
        const step = setting.kind === "DECIMAL" ? 0.5 : 1;
        return `<li>
          <form class="setting-row" data-setting="${esc(setting.key)}">
            <div class="setting-text">
              <span class="item-name">${esc(setting.description)}</span>
              <span class="hint">${t("settings.default", { value: `${formatNumber(setting.defaultValue, 1)} ${unitOf(setting.key)}` })}${
                setting.overridden ? ` <span class="status">${t("settings.changed")}</span>` : ""
              }</span>
            </div>
            ${
              owner
                ? `${numberField({
                    name: "value",
                    label: t("settings.value"),
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
function memberRow(member, me, owner) {
  const self = member.userId === me.id;
  const name = member.name ?? t("settings.member-unknown");
  const manage = owner && !self && member.role !== "OWNER";
  return `<li class="member-row">
    <span class="item-name">${esc(name)}${self ? ` <small>${t("settings.member-you")}</small>` : ""}</span>
    ${
      manage
        ? `<select data-role="${esc(member.userId)}" aria-label="${esc(t("settings.member-role", { member: name }))}">${["MEMBER", "GUEST"]
            .map((role) => `<option value="${role}" ${role === member.role ? "selected" : ""}>${t(`role.${role}`)}</option>`)
            .join("")}</select>`
        : `<span class="hint">${t(`role.${member.role}`)}</span>`
    }
    <span class="item-actions">${
      manage
        ? `<button type="button" class="ghost" data-make-owner="${esc(member.userId)}" data-name="${esc(name)}">${t("settings.make-owner")}</button>
           <button type="button" class="ghost" data-remove-member="${esc(member.userId)}" data-name="${esc(name)}">${t("settings.member-remove")}</button>`
        : self && !owner
          ? `<button type="button" class="ghost" data-leave="${esc(member.userId)}">${t("settings.leave")}</button>`
          : ""
    }</span>
  </li>`;
}

function membersTile(detail, me, owner, invitations, households) {
  return `<section class="tile w-12" aria-labelledby="members-title">
    <h2 id="members-title">${t("settings.members")}</h2>
    <p class="hint">${t("settings.members-hint")}</p>
    ${
      households.length > 1
        ? `<div class="chips-row" role="group" aria-label="${esc(t("settings.households"))}">${households
            .map((home) => `<button type="button" class="chip-button" data-switch-home="${esc(home.id)}" ${home.id === detail.id ? 'aria-current="true" disabled' : ""}>${esc(home.name)}</button>`)
            .join("")}</div>`
        : ""
    }
    <ul class="list">${detail.members.map((member) => memberRow(member, me, owner)).join("")}</ul>
    ${
      owner
        ? `<form class="row-form" data-invite>
            <label class="grow">${t("settings.invite-email")}<input name="email" type="email" required autocomplete="off"></label>
            <label>${t("settings.invite-role")}<select name="role"><option value="MEMBER">${t("role.MEMBER")}</option><option value="GUEST">${t("role.GUEST")}</option></select></label>
            <button class="primary" type="submit">${t("settings.invite-send")}</button>
          </form>
          <div class="invite-link" data-invite-link hidden>
            <p class="hint">${t("settings.invite-link-hint")}</p>
            <div class="row-form"><input class="grow" readonly aria-label="${esc(t("settings.invite-link"))}"><button type="button" data-copy-link>${t("settings.copy")}</button></div>
          </div>
          ${
            invitations.length
              ? `<h3>${t("settings.pending")}</h3><ul class="list">${invitations
                  .map(
                    (invitation) => `<li class="member-row"><span class="item-name">${esc(invitation.email)}</span><span class="hint">${t(`role.${invitation.role}`)}</span>
                      <span class="item-actions"><button type="button" class="ghost" data-cancel-invite="${esc(invitation.id)}" aria-label="${esc(t("settings.invite-cancel-one", { email: invitation.email }))}">${t("settings.invite-cancel")}</button></span></li>`,
                  )
                  .join("")}</ul>`
              : ""
          }`
        : ""
    }
  </section>`;
}

// Removing someone, handing over the household, or leaving it cannot be undone from here, so each asks first.
function confirmSheet(title, text, label, action) {
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

function wireMembers(main, base, rerender) {
  const tile = main.querySelector("#members-title").closest("section");
  const quiet = (action) => action().then(rerender, (error) => toast(errorText(error)));
  const moveTo = (id) => {
    session.household = id;
    location.hash = "#/now";
    location.reload();
  };
  tile.addEventListener("change", (event) => {
    const user = event.target.dataset.role;
    if (user) quiet(() => api(`${base}/members/${user}`, { method: "PATCH", body: { role: event.target.value } }));
  });
  tile.addEventListener("click", async (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    const { removeMember, makeOwner, leave, switchHome, cancelInvite, name } = button.dataset;
    if (removeMember) {
      confirmSheet(t("settings.member-remove"), t("settings.member-remove-ask", { member: name }), t("settings.member-remove"), async () => {
        await api(`${base}/members/${removeMember}`, { method: "DELETE" });
        rerender();
      });
    } else if (makeOwner) {
      confirmSheet(t("settings.make-owner"), t("settings.make-owner-ask", { member: name }), t("settings.make-owner"), async () => {
        await api(`${base}/owner`, { method: "PUT", body: { userId: makeOwner } });
        rerender();
      });
    } else if (leave) {
      confirmSheet(t("settings.leave"), t("settings.leave-ask"), t("settings.leave"), async () => {
        await api(`${base}/members/${leave}`, { method: "DELETE" });
        moveTo(null);
      });
    } else if (switchHome) {
      moveTo(switchHome);
    } else if (cancelInvite) {
      quiet(() => api(`${base}/invitations/${cancelInvite}`, { method: "DELETE" }));
    } else if ("copyLink" in button.dataset) {
      const input = tile.querySelector("[data-invite-link] input");
      await navigator.clipboard?.writeText(input.value).catch(() => input.select());
      toast(t("settings.copied"));
    }
  });
  tile.querySelector("[data-invite]")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.target;
    const button = form.querySelector("button[type=submit]");
    button.disabled = true;
    try {
      const invitation = await api(`${base}/invitations`, { method: "POST", body: formData(form) });
      form.reset();
      const box = tile.querySelector("[data-invite-link]");
      box.querySelector("input").value = invitation.link;
      box.hidden = false;
    } catch (error) {
      showError(form, error);
    } finally {
      button.disabled = false;
    }
  });
}

function saved(form, text = t("settings.saved")) {
  form.querySelector(".saved-stamp")?.remove();
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
  const owner = detail.myRole === "OWNER";
  const invitations = owner ? await api(`${base}/invitations`).catch(() => []) : [];

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
      ["members-title", "settings.members"],
      ["household-settings-title", "settings.household"],
      ...(fridges[0] ? [["fridge-shape-title", "fridge-shape.title"]] : []),
    ]
      .map(([target, key]) => `<button type="button" class="chip-button" data-goto="${target}">${t(key)}</button>`)
      .join("")}</nav>
    <div class="bento">
      ${profileTile(profile)}
      <div class="w-5 stack">
        ${languageTile()}
        ${notificationsTile(preferences)}
      </div>
      ${membersTile(detail, me, owner, invitations, households)}
      ${householdTile(settings, owner)}
      ${fridges[0] ? fridgeTile(shape, owner) : ""}
    </div>`;
  main.querySelector("[data-fridge-shape]")?.addEventListener("click", () => openFridgeShape(household, fridges[0], rerender));
  wireSteppers(main);
  wireMembers(main, base, rerender);

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
        body: { channels: data.getAll("channels"), telegramChatId: formData(alertsForm).telegramChatId || null },
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
        await renderSettings(main, household, rerender);
        saved(main.querySelector(`[data-setting="${CSS.escape(form.dataset.setting)}"]`), reset ? t("settings.toast-reset") : t("settings.saved"));
      } catch (error) {
        showError(form, error);
      }
    }),
  );
}
