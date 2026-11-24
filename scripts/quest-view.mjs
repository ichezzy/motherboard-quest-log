/**
 * The quest as players and GM read it - on the journal page and in the Quest Log window.
 * Both use the same template, the same context and the same buttons.
 */
import { MODULE_ID, STATUSES, STATUS_ICONS, BRIEF_FIELDS } from "./constants.mjs";
import { visibleObjectives, progress, plainToHtml, toggleObjective } from "./logic.mjs";
import { openBrief } from "./secret.mjs";

export const VIEW_TEMPLATE = `modules/${MODULE_ID}/templates/quest-view.hbs`;

const L = key => game.i18n.localize(key);

/** GM brief sections opened in this session stay open when the view re-renders. */
const openBriefs = new Set();

/**
 * May the current user open the quest giver's actor sheet? GM always; players need at least
 * Limited on the actor. Compendium actors only for the GM (not loaded synchronously).
 */
function canOpenGiver(uuid) {
  if (!uuid) return false;
  if (game.user.isGM) return true;
  try {
    const actor = fromUuidSync(uuid);
    return actor instanceof foundry.abstract.Document && actor.testUserPermission(game.user, "LIMITED");
  } catch {
    return false;
  }
}

/** Open the quest giver's sheet (checks the permission again, the view may be old). */
async function openGiver(page) {
  const uuid = page.system.giver.uuid;
  const actor = uuid ? await fromUuid(uuid) : null;
  if (!actor?.testUserPermission(game.user, "LIMITED")) {
    ui.notifications.warn("MQL.View.GiverNoAccess", { localize: true });
    return;
  }
  actor.sheet.render({ force: true });
}

/** Text with Foundry links (@UUID, [[/r]] …) enriched. */
function enrich(html, page, { secrets = false } = {}) {
  if (!html) return "";
  return foundry.applications.ux.TextEditor.implementation.enrichHTML(html, { relativeTo: page, secrets });
}

/**
 * Render context for one quest, for the current user.
 * @param {JournalEntryPage} page
 * @param {{showTitle?: boolean, headingLevel?: number}} [options]
 */
export async function questContext(page, { showTitle = true, headingLevel = 2 } = {}) {
  const system = page.system;
  const isGM = game.user.isGM;
  const status = system.status;

  const objectives = await Promise.all(visibleObjectives(system.objectives, isGM).map(async o => ({
    ...o,
    gm: isGM,
    html: await enrich(plainToHtml(o.text), page),
    revealLabel: L(o.revealed ? "MQL.View.HideObjective" : "MQL.View.RevealObjective")
  })));

  // GM brief: only ever opened for the GM (encrypted in secret mode).
  const brief = [];
  let briefLocked = "";
  if (isGM) {
    try {
      const plain = await openBrief(page);
      for (const key of BRIEF_FIELDS) {
        const text = plain[key];
        if (!text?.trim()) continue;
        brief.push({ key, label: L(`MQL.Quest.FIELDS.brief.${key}.label`), html: await enrich(plainToHtml(text), page) });
      }
    } catch (err) {
      briefLocked = err.message;
    }
  }

  const description = system.description ? await enrich(system.description, page, { secrets: isGM }) : "";

  return {
    uuid: page.uuid,
    name: page.name,
    showTitle,
    headingLevel: Math.min(Math.max(Number(headingLevel) || 2, 1), 6),
    isGM,
    status,
    hidden: status === "hidden",
    statusLabel: L(`MQL.Status.${status}`),
    statusIcon: STATUS_ICONS[status],
    statuses: isGM ? STATUSES.map(value => ({ value, label: L(`MQL.Status.${value}`), selected: value === status })) : [],
    giver: { name: system.giver.name, img: system.giver.img, canOpen: canOpenGiver(system.giver.uuid) },
    location: system.location ? await enrich(plainToHtml(system.location), page) : "",
    description,
    objectives,
    progress: progress(system.objectives, isGM),
    hasContent: Boolean(description || objectives.length),
    brief,
    briefLocked,
    briefOpen: openBriefs.has(page.uuid)
  };
}

/* -------------------------------------------- */
/*  Buttons                                     */
/* -------------------------------------------- */

export function setStatus(page, status) {
  if (!game.user.isGM || page.system.status === status) return;
  return page.update({ "system.status": status });
}

function toggle(page, id, key) {
  if (!game.user.isGM) return;
  const list = foundry.utils.deepClone(page._source.system.objectives);
  return page.update({ "system.objectives": toggleObjective(list, id, key) });
}

/**
 * Wire up the buttons of a rendered quest view.
 * @param {HTMLElement|null} root   Element that contains the <article class="mql-quest">
 * @param {JournalEntryPage} page
 */
export function activateQuestView(root, page) {
  if (!root || !page) return;

  const on = (action, fn) => {
    for (const button of root.querySelectorAll(`[data-mql-action='${action}']`)) {
      button.addEventListener("click", event => {
        event.preventDefault();
        event.stopPropagation();
        fn(button);
      });
    }
  };

  root.querySelector(".mql-brief")?.addEventListener("toggle", event => {
    if (event.currentTarget.open) openBriefs.add(page.uuid);
    else openBriefs.delete(page.uuid);
  });
  on("open-giver", () => openGiver(page));

  if (!game.user.isGM) return;

  on("reveal", () => setStatus(page, "active"));
  on("hide", () => setStatus(page, "hidden"));
  on("edit", () => page.sheet.render({ force: true }));
  on("toggle-done", button => toggle(page, button.dataset.id, "done"));
  on("toggle-reveal", button => toggle(page, button.dataset.id, "revealed"));

  root.querySelector("select[data-mql-status]")?.addEventListener("change", event => {
    setStatus(page, event.currentTarget.value);
  });
}
