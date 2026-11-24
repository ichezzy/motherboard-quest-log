/**
 * The session number, for follow-ups ("remind me in session 7").
 *
 * The GM starts a session with "Start session" - a button in the Ferrond group of the scene
 * controls on the left (if the Motherboard: Ferrond module is active). The number can also be
 * changed in the Quest Log at any time.
 */
import { MODULE_ID } from "./constants.mjs";

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
async function askNumber({ title, hint, value, ok, icon }) {
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
      { action: "ok", label: ok, icon, default: true, callback: (event, button) => button.form.elements.session.valueAsNumber },
      { action: "cancel", label: L("Cancel"), icon: "fa-solid fa-xmark" }
    ],
    rejectClose: false
  });
  return Number.isFinite(result) && result > 0 ? result : null;
}

/** "Start session": the next number, ready to confirm (or to change). */
export async function startSession() {
  if (!game.user.isGM) return;
  const current = currentSession();
  const n = await askNumber({
    title: L("MQL.Session.StartTitle"),
    hint: current ? F("MQL.Session.StartHint", { n: current + 1, last: current }) : L("MQL.Session.StartFirst"),
    value: current + 1,
    ok: L("MQL.Session.Start"),
    icon: "fa-solid fa-play"
  });
  if (n) await setSession(n);
}

/** Quest Log button: set the session number by hand. */
export async function editSession() {
  if (!game.user.isGM) return;
  const n = await askNumber({
    title: L("MQL.Session.Title"),
    hint: L("MQL.Session.EditHint"),
    value: currentSession() || 1,
    ok: L("MQL.Session.Set"),
    icon: "fa-solid fa-check"
  });
  if (n) await setSession(n);
}
