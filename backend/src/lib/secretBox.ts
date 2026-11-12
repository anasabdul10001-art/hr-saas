import crypto from "crypto";

// Secrets kept in the database (the accounting link's signing secret) are encrypted with AES-256-GCM.
export function secretBoxConfigured(): boolean {
  return (process.env.ACCOUNTING_LINK_ENCRYPTION_KEY ?? "").length >= 16;
}

function key(): Buffer {
  const secret = process.env.ACCOUNTING_LINK_ENCRYPTION_KEY;
  if (!secret || secret.length < 16) throw new Error("ACCOUNTING_LINK_ENCRYPTION_KEY must be set (16+ characters)");
  // hashed to a fixed 32-byte key, so any long random string works
  return crypto.createHash("sha256").update(secret).digest();
}

export function encryptSecret(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), enc].map((b) => b.toString("base64")).join(".");
}

export function decryptSecret(payload: string): string {
  const [iv, tag, enc] = payload.split(".").map((p) => Buffer.from(p, "base64"));
  const decipher = crypto.createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
}
