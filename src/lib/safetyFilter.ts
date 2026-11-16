/**
 * SAFETY FILTER — the PII Safety Shield (pure functions, no database)
 * ===================================================================
 * Masks contact details (phone numbers, emails, UPI IDs, social handles, chat
 * links) in early chat so nobody is pushed off-platform before trust exists.
 *
 * IMPORTANT: masking runs on the SERVER before a message is stored. The original
 * text is never saved, so it cannot leak later.
 *
 * Honest limitation: regular expressions are a first line of defence, not a
 * perfect one. A determined person can still find a way around them, which is
 * why reporting and blocking also exist.
 *
 * Reads from src/config/businessRules.ts:
 *   SAFETY_RULES.maskPiiInEarlyChat, messagesRequiredToUnmaskPII, requireCoOpCompleteToUnmask
 * Reads from src/config/brand.ts: APP_NAME (used in the replacement text)
 */
import { APP_NAME } from "@/config/brand";
import { BUSINESS_RULES, type BusinessRules } from "@/config/businessRules";

export type PiiKind = "link" | "email" | "upi" | "phone" | "handle" | "social";

/** Words people use to spell out a phone number. */
const NUMBER_WORDS = "zero|oh|one|two|three|four|five|six|seven|eight|nine|double|triple";

/**
 * PII PATTERNS — checked in this order (order matters: emails before UPI IDs
 * before bare @handles, because they all contain "@").
 *
 * To ADD A PATTERN: add one object to this array with a `kind` (add the new
 * kind to PiiKind above), a short `label` for the UI, and a global (`g`) regex.
 * Then add a test row to src/lib/safetyFilter.test.ts.
 */
export const PII_PATTERNS: { kind: PiiKind; label: string; regex: RegExp }[] = [
  {
    // wa.me/9198..., t.me/name, instagram.com/name, linkedin.com/in/name (with or without https://www.)
    kind: "link",
    label: "contact link",
    regex: /(?:https?:\/\/)?(?:www\.)?(?:wa\.me|t\.me|instagram\.com|linkedin\.com|chat\.whatsapp\.com)\/[^\s]*/gi,
  },
  {
    // name@gmail.com
    kind: "email",
    label: "email address",
    regex: /[\w.+-]+@[\w-]+(?:\.[\w-]+)*\.[a-z]{2,}/gi,
  },
  {
    // "name at gmail dot com", "name (at) gmail (dot) com", "name[at]gmail[dot]com"
    kind: "email",
    label: "email address",
    regex: /[\w.+-]+\s*(?:\(at\)|\[at\]|\s+at\s+)\s*[\w-]+\s*(?:\(dot\)|\[dot\]|\s+dot\s+)\s*(?:com|in|co|org|net|io|me)\b/gi,
  },
  {
    // UPI IDs: name@okhdfc, name@ybl, 9876543210@paytm (an "@" followed by a bank handle with no ".com")
    kind: "upi",
    label: "UPI ID",
    regex: /[\w.-]{2,}@[a-z]{2,}\b/gi,
  },
  {
    // "insta: name", "ig - name", "snap = name", "telegram: @name", "my insta id is name"
    kind: "social",
    label: "social handle",
    regex: /\b(?:insta(?:gram)?|ig|snap(?:chat)?|telegram|tg|whatsapp)\s*(?:(?:id|handle|username)\s*(?:is\s+|[:=-]\s*)|[:=-]\s*)@?[\w.]{3,}/gi,
  },
  {
    // @handle at the start of a word
    kind: "handle",
    label: "@handle",
    regex: /(?<![\w@.])@[a-z_][\w.]{2,}/gi,
  },
  {
    // Indian mobile numbers: 10 digits starting 6–9, optional +91 / 91 / 0 prefix,
    // digits may be separated by single spaces, dashes or dots.
    // The look-behind / look-ahead stop it firing inside longer numbers and prices (₹35,000.50).
    kind: "phone",
    label: "phone number",
    regex: /(?<![\d₹])(?<!\d[.,])(?:\+?91[\s.-]?|0)?[6-9](?:[\s.-]?\d){9}(?!\d|[.,]\d)/g,
  },
  {
    // Digits written as words: eight or more number words in a row ("nine eight seven six ...")
    kind: "phone",
    label: "phone number",
    regex: new RegExp(`\\b(?:(?:${NUMBER_WORDS})[\\s,-]+){7,}(?:${NUMBER_WORDS})\\b`, "gi"),
  },
];

export type MaskContext = {
  /** Messages already exchanged in this chat (both people combined), not counting the one being sent. */
  totalMessages: number;
  /** Whether both people have completed the Co-Op. */
  coOpComplete: boolean;
};

export type MaskResult = {
  /** The text to store and display. */
  text: string;
  /** True if anything was replaced. */
  masked: boolean;
  /** Labels of what was hidden, e.g. ["phone number", "UPI ID"]. */
  reasons: string[];
};

/**
 * Whether the shield is currently active for a chat.
 *
 * Reads: maskPiiInEarlyChat, requireCoOpCompleteToUnmask, messagesRequiredToUnmaskPII.
 * Contact details are allowed only when (Co-Op complete, if required) AND enough messages exist.
 */
export function isShieldActive(ctx: MaskContext, rules: BusinessRules = BUSINESS_RULES): boolean {
  const s = rules.safety;
  if (!s.maskPiiInEarlyChat) return false;
  const coOpOk = !s.requireCoOpCompleteToUnmask || ctx.coOpComplete;
  const enoughMessages = ctx.totalMessages >= s.messagesRequiredToUnmaskPII;
  return !(coOpOk && enoughMessages);
}

/**
 * The text that replaces a hidden contact detail.
 * Reads: APP_NAME and messagesRequiredToUnmaskPII, so renaming the app or
 * changing the threshold updates this text everywhere.
 */
export function shieldReplacementText(rules: BusinessRules = BUSINESS_RULES): string {
  return `[🔒 Hidden by ${APP_NAME} Safety Shield until ${rules.safety.messagesRequiredToUnmaskPII} messages exchanged]`;
}

/**
 * Replaces every contact detail in `text`, regardless of chat state.
 * Used directly for text that must NEVER contain contact details (profile thesis, Co-Op reasons).
 *
 * @returns `{ text, masked, reasons }`.
 */
export function maskAllPii(text: string, rules: BusinessRules = BUSINESS_RULES): MaskResult {
  const replacement = shieldReplacementText(rules);
  const reasons: string[] = [];
  let result = text;
  for (const pattern of PII_PATTERNS) {
    result = result.replace(pattern.regex, () => {
      if (!reasons.includes(pattern.label)) reasons.push(pattern.label);
      return replacement;
    });
  }
  return { text: result, masked: reasons.length > 0, reasons };
}

/**
 * Masks contact details in a chat message unless the shield has lifted.
 *
 * @param text The raw message typed by the user.
 * @param ctx `{ totalMessages, coOpComplete }` for the chat.
 * @param rules Business rules (injectable for tests).
 * @returns `{ text, masked, reasons }`. If the shield has lifted, the text is returned unchanged.
 *
 * Example: maskPii("call 98765 43210", { totalMessages: 2, coOpComplete: true })
 *          -> "call [🔒 Hidden by Veritas Safety Shield until 6 messages exchanged]"
 */
export function maskPii(text: string, ctx: MaskContext, rules: BusinessRules = BUSINESS_RULES): MaskResult {
  if (!isShieldActive(ctx, rules)) return { text, masked: false, reasons: [] };
  return maskAllPii(text, rules);
}
