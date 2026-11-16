/**
 * AUTH (server only)
 * Sign-up, login, the session cookie, and the `require...()` guards every page
 * and server action calls first. The client is never trusted: identity always
 * comes from the signed cookie.
 */
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { db } from "@/db/client";
import { users, type User } from "@/db/schema";
import { SESSION_COOKIE_NAME, SESSION_MAX_AGE_SECONDS, createSessionToken, verifySessionToken } from "@/lib/session";
import { getUserById, logEvent } from "./users";

/** Sets the httpOnly session cookie for a user. */
export async function startSession(userId: string): Promise<void> {
  const token = await createSessionToken(userId);
  (await cookies()).set(SESSION_COOKIE_NAME, token, {
    httpOnly: true, // JavaScript in the browser cannot read it
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

/** Deletes the session cookie. */
export async function endSession(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE_NAME);
}

/**
 * The logged-in user, or null. Wrapped in React `cache` so the navbar and the
 * page share one database lookup per request.
 */
export const getCurrentUser = cache(async (): Promise<User | null> => {
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  const userId = await verifySessionToken(token);
  if (!userId) return null;
  return getUserById(userId);
});

/** Guard: any logged-in user. Redirects to /login otherwise. */
export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** Guard: a consumer with a finished profile. Admins go to /admin, unfinished sign-ups to /signup. */
export async function requireMember(): Promise<User> {
  const user = await requireUser();
  if (user.role === "admin") redirect("/admin");
  if (!user.profileCompletedAt) redirect("/signup");
  return user;
}

/** Guard: admin only. */
export async function requireAdmin(): Promise<User> {
  const user = await requireUser();
  if (user.role !== "admin") redirect("/discover");
  return user;
}

/** Generates a short, readable referral code such as "VR-7K2M9Q". */
function newReferralCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I to avoid confusion
  let code = "";
  for (let i = 0; i < 6; i++) code += alphabet[Math.floor(Math.random() * alphabet.length)];
  return `VR-${code}`;
}

/**
 * Creates an account (step 1 of sign-up).
 * @returns `{ ok: true, userId }` or `{ ok: false, error }`.
 */
export async function createAccount(email: string, password: string): Promise<{ ok: true; userId: string } | { ok: false; error: string }> {
  const normalisedEmail = email.trim().toLowerCase();
  const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, normalisedEmail)).limit(1);
  if (existing.length > 0) return { ok: false, error: "An account with this email already exists. Try logging in." };

  const passwordHash = await bcrypt.hash(password, 10);
  const rows = await db.insert(users).values({ email: normalisedEmail, passwordHash, referralCode: newReferralCode() }).returning({ id: users.id });
  await logEvent(db, rows[0].id, "signup");
  return { ok: true, userId: rows[0].id };
}

/**
 * Checks an email + password.
 * @returns The user, or null if the credentials are wrong (the caller shows one generic error).
 */
export async function verifyCredentials(email: string, password: string): Promise<User | null> {
  const rows = await db.select().from(users).where(eq(users.email, email.trim().toLowerCase())).limit(1);
  const user = rows[0];
  if (!user) return null;
  return (await bcrypt.compare(password, user.passwordHash)) ? user : null;
}
