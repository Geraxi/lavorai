import { createCipheriv, createDecipheriv, randomBytes, createHash } from "node:crypto";

/**
 * AES-256-GCM con chiave derivata dalla env APP_ENCRYPTION_KEY.
 *
 * Formato output: base64(iv:12 + tag:16 + ciphertext).
 *
 * Usato per cifrare i cookie di sessione dei portali terzi (LinkedIn,
 * InfoJobs, Indeed) prima di salvarli in DB. La chiave NON deve essere
 * committata — in produzione va su Vercel env e ruota annualmente.
 *
 * Sprint 4 MVP: chiave derivata via SHA-256 dal secret per semplicità.
 * Sprint 5: passare a KMS (AWS KMS / Google Cloud KMS / Supabase Vault).
 */

const ALGO = "aes-256-gcm";
const IV_LEN = 12;
const TAG_LEN = 16;

function getKey(): Buffer {
  const secret = process.env.APP_ENCRYPTION_KEY;
  if (!secret || secret.length < 32) {
    throw new Error(
      "APP_ENCRYPTION_KEY mancante o troppo corta (min 32 char). " +
        "Aggiungila a .env.local — vedi .env.example.",
    );
  }
  return createHash("sha256").update(secret).digest();
}

export function encryptString(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

export function decryptString(encoded: string): string {
  const key = getKey();
  const buf = Buffer.from(encoded, "base64");
  if (buf.length < IV_LEN + TAG_LEN) {
    throw new Error("Ciphertext troppo corto o corrotto.");
  }
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const ciphertext = buf.subarray(IV_LEN + TAG_LEN);
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);
  return plaintext.toString("utf8");
}

export function encryptJson<T>(value: T): string {
  return encryptString(JSON.stringify(value));
}

export function decryptJson<T>(encoded: string): T {
  return JSON.parse(decryptString(encoded)) as T;
}
