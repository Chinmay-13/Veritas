"use server";
/**
 * MATCH SERVER ACTIONS
 * Thin wrappers: check the session -> validate input (zod) -> call src/server/matches.ts.
 * All rules live in the server layer and the engines, never here.
 */
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { fail, firstZodIssue, success, type ActionState } from "@/lib/actionState";
import { closureSchema, messageSchema, parseCoOpAnswers, reportSchema, uuidSchema } from "@/lib/validation";
import { requireMember } from "@/server/auth";
import { blockAndReport, closeMatch, declineInvitation, sendMessage, startCoOp, submitCoOpAnswers } from "@/server/matches";

/** Discover: place the commitment deposit and start a Co-Op. */
export async function startCoOpAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireMember();
  const targetId = uuidSchema.safeParse(formData.get("targetId"));
  if (!targetId.success) return fail("This profile is not available.");
  const result = await startCoOp(user, targetId.data);
  if (!result.ok) return fail(result.error);
  revalidatePath("/", "layout");
  redirect(`/matches/${result.matchId}`);
}

/** Co-Op: submit answers (for an invited person this also places their deposit). */
export async function submitCoOpAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireMember();
  const matchId = uuidSchema.safeParse(formData.get("matchId"));
  if (!matchId.success) return fail("Match not found.");
  const answers = parseCoOpAnswers(formData);
  if (!answers.success) return fail(firstZodIssue(answers.error));
  const result = await submitCoOpAnswers(user, matchId.data, answers.data);
  if (!result.ok) return fail(result.error);
  revalidatePath("/", "layout");
  return success("Answers locked in.");
}

/** Invitation: "not for me". */
export async function declineInvitationAction(formData: FormData): Promise<void> {
  const user = await requireMember();
  const matchId = uuidSchema.safeParse(formData.get("matchId"));
  if (matchId.success) await declineInvitation(user, matchId.data);
  revalidatePath("/", "layout");
  redirect("/matches");
}

/** Chat: send a message. The server masks contact details before storing it. */
export async function sendMessageAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireMember();
  const parsed = messageSchema.safeParse({ matchId: formData.get("matchId"), body: formData.get("body") });
  if (!parsed.success) return fail(firstZodIssue(parsed.error));
  const result = await sendMessage(user, parsed.data.matchId, parsed.data.body);
  if (!result.ok) return fail(result.error);
  revalidatePath(`/matches/${parsed.data.matchId}`);
  return result.masked ? success(`Sent. The Safety Shield hid your ${result.reasons.join(" and ")}.`) : success("Sent.");
}

/** Honest Closure (or an early exit if the Minimum Effort Gate is not met). */
export async function closeMatchAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireMember();
  const parsed = closureSchema.safeParse({ matchId: formData.get("matchId"), template: formData.get("template"), note: formData.get("note") ?? "" });
  if (!parsed.success) return fail(firstZodIssue(parsed.error));
  const result = await closeMatch(user, parsed.data.matchId, parsed.data.template, parsed.data.note);
  if (!result.ok) return fail(result.error);
  revalidatePath("/", "layout");
  const o = result.outcome;
  return success(
    o.respectful
      ? `Closed respectfully. ${o.refund} credits returned plus a ${o.bonus}-credit bonus, and +${o.reliabilityBonus} reliability.`
      : `Closed early. ${o.refund} credits returned minus a ${o.fee}-credit early-exit fee.`,
  );
}

/** Block & Report. */
export async function blockAndReportAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireMember();
  const parsed = reportSchema.safeParse({ matchId: formData.get("matchId"), reason: formData.get("reason"), details: formData.get("details") ?? "" });
  if (!parsed.success) return fail(firstZodIssue(parsed.error));
  const result = await blockAndReport(user, parsed.data.matchId, parsed.data.reason, parsed.data.details);
  if (!result.ok) return fail(result.error);
  revalidatePath("/", "layout");
  redirect("/safety?reported=1#audit-log");
}
