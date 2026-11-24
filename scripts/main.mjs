import { MODULE_ID, PAGE_TYPE } from "./constants.mjs";
import { QuestData } from "./data-model.mjs";
import { QuestSheet } from "./quest-sheet.mjs";
import { VIEW_TEMPLATE } from "./quest-view.mjs";
import { registerVisibility } from "./visibility.mjs";
import { registerJournalSetting, createQuest } from "./journal.mjs";
import { openQuestLog, toggleQuestLog, refreshQuestLog } from "./quest-log.mjs";
import { addDirectoryButton } from "./directory.mjs";
import { registerNotifications } from "./notify.mjs";
import { registerSecretSettings, loadKey, SECRET_CHANGED } from "./secret.mjs";
import { SecretConfig } from "./secret-config.mjs";

Hooks.once("init", () => {
  CONFIG.JournalEntryPage.dataModels[PAGE_TYPE] = QuestData;

  foundry.applications.apps.DocumentSheetConfig.registerSheet(
    foundry.documents.JournalEntryPage,
    MODULE_ID,
    QuestSheet,
    { types: [PAGE_TYPE], makeDefault: true, label: "MQL.Sheet" }
  );

  registerJournalSetting();
  registerSecretSettings(SecretConfig);
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

Hooks.once("ready", () => {
  registerNotifications();
  if (game.user.isGM) loadKey();
});

// Key loaded, unlocked or forgotten: redraw everything that shows a GM brief.
Hooks.on(SECRET_CHANGED, () => {
  refreshQuestLog();
  for (const app of foundry.applications.instances.values()) {
    if (app instanceof QuestSheet && app.rendered) app.render();
  }
});

for (const event of ["create", "update", "delete"]) {
  Hooks.on(`${event}JournalEntryPage`, page => {
    if (page.type === PAGE_TYPE) refreshQuestLog();
  });
}

// The quest giver link depends on the player's permission on the actor.
Hooks.on("updateActor", (actor, changes) => {
  if ("ownership" in changes) refreshQuestLog();
});

Hooks.on("renderJournalDirectory", addDirectoryButton);
