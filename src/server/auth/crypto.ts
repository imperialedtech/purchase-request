import { createHmac, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { sessionSecret } from "../env";

export function newToken(): string {
  return randomBytes(32).toString("base64url");
}

function secret() {
  const s = sessionSecret();
  if (!s || s.length < 32) throw new Error("SESSION_SECRET (or a linked Supabase store) must be set (min 32 characters)");
  return s;
}

/** Only keyed hashes of session/invite tokens are stored, so a database leak cannot be replayed. */
export function hashToken(token: string): string {
  return createHmac("sha256", secret()).update(token).digest("hex");
}

const BCRYPT_COST = process.env.NODE_ENV === "test" ? 4 : 12;
let dummyHash: string | null = null;

export async function hashPassword(pw: string) {
  return bcrypt.hash(pw, BCRYPT_COST);
}

export async function verifyPassword(pw: string, hash: string | null | undefined) {
  if (!hash) {
    // Spend comparable time when the account has no password, to avoid user enumeration by timing
    dummyHash ??= await bcrypt.hash("unused-dummy-password", BCRYPT_COST);
    await bcrypt.compare(pw, dummyHash);
    return false;
  }
  return bcrypt.compare(pw, hash);
}
