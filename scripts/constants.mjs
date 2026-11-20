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
