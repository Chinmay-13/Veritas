"use server";
/**
 * DEMO TOOLS (only work when DEMO_SETTINGS.demoMode is on)
 */
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { DEMO_SETTINGS } from "@/config/businessRules";
import { resetDemoData } from "@/db/seed";
import { requireUser } from "@/server/auth";

/** "Reset Demo Data": restores the seeded demo accounts. Never touches real sign-ups. */
export async function resetDemoAction(): Promise<void> {
  const user = await requireUser();
  if (!DEMO_SETTINGS.demoMode) redirect("/");
  await resetDemoData();
  revalidatePath("/", "layout");
  redirect(user.role === "admin" ? "/admin?reset=1" : "/discover?reset=1");
}
