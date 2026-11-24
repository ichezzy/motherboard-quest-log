/**
 * Shared constants. No Foundry globals in here, so the tests can import it.
 */

export const MODULE_ID = "motherboard-quest-log";

/** The journal page sub-type, as Foundry stores it. */
export const PAGE_TYPE = `${MODULE_ID}.quest`;

export const SOCKET = `module.${MODULE_ID}`;

/** "hidden" is the only status players never see. */
export const STATUSES = ["hidden", "active", "completed", "failed", "abandoned"];

export const CLOSED_STATUSES = new Set(["completed", "failed", "abandoned"]);

export const STATUS_ICONS = {
  hidden: "fa-solid fa-eye-slash",
  active: "fa-solid fa-circle-dot",
  completed: "fa-solid fa-circle-check",
  failed: "fa-solid fa-circle-xmark",
  abandoned: "fa-solid fa-hourglass-end"
};

/** Tabs of the Quest Log window. "hidden" is GM only. */
export const TABS = ["active", "closed", "hidden"];

/**
 * The GM brief: the eight fields of the quest profile from the Quest Guide
 * (Hook, Who wants what, What the group can do, The twist, The choice, Reward,
 * Consequences later, Secret).
 */
export const BRIEF_FIELDS = ["hook", "wants", "approach", "twist", "choice", "reward", "consequences", "secret"];

/** Same values as CONST.DOCUMENT_OWNERSHIP_LEVELS (kept here for the tests). */
export const OWNERSHIP = { NONE: 0, OBSERVER: 2 };

/** The Data Carrier module: shares the secret word; its pages and loot items can be clues. */
export const DATA_CARRIER = "motherboard-data-carrier-journal";

/** Three Clue Rule from the Quest Guide: at least three clues per conclusion. */
export const MIN_CLUES = 3;

/** Daggerheart's currency slots (Homebrew setting; Ferrond names them Bits, Bytes, Chunks). */
export const CURRENCY_KEYS = ["coins", "handfuls", "bags", "chests"];

/** Quest Guide: two to four threads at a time - more open quests get a hint for the GM. */
export const MAX_THREADS = 4;
