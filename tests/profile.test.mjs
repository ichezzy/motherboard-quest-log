import { test } from "node:test";
import assert from "node:assert/strict";
import { parseQuestProfile, cleanMarkdown } from "../scripts/profile.mjs";

// Shaped like the profiles in the vault's Side Quests note.
const STORMY = `## Stormy und die Bake
- **Aufhänger:** [[Stormy]] sitzt einmal in der Woche in der [[Nachglut]], einen *Dawn 'n' Stormy* vor sich, den Tuner auf dem Tisch.
- **Wer will was:** Stormy will, dass jemand die Bake auch sieht. Dann will er an die Kante, und er braucht eine Crew.
- **Was die Gruppe tun kann:** mit ihm an die Kante fahren. Wege: [[Rennik Clutch|Rennik]] leiht einen Wagen ohne Bake, die Haulmark mit Bake.
- **Die Wendung:** offen ✅ *Chezzy, 17.11.2026* — ein Gerät, das ein Echo wiederholt · der Wisp · oder Dawn, die unten überlebt hat.
- **Die Wahl:** An der Kante — Stormy will hinunter. Lässt man ihn?
- **Belohnung:** Stormy als Peiler der Gruppe, umsonst. Ein Blick über die Kante.
- **Folgen, später:** Wenn die Bake danach nicht mehr zuckt — oder öfter.
- **Geheimnis:** die [[Die Nullsenke|Nullsenke]] · niemand weiß es.

## Die Platte mit dem Crewzeichen — 🔍
- **Aufhänger:** Wer bei [[Tovin Shim]] Panzerung kauft …`;

test("a full profile from the vault", () => {
  const { name, brief, count } = parseQuestProfile(STORMY);
  assert.equal(name, "Stormy und die Bake");
  assert.equal(count, 8);
  assert.equal(brief.hook, "Stormy sitzt einmal in der Woche in der Nachglut, einen Dawn 'n' Stormy vor sich, den Tuner auf dem Tisch.");
  assert.equal(brief.approach, "mit ihm an die Kante fahren. Wege: Rennik leiht einen Wagen ohne Bake, die Haulmark mit Bake.");
  assert.equal(brief.twist, "offen — ein Gerät, das ein Echo wiederholt · der Wisp · oder Dawn, die unten überlebt hat.");
  assert.equal(brief.consequences, "Wenn die Bake danach nicht mehr zuckt — oder öfter.");
  assert.equal(brief.secret, "die Nullsenke · niemand weiß es.");
});

test("the next heading ends the profile; markers leave the name", () => {
  const { name, brief } = parseQuestProfile(STORMY.split("\n").slice(9).join("\n"));
  assert.equal(name, "Die Platte mit dem Crewzeichen");
  assert.equal(brief.hook, "Wer bei Tovin Shim Panzerung kauft …");
});

test("English labels, other spellings, lines that continue a field", () => {
  const { name, brief, count } = parseQuestProfile([
    "**Hook**: A knock under the welded hood.",
    "Who wants what: Marv wants to know who cuts her deliveries.",
    "Wege: talk, sneak, pay",
    "",
    "- second line of the same field",
    "The twist: it's a drone"
  ].join("\n"));
  assert.equal(name, null);
  assert.equal(count, 3);
  assert.equal(brief.hook, "A knock under the welded hood.");
  assert.equal(brief.wants, "Marv wants to know who cuts her deliveries.\nWege: talk, sneak, pay\n\n- second line of the same field");
  assert.equal(brief.twist, "it's a drone");
});

test("nothing recognisable", () => {
  assert.deepEqual(parseQuestProfile("Koina hat sich zweimal bewegt."), { name: null, brief: {}, count: 0 });
});

test("markdown cleanup", () => {
  assert.equal(cleanMarkdown("[[1_Kampagnen/00_Regeln/System|Prep-Regeln]] und [[Welt/Rostgrund]]"), "Prep-Regeln und Rostgrund");
  assert.equal(cleanMarkdown("[[Nodport\\|Koina]] · [Quelle](https://example.com) · `code`"), "Koina · Quelle · code");
  assert.equal(cleanMarkdown("**fett** und *kursiv* ✅ *Chezzy, 18.11.*"), "fett und kursiv");
});
