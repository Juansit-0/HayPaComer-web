import { api, session } from "./api.js";
import { t } from "./i18n.js";
import { confirmSheet } from "./settings.js";
import { busy, errorText, esc, formData, showError, toast } from "./ui.js";

// Casa: your home (its name, the code to share it and who is in it), and the two ways into a home: making one or joining one
// with a code. A person is in one home at a time, so both stay closed while you are in one.

function houseTile(detail, me, code, creator) {
  return `<section class="tile w-7" aria-labelledby="home-house-title">
    <h2 id="home-house-title" class="visually-hidden">${esc(detail.name)}</h2>
    <form class="row-form" data-rename>
      <label class="grow">${t("home-tab.name")}<input name="name" required maxlength="80" value="${esc(detail.name)}"></label>
      <button type="submit">${t("home-tab.rename")}</button>
    </form>
    <h3>${t("home-tab.code")}</h3>
    <p class="hint">${t("home-tab.code-hint")}</p>
    <div class="row-form">
      <output class="grow join-code" data-code>${esc(code?.code ?? "")}</output>
      <button type="button" data-copy-code>${t("settings.copy")}</button>
    </div>
    <h3>${t("home-tab.members")}</h3>
    <ul class="list">${detail.members
      .map((member) => {
        const self = member.userId === me.id;
        return `<li class="member-row">
          <span class="item-name">${esc(member.name ?? t("settings.member-unknown"))}${self ? ` <small>${t("settings.member-you")}</small>` : ""}</span>
          ${creator && !self ? `<span class="item-actions"><button type="button" class="ghost" data-remove="${esc(member.userId)}" data-name="${esc(member.name ?? "")}">${t("settings.member-remove")}</button></span>` : ""}
        </li>`;
      })
      .join("")}</ul>
    <div class="row-form">
      ${
        creator
          ? `<button type="button" class="ghost danger" data-delete-home>${t("home-tab.delete")}</button>`
          : `<button type="button" class="ghost danger" data-leave-home>${t("settings.leave")}</button>`
      }
    </div>
  </section>`;
}

function enterTile(inHome, creator) {
  const closed = inHome ? "disabled" : "";
  return `<section class="tile w-5" aria-labelledby="home-enter-title">
    <h2 id="home-enter-title">${t("home-tab.enter")}</h2>
    ${inHome ? `<p class="hint">${t(creator ? "home-tab.one-home-creator" : "home-tab.one-home-member")}</p>` : ""}
    <form class="stack" data-create-home>
      <h3>${t("home-tab.create")}</h3>
      <div class="row-form">
        <label class="grow">${t("home.name")}<input name="name" required maxlength="80" placeholder="${esc(t("home.name-example"))}" ${closed}></label>
        <button class="primary" type="submit" ${closed}>${t("home.create")}</button>
      </div>
    </form>
    <form class="stack" data-join-home>
      <h3>${t("settings.join-title")}</h3>
      <div class="row-form">
        <label class="grow">${t("settings.join-code")}<input name="code" required maxlength="20" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="ABCD-EFGH" ${closed}></label>
        <button class="primary" type="submit" ${closed}>${t("settings.join-send")}</button>
      </div>
    </form>
  </section>`;
}

// Leaving or deleting the home sends the person to the start, where they make a home or join one.
function goTo(id) {
  session.household = id;
  location.hash = id ? "#/fridge" : "#/home";
  location.reload();
}

export async function renderHome(main, household) {
  const base = `/households/${household.id}`;
  const [me, detail, code] = await Promise.all([api("/me"), api(base), api(`${base}/join-code`).catch(() => null)]);
  const creator = detail.myRole === "OWNER";
  if (main.dataset.route !== "home") return;

  main.innerHTML = `
    <header>
      <h1>${t("nav.home")}</h1>
      <p class="lead">${t("home-tab.lead")}</p>
    </header>
    <div class="bento">
      ${houseTile(detail, me, code, creator)}
      ${enterTile(true, creator)}
    </div>`;

  main.querySelector("[data-copy-code]").addEventListener("click", async () => {
    await navigator.clipboard?.writeText(main.querySelector("[data-code]").textContent).catch(() => {});
    toast(t("settings.code-copied"));
  });

  main.querySelector("[data-rename]").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.target;
    await busy(form.querySelector("button"), async () => {
      try {
        const updated = await api(base, { method: "PATCH", body: { name: formData(form).name.trim() } });
        household.name = updated.name;
        document.querySelector("[data-household]").textContent = updated.name;
        toast(t("settings.saved"));
        await renderHome(main, household);
      } catch (error) {
        showError(form, error);
      }
    });
  });

  main.querySelectorAll("[data-remove]").forEach((button) =>
    button.addEventListener("click", () =>
      confirmSheet(t("settings.member-remove"), t("settings.member-remove-ask", { member: button.dataset.name }), t("settings.member-remove"), async () => {
        await api(`${base}/members/${button.dataset.remove}`, { method: "DELETE" });
        await renderHome(main, household);
      }),
    ),
  );
  main.querySelector("[data-leave-home]")?.addEventListener("click", () =>
    confirmSheet(t("settings.leave"), t("settings.leave-ask"), t("settings.leave"), async () => {
      await api(`${base}/members/${me.id}`, { method: "DELETE" });
      goTo(null);
    }),
  );
  main.querySelector("[data-delete-home]")?.addEventListener("click", () =>
    confirmSheet(t("home-tab.delete"), t("home-tab.delete-ask", { household: detail.name }), t("home-tab.delete"), async () => {
      await api(base, { method: "DELETE" });
      goTo(null);
    }),
  );

  // The tab redraws when the household changes elsewhere, unless the person is typing.
  const shown = main.querySelector(".bento");
  const onLive = (event) => {
    if (!document.body.contains(shown)) return window.removeEventListener("hpc:live", onLive);
    if (main.querySelector("form :focus") || document.querySelector("dialog[open]")) return;
    if (event.detail?.kind === "inventory") {
      window.removeEventListener("hpc:live", onLive);
      renderHome(main, household).catch((error) => toast(errorText(error)));
    }
  };
  window.addEventListener("hpc:live", onLive);
}
