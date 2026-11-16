"use client";
import { startTransition, useActionState, type FormEvent } from "react";
import type { ActionState } from "@/lib/actionState";

/**
 * Connects a <form> to a server action.
 *
 * Why not just <form action={...}>? React clears every field after a form action
 * finishes, so a validation error would wipe what the user typed. Submitting through
 * onSubmit keeps the fields as they are.
 *
 * Usage:
 *   const form = useServerForm(someAction);
 *   <form onSubmit={form.onSubmit}> ... <FormMessage state={form.state} /> <SubmitButton pending={form.pending} />
 */
export function useServerForm(serverAction: (previous: ActionState, formData: FormData) => Promise<ActionState>) {
  const [state, dispatch, pending] = useActionState(serverAction, null);
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => dispatch(formData));
  };
  return { state, onSubmit, pending };
}
