import { MODULE_ID } from "./constants.mjs";
import { cryptoAvailable } from "./crypto.mjs";
import {
  secretModeOn, keyReady, secretStatus, setup, unlock, encryptOpen, turnOff, forget, SECRET_CHANGED
} from "./secret.mjs";

const { ApplicationV2, HandlebarsApplicationMixin, DialogV2 } = foundry.applications.api;
const L = key => game.i18n.localize(key);

/** Window "Secret mode" (Settings → Motherboard: Quest Log). */
export class SecretConfig extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "mql-secret",
    classes: ["mql-secret"],
    window: { title: "MQL.Secret.Name", icon: "fa-solid fa-key", resizable: true },
    position: { width: 520, height: "auto" }
  };

  static PARTS = {
    content: { template: `modules/${MODULE_ID}/templates/secret.hbs` }
  };

  /** @inheritDoc */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const on = secretModeOn();
    return Object.assign(context, {
      crypto: cryptoAvailable(),
      on,
      ready: on && (await keyReady()),
      status: secretStatus()
    });
  }

  /** @inheritDoc */
  async _onRender(context, options) {
    await super._onRender(context, options);
    const el = this.element;
    const value = name => el.querySelector(`[name='${name}']`)?.value ?? "";
    const action = (name, fn) => el.querySelector(`[data-mql-action='${name}']`)?.addEventListener("click", async event => {
      event.preventDefault();
      try {
        await fn();
      } catch (err) {
        ui.notifications.error(err.message);
      }
      this.render();
    });

    action("setup", async () => {
      const word = value("word");
      if (word.length < 8) throw new Error(L("MQL.Secret.TooShort"));
      if (word !== value("repeat")) throw new Error(L("MQL.Secret.Mismatch"));
      await setup(word);
    });
    action("unlock", () => unlock(value("word")));
    action("encrypt", () => encryptOpen());
    action("forget", () => forget());
    action("turn-off", async () => {
      const yes = await DialogV2.confirm({
        window: { title: L("MQL.Secret.TurnOffTitle") },
        content: `<p>${L("MQL.Secret.TurnOffQuestion")}</p>`
      });
      if (yes) await turnOff();
    });
  }
}

/** Keep an open window current when the key arrives (e.g. after "ready"). */
Hooks.on(SECRET_CHANGED, () => {
  const app = foundry.applications.instances.get("mql-secret");
  if (app?.rendered) app.render();
});
