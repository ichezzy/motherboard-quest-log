# Motherboard: Quest Log

Foundry VTT module for *White Signal* (Daggerheart, Foundryborne). Module id `motherboard-quest-log`. A simple quest log built on a new journal page type **Quest**: objectives you reveal one by one, a GM brief per quest, and a **Quest Log** window for everyone.

- Foundry **v14** (checked against the client code of 14.365), Daggerheart **2.12.9**
- Plain ESM, no build step. Tests with `node --test`.
- The page type is stored as `motherboard-quest-log.quest`.
- Interface language: English.

## Installation on the server

1. Once: create `tools\target.txt` with the target, e.g. `aetherion:/srv/foundry/Data/modules/motherboard-quest-log`.
2. From the repo folder: `powershell -ExecutionPolicy Bypass -File tools\deploy.ps1` - runs the tests and copies only the module files via `scp`.
3. A new module needs a Foundry restart. Updates: F5 in the world is usually enough.

## Using it

**Open the Quest Log:** Journal sidebar → **Quest Log** button at the top (GM and players). Optional keybinding under *Configure Controls → Motherboard: Quest Log*.

**New quest:** In the Quest Log → **New quest**. The quest lands in the journal "Quest Log" (created on first use) and starts **hidden**. You can also add a page of type **Quest** to any journal - the Quest Log finds it anyway.

**Edit window:**
- **Status** - Hidden · Active · Completed · Failed · Abandoned. Hidden quests are invisible to players; any other status shows the quest to everyone (the page's default ownership follows the status).
- **Quest giver** - drag an actor from the sidebar onto the portrait: name and image are filled in. Players see name and portrait without needing access to the actor.
- **Location** - plain text, `@UUID[…]{…}` links work.
- **Description** - what the group knows.
- **Objectives** - text plus *Revealed*, *Done*, *Optional*; reorder and delete with the buttons. Players only see revealed objectives. Optional objectives don't count towards progress.
- **GM Brief** - the eight fields of the quest profile from the Quest Guide: Hook, Who wants what, What the group can do, The twist, The choice, Reward, Consequences later, Secret.

**View** (journal page and Quest Log): portrait, status, quest giver, location, progress, description, objectives. Name and portrait of the quest giver open the actor sheet for everyone with at least *Limited* permission on the actor (the GM always); for everyone else they are plain text. The GM additionally has:
- **Reveal to players** / **Hide from players** and a status picker
- a checkbox and an eye per objective: mark done, reveal one by one
- the GM brief in a collapsible box
- **Edit**

**Announcements:** Everyone who can see the quest gets a short notice when the GM reveals a quest, reveals an objective, ticks a revealed objective done, or closes the quest (completed / failed / abandoned). Editing text stays silent, and so does everything while a quest is hidden.

## Secrecy

Foundry 14 sends every journal page to every client. "Hidden" means "not shown", not "secret": a player who opens the browser console could read hidden quests and the GM brief. Encryption (as in the Data Carrier module) is planned for phase 2.

## Roadmap

- **Phase 2 - tools from the Quest Guide:** encrypt the GM brief, paste a quest profile from Obsidian, urgent flag (at most one), the group's decision, consequences with a reminder, clues (incl. data carriers), rewards.
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
| `scripts/directory.mjs` | Button in the Journal sidebar |
| `scripts/logic.mjs` | Pure helpers (tested) |
