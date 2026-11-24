import { STATUSES, BRIEF_FIELDS, CURRENCY_KEYS } from "./constants.mjs";

const {
  HTMLField, StringField, BooleanField, NumberField, ArrayField, SchemaField, DocumentUUIDField, FilePathField
} = foundry.data.fields;

const idField = () => new StringField({ required: true, blank: false, initial: () => foundry.utils.randomID() });
const textField = () => new StringField({ required: true, blank: true, initial: "" });

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

      // Three Clue Rule: what the group should figure out. GM only - in secret mode the text
      // is empty here and lives in `secret`.
      conclusions: new ArrayField(new SchemaField({
        id: idField(),
        text: textField()
      })),

      // The clues that lead to a conclusion. Players only see found ones, never the conclusion.
      // A linked journal page or Data Carrier counts as found once a player may see it (clues.mjs).
      clues: new ArrayField(new SchemaField({
        id: idField(),
        conclusion: textField(),
        text: textField(),
        uuid: textField(),
        name: textField(),
        found: new BooleanField({ initial: false })
      })),

      // What the group gets. GM only until it is handed out (rewards.mjs); then players see `received`.
      rewards: new SchemaField({
        items: new ArrayField(new SchemaField({
          id: idField(),
          uuid: textField(),
          name: textField(),
          img: textField(),
          quantity: new NumberField({ required: true, nullable: false, integer: true, min: 1, initial: 1 })
        })),
        // Daggerheart's four currency slots (Ferrond: Bits, Bytes, Chunks).
        currency: new SchemaField(Object.fromEntries(CURRENCY_KEYS.map(key =>
          [key, new NumberField({ required: true, nullable: false, integer: true, min: 0, initial: 0 })]))),
        // Contacts, favours, reputation - plain text.
        text: textField(),
        handedOut: new BooleanField({ initial: false }),
        // One line per recipient, written at the hand-out.
        received: new ArrayField(new SchemaField({ actor: textField(), text: textField() }))
      }),

      // Consequences that come back later: "in session 7". GM only - in secret mode the text
      // is empty here and lives in `secret`. Reminder: follow-ups.mjs.
      followUps: new ArrayField(new SchemaField({
        id: idField(),
        text: textField(),
        session: new NumberField({ required: false, nullable: true, integer: true, min: 1, initial: null }),
        done: new BooleanField({ initial: false })
      })),

      // GM only. Plain text with line breaks. Empty in secret mode - then it lives in `secret`.
      brief: new SchemaField(Object.fromEntries(
        BRIEF_FIELDS.map(key => [key, new StringField({ required: true, blank: true, initial: "" })])
      )),

      // Secret mode: brief, conclusion and follow-up texts, encrypted as one package (see secret.mjs).
      // Empty = everything is in plain text.
      secret: new StringField({ required: true, blank: true, initial: "" })
    };
  }
}
