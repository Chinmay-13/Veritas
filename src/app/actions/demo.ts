"use server";
/**
 * DEMO TOOLS (only work when DEMO_SETTINGS.demoMode is on)
 */
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { DEMO_SETTINGS } from "@/config/businessRules";
import { resetDemoData } from "@/db/seed";
import { requireMember, requireUser } from "@/server/auth";
import { fastForwardOpenMatches } from "@/server/matches";

/** "Reset Demo Data": restores the seeded demo accounts. Never touches real sign-ups. */
export async function resetDemoAction(): Promise<void> {
  const user = await requireUser();
  if (!DEMO_SETTINGS.demoMode) redirect("/");
  await resetDemoData();
  revalidatePath("/", "layout");
  redirect(user.role === "admin" ? "/admin?reset=1" : "/discover?reset=1");
}

/**
 * "Fast-forward": shifts the timestamps of the current user's open matches back by
 * chatWindowHours + 1 hours, then runs settlement, so ghosting can be seen live.
 */
export async function fastForwardAction(): Promise<void> {
  const user = await requireMember();
  if (!DEMO_SETTINGS.demoMode || !DEMO_SETTINGS.demoTimeTravelEnabled) redirect("/");
  const settled = await fastForwardOpenMatches(user.id);
  revalidatePath("/", "layout");
  redirect(`/wallet?fastforward=${settled}`);
}
