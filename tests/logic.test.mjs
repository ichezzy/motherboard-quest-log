import { test } from "node:test";
import assert from "node:assert/strict";
import {
  tabOf, ownershipFor, visibleObjectives, progress, sortQuests, isUrgent,
  addObjective, removeObjective, moveObjective, toggleObjective, patchById,
  blankConclusion, blankClue, removeConclusion, clueGroups, foundClues, clueLabel,
  hasRewards, addRewardItem, splitAmount, rewardPlan, itemLabel, currencyLabel,
  blankFollowUp, isDue, dueFollowUps, upcomingFollowUps, localDay,
  questEvents, escapeHtml, plainToHtml, plainLabel
} from "../scripts/logic.mjs";

const o = (id, extra = {}) => ({ id, text: `Objective ${id}`, revealed: false, done: false, optional: false, ...extra });

test("tabs: hidden, active, closed", () => {
  assert.equal(tabOf("hidden"), "hidden");
  assert.equal(tabOf("active"), "active");
  for (const s of ["completed", "failed", "abandoned"]) assert.equal(tabOf(s), "closed");
});

test("ownership follows the status", () => {
  assert.equal(ownershipFor("hidden"), 0);
  for (const s of ["active", "completed", "failed", "abandoned"]) assert.equal(ownershipFor(s), 2);
});

test("players only see revealed objectives, the GM sees all", () => {
  const list = [o("a", { revealed: true }), o("b")];
  assert.deepEqual(visibleObjectives(list, false).map(x => x.id), ["a"]);
  assert.deepEqual(visibleObjectives(list, true).map(x => x.id), ["a", "b"]);
});

test("progress ignores optional and unrevealed objectives for players", () => {
  const list = [
    o("a", { revealed: true, done: true }),
    o("b", { revealed: true }),
    o("c", { revealed: true, done: true, optional: true }),
    o("d", { done: true })
  ];
  assert.deepEqual(progress(list, false), { done: 1, total: 2 });
  assert.deepEqual(progress(list, true), { done: 2, total: 3 });
});

test("quests sort by name, numbers naturally", () => {
  const names = sortQuests([{ name: "Quest 10" }, { name: "quest 2" }, { name: "Das Klopfen" }]).map(q => q.name);
  assert.deepEqual(names, ["Das Klopfen", "quest 2", "Quest 10"]);
});

test("the urgent quest comes first, but not once it is closed", () => {
  const list = [
    { name: "A", status: "active" },
    { name: "Z", status: "active", urgent: true },
    { name: "B", status: "completed", urgent: true }
  ];
  assert.deepEqual(sortQuests(list).map(q => q.name), ["Z", "A", "B"]);
  assert.equal(isUrgent({ system: { status: "active", urgent: true } }), true);
  assert.equal(isUrgent({ system: { status: "failed", urgent: true } }), false);
});

test("events: a visible quest becomes urgent", () => {
  const before = { status: "active", urgent: false, objectives: [] };
  assert.deepEqual(questEvents(before, { ...before, urgent: true }), [{ kind: "urgent" }]);
  assert.deepEqual(questEvents({ ...before, urgent: true }, { ...before, urgent: true }), []);
  assert.deepEqual(questEvents({ ...before, status: "hidden" }, { ...before, urgent: true }), [{ kind: "revealed" }]);
});

test("objectives: add, remove, move, toggle", () => {
  let list = [o("a"), o("b")];
  list = addObjective(list, "c");
  assert.deepEqual(list.map(x => x.id), ["a", "b", "c"]);
  assert.deepEqual(list[2], { id: "c", text: "", revealed: false, done: false, optional: false });
  assert.deepEqual(moveObjective(list, "c", -1).map(x => x.id), ["a", "c", "b"]);
  assert.deepEqual(moveObjective(list, "a", -1).map(x => x.id), ["a", "b", "c"]);
  assert.deepEqual(moveObjective(list, "c", 1).map(x => x.id), ["a", "b", "c"]);
  assert.deepEqual(removeObjective(list, "b").map(x => x.id), ["a", "c"]);
  assert.equal(toggleObjective(list, "b", "done")[1].done, true);
  assert.equal(list[1].done, false, "original list stays untouched");
});

test("events: revealing a quest is one message", () => {
  const before = { status: "hidden", objectives: [o("a")] };
  const after = { status: "active", objectives: [o("a", { revealed: true })] };
  assert.deepEqual(questEvents(before, after), [{ kind: "revealed" }]);
});

test("events: nothing while the quest is hidden", () => {
  const before = { status: "hidden", objectives: [o("a")] };
  const after = { status: "hidden", objectives: [o("a", { revealed: true, done: true })] };
  assert.deepEqual(questEvents(before, after), []);
});

test("events: new objective, objective done, quest closed", () => {
  const before = { status: "active", objectives: [o("a", { revealed: true }), o("b")] };
  const after = {
    status: "completed",
    objectives: [o("a", { revealed: true, done: true }), o("b", { revealed: true })]
  };
  assert.deepEqual(questEvents(before, after), [
    { kind: "objective-done", text: "Objective a" },
    { kind: "objective-revealed", text: "Objective b" },
    { kind: "closed", status: "completed" }
  ]);
});

test("events: editing text or unticking is silent", () => {
  const before = { status: "active", objectives: [o("a", { revealed: true, done: true })] };
  const after = { status: "active", objectives: [o("a", { revealed: true, done: false, text: "Changed" })] };
  assert.deepEqual(questEvents(before, after), []);
});

test("events: reopening a closed quest is silent", () => {
  assert.deepEqual(questEvents({ status: "failed", objectives: [] }, { status: "active", objectives: [] }), []);
});

const clue = (id, conclusion, extra = {}) => ({ ...blankClue(id, conclusion), text: `Clue ${id}`, ...extra });

test("clues: grouped by conclusion with counts, fewer than three is flagged", () => {
  const conclusions = [{ id: "k1", text: "The trader is a Gutter" }, { id: "k2", text: "" }];
  const clues = [
    clue("a", "k1", { found: true }), clue("b", "k2"), clue("c", "k1"), clue("d", "k1", { found: true }), clue("x", "gone", { found: true })
  ];
  const groups = clueGroups(conclusions, clues);
  assert.deepEqual(groups.map(g => [g.id, g.clues.map(c => c.id), g.found, g.total, g.few]), [
    ["k1", ["a", "c", "d"], 2, 3, false],
    ["k2", ["b"], 0, 1, true]
  ]);
  // Players: found clues of existing conclusions only.
  assert.deepEqual(foundClues(conclusions, clues).map(c => c.id), ["a", "d"]);
});

test("clues: a conclusion goes together with its clues; entries can be patched", () => {
  const state = { conclusions: [blankConclusion("k1"), blankConclusion("k2")], clues: [clue("a", "k1"), clue("b", "k2")] };
  const after = removeConclusion(state, "k1");
  assert.deepEqual(after.conclusions.map(c => c.id), ["k2"]);
  assert.deepEqual(after.clues.map(c => c.id), ["b"]);
  const patched = patchById(state.clues, "b", { uuid: "JournalEntry.x.JournalEntryPage.y", name: "Disc" });
  assert.equal(patched[1].name, "Disc");
  assert.equal(state.clues[1].name, "", "original list stays untouched");
  assert.equal(clueLabel({ text: " ", name: "Disc" }), "Disc");
});

test("events: a found clue is announced, with the link name if it has no text", () => {
  const conclusions = [{ id: "k1" }];
  const before = { status: "active", objectives: [], conclusions, clues: [clue("a", "k1"), clue("b", "k1", { text: "", name: "Disc 7" })] };
  const after = { ...before, clues: [clue("a", "k1", { found: true }), clue("b", "k1", { text: "", name: "Disc 7", found: true })] };
  assert.deepEqual(questEvents(before, after), [{ kind: "clue", text: "Clue a" }, { kind: "clue", text: "Disc 7" }]);
  assert.deepEqual(questEvents(after, before), [], "unticking is silent");
  assert.deepEqual(questEvents({ ...before, status: "hidden" }, { ...after, status: "hidden" }), [], "silent while hidden");
});

test("rewards: anything to hand out, same item twice adds one", () => {
  const none = { items: [], currency: { coins: 0, handfuls: 0, bags: 0, chests: 0 }, text: " " };
  assert.equal(hasRewards(none), false);
  assert.equal(hasRewards({ ...none, text: "Stormy owes you" }), true);
  assert.equal(hasRewards({ ...none, currency: { ...none.currency, bags: 2 } }), true);
  let items = addRewardItem([], { id: "r1", uuid: "Item.stim", name: "Health Stim" });
  items = addRewardItem(items, { id: "r2", uuid: "Item.stim", name: "Health Stim" });
  assert.deepEqual(items, [{ id: "r1", uuid: "Item.stim", name: "Health Stim", quantity: 2 }]);
  assert.equal(itemLabel(items[0]), "Health Stim ×2");
  assert.equal(itemLabel({ name: "Key", quantity: 1 }), "Key");
});

test("rewards: split evenly, the rest goes to the party or else the first character", () => {
  assert.deepEqual(splitAmount(7, 3), { each: 2, rest: 1 });
  assert.deepEqual(splitAmount(5, 0), { each: 0, rest: 5 });
  const rewards = {
    items: [{ id: "r1", name: "Stim", quantity: 2 }, { id: "r2", name: "Key", quantity: 1 }],
    currency: { coins: 7, handfuls: 2, bags: 0, chests: 0 }
  };
  const choices = { items: { r1: "kas", r2: "party" }, currency: { coins: "split", handfuls: "vanya" } };
  const plan = rewardPlan(rewards, choices, { party: "party", characters: ["kas", "vanya", "drau"] });
  assert.deepEqual([...plan.keys()], ["kas", "party", "vanya", "drau"]);
  assert.deepEqual(plan.get("kas"), { items: [rewards.items[0]], currency: { coins: 2 } });
  assert.deepEqual(plan.get("party"), { items: [rewards.items[1]], currency: { coins: 1 } });
  assert.deepEqual(plan.get("vanya").currency, { coins: 2, handfuls: 2 });
  const noParty = rewardPlan({ items: [], currency: { coins: 7 } }, { currency: { coins: "split" } }, { characters: ["a", "b"] });
  assert.deepEqual(plan.get("drau").currency, { coins: 2 });
  assert.deepEqual(noParty.get("a").currency, { coins: 4 });
  assert.deepEqual(noParty.get("b").currency, { coins: 3 });
  const labels = [{ key: "coins", label: "Bits" }, { key: "handfuls", label: "Bytes" }];
  assert.equal(currencyLabel({ handfuls: 2, coins: 3 }, labels), "3 Bits, 2 Bytes");
});

test("follow-ups: due once their session has come, until done", () => {
  const f = (id, session, done = false) => ({ ...blankFollowUp(id, session), done });
  const list = [f("a", 7), f("b", 5), f("c", 9), f("d", null), f("e", 4, true)];
  assert.equal(isDue(list[0], 0), false, "no session number set yet");
  assert.deepEqual(dueFollowUps(list, 7).map(x => x.id), ["b", "a"], "oldest first");
  assert.deepEqual(upcomingFollowUps(list, 7).map(x => x.id), ["c", "d"], "without a number last");
  assert.deepEqual(dueFollowUps(list, 0), []);
  assert.deepEqual(upcomingFollowUps(list, 0).map(x => x.id), ["b", "a", "c", "d"]);
});

test("session day is the local calendar day", () => {
  assert.equal(localDay(new Date(2026, 0, 5, 23, 59)), "2026-01-05");
  assert.equal(localDay(new Date(2026, 10, 24, 0, 1)), "2026-11-24");
});

test("text helpers", () => {
  assert.equal(escapeHtml(`<b>"Rost" & 'Mast'</b>`), "&lt;b&gt;&quot;Rost&quot; &amp; &#39;Mast&#39;&lt;/b&gt;");
  assert.equal(plainToHtml("  Line one\nLine <two>\r\nthree "), "Line one<br>Line &lt;two&gt;<br>three");
  assert.equal(plainLabel("Talk to @UUID[Actor.abc]{Stormy} at @UUID[JournalEntry.xyz]"), "Talk to Stormy at JournalEntry.xyz");
});
