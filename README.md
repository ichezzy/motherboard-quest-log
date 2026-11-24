# Motherboard: Quest Log

Foundry VTT module for *White Signal* (Daggerheart, Foundryborne). Module id `motherboard-quest-log`. A simple quest log built on a new journal page type **Quest**: objectives you reveal one by one, a GM brief per quest, and a **Quest Log** window for everyone.

- Foundry **v14** (checked against the client code of 14.365), Daggerheart **2.12.9**
- Plain ESM, no build step. Tests with `node --test`.
- The page type is stored as `motherboard-quest-log.quest`.
- Interface language: English.

## Installation

In Foundry: *Add-on Modules → Install Module*, paste this manifest URL and install:

```
https://github.com/ichezzy/motherboard-quest-log/releases/latest/download/module.json
```

Updates: *Setup → Add-on Modules → Check for Updates*.

## Publishing a version

Double-click **`Quest Log veröffentlichen.bat`** (console in German). It runs the tests, shows the next version and the changes since the last release, asks, then writes version and links into `module.json`, builds the ZIP, commits, tags, pushes and creates the GitHub release with `module.json` and the ZIP. The version in `module.json` is used as long as it has no release yet; otherwise the patch number goes up by one. Needs `git`, `node` and the GitHub CLI `gh` (logged in).

## Test copies straight to the server

For quick tests without a release:

1. Once: create `tools\target.txt` (not in git) with the target, e.g. `myserver:/srv/foundry/Data/modules/motherboard-quest-log`.
2. From the repo folder: `powershell -ExecutionPolicy Bypass -File tools\deploy.ps1` - runs the tests and copies only the module files via `scp`.
3. A new module needs a Foundry restart. Updates: F5 in the world is usually enough.

## Using it

**Open the Quest Log:** Journal sidebar → **Quest Log** button at the top (GM and players). With the module *Motherboard: Ferrond* there is a **Quest Log** button in its group (gear) on the left as well - players see that group only while a shop is open. Optional keybinding under *Configure Controls → Motherboard: Quest Log*.

**New quest:** In the Quest Log → **New quest**. The quest lands in the journal "Quest Log" (created on first use) and starts **hidden**. You can also add a page of type **Quest** to any journal - the Quest Log finds it anyway.

**Edit window:**
- **Status** - Hidden · Active · Completed · Failed · Abandoned. Hidden quests are invisible to players; any other status shows the quest to everyone (the page's default ownership follows the status).
- **Urgent** - at most one quest at a time: marking one clears the others, closing a quest clears it. Players see a fire badge, the quest moves to the top of the list, and everyone gets "Urgent: …".
- **Quest giver** - drag an actor from the sidebar onto the portrait: name and image are filled in. Players see name and portrait without needing access to the actor.
- **Location** - plain text, `@UUID[…]{…}` links work.
- **Description** - what the group knows.
- **Objectives** - text plus *Revealed*, *Done*, *Optional*; reorder and delete with the buttons. Players only see revealed objectives. Optional objectives don't count towards progress.
- **The group's decision** - plain text; players see it in its own box as soon as it is filled in.
- **Clues** (Three Clue Rule) - add a *conclusion* the group should draw ("The trader is a Gutter") and the clues that lead there. Drag a journal page, a Data Carrier (page or loot item), an item or an actor onto a clue to link it, or onto a conclusion for a new clue. Each conclusion shows "2 of 3 found" and a hint below three clues. Clues linked to a journal page or journal count as **found automatically** as soon as a player may see that document (e.g. the Data Carrier module unlocks it, or you show it); everything else you tick. Players only see found clues - never the conclusion - and get "New clue in …".
- **Rewards** - drop items (same item twice adds one; set the quantity), enter currency in Daggerheart's slots (names from the Homebrew setting, e.g. Ferrond's Bits, Bytes, Chunks) and write other rewards as text (a contact, a favour, reputation). Players see nothing of it until it is handed out.
- **GM Brief** - the eight fields of the quest profile from the Quest Guide: Hook, Who wants what, What the group can do, The twist, The choice, Reward, Consequences later, Secret.
- **Paste quest profile** - paste a profile from your notes (Markdown, e.g. Obsidian) and the eight fields are filled in; the heading becomes the quest name. German labels (`**Aufhänger:**`, `**Wer will was:**`, `**Die Wendung:**` …) and English ones (`**Hook:**` …) both work; wikilinks, bold and vault markers become plain text.
- **Follow-ups** - consequences that come back later: a text and "session 7" (new rows default to the next session). GM only.

**View** (journal page and Quest Log): portrait, status, quest giver, location, progress, description, objectives, found clues, received rewards. Name and portrait of the quest giver open the actor sheet for everyone with at least *Limited* permission on the actor (the GM always); for everyone else they are plain text. Linked clue documents open the same way. The GM additionally has:
- **Reveal to players** / **Hide from players**, a status picker and **Mark urgent**
- a checkbox and an eye per objective: mark done, reveal one by one
- all conclusions with their clues and a checkbox per clue
- the planned rewards and **Hand out rewards**
- the follow-ups with a checkbox each
- the GM brief in a collapsible box
- **Edit**

**Handing out rewards:** setting a quest with rewards to *Completed* opens the hand-out (also via **Hand out rewards**). Each item goes to the party (Daggerheart's active party) or a character; each currency to the party, a character, or split evenly among the characters - the option says what that means ("Split: 2 Bits each, 1 to Party") and only shows up if every character gets at least one. Below the pickers the dialog shows who gets what before you hand it out. Items land in the inventory - stacked if the actor has the same one - and currency in the purse. A chat message tells everyone, and players see "Received" in the quest. Each quest pays out once; "Allow handing out again" in the edit window resets that (nothing is taken back).

**Sessions and follow-ups:** the module counts sessions. Start one with **Start session** (calendar) in the *Ferrond* group of the scene controls on the left - it suggests the next number, which you can change. That button needs the module *Motherboard: Ferrond*; without it, click the session number in the Quest Log. The Quest Log shows the session number (click to change it) and a bell with the number of due follow-ups. When a session starts and something is due, the **Follow-ups** window opens: everything due (oldest first, with how late it is), each with *Done* or *Next session*, and what is coming up.

**Threads:** with more than four active quests the GM gets a hint in the Quest Log (Quest Guide: two to four threads, one urgent).

**Announcements:** Everyone who can see the quest gets a short notice when the GM reveals a quest, reveals an objective, ticks a revealed objective done, a clue is found, the quest becomes urgent, or it closes (completed / failed / abandoned). Editing text stays silent, and so does everything while a quest is hidden.

## Secret mode

Foundry 14 sends every journal page to every client - hiding a page doesn't stop someone who opens the browser console. In **secret mode** the GM's parts of a quest - the brief, the conclusions and the follow-up texts - are only stored encrypted, as one package per quest (AES-GCM 256, key via PBKDF2 from the GM's secret word; same scheme as the Data Carrier module). The word stays in the GM's browser; the world only holds salt and a check value.

- *Settings → Motherboard: Quest Log → Secret mode*: set a word, unlock in another browser, encrypt leftovers, forget the word in this browser, or turn secret mode off (decrypts everything).
- **One word for both modules:** if the Data Carrier module knows a secret word in this browser, the Quest Log uses it - on first start it turns secret mode on with that word and encrypts everything written so far.
- Without the word the secret parts stay shut: the view says so, and the edit window shows no brief fields and locked conclusion and follow-up texts, so nothing can be overwritten. Clues, session numbers and ticks still work.
- Still readable through the console: names, descriptions, objectives, clue texts and rewards of hidden quests. Briefs from 0.2 open as before.

## Roadmap

- **Phase 3 - style and extras:** White Signal skin, on-screen tracker, player notes, "Open in Obsidian" button.

## Files

| Path | What |
|---|---|
| `scripts/data-model.mjs` | Fields of a quest page |
| `scripts/quest-sheet.mjs` | Edit window and journal view |
| `scripts/quest-view.mjs` | Shared view context and buttons |
| `scripts/quest-log.mjs` | Quest Log window |
| `scripts/visibility.mjs` | Status → ownership, who sees what |
| `scripts/notify.mjs` | Announcements over the module socket |
| `scripts/journal.mjs` | Journal "Quest Log", new quests |
| `scripts/secret.mjs`, `scripts/crypto.mjs`, `scripts/secret-config.mjs` | Secret mode: key, encrypting brief, conclusions and follow-ups, settings window |
| `scripts/clues.mjs` | Clue links, finding clues automatically |
| `scripts/rewards.mjs` | Hand-out dialog: items, currency, chat |
| `scripts/session.mjs` | Session number, "Start session" dialog |
| `scripts/controls.mjs` | Quest Log and Start session buttons in the Ferrond group |
| `scripts/follow-ups.mjs` | Follow-ups window (reminders) |
| `scripts/profile.mjs` | "Paste quest profile" parser (tested) |
| `scripts/directory.mjs` | Button in the Journal sidebar |
| `scripts/logic.mjs` | Pure helpers (tested) |
