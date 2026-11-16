"use server";
/** STORE SERVER ACTIONS: session check -> validation -> src/server/store.ts. Payments are simulated. */
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { fail, success, type ActionState } from "@/lib/actionState";
import { requireMember } from "@/server/auth";
import { bookMixer, purchaseCohortPass, purchaseTopUp } from "@/server/store";

const checkoutSchema = z.object({
  product: z.enum(["cohort_pass", "mixer_seat", "credit_topup"]),
  hub: z.string().max(40).optional(),
  mixerId: z.string().max(40).optional(),
});

/** Demo checkout for any of the three products. */
export async function checkoutAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireMember();
  const parsed = checkoutSchema.safeParse({
    product: formData.get("product"),
    hub: formData.get("hub") ? String(formData.get("hub")) : undefined,
    mixerId: formData.get("mixerId") ? String(formData.get("mixerId")) : undefined,
  });
  if (!parsed.success) return fail("That product is not available.");

  const { product, hub, mixerId } = parsed.data;
  const result =
    product === "cohort_pass" ? await purchaseCohortPass(user, hub ?? "") : product === "mixer_seat" ? await bookMixer(user, mixerId ?? "") : await purchaseTopUp(user);
  if (!result.ok) return fail(result.error);
  revalidatePath("/", "layout");
  return success(result.message);
}
