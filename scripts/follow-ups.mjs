/**
 * The GM's reminder window: follow-ups due this session, and what is coming up.
 * Opens by itself when a new session starts and something is due; also from the Quest Log.
 */
import { MODULE_ID } from "./constants.mjs";
import { dueFollowUps, upcomingFollowUps, isDue, toggleById, patchById, plainToHtml } from "./logic.mjs";
import { allQuests } from "./visibility.mjs";
import { openSecrets } from "./secret.mjs";
import { currentSession, editSession } from "./session.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const L = key => game.i18n.localize(key);
const F = (key, data) => game.i18n.format(key, data);
const APP_ID = "mql-follow-ups";

/** How many follow-ups are due right now, over all quests. */
export function dueCount(session = currentSession()) {
  return allQuests().reduce((sum, page) => sum + dueFollowUps(page.system.followUps, session).length, 0);
}

/** "Session 7", "Session 7 (2 ago)", or "No session". */
export function sessionTag(followUp, session) {
  if (!followUp.session) return L("MQL.FollowUp.NoSession");
  const tag = F("MQL.FollowUp.InSession", { n: followUp.session });
  return isDue(followUp, session) && followUp.session < session
    ? `${tag} · ${F("MQL.FollowUp.Overdue", { n: session - followUp.session })}` : tag;
}

export class FollowUps extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: APP_ID,
    classes: ["mql-follow-ups-window"],
    window: { title: "MQL.FollowUp.Title", icon: "fa-solid fa-bell", resizable: true },
    position: { width: 520, height: 560 },
    actions: {
      done: FollowUps.#onDone,
      later: FollowUps.#onLater,
      openQuest: FollowUps.#onOpenQuest,
      changeSession: () => editSession()
    }
  };

  static PARTS = {
    body: { template: `modules/${MODULE_ID}/templates/follow-ups.hbs`, scrollable: [""] }
  };

  /** @inheritDoc */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const session = currentSession();
    const due = [];
    const upcoming = [];
    let locked = "";

    for (const page of allQuests()) {
      const list = page.system.followUps ?? [];
      const now = dueFollowUps(list, session);
      const later = upcomingFollowUps(list, session);
      if (!now.length && !later.length) continue;
      // Texts may be encrypted: open them once per quest.
      let texts = new Map(list.map(f => [f.id, f.text]));
      let placeholder = L("MQL.FollowUp.NoText");
      try {
        texts = new Map((await openSecrets(page)).followUps.map(f => [f.id, f.text]));
      } catch (err) {
        locked = err.message;
        placeholder = L("MQL.Edit.Encrypted");
      }
      const entry = f => {
        const text = texts.get(f.id) ?? "";
        return {
          ...f,
          html: text.trim() ? plainToHtml(text) : "",
          placeholder,
          tag: sessionTag(f, session),
          overdue: isDue(f, session) && f.session < session
        };
      };
      const quest = { uuid: page.uuid, name: page.name };
      if (now.length) due.push({ ...quest, items: now.map(entry) });
      if (later.length) upcoming.push({ ...quest, items: later.map(entry) });
    }

    return Object.assign(context, {
      session,
      sessionLabel: session ? F("MQL.Session.Current", { n: session }) : L("MQL.Session.NotSet"),
      due,
      upcoming,
      upcomingCount: upcoming.reduce((sum, q) => sum + q.items.length, 0),
      locked
    });
  }

  static async #update(target, change) {
    const page = await fromUuid(target.dataset.uuid);
    if (!page || !game.user.isGM) return;
    // Texts stay as stored (plain or empty in secret mode) - only flags and numbers change.
    const list = foundry.utils.deepClone(page._source.system.followUps);
    await page.update({ "system.followUps": change(list, target.dataset.id) });
  }

  static #onDone(event, target) {
    return FollowUps.#update(target, (list, id) => toggleById(list, id, "done"));
  }

  /** Not yet: due again next session. */
  static #onLater(event, target) {
    return FollowUps.#update(target, (list, id) => patchById(list, id, { session: currentSession() + 1 }));
  }

  static #onOpenQuest(event, target) {
    game.modules.get(MODULE_ID).api.openQuestLog(target.dataset.uuid);
  }
}

export function openFollowUps() {
  if (!game.user.isGM) return;
  const app = foundry.applications.instances.get(APP_ID) ?? new FollowUps();
  return app.render({ force: true });
}

export const refreshFollowUps = foundry.utils.debounce(() => {
  const app = foundry.applications.instances.get(APP_ID);
  if (app?.rendered) app.render();
}, 50);

/** New session: open the reminders if anything is due (active GM only). */
export function onSessionChanged() {
  refreshFollowUps();
  if (game.user !== game.users.activeGM) return;
  const n = dueCount();
  if (!n) return;
  ui.notifications.info(F("MQL.FollowUp.DueNotice", { n }));
  openFollowUps();
}
