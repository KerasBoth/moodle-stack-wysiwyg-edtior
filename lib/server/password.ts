// Passwort-Hashing mit scrypt (node:crypto), Format: scrypt$N$salt$hash (base64url).

import { randomBytes, scryptSync, timingSafeEqual, createHash } from "node:crypto";

const N = 16384;
const KEYLEN = 64;

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, KEYLEN, { N, r: 8, p: 1 });
  return `scrypt$${N}$${salt.toString("base64url")}$${hash.toString("base64url")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [algo, n, salt, hash] = stored.split("$");
  if (algo !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64url");
  const actual = scryptSync(password, Buffer.from(salt, "base64url"), expected.length, { N: Number(n), r: 8, p: 1 });
  return timingSafeEqual(actual, expected);
}

/** Zufälliges Sitzungstoken (für das Cookie) und sein Hash (für die Datenbank). */
export function newSessionToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashToken(token) };
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
