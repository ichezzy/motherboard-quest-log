/**
 * The journal "Quest Log": where the "New quest" button puts its pages.
 * Quests may live in any journal - the Quest Log window collects them all.
 */
import { MODULE_ID, PAGE_TYPE } from "./constants.mjs";

const L = key => game.i18n.localize(key);

export function registerJournalSetting() {
  game.settings.register(MODULE_ID, "journal", { scope: "world", config: false, type: String, default: "" });
}

/** The journal "Quest Log" (created on first use, readable by players; hidden quests stay hidden). */
export async function questJournal() {
  const id = game.settings.get(MODULE_ID, "journal");
  const found = (id && game.journal.get(id)) || game.journal.find(j => j.getFlag(MODULE_ID, "questLog"));
  if (found) return found;
  const journal = await CONFIG.JournalEntry.documentClass.create({
    name: L("MQL.Log.JournalName"),
    ownership: { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER },
    flags: { [MODULE_ID]: { questLog: true } }
  });
  await game.settings.set(MODULE_ID, "journal", journal.id);
  return journal;
}

/** Create a hidden quest and open its edit window (GM only). */
export async function createQuest() {
  if (!game.user.isGM) return null;
  const journal = await questJournal();
  const last = Math.max(0, ...journal.pages.contents.map(p => p.sort));
  const [page] = await journal.createEmbeddedDocuments("JournalEntryPage", [{
    name: L("MQL.Log.NewQuestName"),
    type: PAGE_TYPE,
    sort: last + CONST.SORT_INTEGER_DENSITY
  }]);
  page?.sheet.render({ force: true });
  return page ?? null;
}
