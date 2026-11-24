/**
 * Buttons in the "Ferrond" group of the scene controls on the left (Motherboard: Ferrond module):
 *   Quest Log      - everyone who sees the group (players see it only while a shop is open)
 *   Start session  - GM only
 * Without Ferrond there is no group and no buttons: the Quest Log opens from the Journal sidebar.
 */
import { openQuestLog } from "./quest-log.mjs";
import { startSession } from "./session.mjs";

/** The scene control group of the Motherboard: Ferrond module. */
const FERROND_GROUP = "ferrond";

/**
 * Hook "getSceneControlButtons". Ferrond adds its group in a hook of its own that is registered
 * earlier - so register this one in "init" or later.
 */
export function addFerrondTools(controls) {
  const group = controls[FERROND_GROUP];
  if (!group?.tools) return;
  const next = () => Object.keys(group.tools).length + 1;
  group.tools.mqlQuestLog = {
    name: "mqlQuestLog",
    title: "MQL.Log.Open",
    icon: "fa-solid fa-list-check",
    order: next(),
    button: true,
    onChange: () => openQuestLog()
  };
  if (!game.user.isGM) return;
  group.tools.mqlStartSession = {
    name: "mqlStartSession",
    title: "MQL.Session.StartTitle",
    icon: "fa-solid fa-calendar-day",
    order: next(),
    button: true,
    onChange: () => startSession()
  };
}
