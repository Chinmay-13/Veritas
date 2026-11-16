/**
 * PAYMENTS — behind one small interface so the provider can be swapped.
 * ====================================================================
 * This demo ships ONLY the DemoPaymentProvider: no real money moves, no card
 * details are requested or stored. To go live with Razorpay (test mode first):
 *   1. Write `class RazorpayProvider implements PaymentProvider` that creates an
 *      order with the Razorpay API and verifies the payment signature.
 *   2. Return it from getPaymentProvider() when the Razorpay keys are present.
 * Nothing in src/server/store.ts would need to change.
 */

export type ChargeRequest = { userId: string; amountInr: number; description: string };
export type ChargeResult = { ok: true; reference: string } | { ok: false; error: string };

export interface PaymentProvider {
  /** Short name stored on the order row, e.g. "demo". */
  readonly name: string;
  /** Whether real money moves. Shown in the UI. */
  readonly isSimulated: boolean;
  /** Takes payment. Must resolve with a provider reference or a user-safe error. */
  charge(request: ChargeRequest): Promise<ChargeResult>;
}

/** SIMULATED provider: always succeeds and returns a fake reference. */
export class DemoPaymentProvider implements PaymentProvider {
  readonly name = "demo";
  readonly isSimulated = true;
  async charge(request: ChargeRequest): Promise<ChargeResult> {
    if (request.amountInr <= 0) return { ok: false, error: "Invalid amount." };
    return { ok: true, reference: `demo_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}` };
  }
}

/** @returns The payment provider in use. Only the demo provider exists in this build. */
export function getPaymentProvider(): PaymentProvider {
  return new DemoPaymentProvider();
}
