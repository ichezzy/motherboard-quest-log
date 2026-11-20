/**
 * Pure helpers without Foundry globals, so `node --test` can check them.
 */
import { CLOSED_STATUSES, OWNERSHIP } from "./constants.mjs";

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

/** Sort quests by name, like a list a human would write. */
export function sortQuests(quests) {
  return [...quests].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base", numeric: true }));
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

export function removeObjective(list, id) {
  return list.filter(o => o.id !== id);
}

/** Move an objective up (delta -1) or down (delta +1). Out of range → unchanged. */
export function moveObjective(list, id, delta) {
  const from = list.findIndex(o => o.id === id);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= list.length) return [...list];
  const copy = [...list];
  const [item] = copy.splice(from, 1);
  copy.splice(to, 0, item);
  return copy;
}

/** Flip a boolean flag ("revealed", "done", "optional") of one objective. */
export function toggleObjective(list, id, key) {
  return list.map(o => (o.id === id ? { ...o, [key]: !o[key] } : o));
}

/* -------------------------------------------- */
/*  Notifications                               */
/* -------------------------------------------- */

/**
 * What players should hear about after an update.
 * @param {{status: string, objectives: object[]}} before
 * @param {{status: string, objectives: object[]}} after
 * @returns {Array<{kind: string, status?: string, text?: string}>}
 */
export function questEvents(before, after) {
  const wasVisible = before.status !== "hidden";
  const isVisible = after.status !== "hidden";
  if (!isVisible) return [];
  // A freshly revealed quest is one message; its objectives come with it.
  if (!wasVisible) return [{ kind: "revealed" }];

  const events = [];
  const old = new Map((before.objectives ?? []).map(o => [o.id, o]));
  for (const o of after.objectives ?? []) {
    if (!o.revealed) continue;
    const prev = old.get(o.id);
    if (!prev?.revealed) events.push({ kind: "objective-revealed", text: o.text });
    else if (o.done && !prev.done) events.push({ kind: "objective-done", text: o.text });
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
