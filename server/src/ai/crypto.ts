// Envelope encryption for the one secret this app stores on a user's behalf:
// their own Anthropic API key.
//
// AES-256-GCM with a random 12-byte IV per encryption. The stored value is a
// single base64 string laying out `iv || authTag || ciphertext`, so one text
// column holds everything decryption needs and there is no second field to
// keep in sync.
//
// GCM is authenticated: a tampered ciphertext, a swapped IV or a flipped tag
// byte all fail in `final()` rather than yielding garbage plaintext.
//
// Nothing in this module logs, throws with, or otherwise embeds plaintext —
// the error messages below are deliberately content-free.
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12; // 96-bit nonce, the size GCM is defined for
const TAG_BYTES = 16;
const KEY_BYTES = 32; // AES-256

/**
 * Fixed application salt. A per-record salt would be stronger against a
 * precomputation attack on the master secret, but it would also mean running
 * scrypt on every request; the secret itself is required to be >= 32 random
 * characters (see config), which is well past what a rainbow table reaches.
 */
const SCRYPT_SALT = Buffer.from("blw-app:user-ai-key:v1", "utf8");

/**
 * scrypt is intentionally slow (~50-100ms), so derive once per distinct
 * secret and reuse. The process only ever sees one secret in practice; the
 * map exists so tests can exercise several without paying the cost each call.
 */
const derivedKeys = new Map<string, Buffer>();

function deriveKey(secret: string): Buffer {
  const cached = derivedKeys.get(secret);
  if (cached) return cached;
  const key = scryptSync(secret, SCRYPT_SALT, KEY_BYTES);
  derivedKeys.set(secret, key);
  return key;
}

/**
 * Encrypts `plaintext` under `secret`, returning the base64 blob to store in
 * `user_ai_keys.encrypted_key`. Two calls with the same inputs produce
 * different output (fresh IV each time) — that is expected, not a bug.
 */
export function encryptSecret(plaintext: string, secret: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, deriveKey(secret), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString("base64");
}

/**
 * Reverses {@link encryptSecret}. Throws if the payload is truncated, was
 * encrypted under a different secret, or has been modified in any way — a
 * caller must treat a throw as "this key is unusable", never as "retry".
 */
export function decryptSecret(payload: string, secret: string): string {
  const raw = Buffer.from(payload, "base64");
  if (raw.length <= IV_BYTES + TAG_BYTES) {
    throw new Error("Encrypted payload is malformed");
  }

  const iv = raw.subarray(0, IV_BYTES);
  const authTag = raw.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
  const ciphertext = raw.subarray(IV_BYTES + TAG_BYTES);

  const decipher = createDecipheriv(ALGORITHM, deriveKey(secret), iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

/**
 * The only part of a key that is ever stored in the clear or shown back to
 * the user, so they can tell which of their keys is on file.
 */
export function lastFour(apiKey: string): string {
  return apiKey.slice(-4);
}
