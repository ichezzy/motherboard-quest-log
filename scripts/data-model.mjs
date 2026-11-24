import { STATUSES, BRIEF_FIELDS } from "./constants.mjs";

const { HTMLField, StringField, BooleanField, ArrayField, SchemaField, DocumentUUIDField, FilePathField } = foundry.data.fields;

/**
 * Data of a journal page of type "Quest".
 * The quest title is the normal page name (`page.name`).
 */
export class QuestData extends foundry.abstract.TypeDataModel {
  static LOCALIZATION_PREFIXES = ["MQL.Quest"];

  static defineSchema() {
    return {
      // "hidden" = players don't see the quest at all. Page ownership follows the status (see visibility.mjs).
      status: new StringField({
        required: true,
        blank: false,
        initial: "hidden",
        choices: Object.fromEntries(STATUSES.map(s => [s, `MQL.Status.${s}`]))
      }),

      // At most one quest is urgent (see visibility.mjs). Players see it; cleared when the quest closes.
      urgent: new BooleanField({ initial: false }),

      // Name and portrait are stored on the quest, so players see them without access to the actor.
      giver: new SchemaField({
        uuid: new DocumentUUIDField(),
        name: new StringField({ required: true, blank: true, initial: "" }),
        img: new FilePathField({ categories: ["IMAGE"], base64: false, required: false, nullable: true, initial: null })
      }),

      // Plain text; @UUID[…]{…} links are enriched when shown.
      location: new StringField({ required: true, blank: true, initial: "" }),

      // What the group knows. Sanitized by the server (htmlFields in module.json).
      description: new HTMLField({ required: true, blank: true, initial: "" }),

      objectives: new ArrayField(new SchemaField({
        id: new StringField({ required: true, blank: false, initial: () => foundry.utils.randomID() }),
        text: new StringField({ required: true, blank: true, initial: "" }),
        revealed: new BooleanField({ initial: false }),
        done: new BooleanField({ initial: false }),
        optional: new BooleanField({ initial: false })
      })),

      // What the group decided in the end. Plain text; players see it once it is filled in.
      outcome: new StringField({ required: true, blank: true, initial: "" }),

      // GM only. Plain text with line breaks. Empty in secret mode - then it lives in `secret`.
      brief: new SchemaField(Object.fromEntries(
        BRIEF_FIELDS.map(key => [key, new StringField({ required: true, blank: true, initial: "" })])
      )),

      // Secret mode: the brief, encrypted (see secret.mjs). Empty = brief is in plain text.
      secret: new StringField({ required: true, blank: true, initial: "" })
    };
  }
}
