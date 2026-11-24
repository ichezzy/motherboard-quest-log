/**
 * Pure helpers without Foundry globals, so `node --test` can check them.
 */
import { CLOSED_STATUSES, OWNERSHIP, MIN_CLUES } from "./constants.mjs";

/* -------------------------------------------- */
/*  Status and visibility                       */
/* -------------------------------------------- */

export function isClosed(status) {
  return CLOSED_STATUSES.has(status);
}

/** Which tab of the Quest Log a status belongs to. */
export function tabOf(status) {
  if (status === "hidden") return "hidden";
  return isClosed(status) ? "closed" : "active";
}

/** Default page ownership for a status: hidden → nobody, everything else → everyone may read. */
export function ownershipFor(status) {
  return status === "hidden" ? OWNERSHIP.NONE : OWNERSHIP.OBSERVER;
}

/** Objectives a user may see: the GM sees all, players only the revealed ones. */
export function visibleObjectives(objectives = [], isGM = false) {
  return isGM ? [...objectives] : objectives.filter(o => o.revealed);
}

/**
 * Progress over the visible, non-optional objectives.
 * @returns {{done: number, total: number}}
 */
export function progress(objectives = [], isGM = false) {
  const counted = visibleObjectives(objectives, isGM).filter(o => !o.optional);
  return { done: counted.filter(o => o.done).length, total: counted.length };
}

/** Is a quest urgent right now? Only open quests can be. Works on pages and plain objects. */
export function isUrgent(quest) {
  const urgent = quest.urgent ?? quest.system?.urgent;
  const status = quest.status ?? quest.system?.status;
  return Boolean(urgent) && !isClosed(status);
}

/** Urgent quest first, then by name, like a list a human would write. */
export function sortQuests(quests) {
  return [...quests].sort((a, b) =>
    (isUrgent(b) - isUrgent(a)) || a.name.localeCompare(b.name, undefined, { sensitivity: "base", numeric: true })
  );
}

/* -------------------------------------------- */
/*  Editing objectives                          */
/* -------------------------------------------- */

export function blankObjective(id) {
  return { id, text: "", revealed: false, done: false, optional: false };
}

export function addObjective(list, id) {
  return [...list, blankObjective(id)];
}

/* Lists with ids (objectives, conclusions, clues …) */

export function removeById(list, id) {
  return list.filter(o => o.id !== id);
}

/** Move an entry up (delta -1) or down (delta +1). Out of range → unchanged. */
export function moveById(list, id, delta) {
  const from = list.findIndex(o => o.id === id);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= list.length) return [...list];
  const copy = [...list];
  const [item] = copy.splice(from, 1);
  copy.splice(to, 0, item);
  return copy;
}

/** Flip a boolean flag (e.g. "revealed", "done", "found") of one entry. */
export function toggleById(list, id, key) {
  return list.map(o => (o.id === id ? { ...o, [key]: !o[key] } : o));
}

/** Set fields of one entry. */
export function patchById(list, id, patch) {
  return list.map(o => (o.id === id ? { ...o, ...patch } : o));
}

export const removeObjective = removeById;
export const moveObjective = moveById;
export const toggleObjective = toggleById;

/* -------------------------------------------- */
/*  Clues (Three Clue Rule)                     */
/* -------------------------------------------- */

export function blankConclusion(id) {
  return { id, text: "" };
}

export function blankClue(id, conclusion) {
  return { id, conclusion, text: "", uuid: "", name: "", found: false };
}

/** A conclusion goes together with its clues. */
export function removeConclusion({ conclusions = [], clues = [] }, id) {
  return { conclusions: removeById(conclusions, id), clues: clues.filter(c => c.conclusion !== id) };
}

/**
 * Conclusions with their clues and counts, in the order of the conclusions.
 * Clues of a conclusion that no longer exists are left out.
 * @returns {Array<object & {clues: object[], found: number, total: number, few: boolean}>}
 */
export function clueGroups(conclusions = [], clues = [], minimum = MIN_CLUES) {
  return conclusions.map(conclusion => {
    const own = clues.filter(c => c.conclusion === conclusion.id);
    const found = own.filter(c => c.found).length;
    return { ...conclusion, clues: own, found, total: own.length, few: own.length < minimum };
  });
}

/** Clues players see: found ones of existing conclusions, in the order they were written down. */
export function foundClues(conclusions = [], clues = []) {
  const known = new Set(conclusions.map(c => c.id));
  return clues.filter(c => c.found && known.has(c.conclusion));
}

/** What a clue is called in a notification or list: its text, else the linked document's name. */
export function clueLabel(clue) {
  return clue.text?.trim() || clue.name || "";
}

/* -------------------------------------------- */
/*  Rewards                                     */
/* -------------------------------------------- */

/** Is there anything to hand out or to tell? */
export function hasRewards(rewards = {}) {
  return Boolean(rewards.items?.length
    || Object.values(rewards.currency ?? {}).some(n => n > 0)
    || rewards.text?.trim());
}

/** A dropped item: a new line, or one more of the same item. */
export function addRewardItem(items, item) {
  if (items.some(i => i.uuid === item.uuid)) {
    return items.map(i => (i.uuid === item.uuid ? { ...i, quantity: i.quantity + 1 } : i));
  }
  return [...items, { quantity: 1, ...item }];
}

/** Same amount for everyone, the rest stays over. */
export function splitAmount(amount, count) {
  if (count < 1) return { each: 0, rest: amount };
  const each = Math.floor(amount / count);
  return { each, rest: amount - each * count };
}

/**
 * Who gets what.
 * @param {object} rewards     `system.rewards`
 * @param {{items: Record<string, string>, currency: Record<string, string>}} choices
 *   item id → actor id; currency key → actor id or "split"
 * @param {{party?: string|null, characters?: string[]}} recipients   actor ids
 *   "split": every character gets the same; the rest goes to the party, else to the first character.
 * @returns {Map<string, {items: object[], currency: Record<string, number>}>}  in hand-out order
 */
export function rewardPlan(rewards, choices, { party = null, characters = [] } = {}) {
  const plan = new Map();
  const share = id => {
    if (!plan.has(id)) plan.set(id, { items: [], currency: {} });
    return plan.get(id);
  };
  const giveMoney = (id, key, amount) => {
    if (!id || amount <= 0) return;
    const entry = share(id);
    entry.currency[key] = (entry.currency[key] ?? 0) + amount;
  };

  for (const item of rewards.items ?? []) {
    const id = choices.items?.[item.id];
    if (id) share(id).items.push(item);
  }
  for (const [key, amount] of Object.entries(rewards.currency ?? {})) {
    if (!(amount > 0)) continue;
    const choice = choices.currency?.[key];
    if (choice !== "split") {
      giveMoney(choice, key, amount);
      continue;
    }
    const { each, rest } = splitAmount(amount, characters.length);
    for (const id of characters) giveMoney(id, key, each);
    giveMoney(party ?? characters[0], key, rest);
  }
  return plan;
}

/** "Health Stim ×2" */
export function itemLabel(item) {
  return item.quantity > 1 ? `${item.name} ×${item.quantity}` : item.name;
}

/**
 * "3 Bytes, 1 Chunks" in the order of `currencies`.
 * @param {Record<string, number>} amounts
 * @param {Array<{key: string, label: string}>} currencies
 */
export function currencyLabel(amounts = {}, currencies = []) {
  return currencies.filter(c => amounts[c.key] > 0).map(c => `${amounts[c.key]} ${c.label}`).join(", ");
}

/**
 * Can an amount be split among the characters? Only if there are two or more
 * and every one of them gets at least one.
 */
export function canSplit(amount, count) {
  return count > 1 && amount >= count;
}

/**
 * A reward plan as lines for people: [{actor: "Vanya", text: "Gear, 1 Bits"}].
 * @param {Map<string, {items: object[], currency: Record<string, number>}>} plan  from `rewardPlan`
 * @param {(id: string) => string} nameOf
 * @param {Array<{key: string, label: string}>} currencies
 */
export function planLines(plan, nameOf, currencies = []) {
  const lines = [];
  for (const [id, share] of plan) {
    const parts = share.items.map(itemLabel);
    const money = currencyLabel(share.currency, currencies);
    if (money) parts.push(money);
    if (parts.length) lines.push({ actor: nameOf(id), text: parts.join(", ") });
  }
  return lines;
}

/* -------------------------------------------- */
/*  Follow-ups and sessions                     */
/* -------------------------------------------- */

export function blankFollowUp(id, session = null) {
  return { id, text: "", session, done: false };
}

/** Is a follow-up due in this session? Open, with a session number that has come. */
export function isDue(followUp, session) {
  return session > 0 && !followUp.done && followUp.session > 0 && followUp.session <= session;
}

/** Follow-ups due now (oldest first). */
export function dueFollowUps(followUps = [], session = 0) {
  return followUps.filter(f => isDue(f, session)).sort((a, b) => a.session - b.session);
}

/** Open follow-ups still to come (by session; without a number last). */
export function upcomingFollowUps(followUps = [], session = 0) {
  return followUps
    .filter(f => !f.done && !isDue(f, session))
    .sort((a, b) => (a.session ?? Infinity) - (b.session ?? Infinity));
}

/** The calendar day in local time, e.g. "2026-11-24" - one session prompt per day. */
export function localDay(date = new Date()) {
  const pad = n => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/* -------------------------------------------- */
/*  Notifications                               */
/* -------------------------------------------- */

/**
 * What players should hear about after an update.
 * @param {{status: string, urgent?: boolean, objectives: object[], conclusions?: object[], clues?: object[]}} before
 * @param {{status: string, urgent?: boolean, objectives: object[], conclusions?: object[], clues?: object[]}} after
 * @returns {Array<{kind: string, status?: string, text?: string}>}
 */
export function questEvents(before, after) {
  const wasVisible = before.status !== "hidden";
  const isVisible = after.status !== "hidden";
  if (!isVisible) return [];
  // A freshly revealed quest is one message; its objectives come with it.
  if (!wasVisible) return [{ kind: "revealed" }];

  const events = [];
  if (isUrgent(after) && !isUrgent(before)) events.push({ kind: "urgent" });
  const old = new Map((before.objectives ?? []).map(o => [o.id, o]));
  for (const o of after.objectives ?? []) {
    if (!o.revealed) continue;
    const prev = old.get(o.id);
    if (!prev?.revealed) events.push({ kind: "objective-revealed", text: o.text });
    else if (o.done && !prev.done) events.push({ kind: "objective-done", text: o.text });
  }
  const wasFound = new Set(foundClues(before.conclusions, before.clues).map(c => c.id));
  for (const clue of foundClues(after.conclusions, after.clues)) {
    if (!wasFound.has(clue.id)) events.push({ kind: "clue", text: clueLabel(clue) });
  }
  if (after.status !== before.status && isClosed(after.status)) events.push({ kind: "closed", status: after.status });
  return events;
}

/* -------------------------------------------- */
/*  Text                                        */
/* -------------------------------------------- */

const HTML_ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" };

export function escapeHtml(text = "") {
  return String(text).replace(/[&<>"']/g, c => HTML_ESCAPES[c]);
}

/** Plain text with line breaks → safe HTML (enrichment of @UUID links happens afterwards). */
export function plainToHtml(text = "") {
  return escapeHtml(text.trim()).replace(/\r?\n/g, "<br>");
}

/** Plain text for a notification: "@UUID[…]{Label}" becomes "Label". */
export function plainLabel(text = "") {
  return String(text)
    .replace(/@\w+\[[^\]]*\]\{([^}]*)\}/g, "$1")
    .replace(/@\w+\[([^\]]*)\]/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}
