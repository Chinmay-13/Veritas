/**
 * FIXED COPY LISTS
 * Honest Closure templates and report reasons. Safe to edit the text;
 * keep the `id`s stable because they are stored with reports.
 */

/** Polite, pre-written closing notes. "custom" lets the user write their own. */
export const CLOSURE_TEMPLATES = [
  { id: "no-fit", text: "I enjoyed talking, but I don't see a long-term fit. Wishing you the best." },
  { id: "priorities", text: "My priorities have shifted and I can't give this the attention it deserves. Thank you for your time." },
  { id: "timing", text: "The timing isn't right for me. I'd rather say so now than go quiet." },
  { id: "custom", text: "Write my own note" },
] as const;

/** Reasons offered in the Block & Report modal. */
export const REPORT_REASONS = [
  { id: "harassment", label: "Harassment or abusive language" },
  { id: "off-platform", label: "Pressuring me to move off-platform or share contact details" },
  { id: "fake", label: "Fake profile or misrepresentation" },
  { id: "money", label: "Asking for money or financial details" },
  { id: "uncomfortable", label: "Made me uncomfortable" },
  { id: "other", label: "Something else" },
] as const;

/** @returns The label for a report reason id. */
export function reportReasonLabel(reasonId: string): string {
  return REPORT_REASONS.find((r) => r.id === reasonId)?.label ?? reasonId;
}
