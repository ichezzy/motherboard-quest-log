/**
 * Short announcements for everyone who can see the quest:
 * new quest, new objective, objective complete, new clue, urgent, quest completed / failed / abandoned.
 *
 * The GM's client compares the quest before and after its own update and sends the
 * events over the module socket; every client shows them only if it may see the quest.
 */
import { PAGE_TYPE, SOCKET } from "./constants.mjs";
import { questEvents, plainLabel } from "./logic.mjs";
import { snapshot, takeSnapshot, canSee } from "./visibility.mjs";

const F = (key, data) => game.i18n.format(key, data);

function message(page, event) {
  const quest = page.name;
  switch (event.kind) {
    case "revealed": return F("MQL.Notify.Revealed", { quest });
    case "objective-revealed": return F("MQL.Notify.ObjectiveRevealed", { quest, text: plainLabel(event.text) });
    case "objective-done": return F("MQL.Notify.ObjectiveDone", { quest, text: plainLabel(event.text) });
    case "closed": return F(`MQL.Notify.Closed.${event.status}`, { quest });
    case "urgent": return F("MQL.Notify.Urgent", { quest });
    case "clue": return F("MQL.Notify.Clue", { quest, text: plainLabel(event.text) });
    default: return null;
  }
}

function show({ uuid, events }) {
  const page = fromUuidSync(uuid);
  if (!page || !canSee(page)) return;
  for (const event of events ?? []) {
    const text = message(page, event);
    if (text) ui.notifications.info(text);
  }
}

export function registerNotifications() {
  game.socket.on(SOCKET, data => {
    if (data?.action === "notify") show(data);
  });

  Hooks.on("updateJournalEntryPage", (page, changes, options, userId) => {
    if (page.type !== PAGE_TYPE) return;
    const before = takeSnapshot(page.uuid);
    if (userId !== game.user.id || !before) return;
    const events = questEvents(before, snapshot(page));
    if (!events.length) return;
    const data = { action: "notify", uuid: page.uuid, events };
    game.socket.emit(SOCKET, data);
    show(data);
  });
}
