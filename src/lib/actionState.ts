/**
 * The value every form server action returns (used with React's useActionState).
 * `null` means "nothing submitted yet".
 */
export type ActionState = { ok: boolean; message: string } | null;

/** Shorthand for a failed action. */
export const fail = (message: string): ActionState => ({ ok: false, message });

/** Shorthand for a successful action. */
export const success = (message: string): ActionState => ({ ok: true, message });

/** Turns a zod error into one readable sentence for the form. */
export function firstZodIssue(error: { issues: { message: string }[] }): string {
  return error.issues[0]?.message ?? "Please check the form and try again.";
}
