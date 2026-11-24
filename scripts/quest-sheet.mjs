import { MODULE_ID, BRIEF_FIELDS } from "./constants.mjs";
import { addObjective, removeObjective, moveObjective } from "./logic.mjs";
import { VIEW_TEMPLATE, questContext, activateQuestView } from "./quest-view.mjs";
import { openBrief, briefValues, secretModeOn, isEncrypted, keyReady } from "./secret.mjs";

const { JournalEntryPageHandlebarsSheet } = foundry.applications.sheets.journal;

export const EDIT_TEMPLATE = `modules/${MODULE_ID}/templates/quest-edit.hbs`;

/**
 * One sheet, two modes - like Foundry's own pages:
 * view inside the journal, edit in a window of its own.
 */
export class QuestSheet extends JournalEntryPageHandlebarsSheet {
  static DEFAULT_OPTIONS = {
    classes: ["mql-sheet"],
    window: { icon: "fa-solid fa-list-check" },
    position: { width: 680, height: 820 }
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

  /** Objective whose text field gets the focus after the next render (a freshly added one). */
  #focusObjective = null;

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
    } else {
      const source = page._source.system;
      context.giver = source.giver;
      context.hasGiver = Boolean(source.giver.uuid || source.giver.name || source.giver.img);
      context.objectives = source.objectives;
      context.secretOn = secretModeOn();
      // Encrypted without key: show no fields, so saving can't overwrite the brief with blanks.
      let brief = null;
      try {
        brief = await openBrief(page);
      } catch (err) {
        context.briefLocked = err.message;
      }
      context.briefFields = brief
        ? BRIEF_FIELDS.map(key => ({ field: fields.brief.fields[key], value: brief[key] }))
        : [];
    }
    return context;
  }

  /**
   * In secret mode the brief is never saved in plain text: it is merged with the stored
   * brief and encrypted before the update. Without the key it is left untouched.
   * @inheritDoc
   */
  async _processSubmitData(event, form, submitData, options) {
    const system = submitData.system;
    const page = this.document;
    if (system?.brief && (secretModeOn() || isEncrypted(page))) {
      if (await keyReady()) {
        const stored = await openBrief(page);
        Object.assign(system, await briefValues({ ...stored, ...system.brief }));
      } else {
        delete system.brief;
        ui.notifications.error("MQL.Secret.Locked", { localize: true });
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
    const rowId = button => button.closest(".mql-objective-row")?.dataset.id;

    on("add-objective", () => {
      const id = foundry.utils.randomID();
      this.#focusObjective = id;
      this.#saveObjectives(addObjective(this.#readObjectives(), id));
    });
    on("delete-objective", button => this.#saveObjectives(removeObjective(this.#readObjectives(), rowId(button))));
    on("move-up", button => this.#saveObjectives(moveObjective(this.#readObjectives(), rowId(button), -1)));
    on("move-down", button => this.#saveObjectives(moveObjective(this.#readObjectives(), rowId(button), 1)));
    on("clear-giver", () => page.update({ "system.giver": { uuid: null, name: "", img: null } }));

    const drop = el.querySelector("[data-mql-drop='giver']");
    if (drop) {
      drop.addEventListener("dragover", event => {
        event.preventDefault();
        drop.classList.add("mql-drag-over");
      });
      drop.addEventListener("dragleave", () => drop.classList.remove("mql-drag-over"));
      drop.addEventListener("drop", event => {
        drop.classList.remove("mql-drag-over");
        this.#onDropGiver(event);
      });
    }

    if (this.#focusObjective) {
      el.querySelector(`.mql-objective-row[data-id='${this.#focusObjective}'] input[data-field='text']`)?.focus();
      this.#focusObjective = null;
    }
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

  #saveObjectives(objectives) {
    return this.document.update({ "system.objectives": objectives });
  }

  /** An actor dropped on the portrait becomes the quest giver. */
  async #onDropGiver(event) {
    event.preventDefault();
    event.stopPropagation();
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
