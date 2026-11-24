/**
 * Encryption for the GM brief - WebCrypto only, no Foundry (testable in Node).
 *
 * Foundry 14 sends every journal page and every world setting to every client.
 * So what players must not read is stored encrypted: AES-GCM 256, key derived with
 * PBKDF2 from the GM's secret word. The word stays in the GM's browser.
 * Same scheme as the Data Carrier module.
 */

const encoder = new TextEncoder();
const decoder = new TextDecoder();
export const ITERATIONS = 250000;

function toBase64(bytes) {
  let s = "";
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
}

function fromBase64(text) {
  const s = atob(text);
  const b = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i);
  return b;
}

export function cryptoAvailable() {
  return Boolean(globalThis.crypto?.subtle);
}

/** Random salt (public, stored in the world). */
export function newSalt() {
  return toBase64(crypto.getRandomValues(new Uint8Array(16)));
}

/** Key from secret word and salt. */
export async function keyFrom(word, salt, iterations = ITERATIONS) {
  const raw = await crypto.subtle.importKey("raw", encoder.encode(word), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: fromBase64(salt), iterations, hash: "SHA-256" },
    raw,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

/** Object → encrypted package (a JSON string, fits a StringField). */
export async function encrypt(key, value) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoder.encode(JSON.stringify(value)));
  return JSON.stringify({ v: 1, iv: toBase64(iv), data: toBase64(data) });
}

/** Package → object. Throws on a wrong key or damaged data. */
export async function decrypt(key, pack) {
  const { v, iv, data } = typeof pack === "string" ? JSON.parse(pack) : pack;
  if (v !== 1) throw new Error(`Unknown package version ${v}`);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromBase64(iv) }, key, fromBase64(data));
  return JSON.parse(decoder.decode(plain));
}

/** Check value: confirms a secret word without storing it. */
export const PROBE = "motherboard-quest-log:ok";

export function createProbe(key) {
  return encrypt(key, PROBE);
}

export async function probeMatches(key, probe) {
  try {
    return (await decrypt(key, probe)) === PROBE;
  } catch {
    return false;
  }
}
