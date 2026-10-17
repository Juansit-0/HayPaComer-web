import { api } from "./api.js";
import { formatDay, formatTime, t } from "./i18n.js";
import { esc, openSheet } from "./ui.js";

function item(notification) {
  const unread = !notification.readAt;
  const at = `${formatDay(notification.at.slice(0, 10))} ${formatTime(notification.at)}`;
  return `<li class="inbox-item${unread ? " inbox-unread" : ""}">
      <div class="inbox-line">
        <strong>${esc(notification.title)}</strong>
        <span class="inbox-when">${esc(at)}</span>
      </div>
      <p>${esc(notification.body)}</p>
      ${unread ? `<button type="button" class="ghost" data-read="${esc(notification.id)}">${t("inbox.mark-read")}</button>` : ""}
    </li>`;
}

export async function openInbox(onChange) {
  const dialog = openSheet(t("inbox.title"), `<div data-inbox-body></div>`, (sheet) => {
    sheet.addEventListener("click", async (event) => {
      const read = event.target.closest("[data-read]");
      const all = event.target.closest("[data-read-all]");
      if (!read && !all) return;
      const notifications = await api("/notifications").catch(() => []);
      const pending = read
        ? [read.dataset.read]
        : notifications.filter((note) => !note.readAt).map((note) => note.id);
      for (const id of pending) {
        await api(`/notifications/${id}/read`, { method: "PATCH" }).catch(() => null);
      }
      await draw();
      onChange?.();
    });
  });
  const body = dialog.querySelector("[data-inbox-body]");

  async function draw() {
    const notifications = await api("/notifications").catch(() => []);
    if (!notifications.length) {
      body.innerHTML = `<p class="inbox-empty">${t("inbox.empty")}</p>`;
      return;
    }
    const unread = notifications.filter((note) => !note.readAt).length;
    body.innerHTML = `
      ${unread ? `<button type="button" class="ghost" data-read-all>${t("inbox.mark-all")}</button>` : ""}
      <ul class="inbox-list">${notifications.map(item).join("")}</ul>`;
  }

  await draw();
}
