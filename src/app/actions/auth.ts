"use server";
/**
 * AUTH + SIGN-UP SERVER ACTIONS
 * Thin wrappers: validate input (zod) -> check the session -> call src/server -> redirect.
 */
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { DEMO_SETTINGS } from "@/config/businessRules";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { fail, firstZodIssue, success, type ActionState } from "@/lib/actionState";
import { RATE_LIMITS, rateLimit } from "@/lib/rateLimit";
import { consentSchema, credentialsSchema, otpSchema, parseNonNegotiables, profileSchema, verificationSchema } from "@/lib/validation";
import { createAccount, endSession, requireUser, startSession, verifyCredentials } from "@/server/auth";
import { cancelVerification, confirmVerification, saveConsent, saveNonNegotiables, saveProfile, startVerification } from "@/server/onboarding";

/** Step 1 of sign-up: create the account and log in. */
export async function signupAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = credentialsSchema.safeParse({ email: formData.get("email"), password: formData.get("password") });
  if (!parsed.success) return fail(firstZodIssue(parsed.error));

  const result = await createAccount(parsed.data.email, parsed.data.password);
  if (!result.ok) return fail(result.error);
  await startSession(result.userId);
  redirect("/signup");
}

/** Email + password login. */
export async function loginAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = credentialsSchema.safeParse({ email: formData.get("email"), password: formData.get("password") });
  if (!parsed.success) return fail("Enter your email and password.");

  const limit = rateLimit(`login:${parsed.data.email.toLowerCase()}`, RATE_LIMITS.login.limit, RATE_LIMITS.login.windowMs);
  if (!limit.ok) return fail(`Too many attempts. Try again in ${limit.retryAfterSeconds} seconds.`);

  const user = await verifyCredentials(parsed.data.email, parsed.data.password);
  if (!user) return fail("Email or password is incorrect.");
  await startSession(user.id);
  redirect(user.role === "admin" ? "/admin" : user.profileCompletedAt ? "/discover" : "/signup");
}

/** Logs out. */
export async function logoutAction(): Promise<void> {
  await endSession();
  redirect("/login");
}

/**
 * DEMO ONLY: one-click login as a seeded persona (login pills and navbar switcher).
 * Refuses to run unless DEMO_SETTINGS.demoMode is on, and can only ever log in as a seeded demo account.
 */
export async function demoLoginAction(formData: FormData): Promise<void> {
  if (!DEMO_SETTINGS.demoMode) redirect("/login");
  const key = String(formData.get("persona") ?? "");
  const rows = await db.select().from(users).where(and(eq(users.seedKey, key), eq(users.isDemo, true))).limit(1);
  const user = rows[0];
  if (!user) redirect("/login");
  await startSession(user.id);
  redirect(user.role === "admin" ? "/admin" : "/discover");
}

/** Step 2: consent. */
export async function consentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const parsed = consentSchema.safeParse({
    birthYear: formData.get("birthYear"),
    matching: formData.get("matching"),
    adult: formData.get("adult"),
    marketing: formData.get("marketing") === "on",
    badge: formData.get("badge") === "on",
  });
  if (!parsed.success) return fail(firstZodIssue(parsed.error));
  const result = await saveConsent(user.id, parsed.data);
  if (!result.ok) return fail(result.error);
  redirect("/signup");
}

/** Step 3a (simulated): eLitmus ID + work email. */
export async function verificationAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const parsed = verificationSchema.safeParse({ elitmusId: formData.get("elitmusId"), workEmail: formData.get("workEmail") });
  if (!parsed.success) return fail(firstZodIssue(parsed.error));
  const result = await startVerification(user.id, parsed.data.elitmusId);
  if (!result.ok) return fail(result.error);
  redirect("/signup");
}

/** Step 3b (simulated): OTP. */
export async function otpAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const parsed = otpSchema.safeParse({ otp: formData.get("otp") });
  if (!parsed.success) return fail(firstZodIssue(parsed.error));
  const result = await confirmVerification(user, parsed.data.otp);
  if (!result.ok) return fail(result.error);
  redirect("/signup");
}

/** Step 3b back button: use a different eLitmus ID. */
export async function cancelVerificationAction(): Promise<void> {
  const user = await requireUser();
  await cancelVerification(user.id);
  redirect("/signup");
}

/** Step 4 and the /profile editor: profile details. */
export async function profileAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const parsed = profileSchema.safeParse({
    firstName: formData.get("firstName"),
    hub: formData.get("hub"),
    roleFamily: formData.get("roleFamily"),
    gender: formData.get("gender"),
    interestedIn: formData.get("interestedIn"),
    thesis: formData.get("thesis"),
    showPercentile: formData.get("showPercentile") === "on",
    referralCode: formData.get("referralCode") ? String(formData.get("referralCode")) : undefined,
  });
  if (!parsed.success) return fail(firstZodIssue(parsed.error));
  const result = await saveProfile(user, parsed.data);
  if (!result.ok) return fail(result.error);
  if (!user.profileCompletedAt) redirect("/signup");
  revalidatePath("/", "layout");
  return success("Profile saved.");
}

/** Step 5 and the /profile editor: the four non-negotiables. */
export async function nonNegotiablesAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const parsed = parseNonNegotiables(formData);
  if (!parsed.success) return fail(firstZodIssue(parsed.error));
  await saveNonNegotiables(user, parsed.data as Parameters<typeof saveNonNegotiables>[1]);
  if (!user.profileCompletedAt) redirect("/discover?welcome=1");
  revalidatePath("/", "layout");
  return success("Non-negotiables saved. Your compatibility scores are recalculated.");
}
