/**
 * Clues (Three Clue Rule): links to documents, and finding them automatically.
 *
 * A clue may link a journal page, a journal, an item or an actor. A Data Carrier loot item links
 * its page instead. Clues linked to a journal page or journal count as found as soon as a player
 * may see that document (Observer) - e.g. when the Data Carrier module unlocks a page for a player
 * or the GM shows it. Everything else the GM ticks by hand.
 */
import { DATA_CARRIER } from "./constants.mjs";
import { allQuests } from "./visibility.mjs";

const LINKABLE = new Set(["JournalEntryPage", "JournalEntry", "Item", "Actor"]);
const FOUND_BY_ACCESS = new Set(["JournalEntryPage", "JournalEntry"]);
const DATA_CARRIER_PAGE = `${DATA_CARRIER}.datentraeger`;

const ICONS = {
  JournalEntryPage: "fa-solid fa-file-lines",
  JournalEntry: "fa-solid fa-book-open",
  Item: "fa-solid fa-suitcase",
  Actor: "fa-solid fa-user"
};

/** The document behind a UUID, if it is loaded (world documents). Compendium index entries don't count. */
function loaded(uuid) {
  if (!uuid) return null;
  try {
    const doc = fromUuidSync(uuid);
    return doc instanceof foundry.abstract.Document ? doc : null;
  } catch {
    return null;
  }
}

function iconFor(doc, uuid) {
  if (doc?.type === DATA_CARRIER_PAGE) return "fa-solid fa-compact-disc";
  const type = doc?.documentName ?? Object.keys(ICONS).find(name => uuid.includes(`${name}.`));
  return ICONS[type] ?? "fa-solid fa-link";
}

/**
 * How to show a clue's link to the current user.
 * @returns {{uuid: string, name: string, icon: string, missing: boolean, canOpen: boolean}|null}
 */
export function linkInfo(clue) {
  if (!clue.uuid) return null;
  const doc = loaded(clue.uuid);
  let name = clue.name;
  if (!doc) {
    try {
      name = fromUuidSync(clue.uuid)?.name ?? name; // compendium index entry
    } catch { /* gone */ }
  } else {
    name = doc.name;
  }
  const canOpen = game.user.isGM || Boolean(doc?.testUserPermission(game.user, "LIMITED"));
  return { uuid: clue.uuid, name, icon: iconFor(doc, clue.uuid), missing: !doc && !name, canOpen };
}

/**
 * What a dropped document links to. A Data Carrier loot item points to its page.
 * @returns {Promise<{uuid: string, name: string, doc: foundry.abstract.Document}|null>}
 */
export async function linkFromDrop(data) {
  if (!data?.uuid || !LINKABLE.has(data.type)) return null;
  let doc = await fromUuid(data.uuid);
  if (!doc) return null;
  const pageUuid = doc.documentName === "Item" ? doc.flags?.[DATA_CARRIER]?.seite : null;
  if (pageUuid) doc = (await fromUuid(pageUuid)) ?? doc;
  return { uuid: doc.uuid, name: doc.name, doc };
}

/** May at least one player see this journal page or journal? */
export function openToPlayers(doc) {
  if (!doc || !FOUND_BY_ACCESS.has(doc.documentName) || doc.pack) return false;
  return game.users.some(user => !user.isGM && doc.testUserPermission(user, "OBSERVER"));
}

/** Open a linked document: a journal page inside its journal, everything else in its own sheet. */
export async function openLink(uuid) {
  const doc = uuid ? await fromUuid(uuid) : null;
  if (!doc) {
    ui.notifications.warn("MQL.Clue.Missing", { localize: true });
    return;
  }
  if (!game.user.isGM && !doc.testUserPermission(game.user, "LIMITED")) {
    ui.notifications.warn("MQL.Clue.NoAccess", { localize: true });
    return;
  }
  if (doc.documentName === "JournalEntryPage") return doc.parent.sheet.render({ force: true, pageId: doc.id });
  return doc.sheet?.render({ force: true });
}

/**
 * Active GM: mark every clue as found whose journal page or journal players may see now.
 * Runs on "ready" and whenever the ownership of a journal or page changes.
 */
async function markOpenClues() {
  if (game.user !== game.users.activeGM) return;
  for (const page of allQuests()) {
    const clues = page._source.system.clues ?? [];
    let changed = false;
    const next = clues.map(clue => {
      if (clue.found || !openToPlayers(loaded(clue.uuid))) return clue;
      changed = true;
      return { ...clue, found: true };
    });
    if (changed) await page.update({ "system.clues": next });
  }
}

const markSoon = foundry.utils.debounce(() => {
  markOpenClues().catch(err => console.error("motherboard-quest-log | Clues", err));
}, 250);

export function registerClues() {
  Hooks.once("ready", markSoon);
  Hooks.on("updateJournalEntry", (journal, changes) => {
    if ("ownership" in changes) markSoon();
  });
  Hooks.on("updateJournalEntryPage", (page, changes) => {
    if ("ownership" in changes) markSoon();
  });
  // A user who stops being a GM counts as a player from now on.
  Hooks.on("updateUser", (user, changes) => {
    if ("role" in changes) markSoon();
  });
}
