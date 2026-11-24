/**
 * The Quest Log window: tabs, a list of quests, the selected quest on the right.
 * Everyone can open it. Players see what they may see, the GM sees everything.
 */
import { MODULE_ID, TABS, STATUS_ICONS } from "./constants.mjs";
import { tabOf, progress, sortQuests, isUrgent } from "./logic.mjs";
import { allQuests, canSee } from "./visibility.mjs";
import { questContext, activateQuestView } from "./quest-view.mjs";
import { createQuest } from "./journal.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const L = key => game.i18n.localize(key);
const APP_ID = "mql-quest-log";

export class QuestLog extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: APP_ID,
    classes: ["mql-quest-log"],
    window: { title: "MQL.Title", icon: "fa-solid fa-list-check", resizable: true },
    position: { width: 860, height: 640 },
    actions: {
      tab: QuestLog.#onTab,
      select: QuestLog.#onSelect,
      create: QuestLog.#onCreate
    }
  };

  static PARTS = {
    log: {
      template: `modules/${MODULE_ID}/templates/quest-log.hbs`,
      scrollable: [".mql-list-items", ".mql-detail"]
    }
  };

  #tab = "active";

  /** UUID of the selected quest page. */
  #selected = null;

  /** Show a quest: switch to its tab and select it. */
  show(uuid) {
    const page = uuid ? fromUuidSync(uuid) : null;
    if (page && canSee(page)) {
      this.#tab = tabOf(page.system.status);
      this.#selected = page.uuid;
    }
    return this.render({ force: true });
  }

  /** @inheritDoc */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const isGM = game.user.isGM;

    const groups = Object.fromEntries(TABS.map(tab => [tab, []]));
    for (const page of allQuests()) {
      if (canSee(page)) groups[tabOf(page.system.status)].push(page);
    }
    const tabs = TABS.filter(tab => isGM || tab !== "hidden");
    // Selection only happens inside a tab - if the selected quest is elsewhere now,
    // its status changed (e.g. revealed or completed): follow it.
    const current = this.#selected ? fromUuidSync(this.#selected) : null;
    if (current && canSee(current)) this.#tab = tabOf(current.system.status);
    if (!tabs.includes(this.#tab)) this.#tab = "active";

    const list = sortQuests(groups[this.#tab]);
    const selected = list.find(p => p.uuid === this.#selected) ?? list[0] ?? null;
    this.#selected = selected?.uuid ?? null;

    return Object.assign(context, {
      isGM,
      tabs: tabs.map(id => ({ id, label: L(`MQL.Tab.${id}`), count: groups[id].length, active: id === this.#tab })),
      quests: list.map(page => {
        const { done, total } = progress(page.system.objectives, isGM);
        const status = page.system.status;
        return {
          uuid: page.uuid,
          name: page.name,
          img: page.system.giver.img,
          status,
          statusLabel: L(`MQL.Status.${status}`),
          statusIcon: STATUS_ICONS[status],
          progress: total ? `${done}/${total}` : "",
          urgent: isUrgent(page),
          selected: page.uuid === this.#selected
        };
      }),
      empty: L(`MQL.Log.Empty.${this.#tab}`),
      quest: selected ? await questContext(selected, { showTitle: true, headingLevel: 2 }) : null
    });
  }

  /** @inheritDoc */
  async _onRender(context, options) {
    await super._onRender(context, options);
    const page = this.#selected ? fromUuidSync(this.#selected) : null;
    if (page) activateQuestView(this.element.querySelector(".mql-detail"), page);
  }

  static #onTab(event, target) {
    this.#tab = target.dataset.tab;
    this.#selected = null;
    this.render();
  }

  static #onSelect(event, target) {
    this.#selected = target.dataset.uuid;
    this.render();
  }

  static async #onCreate() {
    const page = await createQuest();
    if (page) this.show(page.uuid);
  }
}

/** Open the Quest Log (only one at a time), optionally at a quest. */
export function openQuestLog(uuid) {
  const app = foundry.applications.instances.get(APP_ID) ?? new QuestLog();
  return uuid ? app.show(uuid) : app.render({ force: true });
}

/** Keybinding: open, or close if it is open already. */
export function toggleQuestLog() {
  const app = foundry.applications.instances.get(APP_ID);
  if (app?.rendered) return app.close();
  return openQuestLog();
}

/** Re-render the Quest Log after quest pages change (once per burst of updates). */
export const refreshQuestLog = foundry.utils.debounce(() => {
  const app = foundry.applications.instances.get(APP_ID);
  if (app?.rendered) app.render();
}, 50);
