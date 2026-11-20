import { MODULE_ID, PAGE_TYPE } from "./constants.mjs";
import { QuestData } from "./data-model.mjs";
import { QuestSheet } from "./quest-sheet.mjs";
import { VIEW_TEMPLATE } from "./quest-view.mjs";
import { registerVisibility } from "./visibility.mjs";
import { registerJournalSetting, createQuest } from "./journal.mjs";
import { openQuestLog, toggleQuestLog, refreshQuestLog } from "./quest-log.mjs";
import { addDirectoryButton } from "./directory.mjs";
import { registerNotifications } from "./notify.mjs";

Hooks.once("init", () => {
  CONFIG.JournalEntryPage.dataModels[PAGE_TYPE] = QuestData;

  foundry.applications.apps.DocumentSheetConfig.registerSheet(
    foundry.documents.JournalEntryPage,
    MODULE_ID,
    QuestSheet,
    { types: [PAGE_TYPE], makeDefault: true, label: "MQL.Sheet" }
  );

  registerJournalSetting();
  registerVisibility();

  game.keybindings.register(MODULE_ID, "toggle", {
    name: "MQL.Keybinding.Toggle",
    editable: [],
    onDown: () => {
      toggleQuestLog();
      return true;
    }
  });

  // The Quest Log window shows the quest view as a partial.
  foundry.applications.handlebars.loadTemplates([VIEW_TEMPLATE]);

  // For macros: game.modules.get("motherboard-quest-log").api.openQuestLog()
  game.modules.get(MODULE_ID).api = { openQuestLog, createQuest };
});

Hooks.once("ready", () => registerNotifications());

for (const event of ["create", "update", "delete"]) {
  Hooks.on(`${event}JournalEntryPage`, page => {
    if (page.type === PAGE_TYPE) refreshQuestLog();
  });
}

Hooks.on("renderJournalDirectory", addDirectoryButton);
