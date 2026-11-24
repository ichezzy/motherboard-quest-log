/**
 * Secret mode: the GM's parts of a quest are stored encrypted (`system.secret`), never in plain text.
 * These are the GM brief and the texts of the lists in SECRET_LISTS (e.g. the conclusions);
 * the lists themselves stay in place with empty texts, so ids and flags keep working.
 *
 * - Foundry 14 sends every journal page to every client - ownership hides nothing.
 * - The key comes from the GM's secret word. It stays in the GM's browser (client setting)
 *   and never reaches the server. The world only holds salt and a check value.
 * - Players never need these parts, so only the GM ever decrypts.
 * - If the Data Carrier module knows a secret word in this browser, it is used too:
 *   one word for both modules.
 * - Package: {brief, conclusions: {id: text}, followUps: {id: text}}. Packages from 0.2 hold
 *   only the brief fields.
 */
import { MODULE_ID, BRIEF_FIELDS, DATA_CARRIER } from "./constants.mjs";
import { cryptoAvailable, newSalt, keyFrom, encrypt, decrypt, createProbe, probeMatches } from "./crypto.mjs";
import { allQuests } from "./visibility.mjs";

export const SECRET_CHANGED = `${MODULE_ID}.secretChanged`;

/** Lists of a quest whose `text` is secret. */
export const SECRET_LISTS = ["conclusions", "followUps"];

const L = key => game.i18n.localize(key);
const F = (key, data) => game.i18n.format(key, data);
const setting = key => game.settings.get(MODULE_ID, key);

let key = null;
let loading = null;

/* -------------------------------------------- */
/*  Settings                                    */
/* -------------------------------------------- */

export function registerSecretSettings(SecretConfig) {
  game.settings.register(MODULE_ID, "secretSalt", { scope: "world", config: false, type: String, default: "" });
  game.settings.register(MODULE_ID, "secretProbe", { scope: "world", config: false, type: String, default: "" });
  // Only in this browser (localStorage), never on the server.
  game.settings.register(MODULE_ID, "secretWord", { scope: "client", config: false, type: String, default: "" });
  game.settings.registerMenu(MODULE_ID, "secret", {
    name: "MQL.Secret.Name",
    label: "MQL.Secret.Label",
    hint: "MQL.Secret.Hint",
    icon: "fa-solid fa-key",
    type: SecretConfig,
    restricted: true
  });
}

/** Is secret mode set up in this world? Then the brief is encrypted on save. */
export function secretModeOn() {
  return Boolean(setting("secretSalt") && setting("secretProbe"));
}

/** The Data Carrier's secret word in this browser, if that module is active and has one. */
function dataCarrierWord() {
  try {
    return game.modules.get(DATA_CARRIER)?.active ? (game.settings.get(DATA_CARRIER, "geheimWort") || "") : "";
  } catch {
    return "";
  }
}

function changed() {
  Hooks.callAll(SECRET_CHANGED);
}

/* -------------------------------------------- */
/*  Secret parts: open and seal                 */
/* -------------------------------------------- */

/** All eight brief fields, missing ones as "". */
export function pickBrief(value = {}) {
  return Object.fromEntries(BRIEF_FIELDS.map(f => [f, value?.[f] ?? ""]));
}

/** Form data may come as an object with numeric keys - always a list here. */
export function asList(value) {
  if (Array.isArray(value)) return value;
  return value && typeof value === "object" ? Object.values(value) : [];
}

const textsById = list => Object.fromEntries(list.filter(e => e.text?.trim()).map(e => [e.id, e.text]));

/** Does a set of parts (from openSecrets) hold any text worth hiding? */
function hasText(parts) {
  return BRIEF_FIELDS.some(f => parts.brief[f]?.trim())
    || SECRET_LISTS.some(name => parts[name].some(e => e.text?.trim()));
}

/** The parts as they stand in plain text on the page (nothing decrypted). */
function plainParts(page) {
  const system = page.system;
  const parts = { brief: pickBrief(system.brief) };
  for (const name of SECRET_LISTS) parts[name] = asList(system[name]).map(e => ({ ...e, text: e.text ?? "" }));
  return parts;
}

/** A decrypted package. Packages from 0.2 are the brief fields alone. */
function unpack(data) {
  if (data?.brief && typeof data.brief === "object") {
    return { brief: pickBrief(data.brief), texts: Object.fromEntries(SECRET_LISTS.map(name => [name, data[name] ?? {}])) };
  }
  return { brief: pickBrief(data), texts: {} };
}

export function isEncrypted(page) {
  return Boolean(page?.system?.secret);
}

export async function keyReady() {
  if (loading) await loading;
  return Boolean(key);
}

/**
 * Everything secret mode protects, in plain text: the brief and the SECRET_LISTS with their texts.
 * Encrypted quests only open for the GM with the key.
 * @returns {Promise<{brief: Record<string, string>, conclusions: object[], followUps: object[]}>}
 */
export async function openSecrets(page) {
  const parts = plainParts(page);
  const secret = page.system.secret;
  if (!secret) return parts;
  if (!game.user.isGM) throw new Error(L("MQL.Secret.GMOnly"));
  if (!(await keyReady())) throw new Error(L("MQL.Secret.Locked"));
  const { brief, texts } = unpack(await decrypt(key, secret));
  parts.brief = brief;
  for (const name of SECRET_LISTS) {
    // Text that is still in plain text wins (written by a macro, say) - it gets sealed on the next save.
    parts[name] = parts[name].map(e => ({ ...e, text: e.text.trim() ? e.text : (texts[name]?.[e.id] ?? "") }));
  }
  return parts;
}

/** Only the brief (see openSecrets). */
export async function openBrief(page) {
  return (await openSecrets(page)).brief;
}

/**
 * Can the secret parts of this quest be saved here? Not in secret mode without the key -
 * then they could neither be encrypted nor safely left alone.
 */
export async function secretsWritable(page) {
  if (!secretModeOn() && !isEncrypted(page)) return true;
  return keyReady();
}

/** Values for `system.*`: in plain text, or with every secret text in one encrypted package. */
async function pack(parts, encrypted) {
  const brief = pickBrief(parts.brief);
  const lists = Object.fromEntries(SECRET_LISTS.map(name =>
    [name, asList(parts[name]).map(e => ({ ...e, text: e.text ?? "" }))]));
  if (!encrypted) return { brief, ...lists, secret: "" };
  const sealed = { brief };
  const stripped = {};
  for (const name of SECRET_LISTS) {
    sealed[name] = textsById(lists[name]);
    stripped[name] = lists[name].map(e => ({ ...e, text: "" }));
  }
  return { brief: pickBrief(), ...stripped, secret: await encrypt(key, sealed) };
}

/**
 * How to store the secret parts. Pass all of them (from openSecrets, with your changes):
 * in secret mode they are encrypted, otherwise they stay in plain text.
 * @returns {Promise<object>}  values for `system.*`
 */
export async function secretValues(parts) {
  if (!secretModeOn()) return pack(parts, false);
  if (!(await keyReady())) throw new Error(L("MQL.Secret.Locked"));
  return pack(parts, true);
}

/**
 * Change some secret parts of a quest and save them the right way (merged with the rest).
 * @param {JournalEntryPage} page
 * @param {object} changes   e.g. {conclusions: [...]} or {brief: {hook: "…"}} (brief fields are merged)
 * @param {object} [extra]   further `system` values to save in the same update
 */
export async function saveSecrets(page, changes, extra = {}) {
  const parts = await openSecrets(page);
  if (changes.brief) parts.brief = { ...parts.brief, ...changes.brief };
  for (const name of SECRET_LISTS) if (name in changes) parts[name] = asList(changes[name]);
  return page.update({ system: { ...extra, ...(await secretValues(parts)) } });
}

/** Counts for the settings window: quests with encrypted parts, quests with readable ones. */
export function secretStatus() {
  const quests = allQuests();
  return {
    total: quests.length,
    encrypted: quests.filter(isEncrypted).length,
    open: quests.filter(p => !isEncrypted(p) && hasText(plainParts(p))).length
  };
}

/** Bring all quests into one state: encrypted (secret mode on) or plain text (off). */
async function rewriteAll(encrypted) {
  let count = 0;
  const byJournal = new Map();
  for (const page of allQuests()) {
    if (isEncrypted(page) === encrypted) continue;
    const parts = await openSecrets(page);
    if (encrypted && !hasText(parts)) continue; // nothing to hide
    const values = await pack(parts, encrypted);
    if (!byJournal.has(page.parent)) byJournal.set(page.parent, []);
    byJournal.get(page.parent).push({ _id: page.id, system: values });
    count++;
  }
  for (const [journal, updates] of byJournal) await journal.updateEmbeddedDocuments("JournalEntryPage", updates);
  return count;
}

/* -------------------------------------------- */
/*  Set up, unlock, turn off                    */
/* -------------------------------------------- */

async function setUp(word) {
  const salt = newSalt();
  const k = await keyFrom(word, salt);
  await game.settings.set(MODULE_ID, "secretSalt", salt);
  await game.settings.set(MODULE_ID, "secretProbe", await createProbe(k));
  await game.settings.set(MODULE_ID, "secretWord", word);
  key = k;
  return rewriteAll(true);
}

/** Turn secret mode on with a new secret word and encrypt every brief. */
export async function setup(word) {
  if (!game.user.isGM) return;
  if (!cryptoAvailable()) throw new Error(L("MQL.Secret.NoCrypto"));
  loading = setUp(word).then(() => key);
  await loading;
  ui.notifications.info(F("MQL.Secret.SetUp", { n: secretStatus().encrypted }));
  changed();
}

/** Enter the secret word on another device or browser. */
export async function unlock(word) {
  const k = await keyFrom(word, setting("secretSalt"));
  if (!(await probeMatches(k, setting("secretProbe")))) throw new Error(L("MQL.Secret.WrongWord"));
  await game.settings.set(MODULE_ID, "secretWord", word);
  key = k;
  loading = Promise.resolve(k);
  ui.notifications.info("MQL.Secret.Unlocked", { localize: true });
  changed();
}

/** Encrypt briefs that are still readable (e.g. created by a macro or import). */
export async function encryptOpen() {
  if (!(await keyReady())) throw new Error(L("MQL.Secret.Locked"));
  const n = await rewriteAll(true);
  ui.notifications.info(F("MQL.Secret.Encrypted", { n }));
  changed();
}

/** Secret mode off: decrypt everything, delete salt and check value. */
export async function turnOff() {
  if (!(await keyReady())) throw new Error(L("MQL.Secret.Locked"));
  const n = await rewriteAll(false);
  await game.settings.set(MODULE_ID, "secretSalt", "");
  await game.settings.set(MODULE_ID, "secretProbe", "");
  await game.settings.set(MODULE_ID, "secretWord", "");
  key = null;
  loading = null;
  ui.notifications.info(F("MQL.Secret.TurnedOff", { n }));
  changed();
}

/** Remove the secret word from this browser (the world stays encrypted). */
export async function forget() {
  await game.settings.set(MODULE_ID, "secretWord", "");
  key = null;
  loading = null;
  changed();
}

/**
 * GM, at "ready": load the key from this browser's word - or from the Data Carrier's word.
 * Without secret mode but with the Data Carrier's word, secret mode is set up automatically
 * and every brief written so far is encrypted.
 */
export function loadKey() {
  loading = (async () => {
    key = null;
    if (!game.user.isGM || !cryptoAvailable()) return null;
    const own = setting("secretWord");
    const shared = dataCarrierWord();

    if (secretModeOn()) {
      for (const word of [...new Set([own, shared])].filter(Boolean)) {
        const k = await keyFrom(word, setting("secretSalt"));
        if (!(await probeMatches(k, setting("secretProbe")))) continue;
        key = k;
        if (word !== own) await game.settings.set(MODULE_ID, "secretWord", word);
        return key;
      }
      if (own) ui.notifications.error("MQL.Secret.WrongWordStored", { localize: true, permanent: true });
      else ui.notifications.warn("MQL.Secret.EnterWord", { localize: true });
      return null;
    }

    if (shared) {
      const n = await setUp(shared);
      ui.notifications.info(F("MQL.Secret.SetUpShared", { n }));
      return key;
    }
    if (secretStatus().open) ui.notifications.warn("MQL.Secret.NotSetUp", { localize: true });
    return null;
  })();
  loading.then(() => changed()).catch(err => console.error(`${MODULE_ID} | Secret mode`, err));
  return loading;
}

