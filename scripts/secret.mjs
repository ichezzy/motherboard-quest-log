/**
 * Secret mode: the GM brief is stored encrypted (`system.secret`), never in plain text.
 *
 * - Foundry 14 sends every journal page to every client - ownership hides nothing.
 * - The key comes from the GM's secret word. It stays in the GM's browser (client setting)
 *   and never reaches the server. The world only holds salt and a check value.
 * - Players never need the brief, so only the GM ever decrypts.
 * - If the Data Carrier module knows a secret word in this browser, it is used too:
 *   one word for both modules.
 */
import { MODULE_ID, BRIEF_FIELDS } from "./constants.mjs";
import { cryptoAvailable, newSalt, keyFrom, encrypt, decrypt, createProbe, probeMatches } from "./crypto.mjs";
import { allQuests } from "./visibility.mjs";

const DATA_CARRIER = "motherboard-data-carrier-journal";
export const SECRET_CHANGED = `${MODULE_ID}.secretChanged`;

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
/*  Brief: open and seal                        */
/* -------------------------------------------- */

/** All eight brief fields, missing ones as "". */
export function pickBrief(value = {}) {
  return Object.fromEntries(BRIEF_FIELDS.map(f => [f, value?.[f] ?? ""]));
}

function hasText(brief) {
  return BRIEF_FIELDS.some(f => brief[f]?.trim());
}

export function isEncrypted(page) {
  return Boolean(page?.system?.secret);
}

export async function keyReady() {
  if (loading) await loading;
  return Boolean(key);
}

/**
 * The brief in plain text. Encrypted briefs only open for the GM with the key.
 * @returns {Promise<Record<string, string>>}
 */
export async function openBrief(page) {
  const system = page.system;
  if (!system.secret) return pickBrief(system.brief);
  if (!game.user.isGM) throw new Error(L("MQL.Secret.GMOnly"));
  if (!(await keyReady())) throw new Error(L("MQL.Secret.Locked"));
  return pickBrief(await decrypt(key, system.secret));
}

/**
 * How to store a complete brief: encrypted in secret mode, otherwise in plain text.
 * @returns {Promise<{brief: object, secret: string}>}  values for `system.*`
 */
export async function briefValues(brief) {
  const full = pickBrief(brief);
  if (secretModeOn()) {
    if (!(await keyReady())) throw new Error(L("MQL.Secret.Locked"));
    return { brief: pickBrief(), secret: await encrypt(key, full) };
  }
  return { brief: full, secret: "" };
}

/** Counts for the settings window: quests with an encrypted brief, quests with a readable one. */
export function secretStatus() {
  const quests = allQuests();
  return {
    total: quests.length,
    encrypted: quests.filter(isEncrypted).length,
    open: quests.filter(p => !isEncrypted(p) && hasText(pickBrief(p.system.brief))).length
  };
}

/** Bring all quests into one state: encrypted (secret mode on) or plain text (off). */
async function rewriteAll(encrypted) {
  let count = 0;
  const byJournal = new Map();
  for (const page of allQuests()) {
    if (isEncrypted(page) === encrypted) continue;
    const brief = await openBrief(page);
    if (encrypted && !hasText(brief)) continue; // nothing to hide
    const values = encrypted ? { brief: pickBrief(), secret: await encrypt(key, brief) } : { brief, secret: "" };
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

