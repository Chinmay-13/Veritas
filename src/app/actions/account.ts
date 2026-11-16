"use server";
/** SAFETY CENTER + ADMIN SERVER ACTIONS. */
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { fail, success, type ActionState } from "@/lib/actionState";
import { uuidSchema } from "@/lib/validation";
import { deleteAccount, updateConsents } from "@/server/account";
import { resolveReport } from "@/server/admin";
import { endSession, requireAdmin, requireMember } from "@/server/auth";

/** Consent management: every consent can be changed at any time. */
export async function consentsAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireMember();
  const matching = formData.get("matching") === "on";
  await updateConsents(user, { matching, marketing: formData.get("marketing") === "on", badge: formData.get("badge") === "on" });
  revalidatePath("/", "layout");
  return success(matching ? "Consent preferences saved." : "Saved. You have withdrawn consent to matching, so you are now hidden from everyone until you turn it back on.");
}

/** Delete my account: requires typing DELETE, then hard-deletes and logs out. */
export async function deleteAccountAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireMember();
  if (String(formData.get("confirm") ?? "").trim() !== "DELETE") return fail("Type DELETE in capitals to confirm.");
  const result = await deleteAccount(user);
  if (!result.ok) return fail(result.error);
  await endSession();
  redirect("/?deleted=1");
}

const reportActionSchema = z.object({ reportId: uuidSchema, action: z.enum(["dismiss", "warn", "suspend", "reinstate"]) });

/** Admin: resolve a report (Dismiss / Warn / Suspend / Reinstate). */
export async function resolveReportAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const parsed = reportActionSchema.safeParse({ reportId: formData.get("reportId"), action: formData.get("action") });
  if (parsed.success) await resolveReport(parsed.data.reportId, parsed.data.action);
  revalidatePath("/", "layout");
}
