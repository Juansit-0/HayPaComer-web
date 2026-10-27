import { api } from "./api.js";
import { formatDay, formatTime, t } from "./i18n.js";
import { closeSheet, esc, openSheet } from "./ui.js";
import { grow, reduced } from "./motion.js";

const icon = (body) => `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${body}</svg>`;
// Each kind of alert has its glyph and the one thing worth doing about it.
const KINDS = {
  DOOR_LEFT_OPEN: { glyph: icon('<rect x="5" y="3" width="10" height="18" rx="1.5"/><path d="M15 5l4 1.5v12L15 20"/><path class="hatch" d="M8 8l4-3M8 12l4-3"/>'), action: "inbox.action.fridge", route: "#/fridge" },
  COLD_CHAIN_BREACH: { glyph: icon('<path d="M10 4a2 2 0 0 1 4 0v9.5a4 4 0 1 1-4 0z"/><path d="M12 9v7"/><path class="hatch" d="M17 6h3M17 9h2"/>'), action: "inbox.action.check", route: "#/fridge" },
  BRIEFING: { glyph: icon('<path d="M4 11h16v2a6 6 0 0 1-6 6h-4a6 6 0 0 1-6-6z"/><path d="M8 7c0-1.5 1.5-1.5 1.5-3M12 7c0-1.5 1.5-1.5 1.5-3M16 7c0-1.5 1.5-1.5 1.5-3"/>'), action: "inbox.action.cook", route: "#/now" },
};

function item(notification) {
  const unread = !notification.readAt;
  const kind = KINDS[notification.type] ?? KINDS.BRIEFING;
  const at = `${formatDay(notification.at.slice(0, 10))} ${formatTime(notification.at)}`;
  return `<li class="inbox-item${unread ? " inbox-unread" : ""}" data-note="${esc(notification.id)}">
      <span class="inbox-glyph">${kind.glyph}</span>
      <div class="inbox-text">
        <p class="inbox-line"><strong>${esc(notification.title)}</strong> ${esc(notification.body)}</p>
        <span class="inbox-when">${esc(at)}</span>
        <div class="inbox-actions">
          <a class="button" href="${kind.route}" data-go>${t(kind.action)}</a>
          ${unread ? `<button type="button" class="ghost" data-read="${esc(notification.id)}">${t("inbox.mark-read")}</button>` : ""}
        </div>
      </div>
    </li>`;
}

export async function openInbox(onChange) {
  const dialog = openSheet(t("inbox.title"), `<div data-inbox-body></div>`, (sheet) => {
    sheet.classList.add("inbox-sheet");
    sheet.addEventListener("click", async (event) => {
      if (event.target.closest("[data-go]")) {
        closeSheet(sheet);
        return;
      }
      if (event.target.closest("[data-retry]")) {
        await draw();
        return;
      }
      const read = event.target.closest("[data-read]");
      const all = event.target.closest("[data-read-all]");
      if (!read && !all) return;
      await markRead(read ? [read.dataset.read] : null);
      if (!sheet.contains(document.activeElement)) (sheet.querySelector("[data-read], [data-read-all]") ?? sheet.querySelector("[data-close]")).focus();
    });
  });
  const body = dialog.querySelector("[data-inbox-body]");

  async function markRead(ids) {
    const notifications = ids ? null : await api("/notifications").catch(() => []);
    for (const id of ids ?? notifications.filter((note) => !note.readAt).map((note) => note.id)) {
      await api(`/notifications/${id}/read`, { method: "PATCH" }).catch(() => null);
    }
    await draw();
    onChange?.();
  }

  // A failed load says so and offers a retry, instead of looking like an empty inbox.
  async function draw() {
    const notifications = await api("/notifications").catch(() => null);
    const unread = notifications?.filter((note) => !note.readAt).length ?? 0;
    await grow(body, () => {
      body.innerHTML = !notifications
        ? `<div class="inbox-empty" role="alert"><p>${t("inbox.failed")}</p><button type="button" data-retry>${t("action.retry")}</button></div>`
        : notifications.length
          ? `${unread ? `<button type="button" class="ghost" data-read-all>${t("inbox.mark-all")}</button>` : ""}
            <ul class="inbox-list">${notifications.map(item).join("")}</ul>`
          : `<p class="inbox-empty">${t("inbox.empty")}</p>`;
    });
  }

  // Phones: swiping an unread alert to the left marks it read; a short swipe springs back.
  let swipe = null;
  body.addEventListener("pointerdown", (event) => {
    const row = event.target.closest(".inbox-unread");
    if (event.pointerType !== "touch" || !row || event.target.closest("a, button")) return;
    swipe = { row, id: event.pointerId, x: event.clientX, dx: 0 };
  });
  body.addEventListener("pointermove", (event) => {
    if (swipe?.id !== event.pointerId) return;
    swipe.dx = Math.min(0, event.clientX - swipe.x);
    if (!reduced()) swipe.row.style.translate = `${swipe.dx}px 0`;
  });
  const end = async (event) => {
    if (swipe?.id !== event.pointerId) return;
    const { row, dx } = swipe;
    swipe = null;
    row.style.translate = "";
    if (event.type === "pointerup" && -dx > row.offsetWidth * 0.3) await markRead([row.dataset.note]);
  };
  body.addEventListener("pointerup", end);
  body.addEventListener("pointercancel", end);

  await draw();
}
