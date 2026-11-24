import { test } from "node:test";
import assert from "node:assert/strict";
import { newSalt, keyFrom, encrypt, decrypt, createProbe, probeMatches } from "../scripts/crypto.mjs";

// Fewer iterations keep the test fast - the scheme is the same.
const IT = 1000;

test("round trip with umlauts and long text", async () => {
  const key = await keyFrom("Mast am Rand der Deadband", newSalt(), IT);
  const brief = { twist: "Der Händler ist ein Gutter aus Junkers Gang. ".repeat(500), secret: "Größe ✓" };
  const pack = await encrypt(key, brief);
  assert.ok(!pack.includes("Gutter"), "no plain text in the package");
  assert.deepEqual(await decrypt(key, pack), brief);
});

test("wrong secret word fails", async () => {
  const salt = newSalt();
  const pack = await encrypt(await keyFrom("right", salt, IT), { hook: "x" });
  const wrong = await keyFrom("wrong", salt, IT);
  await assert.rejects(() => decrypt(wrong, pack));
});

test("same content gives a different package every time", async () => {
  const key = await keyFrom("w", newSalt(), IT);
  assert.notEqual(await encrypt(key, { a: 1 }), await encrypt(key, { a: 1 }));
});

test("probe recognises the right secret word", async () => {
  const salt = newSalt();
  const key = await keyFrom("one", salt, IT);
  const probe = await createProbe(key);
  assert.equal(await probeMatches(key, probe), true);
  assert.equal(await probeMatches(await keyFrom("two", salt, IT), probe), false);
});
