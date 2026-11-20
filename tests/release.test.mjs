import { test } from "node:test";
import assert from "node:assert/strict";
import { bumpPatch, nextVersion, manifestFor, releaseNotes } from "../tools/release.mjs";

test("patch bump", () => {
  assert.equal(bumpPatch("0.1.1"), "0.1.2");
  assert.equal(bumpPatch("1.9.9"), "1.9.10");
  assert.throws(() => bumpPatch("1.2"));
});

test("next version: current if untagged, otherwise next patch", () => {
  assert.equal(nextVersion("0.1.1", []), "0.1.1");
  assert.equal(nextVersion("0.1.1", ["v0.1.1"]), "0.1.2");
  assert.equal(nextVersion("0.2.0", ["v0.1.1", "v0.1.2"]), "0.2.0");
});

test("manifest gets version and GitHub links", () => {
  const m = manifestFor({ id: "motherboard-quest-log", version: "0.1.0", title: "X" }, "0.1.1");
  assert.equal(m.version, "0.1.1");
  assert.equal(m.title, "X");
  assert.equal(m.url, "https://github.com/ichezzy/motherboard-quest-log");
  assert.equal(m.manifest, "https://github.com/ichezzy/motherboard-quest-log/releases/latest/download/module.json");
  assert.equal(m.download, "https://github.com/ichezzy/motherboard-quest-log/releases/download/v0.1.1/motherboard-quest-log.zip");
});

test("release notes list changes, skip version commits", () => {
  assert.equal(releaseNotes(["Version 0.1.1", "Urgent flag", "Paste quest profile"]), "- Urgent flag\n- Paste quest profile\n");
  assert.equal(releaseNotes(["A"], { first: true }), "First release.\n\n- A\n");
  assert.equal(releaseNotes(["Version 0.1.2"]), "Maintenance release.\n");
});
