/**
 * INPUT VALIDATION (zod)
 * Every server action and API route parses its input with one of these schemas
 * before doing anything. Nothing from the browser is trusted.
 */
import { z } from "zod";
import { COOP_REASON_MAX_LENGTH, COOP_SCENARIOS } from "@/data/coopScenarios";
import { DIMENSIONS, GENDER_IDS, HUB_IDS, INTERESTED_IN_IDS, ROLE_FAMILY_IDS } from "@/data/nonNegotiables";

export const emailSchema = z.email("Enter a valid email address.").max(200);
export const passwordSchema = z.string().min(8, "Password must be at least 8 characters.").max(100);
export const uuidSchema = z.uuid("Invalid id.");

export const credentialsSchema = z.object({ email: emailSchema, password: passwordSchema });

export const consentSchema = z.object({
  birthYear: z.coerce.number("Enter your birth year.").int().min(1900, "Enter a valid birth year.").max(2100, "Enter a valid birth year."),
  matching: z.literal("on", "Consent to matching is required to use the product."),
  adult: z.literal("on", "Please confirm you are 18 or older."),
  marketing: z.boolean(),
  badge: z.boolean(),
});

export const verificationSchema = z.object({
  elitmusId: z.string().trim().regex(/^ELM-\d{4}-\d{6}$/i, "eLitmus IDs look like ELM-2022-483920."),
  workEmail: emailSchema,
});

export const otpSchema = z.object({ otp: z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code.") });

export const profileSchema = z.object({
  firstName: z.string().trim().min(2, "Enter your first name.").max(40).regex(/^[\p{L} .'-]+$/u, "Use letters only for your first name."),
  hub: z.enum(HUB_IDS, "Choose a metro hub."),
  roleFamily: z.enum(ROLE_FAMILY_IDS, "Choose a role family."),
  gender: z.enum(GENDER_IDS, "Choose a gender."),
  interestedIn: z.enum(INTERESTED_IN_IDS, "Choose who you are interested in."),
  thesis: z.string().trim().min(30, "Write at least 30 characters about what you are looking for.").max(400, "Keep it under 400 characters."),
  showPercentile: z.boolean(),
  referralCode: z.string().trim().max(20).optional(),
});

/** Builds the non-negotiables object from form fields named `<dimension>` and `<dimension>_must`. */
export function parseNonNegotiables(formData: FormData) {
  const shape = Object.fromEntries(
    DIMENSIONS.map((d) => [
      d.key,
      z.object({
        value: z.enum(d.options.map((o) => o.id) as [string, ...string[]], `Choose an option for ${d.label}.`),
        mustMatch: z.boolean(),
      }),
    ]),
  );
  const raw = Object.fromEntries(DIMENSIONS.map((d) => [d.key, { value: formData.get(d.key), mustMatch: formData.get(`${d.key}_must`) === "must" }]));
  return z.object(shape).safeParse(raw);
}

/** Co-Op answers: one option per scenario, optional short reason. */
export function parseCoOpAnswers(formData: FormData) {
  const schema = z.array(
    z.object({
      scenarioId: z.string(),
      optionId: z.string().min(1, "Choose an option for every scenario."),
      reason: z.string().trim().max(COOP_REASON_MAX_LENGTH, `Reasons can be at most ${COOP_REASON_MAX_LENGTH} characters.`),
    }),
  );
  const raw = COOP_SCENARIOS.map((s) => ({ scenarioId: s.id, optionId: String(formData.get(`option_${s.id}`) ?? ""), reason: String(formData.get(`reason_${s.id}`) ?? "") }));
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return parsed;
  // Every chosen option must actually exist in its scenario.
  for (const answer of parsed.data) {
    const scenario = COOP_SCENARIOS.find((s) => s.id === answer.scenarioId);
    if (!scenario?.options.some((o) => o.id === answer.optionId)) {
      return { success: false as const, error: { issues: [{ message: "Choose an option for every scenario." }] } };
    }
  }
  return parsed;
}

export const messageSchema = z.object({ matchId: uuidSchema, body: z.string().trim().min(1, "Write a message first.").max(1000, "Messages can be at most 1000 characters.") });

export const closureSchema = z.object({ matchId: uuidSchema, template: z.string().min(1).max(40), note: z.string().trim().max(300, "Keep the note under 300 characters.") });

export const reportSchema = z.object({
  matchId: uuidSchema,
  reason: z.string().min(1, "Choose a reason.").max(40),
  details: z.string().trim().max(1000, "Keep the details under 1000 characters."),
});
