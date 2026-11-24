/**
 * Who sees a quest.
 *
 * The status decides: "hidden" sets the page's default ownership to None, every other status
 * to Observer. Per-player entries in the page's ownership are left alone.
 * Note: Foundry 14 sends all journal pages to every client. "Hidden" means "not shown",
 * not "secret" - see the hint on the GM brief.
 */
import { PAGE_TYPE } from "./constants.mjs";
import { ownershipFor, isClosed } from "./logic.mjs";

/** Quest state right before an update, kept only on the client that makes the update. */
const pending = new Map();

/** The parts of a quest that notifications compare. */
export function snapshot(page) {
  const source = page._source.system;
  return {
    status: source.status,
    urgent: Boolean(source.urgent),
    objectives: foundry.utils.deepClone(source.objectives ?? [])
  };
}

/** State before the update that just arrived (once). */
export function takeSnapshot(uuid) {
  const before = pending.get(uuid);
  pending.delete(uuid);
  return before;
}

/** May this user see the quest at all? */
export function canSee(page, user = game.user) {
  if (user.isGM) return true;
  return page.system.status !== "hidden" && page.testUserPermission(user, "OBSERVER");
}

/** All quest pages of the world, in every journal. */
export function allQuests() {
  return game.journal.contents.flatMap(journal => journal.pages.contents.filter(page => page.type === PAGE_TYPE));
}

export function registerVisibility() {
  // New quests start hidden - also in journals the players can read.
  Hooks.on("preCreateJournalEntryPage", page => {
    if (page.type !== PAGE_TYPE) return;
    page.updateSource({ ownership: { default: ownershipFor(page.system.status) } });
  });

  // Changes arrive here already cleaned and expanded (Foundry expands "system.status" keys first).
  Hooks.on("preUpdateJournalEntryPage", (page, changes) => {
    if (page.type !== PAGE_TYPE) return;
    const status = changes.system?.status;
    if (status && status !== page.system.status) {
      changes.ownership = { ...(changes.ownership ?? {}), default: ownershipFor(status) };
      // A closed quest is no longer urgent.
      if (isClosed(status)) changes.system.urgent = false;
    }
    pending.set(page.uuid, snapshot(page));
  });

  // Only one quest is urgent at a time: marking one clears the others.
  Hooks.on("createJournalEntryPage", (page, options, userId) => {
    if (page.type === PAGE_TYPE && userId === game.user.id && page.system.urgent) clearOtherUrgent(page);
  });
  Hooks.on("updateJournalEntryPage", (page, changes, options, userId) => {
    if (page.type === PAGE_TYPE && userId === game.user.id && changes.system?.urgent === true) clearOtherUrgent(page);
  });
}

async function clearOtherUrgent(page) {
  const byJournal = new Map();
  for (const other of allQuests()) {
    if (other.uuid === page.uuid || !other.system.urgent) continue;
    if (!byJournal.has(other.parent)) byJournal.set(other.parent, []);
    byJournal.get(other.parent).push({ _id: other.id, "system.urgent": false });
  }
  for (const [journal, updates] of byJournal) await journal.updateEmbeddedDocuments("JournalEntryPage", updates);
}
