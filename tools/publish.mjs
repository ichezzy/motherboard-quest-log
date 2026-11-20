/**
 * Publish a new version on GitHub - started by "Quest Log veröffentlichen.bat".
 *
 * tests → summary → ask → module.json (version, links) → ZIP → commit, tag, push → GitHub release.
 * Foundry then finds the update itself (Setup → Add-on Modules → Check for Updates).
 * Console text is German (it is for Chezzy on this PC); everything on GitHub is English.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline/promises";
import { fileURLToPath } from "node:url";
import { REPO, nextVersion, manifestFor, releaseNotes } from "./release.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MODULE_PARTS = ["module.json", "scripts", "templates", "styles", "lang", "assets"];
const DIST = path.join(ROOT, "dist");

function run(program, args) {
  try {
    return execFileSync(program, args, { cwd: ROOT, encoding: "utf8", stdio: "pipe" }).trim();
  } catch (error) {
    const text = (error.stderr || error.stdout || error.message || "").toString().trim();
    throw new Error(`„${program} ${args.join(" ")}“ ist fehlgeschlagen:\n${text}`);
  }
}

const lines = text => text.split(/\r?\n/).filter(Boolean);

async function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = (await rl.question(question)).trim().toLowerCase();
  rl.close();
  return answer === "j" || answer === "ja";
}

/** ZIP with module.json at the top, like Foundry expects it. Uses Windows' own tar.exe. */
function buildZip(id) {
  const stage = path.join(DIST, "stage");
  fs.rmSync(DIST, { recursive: true, force: true });
  fs.mkdirSync(stage, { recursive: true });
  const parts = MODULE_PARTS.filter(part => fs.existsSync(path.join(ROOT, part)));
  for (const part of parts) fs.cpSync(path.join(ROOT, part), path.join(stage, part), { recursive: true });
  fs.copyFileSync(path.join(ROOT, "module.json"), path.join(DIST, "module.json"));

  const tar = path.join(process.env.SystemRoot ?? "C:\\Windows", "System32", "tar.exe");
  const zip = path.join(DIST, `${id}.zip`);
  run(tar, ["-a", "-c", "-f", zip, "-C", stage, ...parts]);
  const content = lines(run(tar, ["-t", "-f", zip]));
  if (!content.includes("module.json") || !content.includes("scripts/main.mjs")) {
    throw new Error(`Die ZIP-Datei sieht falsch aus:\n${content.join("\n")}`);
  }
  return zip;
}

async function main() {
  const manifestPath = path.join(ROOT, "module.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

  try {
    run("git", ["remote", "get-url", "origin"]);
  } catch {
    throw new Error(`Das Repo hat noch kein GitHub-Ziel (origin). Erwartet: https://github.com/${REPO}`);
  }

  console.log("Tests …");
  try {
    run(process.execPath, ["--test"]);
  } catch (error) {
    throw new Error(`Tests sind fehlgeschlagen – nichts veröffentlicht.\n${error.message}`);
  }

  const tags = lines(run("git", ["tag", "--list", "v*"]));
  const version = nextVersion(manifest.version, tags);
  let lastTag = null;
  if (tags.length) {
    try {
      lastTag = run("git", ["describe", "--tags", "--abbrev=0", "--match", "v*"]);
    } catch { /* no tag reachable from HEAD */ }
  }
  const subjects = lines(run("git", ["log", "--format=%s", lastTag ? `${lastTag}..HEAD` : "HEAD"]));
  const pending = lines(run("git", ["status", "--short"]));

  console.log("");
  console.log(`${manifest.title} – nächste Version: ${version} (zuletzt veröffentlicht: ${lastTag ?? "noch keine"})`);
  const changes = subjects.filter(s => !/^Version \d/.test(s));
  if (changes.length) {
    console.log(`Änderungen${lastTag ? ` seit ${lastTag}` : ""}:`);
    for (const s of changes) console.log(`  - ${s}`);
  } else {
    console.log("Seit der letzten Version gibt es keine neuen Commits.");
  }
  if (pending.length) {
    console.log("Noch nicht committete Dateien (werden mit veröffentlicht):");
    for (const p of pending) console.log(`  ${p}`);
  }
  console.log("");
  if (!(await ask(`Version ${version} jetzt auf GitHub veröffentlichen? (j/n) `))) {
    console.log("Nichts veröffentlicht.");
    return;
  }

  const updated = manifestFor(manifest, version);
  fs.writeFileSync(manifestPath, JSON.stringify(updated, null, 2) + "\n", "utf8");
  const zip = buildZip(updated.id);

  run("git", ["add", "-A"]);
  const staged = run("git", ["diff", "--cached", "--name-only"]);
  if (staged) run("git", ["commit", "-q", "-m", `Version ${version}`]);
  run("git", ["tag", `v${version}`]);

  console.log("Lade hoch …");
  run("git", ["push", "-q", "origin", "HEAD"]);
  run("git", ["push", "-q", "origin", `v${version}`]);
  const notes = path.join(DIST, "release.md");
  fs.writeFileSync(notes, releaseNotes(changes, { first: !lastTag }), "utf8");
  run("gh", [
    "release", "create", `v${version}`, path.join(DIST, "module.json"), zip,
    "--repo", REPO, "--title", `Version ${version}`, "--notes-file", notes, "--verify-tag"
  ]);

  console.log("");
  console.log(`Fertig: Version ${version} ist veröffentlicht – https://github.com/${REPO}/releases/tag/v${version}`);
  console.log(`In Foundry: Setup → Add-on Modules → „Check for Updates“ → bei „${manifest.title}“ auf „Update“.`);
}

try {
  await main();
} catch (error) {
  console.error("\nVERÖFFENTLICHEN IST ABGEBROCHEN:\n" + (error?.message ?? error));
  process.exitCode = 1;
}
