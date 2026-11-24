/**
 * Secret mode end to end against a tiny stand-in for Foundry (settings, journal, pages).
 * Uses the real crypto with the real iteration count.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { PAGE_TYPE } from "../scripts/constants.mjs";
import { keyFrom, encrypt } from "../scripts/crypto.mjs";

const DATA_CARRIER = "motherboard-data-carrier-journal";
const WORD = "Mast am Rand der Deadband";
const store = new Map();
const messages = [];
const blank = () => ({ hook: "", wants: "", approach: "", twist: "", choice: "", reward: "", consequences: "", secret: "" });

const journal = {
  pages: { contents: [] },
  async updateEmbeddedDocuments(type, updates) {
    for (const { _id, system } of updates) {
      const page = this.pages.contents.find(p => p.id === _id);
      Object.assign(page.system, system);
    }
  }
};
const page = (id, brief, conclusions = [], followUps = []) => ({
  id,
  uuid: `JournalEntry.j.JournalEntryPage.${id}`,
  type: PAGE_TYPE,
  parent: journal,
  system: { brief: { ...blank(), ...brief }, conclusions, clues: [], followUps, secret: "" }
});
const withTwist = page("a", { twist: "Der Händler ist ein Gutter." },
  [{ id: "k1", text: "Der Händler lügt" }, { id: "k2", text: "" }],
  [{ id: "f1", text: "Sein Bruder taucht auf", session: 7, done: false }]);
const empty = page("b", {});
journal.pages.contents.push(withTwist, empty);

globalThis.game = {
  user: { isGM: true },
  settings: {
    get: (module, key) => store.get(`${module}.${key}`) ?? "",
    set: async (module, key, value) => store.set(`${module}.${key}`, value)
  },
  modules: new Map([[DATA_CARRIER, { active: true }]]),
  i18n: { localize: key => key, format: (key, data) => `${key} ${JSON.stringify(data)}` },
  journal: { contents: [journal] }
};
globalThis.ui = { notifications: Object.fromEntries(["info", "warn", "error"].map(level => [level, msg => messages.push([level, msg])])) };
globalThis.Hooks = { callAll() {} };

const secret = await import("../scripts/secret.mjs");

test("first start with the Data Carrier's word: secret mode is set up, brief and conclusions are encrypted", async () => {
  store.set(`${DATA_CARRIER}.geheimWort`, WORD);
  await secret.loadKey();
  assert.equal(secret.secretModeOn(), true);
  const stored = withTwist.system.secret;
  assert.ok(stored, "encrypted");
  assert.ok(!stored.includes("Gutter") && !stored.includes("lügt") && !stored.includes("Bruder"), "no plain text in the world");
  assert.equal(withTwist.system.brief.twist, "", "plain brief field is emptied");
  assert.deepEqual(withTwist.system.conclusions, [{ id: "k1", text: "" }, { id: "k2", text: "" }], "ids stay, texts go");
  assert.deepEqual(withTwist.system.followUps, [{ id: "f1", text: "", session: 7, done: false }], "session and tick stay readable");
  assert.equal(empty.system.secret, "", "a quest without secret text stays as it is");
  assert.equal(store.get("motherboard-quest-log.secretWord"), WORD);

  const open = await secret.openSecrets(withTwist);
  assert.equal(open.brief.twist, "Der Händler ist ein Gutter.");
  assert.deepEqual(open.conclusions, [{ id: "k1", text: "Der Händler lügt" }, { id: "k2", text: "" }]);
  assert.equal(open.followUps[0].text, "Sein Bruder taucht auf");
});

test("saving in secret mode stores only the encrypted package", async () => {
  const values = await secret.secretValues({ brief: { hook: "Ein Klopfen" }, conclusions: [{ id: "k", text: "Geheim" }] });
  assert.deepEqual(values.brief, blank());
  assert.deepEqual(values.conclusions, [{ id: "k", text: "" }]);
  assert.ok(values.secret && !values.secret.includes("Klopfen") && !values.secret.includes("Geheim"));
});

test("a package from 0.2 (brief fields only) still opens", async () => {
  const old = page("c", {}, [{ id: "k9", text: "" }]);
  old.system.secret = await encrypt(await keyFrom(WORD, store.get("motherboard-quest-log.secretSalt")), { ...blank(), hook: "Alt" });
  const open = await secret.openSecrets(old);
  assert.equal(open.brief.hook, "Alt");
  assert.deepEqual(open.conclusions, [{ id: "k9", text: "" }]);
});

test("without the word everything stays shut; the right word unlocks", async () => {
  await secret.forget();
  await assert.rejects(() => secret.openBrief(withTwist), /MQL.Secret.Locked/);
  await assert.rejects(() => secret.secretValues({ brief: { hook: "x" } }), /MQL.Secret.Locked/);
  assert.equal(await secret.secretsWritable(empty), false, "secret mode without key: nothing can be saved");
  await assert.rejects(() => secret.unlock("falsch"), /MQL.Secret.WrongWord/);
  await secret.unlock(WORD);
  assert.equal((await secret.openBrief(withTwist)).twist, "Der Händler ist ein Gutter.");
  assert.equal(await secret.secretsWritable(empty), true);
});

test("another browser without any word: not unlocked, GM gets a hint", async () => {
  store.set("motherboard-quest-log.secretWord", "");
  game.modules.set(DATA_CARRIER, { active: false });
  messages.length = 0;
  await secret.loadKey();
  assert.equal(await secret.keyReady(), false);
  assert.deepEqual(messages.map(m => m[1]), ["MQL.Secret.EnterWord"]);
});

test("players can never open encrypted parts", async () => {
  game.user.isGM = false;
  await assert.rejects(() => secret.openSecrets(withTwist), /MQL.Secret.GMOnly/);
  game.user.isGM = true;
});

test("turning secret mode off makes everything readable again", async () => {
  await secret.unlock(WORD);
  await secret.turnOff();
  assert.equal(secret.secretModeOn(), false);
  assert.equal(withTwist.system.secret, "");
  assert.equal(withTwist.system.brief.twist, "Der Händler ist ein Gutter.");
  assert.deepEqual(withTwist.system.conclusions, [{ id: "k1", text: "Der Händler lügt" }, { id: "k2", text: "" }]);
  assert.equal(withTwist.system.followUps[0].text, "Sein Bruder taucht auf");
  assert.deepEqual(secret.secretStatus(), { total: 2, encrypted: 0, open: 1 });
});
