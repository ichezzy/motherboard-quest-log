import { test } from "node:test";
import assert from "node:assert/strict";
import {
  tabOf, ownershipFor, visibleObjectives, progress, sortQuests,
  addObjective, removeObjective, moveObjective, toggleObjective,
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

test("text helpers", () => {
  assert.equal(escapeHtml(`<b>"Rost" & 'Mast'</b>`), "&lt;b&gt;&quot;Rost&quot; &amp; &#39;Mast&#39;&lt;/b&gt;");
  assert.equal(plainToHtml("  Line one\nLine <two>\r\nthree "), "Line one<br>Line &lt;two&gt;<br>three");
  assert.equal(plainLabel("Talk to @UUID[Actor.abc]{Stormy} at @UUID[JournalEntry.xyz]"), "Talk to Stormy at JournalEntry.xyz");
});
