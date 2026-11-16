/**
 * SESSION TOKENS
 * A session is a signed JWT (HS256, via `jose`) stored in an httpOnly cookie.
 * The token only contains the user id; everything else is loaded from the database.
 */
import { createHmac } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE_NAME = "veritas_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 days

/** @returns The signing secret from SESSION_SECRET (throws a clear error if missing or too short). */
function getSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("SESSION_SECRET is missing or shorter than 32 characters. Set it in .env (see .env.example).");
  }
  return secret;
}

/**
 * Creates a signed session token for a user.
 * @param userId The user's id.
 * @returns A JWT string valid for SESSION_MAX_AGE_SECONDS.
 */
export async function createSessionToken(userId: string): Promise<string> {
  return new SignJWT({ uid: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE_SECONDS}s`)
    .sign(new TextEncoder().encode(getSecret()));
}

/**
 * Verifies a session token.
 * @param token The cookie value.
 * @returns The user id, or null if the token is missing, expired or tampered with.
 */
export async function verifySessionToken(token: string | undefined): Promise<string | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(getSecret()), { algorithms: ["HS256"] });
    return typeof payload.uid === "string" ? payload.uid : null;
  } catch {
    return null;
  }
}

/**
 * SIMULATED OTP for the demo work-email step. Deterministic per user + eLitmus ID,
 * so no OTP needs to be stored. A real launch would send a random code by email.
 * @returns A 6-digit code as a string.
 */
export function demoOtpFor(userId: string, elitmusId: string): string {
  const digest = createHmac("sha256", getSecret()).update(`${userId}:${elitmusId}`).digest();
  return String(digest.readUInt32BE(0) % 1_000_000).padStart(6, "0");
}
