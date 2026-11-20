import { MODULE_ID, PAGE_TYPE } from "./constants.mjs";
import { QuestData } from "./data-model.mjs";

Hooks.once("init", () => {
  CONFIG.JournalEntryPage.dataModels[PAGE_TYPE] = QuestData;
});
