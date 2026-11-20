/**
 * "Quest Log" button at the top of the Journal sidebar - for GM and players.
 */
import { openQuestLog } from "./quest-log.mjs";

export function addDirectoryButton(app, element) {
  const root = element instanceof HTMLElement ? element : element?.[0];
  if (!root || root.querySelector(".mql-open-log")) return;
  const actions = root.querySelector(".header-actions");
  const header = root.querySelector(".directory-header");
  if (!actions && !header) return;

  const row = document.createElement("div");
  row.className = "mql-directory-row";
  const button = document.createElement("button");
  button.type = "button";
  button.className = "mql-open-log";
  const icon = document.createElement("i");
  icon.className = "fa-solid fa-list-check";
  icon.inert = true;
  const label = document.createElement("span");
  label.textContent = game.i18n.localize("MQL.Log.Open");
  button.append(icon, " ", label);
  button.addEventListener("click", event => {
    event.preventDefault();
    openQuestLog();
  });
  row.append(button);

  if (actions) actions.after(row);
  else header.prepend(row);
}
