/**
 * The session number, for follow-ups ("remind me in session 7").
 *
 * On the GM's first login of a calendar day Foundry asks "Start session 5?". "Not today" keeps
 * the number (a prep day). The number can also be changed in the Quest Log at any time.
 */
import { MODULE_ID } from "./constants.mjs";
import { localDay } from "./logic.mjs";

export const SESSION_CHANGED = `${MODULE_ID}.sessionChanged`;

const L = key => game.i18n.localize(key);
const F = (key, data) => game.i18n.format(key, data);

export function registerSessionSettings() {
  // 0 = not set yet
  game.settings.register(MODULE_ID, "session", {
    scope: "world",
    config: false,
    type: Number,
    default: 0,
    onChange: value => Hooks.callAll(SESSION_CHANGED, value)
  });
  // The day the GM was last asked - so the question comes once per day.
  game.settings.register(MODULE_ID, "sessionDay", { scope: "world", config: false, type: String, default: "" });
}

/** The current session number (0 = not set yet). */
export function currentSession() {
  return Number(game.settings.get(MODULE_ID, "session")) || 0;
}

export async function setSession(number) {
  const n = Math.max(0, Math.floor(Number(number) || 0));
  if (!game.user.isGM || n === currentSession()) return;
  await game.settings.set(MODULE_ID, "session", n);
  if (n) ui.notifications.info(F("MQL.Session.Started", { n }));
}

/** A small dialog with one number field. @returns {Promise<number|null>} */
async function askNumber({ title, hint, value, ok, skip }) {
  const { DialogV2 } = foundry.applications.api;
  const result = await DialogV2.wait({
    window: { title, icon: "fa-solid fa-calendar-day" },
    position: { width: 380 },
    classes: ["mql-session-dialog"],
    content: `<p>${hint}</p>
      <div class="form-group">
        <label>${L("MQL.Session.Number")}</label>
        <div class="form-fields"><input type="number" name="session" value="${value}" min="1" step="1" autofocus></div>
      </div>`,
    buttons: [
      { action: "ok", label: ok, icon: "fa-solid fa-play", default: true, callback: (event, button) => button.form.elements.session.valueAsNumber },
      { action: "skip", label: skip, icon: "fa-solid fa-xmark" }
    ],
    rejectClose: false
  });
  return Number.isFinite(result) && result > 0 ? result : null;
}

/** Quest Log button: set the session number by hand. */
export async function editSession() {
  if (!game.user.isGM) return;
  const n = await askNumber({
    title: L("MQL.Session.Title"),
    hint: L("MQL.Session.EditHint"),
    value: currentSession() || 1,
    ok: L("MQL.Session.Set"),
    skip: L("Cancel")
  });
  if (n) await setSession(n);
}

/** Active GM, at "ready": once per day, ask whether a new session starts. */
export async function askForSession() {
  if (game.user !== game.users.activeGM) return;
  const today = localDay();
  if (game.settings.get(MODULE_ID, "sessionDay") === today) return;
  await game.settings.set(MODULE_ID, "sessionDay", today);

  const current = currentSession();
  const n = await askNumber({
    title: L("MQL.Session.Title"),
    hint: current ? F("MQL.Session.Ask", { n: current + 1, last: current }) : L("MQL.Session.AskFirst"),
    value: current + 1,
    ok: L("MQL.Session.Start"),
    skip: L("MQL.Session.NotToday")
  });
  if (n) await setSession(n);
}
