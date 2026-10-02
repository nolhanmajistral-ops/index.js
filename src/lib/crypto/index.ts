import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";

/**
 * Chiffrement AES-256-GCM des données sensibles (tokens OAuth, emails, téléphones).
 * Format : v1:<iv base64>:<tag base64>:<ciphertext base64>
 * Les recherches se font via un index aveugle HMAC-SHA256 (blindIndex), jamais en clair.
 */
const PREFIX = "v1";

function key(): Buffer {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) throw new Error("ENCRYPTION_KEY manquante");
  const buf = Buffer.from(raw, "base64");
  if (buf.length !== 32) throw new Error("ENCRYPTION_KEY doit faire 32 octets (base64)");
  return buf;
}

export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [PREFIX, iv.toString("base64"), tag.toString("base64"), enc.toString("base64")].join(":");
}

export function decrypt(payload: string): string {
  const [prefix, iv, tag, data] = payload.split(":");
  if (prefix !== PREFIX || !iv || !tag || !data) throw new Error("Format chiffré invalide");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString("utf8");
}

export function encryptNullable(v: string | null | undefined): string | null {
  return v ? encrypt(v) : null;
}

export function decryptNullable(v: string | null | undefined): string | null {
  if (!v) return null;
  try {
    return decrypt(v);
  } catch {
    return null;
  }
}

/** Index aveugle déterministe, scopé par utilisateur, pour rechercher sans stocker en clair. */
export function blindIndex(userId: string, value: string): string {
  return createHmac("sha256", key()).update(`${userId}:${value}`).digest("hex");
}

export function sha256Hex(data: Buffer | string): string {
  return createHmac("sha256", "nolhan-os-file").update(data).digest("hex");
}
