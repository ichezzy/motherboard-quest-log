/**
 * "Paste quest profile": reads a quest profile written in Markdown (Obsidian) and
 * maps it onto the eight GM brief fields. Pure, no Foundry - tested in tests/profile.test.mjs.
 *
 * Understood lines (German labels as in the Quest Guide, or the English ones):
 *   ## Stormy und die Bake
 *   - **Aufhänger:** …        - **Hook:** …
 *   **Wer will was:** …       Who wants what: …
 * Lines without a known label continue the field above. The heading before the first
 * field becomes the quest name; a heading after the fields ends the profile.
 */
import { BRIEF_FIELDS } from "./constants.mjs";

const LABELS = {
  hook: ["aufhänger", "aufhaenger", "hook"],
  wants: ["wer will was", "who wants what"],
  approach: ["was die gruppe tun kann", "what the group can do"],
  twist: ["die wendung", "wendung", "the twist", "twist"],
  choice: ["die wahl", "wahl", "the choice", "choice"],
  reward: ["belohnung", "reward", "rewards"],
  consequences: ["folgen, später", "folgen später", "folgen", "consequences, later", "consequences later", "consequences"],
  secret: ["geheimnis", "secret"]
};

const LABEL_TO_FIELD = new Map(
  Object.entries(LABELS).flatMap(([field, labels]) => labels.map(label => [label, field]))
);

const HEADING = /^\s*#{1,6}\s+(.+?)\s*#*\s*$/;
// "- **Label:** text", "**Label**: text", "Label: text"
const FIELD_LINE = /^\s*(?:[-*+]\s+)?(?:\*\*|__)?([^:*_\n]{2,40}?)(?:\*\*|__)?\s*:\s*(?:\*\*|__)?\s*(.*)$/;

function normalizeLabel(label) {
  return label.toLowerCase().replace(/\s+/g, " ").trim();
}

/** Markdown → plain text: wikilinks, links, bold/italic, code, canon markers. */
export function cleanMarkdown(text = "") {
  return String(text)
    // [[Target#Heading|Alias]] → Alias, [[Folder/Target]] → Target (also "\|" from tables)
    .replace(/\[\[([^\]|#\\]+)(?:#[^\]|\\]*)?(?:\\?\|([^\]]+))?\]\]/g, (_, target, alias) => (alias ?? target.split("/").pop()).trim())
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    // Vault markers: "✅ *Chezzy, 17.11.2026*", "🔍"
    .replace(/✅\s*\*[^*\n]+\*/g, "")
    .replace(/[✅🔍]/gu, "")
    .replace(/\*\*([^*\n]+)\*\*/g, "$1")
    .replace(/__([^_\n]+)__/g, "$1")
    .replace(/\*([^*\n]+)\*/g, "$1")
    .replace(/`([^`\n]+)`/g, "$1")
    .replace(/[ \t]{2,}/g, " ")
    // Dashes left over around a removed marker ("offen ✅ … — text", "Name — 🔍"); keep bullet "- "
    .replace(/^[\s—–]+|[\s—–-]+$/g, "")
    .trim();
}

/**
 * @param {string} text  pasted Markdown
 * @returns {{name: string|null, brief: Record<string, string>, count: number}}
 *          `brief` only has the fields found; `count` is their number
 */
export function parseQuestProfile(text = "") {
  const parts = {};
  let name = null;
  let current = null;

  for (const raw of String(text).split(/\r?\n/)) {
    const heading = raw.match(HEADING);
    if (heading) {
      if (Object.keys(parts).length) break; // next quest begins
      name = cleanMarkdown(heading[1]) || name;
      current = null;
      continue;
    }

    const line = raw.match(FIELD_LINE);
    const field = line ? LABEL_TO_FIELD.get(normalizeLabel(cleanMarkdown(line[1]))) : null;
    if (field) {
      current = field;
      (parts[field] ??= []).push(line[2]);
      continue;
    }

    if (current) parts[current].push(raw.replace(/^\s*[-*+]\s+/, "- "));
  }

  const brief = {};
  for (const field of BRIEF_FIELDS) {
    if (!parts[field]) continue;
    const value = parts[field].map(cleanMarkdown).join("\n").replace(/\n{3,}/g, "\n\n").trim();
    if (value) brief[field] = value;
  }
  return { name, brief, count: Object.keys(brief).length };
}
