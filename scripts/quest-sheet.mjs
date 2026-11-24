import { MODULE_ID, BRIEF_FIELDS } from "./constants.mjs";
import {
  addObjective, removeObjective, moveObjective, removeById, patchById,
  blankConclusion, blankClue, removeConclusion, clueGroups, addRewardItem, blankFollowUp, isDue
} from "./logic.mjs";
import { currentSession } from "./session.mjs";
import { VIEW_TEMPLATE, questContext, activateQuestView } from "./quest-view.mjs";
import { openSecrets, secretValues, secretsWritable, secretModeOn, isEncrypted, pickBrief } from "./secret.mjs";
import { parseQuestProfile } from "./profile.mjs";
import { linkInfo, linkFromDrop, openToPlayers } from "./clues.mjs";
import { currencies, resetHandOut } from "./rewards.mjs";

const { JournalEntryPageHandlebarsSheet } = foundry.applications.sheets.journal;

export const EDIT_TEMPLATE = `modules/${MODULE_ID}/templates/quest-edit.hbs`;

const L = key => game.i18n.localize(key);
const F = (key, data) => game.i18n.format(key, data);

/** Same conclusions, same texts, same order? */
function sameTexts(a, b) {
  return a.length === b.length && a.every((entry, i) => entry.id === b[i].id && (entry.text ?? "") === (b[i].text ?? ""));
}

/**
 * One sheet, two modes - like Foundry's own pages:
 * view inside the journal, edit in a window of its own.
 *
 * The lists with buttons (conclusions and clues) have no `name` in the form: they are read from
 * the form and saved by their own handlers, so a form submit never races with them.
 */
export class QuestSheet extends JournalEntryPageHandlebarsSheet {
  static DEFAULT_OPTIONS = {
    classes: ["mql-sheet"],
    window: { icon: "fa-solid fa-list-check" },
    position: { width: 720, height: 820 }
  };

  static EDIT_PARTS = {
    header: super.EDIT_PARTS.header,
    content: {
      template: EDIT_TEMPLATE,
      // "scrollable" as a class: Foundry cuts off the content of page sheets otherwise
      classes: ["standard-form", "scrollable"],
      scrollable: [""]
    },
    footer: super.EDIT_PARTS.footer
  };

  /**
   * No `root: true`: with it Foundry would only take the template's children,
   * and the <article class="mql-quest"> the styles hang on would be lost.
   */
  static VIEW_PARTS = {
    content: { template: VIEW_TEMPLATE }
  };

  /** Field that gets the focus after the next render (a freshly added row). */
  #focus = null;

  /** Can brief and conclusions be read and saved in this browser right now? */
  #secretsOpen = false;

  /** @inheritDoc */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const page = this.document;
    const fields = page.system.schema.fields;
    context.systemFields = fields;
    if (this.isView) {
      Object.assign(context, await questContext(page, {
        showTitle: page.title?.show !== false,
        headingLevel: page.title?.level ?? 1
      }));
      return context;
    }

    const source = page._source.system;
    context.giver = source.giver;
    context.hasGiver = Boolean(source.giver.uuid || source.giver.name || source.giver.img);
    context.objectives = source.objectives;
    context.secretOn = secretModeOn();

    // Encrypted without key: show no secret fields, so saving can't overwrite them with blanks.
    let secrets = null;
    try {
      secrets = await openSecrets(page);
      if (!(await secretsWritable(page))) context.briefLocked = L("MQL.Secret.Locked");
    } catch (err) {
      context.briefLocked = err.message;
    }
    this.#secretsOpen = Boolean(secrets) && !context.briefLocked;
    context.secretsLocked = !this.#secretsOpen;
    context.briefFields = this.#secretsOpen
      ? BRIEF_FIELDS.map(key => ({ field: fields.brief.fields[key], value: secrets.brief[key] }))
      : [];

    const conclusions = this.#secretsOpen ? secrets.conclusions : source.conclusions;
    context.clueGroups = clueGroups(conclusions, source.clues).map(group => ({
      ...group,
      text: this.#secretsOpen ? group.text : "",
      countLabel: F("MQL.View.FoundCount", { found: group.found, total: group.total }),
      clues: group.clues.map(clue => ({ ...clue, link: linkInfo(clue) }))
    }));

    const rewards = source.rewards;
    context.rewards = {
      items: rewards.items.map(item => ({ ...item, img: item.img || "icons/svg/item-bag.svg" })),
      currency: currencies().map(c => ({ ...c, name: `system.rewards.currency.${c.key}`, value: rewards.currency[c.key] ?? 0 })),
      text: rewards.text,
      handedOut: rewards.handedOut,
      received: rewards.received
    };

    const session = currentSession();
    const followUps = this.#secretsOpen ? secrets.followUps : source.followUps;
    context.followUps = followUps.map(f => ({ ...f, text: this.#secretsOpen ? f.text : "", due: isDue(f, session) }));
    context.sessionHint = session ? F("MQL.Edit.SessionNow", { n: session }) : L("MQL.Edit.SessionNotSet");
    return context;
  }

  /**
   * In secret mode the brief is never saved in plain text: it is merged with the stored
   * secret parts and encrypted before the update - only if it really changed.
   * @inheritDoc
   */
  async _processSubmitData(event, form, submitData, options) {
    const system = submitData.system;
    const page = this.document;
    if (system?.brief && (secretModeOn() || isEncrypted(page))) {
      const submitted = system.brief;
      delete system.brief;
      if (this.#secretsOpen) {
        const parts = await openSecrets(page);
        const brief = pickBrief({ ...parts.brief, ...submitted });
        if (BRIEF_FIELDS.some(f => brief[f] !== parts.brief[f])) Object.assign(system, await secretValues({ ...parts, brief }));
      }
    }
    return super._processSubmitData(event, form, submitData, options);
  }

  /**
   * Own listeners instead of `actions`: in view mode the sheet lives inside the journal,
   * not in a window of its own - this way the buttons work the same in both modes.
   * @inheritDoc
   */
  async _onRender(context, options) {
    await super._onRender(context, options);
    if (this.isView) activateQuestView(this.element, this.document);
    else this.#activateEdit();
  }

  /* -------------------------------------------- */
  /*  Edit mode                                   */
  /* -------------------------------------------- */

  #activateEdit() {
    const el = this.element;
    const page = this.document;
    const on = (action, fn) => {
      for (const button of el.querySelectorAll(`[data-mql-action='${action}']`)) {
        button.addEventListener("click", event => {
          event.preventDefault();
          fn(button);
        });
      }
    };
    const rowId = button => button.closest("[data-id]")?.dataset.id;
    const conclusionId = button => button.closest(".mql-conclusion-edit")?.dataset.id;

    on("add-objective", () => {
      const id = foundry.utils.randomID();
      this.#focus = `.mql-objective-row[data-id='${id}'] input[data-field='text']`;
      this.#saveObjectives(addObjective(this.#readObjectives(), id));
    });
    on("delete-objective", button => this.#saveObjectives(removeObjective(this.#readObjectives(), rowId(button))));
    on("move-up", button => this.#saveObjectives(moveObjective(this.#readObjectives(), rowId(button), -1)));
    on("move-down", button => this.#saveObjectives(moveObjective(this.#readObjectives(), rowId(button), 1)));
    on("clear-giver", () => page.update({ "system.giver": { uuid: null, name: "", img: null } }));
    on("paste-profile", () => this.#pasteProfile());

    // Clues: saved by their own handlers, never by the form.
    on("add-conclusion", () => {
      const id = foundry.utils.randomID();
      this.#focus = `.mql-conclusion-edit[data-id='${id}'] .mql-conclusion-head input`;
      this.#saveClues({ conclusions: [...this.#readConclusions(), blankConclusion(id)] });
    });
    on("delete-conclusion", button => this.#saveClues(removeConclusion(
      { conclusions: this.#readConclusions(), clues: this.#readClues() }, conclusionId(button)
    )));
    on("add-clue", button => {
      const id = foundry.utils.randomID();
      this.#focus = `.mql-clue-row[data-id='${id}'] input[data-field='text']`;
      this.#saveClues({ clues: [...this.#readClues(), blankClue(id, conclusionId(button))] });
    });
    on("delete-clue", button => this.#saveClues({ clues: removeById(this.#readClues(), rowId(button)) }));
    on("clear-link", button => this.#saveClues({ clues: patchById(this.#readClues(), rowId(button), { uuid: "", name: "" }) }));

    const clueSet = el.querySelector("[data-mql-list='clues']");
    clueSet?.addEventListener("change", event => {
      event.stopPropagation(); // not a form submit
      this.#saveClues();
    });
    // Drop on a clue: link it. Drop on a conclusion: a new clue with that link.
    for (const zone of el.querySelectorAll(".mql-clue-row, .mql-conclusion-edit")) this.#dropZone(zone, event => this.#onDropClue(event, zone));

    // Reward items: own handlers too. Currency and text are normal form fields.
    on("delete-reward", button => this.#saveRewardItems(removeById(this.#readRewardItems(), rowId(button))));
    on("reset-hand-out", () => resetHandOut(page));
    const rewardList = el.querySelector("[data-mql-list='reward-items']");
    if (rewardList) {
      rewardList.addEventListener("change", event => {
        event.stopPropagation(); // not a form submit
        this.#saveRewardItems(this.#readRewardItems());
      });
      this.#dropZone(rewardList, event => this.#onDropReward(event));
    }

    // Follow-ups: own handlers as well (their texts are secret).
    on("add-follow-up", () => {
      const id = foundry.utils.randomID();
      const session = currentSession();
      this.#focus = `.mql-follow-up-row[data-id='${id}'] input[data-field='text']`;
      this.#saveFollowUps([...this.#readFollowUps(), blankFollowUp(id, session ? session + 1 : null)]);
    });
    on("delete-follow-up", button => this.#saveFollowUps(removeById(this.#readFollowUps(), rowId(button))));
    el.querySelector("[data-mql-list='follow-ups']")?.addEventListener("change", event => {
      event.stopPropagation(); // not a form submit
      this.#saveFollowUps(this.#readFollowUps());
    });

    const giver = el.querySelector("[data-mql-drop='giver']");
    if (giver) this.#dropZone(giver, event => this.#onDropGiver(event));

    if (this.#focus) {
      el.querySelector(this.#focus)?.focus();
      this.#focus = null;
    }
  }

  /** Highlight while dragging over, call `onDrop` on drop. */
  #dropZone(zone, onDrop) {
    zone.addEventListener("dragover", event => {
      event.preventDefault();
      event.stopPropagation();
      zone.classList.add("mql-drag-over");
    });
    zone.addEventListener("dragleave", event => {
      event.stopPropagation();
      zone.classList.remove("mql-drag-over");
    });
    zone.addEventListener("drop", event => {
      event.preventDefault();
      event.stopPropagation();
      zone.classList.remove("mql-drag-over");
      onDrop(event);
    });
  }

  /**
   * Objectives as they stand in the form right now - including text that was typed
   * but not saved yet (the click on a button comes before the pending save).
   */
  #readObjectives() {
    return [...this.element.querySelectorAll(".mql-objective-row")].map(row => {
      const value = field => row.querySelector(`[data-field='${field}']`);
      return {
        id: row.dataset.id,
        text: value("text")?.value ?? "",
        revealed: Boolean(value("revealed")?.checked),
        done: Boolean(value("done")?.checked),
        optional: Boolean(value("optional")?.checked)
      };
    });
  }

  #readConclusions() {
    return [...this.element.querySelectorAll(".mql-conclusion-edit")].map(box => ({
      id: box.dataset.id,
      text: box.querySelector(".mql-conclusion-head input[data-field='text']")?.value ?? ""
    }));
  }

  #readClues() {
    return [...this.element.querySelectorAll(".mql-clue-row")].map(row => ({
      id: row.dataset.id,
      conclusion: row.closest(".mql-conclusion-edit")?.dataset.id ?? "",
      text: row.querySelector("input[data-field='text']")?.value ?? "",
      uuid: row.dataset.uuid ?? "",
      name: row.dataset.name ?? "",
      found: Boolean(row.querySelector("input[data-field='found']")?.checked)
    }));
  }

  /**
   * Save conclusions and clues (missing ones are read from the form). Conclusion texts are
   * secret: they only change when they can be saved the right way, and only if they changed.
   */
  async #saveClues({ conclusions, clues } = {}) {
    const page = this.document;
    conclusions ??= this.#readConclusions();
    clues ??= this.#readClues();
    try {
      const system = { clues };
      if (this.#secretsOpen) {
        const parts = await openSecrets(page);
        if (!sameTexts(parts.conclusions, conclusions)) Object.assign(system, await secretValues({ ...parts, conclusions }));
      }
      await page.update({ system });
    } catch (err) {
      ui.notifications.error(err.message);
    }
  }

  /** A document dropped on a clue (links it) or on a conclusion (new clue with that link). */
  async #onDropClue(event, zone) {
    const data = foundry.applications.ux.TextEditor.implementation.getDragEventData(event);
    const link = await linkFromDrop(data);
    if (!link) {
      ui.notifications.warn("MQL.Edit.ClueDropOnly", { localize: true });
      return;
    }
    const patch = { uuid: link.uuid, name: link.name };
    // Players may see it already: then it is found already.
    if (openToPlayers(link.doc)) patch.found = true;
    const clues = this.#readClues();
    if (zone.classList.contains("mql-clue-row")) return this.#saveClues({ clues: patchById(clues, zone.dataset.id, patch) });
    const clue = { ...blankClue(foundry.utils.randomID(), zone.dataset.id), ...patch };
    this.#focus = `.mql-clue-row[data-id='${clue.id}'] input[data-field='text']`;
    return this.#saveClues({ clues: [...clues, clue] });
  }

  #readFollowUps() {
    return [...this.element.querySelectorAll(".mql-follow-up-row")].map(row => {
      const session = Number.parseInt(row.querySelector("input[data-field='session']")?.value, 10);
      return {
        id: row.dataset.id,
        text: row.querySelector("input[data-field='text']")?.value ?? "",
        session: session > 0 ? session : null,
        done: Boolean(row.querySelector("input[data-field='done']")?.checked)
      };
    });
  }

  /**
   * Save the follow-ups. If only session numbers or ticks changed, the texts stay where they are
   * (nothing to encrypt); new or changed texts are saved the secret way.
   */
  async #saveFollowUps(list) {
    const page = this.document;
    const stored = new Map((page._source.system.followUps ?? []).map(f => [f.id, f.text]));
    const keepTexts = () => list.map(f => ({ ...f, text: stored.get(f.id) ?? "" }));
    try {
      let system = { followUps: keepTexts() };
      if (this.#secretsOpen) {
        const parts = await openSecrets(page);
        if (!sameTexts(parts.followUps, list)) system = await secretValues({ ...parts, followUps: list });
      }
      await page.update({ system });
    } catch (err) {
      ui.notifications.error(err.message);
    }
  }

  #readRewardItems() {
    return [...this.element.querySelectorAll(".mql-reward-row")].map(row => ({
      id: row.dataset.id,
      uuid: row.dataset.uuid ?? "",
      name: row.dataset.name ?? "",
      img: row.dataset.img ?? "",
      quantity: Math.max(1, Number.parseInt(row.querySelector("input[data-field='quantity']")?.value, 10) || 1)
    }));
  }

  #saveRewardItems(items) {
    return this.document.update({ "system.rewards.items": items });
  }

  /** An item dropped on the rewards: a new line, or one more of it. */
  async #onDropReward(event) {
    const data = foundry.applications.ux.TextEditor.implementation.getDragEventData(event);
    const item = data?.type === "Item" && data.uuid ? await fromUuid(data.uuid) : null;
    if (!item) {
      ui.notifications.warn("MQL.Edit.RewardDropOnly", { localize: true });
      return;
    }
    const entry = { id: foundry.utils.randomID(), uuid: item.uuid, name: item.name, img: item.img };
    return this.#saveRewardItems(addRewardItem(this.#readRewardItems(), entry));
  }

  /**
   * "Paste quest profile": Markdown from the notes → GM brief fields (and the quest name
   * from the heading). Fields found replace what is there, the others stay.
   */
  async #pasteProfile() {
    let data = null;
    try {
      data = await foundry.applications.api.DialogV2.input({
        window: { title: L("MQL.Paste.Title"), icon: "fa-solid fa-paste" },
        position: { width: 620 },
        classes: ["mql-paste-dialog"],
        content: `<p class="hint">${L("MQL.Paste.Hint")}</p>
          <textarea name="profile" class="mql-paste-text" rows="16" autofocus></textarea>`,
        ok: { label: L("MQL.Paste.Apply"), icon: "fa-solid fa-paste" },
        rejectClose: false
      });
    } catch {
      return; // closed
    }
    const text = data?.profile ?? "";
    if (!text.trim()) return;

    const parsed = parseQuestProfile(text);
    if (!parsed.count) {
      ui.notifications.warn("MQL.Paste.NoFields", { localize: true });
      return;
    }
    const page = this.document;
    try {
      const parts = await openSecrets(page);
      parts.brief = { ...parts.brief, ...parsed.brief };
      const update = { system: await secretValues(parts) };
      if (parsed.name) update.name = parsed.name;
      await page.update(update);
      ui.notifications.info(F("MQL.Paste.Done", { n: parsed.count }));
    } catch (err) {
      ui.notifications.error(err.message);
    }
  }

  #saveObjectives(objectives) {
    return this.document.update({ "system.objectives": objectives });
  }

  /** An actor dropped on the portrait becomes the quest giver. */
  async #onDropGiver(event) {
    const data = foundry.applications.ux.TextEditor.implementation.getDragEventData(event);
    if (data?.type !== "Actor" || !data.uuid) {
      ui.notifications.warn("MQL.Edit.DropActorOnly", { localize: true });
      return;
    }
    const actor = await fromUuid(data.uuid);
    if (!actor) return;
    await this.document.update({ "system.giver": { uuid: actor.uuid, name: actor.name, img: actor.img } });
  }
}
