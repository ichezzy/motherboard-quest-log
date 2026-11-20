import { MODULE_ID, PAGE_TYPE } from "./constants.mjs";
import { QuestData } from "./data-model.mjs";
import { QuestSheet } from "./quest-sheet.mjs";
import { registerVisibility } from "./visibility.mjs";

Hooks.once("init", () => {
  CONFIG.JournalEntryPage.dataModels[PAGE_TYPE] = QuestData;

  foundry.applications.apps.DocumentSheetConfig.registerSheet(
    foundry.documents.JournalEntryPage,
    MODULE_ID,
    QuestSheet,
    { types: [PAGE_TYPE], makeDefault: true, label: "MQL.Sheet" }
  );

  registerVisibility();
});
