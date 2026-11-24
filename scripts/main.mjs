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
import { registerClues } from "./clues.mjs";
import { registerRewards } from "./rewards.mjs";
import { registerSessionSettings, addSessionControl, SESSION_CHANGED } from "./session.mjs";
import { openFollowUps, refreshFollowUps, onSessionChanged } from "./follow-ups.mjs";

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
  registerSessionSettings();
  registerVisibility();
  registerClues();
  registerRewards();
  // "Start session" in Ferrond's group on the left. Registered here so it runs after Ferrond's own hook.
  Hooks.on("getSceneControlButtons", addSessionControl);

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
  game.modules.get(MODULE_ID).api = { openQuestLog, createQuest, openFollowUps };
});

Hooks.once("ready", () => {
  registerNotifications();
  if (!game.user.isGM) return;
  loadKey();
});

/** Redraw every open quest sheet (journal pages and edit windows). */
function refreshSheets() {
  for (const app of foundry.applications.instances.values()) {
    if (app instanceof QuestSheet && app.rendered) app.render();
  }
}

// Key loaded, unlocked or forgotten: redraw everything that shows secret parts.
Hooks.on(SECRET_CHANGED, () => {
  refreshQuestLog();
  refreshFollowUps();
  refreshSheets();
});

// New session number: due follow-ups change, the reminder may open.
Hooks.on(SESSION_CHANGED, () => {
  refreshQuestLog();
  if (game.user.isGM) refreshSheets();
  onSessionChanged();
});

for (const event of ["create", "update", "delete"]) {
  Hooks.on(`${event}JournalEntryPage`, page => {
    if (page.type !== PAGE_TYPE) return;
    refreshQuestLog();
    refreshFollowUps();
  });
}

// The quest giver link depends on the player's permission on the actor.
Hooks.on("updateActor", (actor, changes) => {
  if ("ownership" in changes) refreshQuestLog();
});

Hooks.on("renderJournalDirectory", addDirectoryButton);
