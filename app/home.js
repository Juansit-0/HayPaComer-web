import { api, session } from "./api.js";
import { formatDay, formatTime, t } from "./i18n.js";
import { confirmSheet } from "./settings.js";
import { busy, errorText, esc, formData, grams, showError, toast } from "./ui.js";

const ROLES = ["MEMBER", "GUEST"];
const ACTIONS = ["STOCK_FOOD", "CONSUME_FOOD", "DISCARD_FOOD", "MOVE_FOOD", "OPEN_FOOD", "CHANGE_FRIDGE_SHAPE", "REVIEW_COLD_CHAIN", "RESTORE_SNAPSHOT"];
const when = (at) => `${formatDay(at.slice(0, 10))} ${formatTime(at)}`;
const roleOptions = (selected) => ROLES.map((role) => `<option value="${role}" ${role === selected ? "selected" : ""}>${t(`role.${role}`)}</option>`).join("");

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
    ${code?.expiresAt ? `<p class="hint">${esc(t("settings.code-expires", { date: formatDay(code.expiresAt.slice(0, 10)) }))}</p>` : `<p class="hint">${t("settings.code-none")}</p>`}
    ${
      creator
        ? `<div class="row-form">
            <button type="button" class="ghost" data-code-renew>${t(code ? "settings.code-renew" : "settings.code-create")}</button>
            ${code ? `<button type="button" class="ghost danger" data-code-off>${t("settings.code-revoke")}</button>` : ""}
          </div>`
        : ""
    }
    <h3>${t("home-tab.members")}</h3>
    <ul class="list">${detail.members
      .map((member) => {
        const self = member.userId === me.id;
        return `<li class="member-row">
          <span class="item-name">${esc(member.name ?? t("settings.member-unknown"))}${self ? ` <small>${t("settings.member-you")}</small>` : ""}</span>
          ${
            creator && !self
              ? `<span class="item-actions">
                  <label class="visually-hidden" for="role-${esc(member.userId)}">${esc(t("settings.member-role", { member: member.name ?? "" }))}</label>
                  <select id="role-${esc(member.userId)}" data-role="${esc(member.userId)}">${roleOptions(member.role)}</select>
                  <button type="button" class="ghost" data-owner="${esc(member.userId)}" data-name="${esc(member.name ?? "")}">${t("settings.make-owner")}</button>
                  <button type="button" class="ghost" data-remove="${esc(member.userId)}" data-name="${esc(member.name ?? "")}">${t("settings.member-remove")}</button>
                </span>`
              : `<span class="hint">${t(`role.${member.role ?? "MEMBER"}`)}</span>`
          }
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

// Who is invited by email and still has not come in; the link appears once, right after inviting.
function inviteTile(invitations) {
  return `<section class="tile w-7" aria-labelledby="home-invite-title">
    <h2 id="home-invite-title">${t("home-tab.invite")}</h2>
    <form class="row-form" data-invite>
      <label class="grow">${t("settings.invite-email")}<input name="email" type="email" required maxlength="254" autocomplete="off"></label>
      <label>${t("settings.invite-role")}<select name="role">${roleOptions("MEMBER")}</select></label>
      <button class="primary" type="submit">${t("settings.invite-send")}</button>
    </form>
    <div class="invite-link" data-invite-link hidden>
      <p class="hint">${t("settings.invite-link-hint")}</p>
      <div class="row-form"><input class="grow" readonly aria-label="${esc(t("settings.invite-link"))}"><button type="button" data-copy-link>${t("settings.copy")}</button></div>
    </div>
    ${
      invitations.length
        ? `<h3>${t("settings.pending")}</h3>
          <ul class="list">${invitations
            .map(
              (invitation) => `<li class="member-row">
                <span class="item-name">${esc(invitation.email)} <small>${t(`role.${invitation.role}`)}</small></span>
                <span class="item-actions"><button type="button" class="ghost" data-cancel-invite="${esc(invitation.id)}" aria-label="${esc(t("settings.invite-cancel-one", { email: invitation.email }))}">${t("settings.invite-cancel")}</button></span>
              </li>`,
            )
            .join("")}</ul>`
        : ""
    }
  </section>`;
}

// The last changes to the fridge, by whom; private food of others shows as a change without details.
function activityTile(activity, names) {
  return `<section class="tile w-5" aria-labelledby="home-activity-title">
    <h2 id="home-activity-title">${t("home-tab.activity")}</h2>
    ${
      activity.length
        ? `<ul class="list">${activity
            .map((entry) => {
              const action = entry.action.startsWith("UNDO_") ? "UNDO" : ACTIONS.includes(entry.action) ? entry.action : "OTHER";
              const amount = entry.detail?.grams ? ` <span class="data">${grams(Number(entry.detail.grams))}</span>` : "";
              return `<li class="member-row">
                <span class="item-name">${esc(names.get(entry.actor) ?? t("settings.member-unknown"))} <small>${t(`activity.${action}`)}${amount}</small></span>
                <span class="hint">${esc(when(entry.at))}</span>
              </li>`;
            })
            .join("")}</ul>`
        : `<p class="hint">${t("home-tab.activity-none")}</p>`
    }
  </section>`;
}

// A snapshot keeps the whole fridge as it is now; restoring one puts every item back and ends the undo history.
function snapshotsTile(snapshots, creator) {
  const manual = snapshots.filter((snapshot) => snapshot.kind === "MANUAL").slice(0, 10);
  return `<section class="tile w-12" aria-labelledby="home-snapshots-title">
    <h2 id="home-snapshots-title">${t("home-tab.snapshots")}</h2>
    <p class="hint">${t("home-tab.snapshots-hint")}</p>
    <form class="row-form" data-snapshot>
      <label class="grow">${t("home-tab.snapshot-reason")}<input name="reason" maxlength="120" autocomplete="off"></label>
      <button type="submit">${t("home-tab.snapshot-take")}</button>
    </form>
    ${
      manual.length
        ? `<ul class="list">${manual
            .map(
              (snapshot) => `<li class="member-row">
                <span class="item-name">${esc(snapshot.reason || when(snapshot.at))} <small>${esc(t("home-tab.snapshot-items", { n: snapshot.items }))}</small></span>
                <span class="hint">${esc(when(snapshot.at))}</span>
                ${creator ? `<span class="item-actions"><button type="button" class="ghost" data-restore="${esc(snapshot.id)}" data-name="${esc(snapshot.reason || when(snapshot.at))}">${t("home-tab.snapshot-restore")}</button></span>` : ""}
              </li>`,
            )
            .join("")}</ul>`
        : `<p class="hint">${t("home-tab.snapshots-none")}</p>`
    }
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
  const [me, detail, code, invitations, activity, snapshots] = await Promise.all([
    api("/me"),
    api(base),
    api(`${base}/join-code`).catch(() => null),
    api(`${base}/invitations`).catch(() => []),
    api(`${base}/activity?limit=10`).catch(() => []),
    api(`${base}/snapshots`).catch(() => []),
  ]);
  const creator = detail.myRole === "OWNER";
  const names = new Map(detail.members.map((member) => [member.userId, member.name]));
  if (main.dataset.route !== "home") return;

  main.innerHTML = `
    <header>
      <h1>${t("nav.home")}</h1>
      <p class="lead">${t("home-tab.lead")}</p>
    </header>
    <div class="bento">
      ${houseTile(detail, me, code, creator)}
      ${enterTile(true, creator)}
      ${creator ? inviteTile(invitations ?? []) : ""}
      ${activityTile(activity ?? [], names)}
      ${detail.myRole !== "GUEST" ? snapshotsTile(snapshots ?? [], creator) : ""}
    </div>`;
  const redraw = () => renderHome(main, household);
  const act = (button, task) =>
    busy(button, async () => {
      try {
        await task();
      } catch (error) {
        toast(errorText(error));
      }
    });

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
  main.querySelector("[data-code-renew]")?.addEventListener("click", (event) =>
    act(event.currentTarget, async () => {
      await api(`${base}/join-code`, { method: "POST" });
      await redraw();
    }),
  );
  main.querySelector("[data-code-off]")?.addEventListener("click", () =>
    confirmSheet(t("settings.code-revoke"), t("home-tab.code-off-ask"), t("settings.code-revoke"), async () => {
      await api(`${base}/join-code`, { method: "DELETE" });
      await redraw();
    }),
  );
  main.querySelectorAll("[data-role]").forEach((select) =>
    select.addEventListener("change", async () => {
      try {
        await api(`${base}/members/${select.dataset.role}`, { method: "PATCH", body: { role: select.value } });
        toast(t("settings.saved"));
      } catch (error) {
        toast(errorText(error));
      }
      await redraw();
    }),
  );
  main.querySelectorAll("[data-owner]").forEach((button) =>
    button.addEventListener("click", () =>
      confirmSheet(t("settings.make-owner"), t("settings.make-owner-ask", { member: button.dataset.name }), t("settings.make-owner"), async () => {
        await api(`${base}/owner`, { method: "PUT", body: { userId: button.dataset.owner } });
        await redraw();
      }),
    ),
  );
  main.querySelector("[data-invite]")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.target;
    await busy(form.querySelector("button"), async () => {
      try {
        const values = formData(form);
        const invitation = await api(`${base}/invitations`, { method: "POST", body: { email: values.email.trim(), role: values.role } });
        await redraw();
        const box = main.querySelector("[data-invite-link]");
        if (invitation.link && box) {
          box.querySelector("input").value = invitation.link;
          box.hidden = false;
        }
      } catch (error) {
        showError(form, error);
      }
    });
  });
  main.querySelector("[data-copy-link]")?.addEventListener("click", async () => {
    const input = main.querySelector("[data-invite-link] input");
    await navigator.clipboard?.writeText(input.value).catch(() => input.select());
    toast(t("settings.copied"));
  });
  main.querySelectorAll("[data-cancel-invite]").forEach((button) =>
    button.addEventListener("click", () =>
      act(button, async () => {
        await api(`${base}/invitations/${button.dataset.cancelInvite}`, { method: "DELETE" });
        await redraw();
      }),
    ),
  );
  main.querySelector("[data-snapshot]")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.target;
    await busy(form.querySelector("button"), async () => {
      try {
        await api(`${base}/snapshots`, { method: "POST", body: { reason: formData(form).reason.trim() || null } });
        toast(t("home-tab.snapshot-taken"));
        await redraw();
      } catch (error) {
        showError(form, error);
      }
    });
  });
  main.querySelectorAll("[data-restore]").forEach((button) =>
    button.addEventListener("click", () =>
      confirmSheet(t("home-tab.snapshot-restore"), t("home-tab.snapshot-restore-ask", { name: button.dataset.name }), t("home-tab.snapshot-restore"), async () => {
        await api(`${base}/snapshots/${button.dataset.restore}/restore`, { method: "POST" });
        toast(t("home-tab.snapshot-restored"));
        await redraw();
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
