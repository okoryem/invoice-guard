import type { ExpectedCheck, PriorPayment, Reason, RealCheck, Verdict, WordingCheck } from "./types";

// Jev's overall scam probability. Above BLOCK the wording alone is enough to stop;
// between the two the owner is asked. Measured on spike/requests*.json.
export const SCAM_BLOCK = 0.8;
export const SCAM_UNSURE = 0.2;
// A flag is shown as a reason once Jev is this sure it applies.
export const FLAG_FIRED = 0.8;
// An amount this many times the largest past payment to a vendor is unusual.
export const UNUSUAL_MULTIPLE = 2;

const PAYABLE = new Set(["SENT", "UNPAID", "PARTIALLY_PAID", "PAYMENT_PENDING"]);

export const FLAG_TEXT: Record<string, string> = {
  impersonation: "Claims to come from a well-known company, bank, or agency",
  sender_mismatch: "The sender's name does not match their email address",
  phone_callback: "Tells you to call a phone number to cancel or dispute",
  pressure: "Threatens consequences or rushes you",
  unordered_charge: "Describes a charge you may not have authorized",
  advance_fee: "Asks for a fee now in return for more later",
  off_platform: "Steers you to a link, changed payment details, or secrecy",
};

export interface DecisionInput {
  real: RealCheck;
  status: string | null;
  amount: number;
  expected: ExpectedCheck | null;
  wording: WordingCheck | null;
  autoPayLimit: number;
  /** A payment already made against this invoice, by the agent or found in PayPal's history. */
  alreadyPaid?: PriorPayment | null;
}

export function firedFlags(wording: WordingCheck | null): Reason[] {
  if (!wording) return [];
  return Object.entries(wording.flags)
    .filter(([, p]) => p >= FLAG_FIRED)
    .map(([code]) => ({ code, text: FLAG_TEXT[code] ?? code }));
}

export function decide(input: DecisionInput): { verdict: Verdict; reasons: Reason[] } {
  const { real, status, amount, expected, wording, autoPayLimit, alreadyPaid } = input;

  if (real.state === "not_found") {
    return { verdict: "block", reasons: [{ code: "no_record", text: "PayPal has no record of this invoice" }] };
  }
  if (real.state === "not_yours") {
    return { verdict: "block", reasons: [{ code: "not_yours", text: "This invoice is not addressed to your account" }] };
  }
  if (real.state === "error") {
    return { verdict: "ask", reasons: [{ code: "paypal_error", text: "PayPal could not be reached to confirm this invoice" }] };
  }
  // A payout does not mark the invoice paid on PayPal, so the agent's own record is what
  // stops it paying the same invoice twice.
  if (alreadyPaid) {
    const day = new Date(alreadyPaid.at).toISOString().slice(0, 10);
    return { verdict: "closed", reasons: [{ code: "already_paid", text: `Already paid on ${day}` }] };
  }
  if (status && !PAYABLE.has(status)) {
    return { verdict: "closed", reasons: [{ code: "not_payable", text: `Nothing to pay: PayPal lists this invoice as ${status.toLowerCase().replaceAll("_", " ")}` }] };
  }

  if (wording && wording.isScam >= SCAM_BLOCK) {
    return {
      verdict: "block",
      reasons: [{ code: "reads_like_scam", text: "The wording reads like a scam" }, ...firedFlags(wording)],
    };
  }

  const reasons: Reason[] = [];
  if (!expected?.senderEmail) {
    reasons.push({ code: "unverified_sender", text: "The sender gave no verified email, only a business name anyone can type" });
  } else if (expected.timesPaid === 0) {
    reasons.push({ code: "new_sender", text: "You have never paid this sender before" });
  } else if (expected.largestPaid !== null && amount > expected.largestPaid * UNUSUAL_MULTIPLE) {
    reasons.push({ code: "unusual_amount", text: `The amount is more than ${UNUSUAL_MULTIPLE} times the most you have paid this sender` });
  }
  if (amount > autoPayLimit) {
    reasons.push({ code: "over_limit", text: "The amount is above your automatic payment limit" });
  }
  if (!wording) {
    reasons.push({ code: "wording_unchecked", text: "The wording could not be checked" });
  } else if (wording.isScam > SCAM_UNSURE) {
    reasons.push({ code: "wording_unsure", text: "The wording has some signs of a scam" }, ...firedFlags(wording));
  }

  return reasons.length ? { verdict: "ask", reasons } : { verdict: "pay", reasons: [] };
}
