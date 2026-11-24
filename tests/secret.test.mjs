/**
 * Secret mode end to end against a tiny stand-in for Foundry (settings, journal, pages).
 * Uses the real crypto with the real iteration count.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { PAGE_TYPE } from "../scripts/constants.mjs";

const DATA_CARRIER = "motherboard-data-carrier-journal";
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
const page = (id, brief) => ({ id, uuid: `JournalEntry.j.JournalEntryPage.${id}`, type: PAGE_TYPE, parent: journal, system: { brief: { ...blank(), ...brief }, secret: "" } });
const withTwist = page("a", { twist: "Der Händler ist ein Gutter." });
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

test("first start with the Data Carrier's word: secret mode is set up and briefs are encrypted", async () => {
  store.set(`${DATA_CARRIER}.geheimWort`, "Mast am Rand der Deadband");
  await secret.loadKey();
  assert.equal(secret.secretModeOn(), true);
  assert.ok(withTwist.system.secret, "brief is encrypted");
  assert.ok(!withTwist.system.secret.includes("Gutter"), "no plain text in the world");
  assert.equal(withTwist.system.brief.twist, "", "plain field is emptied");
  assert.equal(empty.system.secret, "", "an empty brief stays as it is");
  assert.equal(store.get("motherboard-quest-log.secretWord"), "Mast am Rand der Deadband");
  assert.equal((await secret.openBrief(withTwist)).twist, "Der Händler ist ein Gutter.");
});

test("saving in secret mode stores only the encrypted package", async () => {
  const values = await secret.briefValues({ hook: "Ein Klopfen" });
  assert.deepEqual(values.brief, blank());
  assert.ok(values.secret && !values.secret.includes("Klopfen"));
});

test("without the word the brief stays shut; the right word unlocks", async () => {
  await secret.forget();
  await assert.rejects(() => secret.openBrief(withTwist), /MQL.Secret.Locked/);
  await assert.rejects(() => secret.briefValues({ hook: "x" }), /MQL.Secret.Locked/);
  await assert.rejects(() => secret.unlock("falsch"), /MQL.Secret.WrongWord/);
  await secret.unlock("Mast am Rand der Deadband");
  assert.equal((await secret.openBrief(withTwist)).twist, "Der Händler ist ein Gutter.");
});

test("another browser without any word: not unlocked, GM gets a hint", async () => {
  store.set("motherboard-quest-log.secretWord", "");
  game.modules.set(DATA_CARRIER, { active: false });
  messages.length = 0;
  await secret.loadKey();
  assert.equal(await secret.keyReady(), false);
  assert.deepEqual(messages.map(m => m[1]), ["MQL.Secret.EnterWord"]);
});

test("players can never open an encrypted brief", async () => {
  game.user.isGM = false;
  await assert.rejects(() => secret.openBrief(withTwist), /MQL.Secret.GMOnly/);
  game.user.isGM = true;
});

test("turning secret mode off makes every brief readable again", async () => {
  await secret.unlock("Mast am Rand der Deadband");
  await secret.turnOff();
  assert.equal(secret.secretModeOn(), false);
  assert.equal(withTwist.system.secret, "");
  assert.equal(withTwist.system.brief.twist, "Der Händler ist ein Gutter.");
  assert.deepEqual(secret.secretStatus(), { total: 2, encrypted: 0, open: 1 });
});
