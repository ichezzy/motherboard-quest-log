/**
 * Pure helpers for publishing (tested in tests/release.test.mjs).
 */

export const REPO = "ichezzy/motherboard-quest-log";

/** 0.1.1 → 0.1.2 */
export function bumpPatch(version) {
  const parts = String(version).split(".").map(n => Number.parseInt(n, 10));
  if (parts.length !== 3 || parts.some(n => !Number.isInteger(n) || n < 0)) {
    throw new Error(`Version must look like 1.2.3, got "${version}"`);
  }
  parts[2] += 1;
  return parts.join(".");
}

/**
 * The version to publish: the one in module.json if it has no tag yet
 * (it was raised by hand, e.g. for a new phase), otherwise the next patch.
 */
export function nextVersion(current, tags = []) {
  return tags.includes(`v${current}`) ? bumpPatch(current) : current;
}

/** module.json with version and GitHub links. */
export function manifestFor(manifest, version, repo = REPO) {
  const id = manifest.id;
  return {
    ...manifest,
    version,
    url: `https://github.com/${repo}`,
    manifest: `https://github.com/${repo}/releases/latest/download/module.json`,
    download: `https://github.com/${repo}/releases/download/v${version}/${id}.zip`
  };
}

/** Release text on GitHub (English): the commit subjects since the last release. */
export function releaseNotes(subjects = [], { first = false } = {}) {
  const changes = subjects.filter(s => s && !/^Version \d+\.\d+\.\d+$/.test(s));
  const lines = [];
  if (first) lines.push("First release.");
  if (changes.length) {
    if (first) lines.push("");
    lines.push(...changes.map(s => `- ${s}`));
  } else if (!first) {
    lines.push("Maintenance release.");
  }
  return lines.join("\n") + "\n";
}
