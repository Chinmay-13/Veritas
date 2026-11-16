import { describe, expect, it } from "vitest";
import { APP_NAME } from "@/config/brand";
import { BUSINESS_RULES, type BusinessRules } from "@/config/businessRules";
import { isShieldActive, maskAllPii, maskPii, shieldReplacementText } from "./safetyFilter";

const EARLY = { totalMessages: 0, coOpComplete: true };
const N = BUSINESS_RULES.safety.messagesRequiredToUnmaskPII;

/** Text that MUST be masked, with the label we expect in `reasons`. */
const SHOULD_MASK: [string, string][] = [
  ["call me on 9876543210", "phone number"],
  ["my number is +91 98765 43210", "phone number"],
  ["+91-9876543210 works after 7", "phone number"],
  ["ping 09876543210", "phone number"],
  ["98765-43210", "phone number"],
  ["9 8 7 6 5 4 3 2 1 0", "phone number"],
  ["98.76.54.32.10 is me", "phone number"],
  ["919876543210", "phone number"],
  ["its nine eight seven six five four three two one zero", "phone number"],
  ["Nine-Eight-Seven-Six-Five-Four-Three-Two-One-Zero", "phone number"],
  ["nine eight double seven six five four three two one", "phone number"],
  ["mail me at arjun.k@gmail.com", "email address"],
  ["ARJUN_22@outlook.co.in please", "email address"],
  ["arjun at gmail dot com", "email address"],
  ["arjun (at) gmail (dot) com", "email address"],
  ["arjun[at]yahoo[dot]in", "email address"],
  ["gpay me at arjun@okhdfc", "UPI ID"],
  ["arjun22@ybl", "UPI ID"],
  ["9876543210@paytm", "UPI ID"],
  ["find me @arjun_codes", "@handle"],
  ["@meera.designs on most apps", "@handle"],
  ["insta: arjun.codes", "social handle"],
  ["ig - arjun_22", "social handle"],
  ["my snap id is arjunk", "social handle"],
  ["telegram: @arjunk", "social handle"],
  ["Instagram handle: arjun.k", "social handle"],
  ["wa.me/919876543210", "contact link"],
  ["https://t.me/arjunk", "contact link"],
  ["www.instagram.com/arjun.codes", "contact link"],
  ["https://www.linkedin.com/in/arjun-k-123", "contact link"],
];

/** Ordinary text that must NOT be touched (false-positive guard). */
const SHOULD_NOT_MASK: string[] = [
  "We have 4 days off and ₹35,000 to spend",
  "My rent is ₹18,500 and I save 40% of my salary",
  "Let's talk at 7:30 pm on 12-05-2026",
  "I joined in 2022 and moved in 2023",
  "My CTC went from 6.5 LPA to 11 LPA",
  "I ran 10 km in 55 minutes on Sunday",
  "Flat 902, 7th floor, near the ORR",
  "one two three, testing",
  "I can meet at Third Wave around 5",
  "Budget is 35000 for the trip and 1200 for dinner",
  "I scored 96.4 percentile in the pH test",
  "ping me at 5 or after work",
  "I love Instagram reels about cooking",
  "The order number was 12345678",
  "Sent 3 emails and 2 follow-ups today",
];

describe("maskAllPii: positive cases", () => {
  it.each(SHOULD_MASK)("masks %j as %s", (input, reason) => {
    const result = maskAllPii(input);
    expect(result.masked).toBe(true);
    expect(result.reasons).toContain(reason);
    expect(result.text).toContain(shieldReplacementText());
  });

  it("removes every digit of a phone number", () => {
    expect(maskAllPii("call 98765 43210 now").text).toBe(`call ${shieldReplacementText()} now`);
  });

  it("masks several different details in one message", () => {
    const result = maskAllPii("9876543210 or arjun@okaxis or @arjunk");
    expect(result.reasons).toEqual(expect.arrayContaining(["phone number", "UPI ID", "@handle"]));
    expect(result.text).not.toMatch(/9876543210|okaxis|arjunk/);
  });
});

describe("maskAllPii: negative cases (no false positives)", () => {
  it.each(SHOULD_NOT_MASK)("leaves %j untouched", (input) => {
    expect(maskAllPii(input)).toEqual({ text: input, masked: false, reasons: [] });
  });
});

describe("shield state", () => {
  it("is active before the message threshold and lifts at it", () => {
    expect(isShieldActive({ totalMessages: N - 1, coOpComplete: true })).toBe(true);
    expect(isShieldActive({ totalMessages: N, coOpComplete: true })).toBe(false);
  });
  it("stays active until the Co-Op is complete, whatever the message count", () => {
    expect(isShieldActive({ totalMessages: 999, coOpComplete: false })).toBe(true);
  });
  it("can ignore the Co-Op requirement when configured", () => {
    const rules: BusinessRules = structuredClone(BUSINESS_RULES);
    rules.safety.requireCoOpCompleteToUnmask = false;
    expect(isShieldActive({ totalMessages: N, coOpComplete: false }, rules)).toBe(false);
  });
  it("can be switched off entirely", () => {
    const rules: BusinessRules = structuredClone(BUSINESS_RULES);
    rules.safety.maskPiiInEarlyChat = false;
    expect(maskPii("9876543210", EARLY, rules).masked).toBe(false);
  });
});

describe("maskPii", () => {
  it("masks before the threshold and stops masking after it", () => {
    expect(maskPii("9876543210", { totalMessages: N - 1, coOpComplete: true }).masked).toBe(true);
    expect(maskPii("9876543210", { totalMessages: N, coOpComplete: true })).toEqual({ text: "9876543210", masked: false, reasons: [] });
  });
  it("builds the replacement text from config and the app name", () => {
    expect(shieldReplacementText()).toBe(`[🔒 Hidden by ${APP_NAME} Safety Shield until ${N} messages exchanged]`);
    const rules: BusinessRules = structuredClone(BUSINESS_RULES);
    rules.safety.messagesRequiredToUnmaskPII = 10;
    expect(maskPii("9876543210", EARLY, rules).text).toContain("until 10 messages exchanged");
    expect(maskPii("9876543210", { totalMessages: 8, coOpComplete: true }, rules).masked).toBe(true);
  });
});
