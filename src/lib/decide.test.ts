import { describe, expect, it } from "vitest";
import { decide, decideEmailWithoutInvoice, type DecisionInput } from "./decide";

const clean: DecisionInput = {
  real: { state: "found" },
  status: "SENT",
  amount: 120,
  expected: { senderEmail: "billing@greenleaflawn.com", timesPaid: 3, largestPaid: 138 },
  wording: { isScam: 0.1, flags: { pressure: 0.05 }, model: "jev-1.13.0", ms: 200 },
  autoPayLimit: 1000,
};
const codes = (input: DecisionInput) => decide(input).reasons.map((r) => r.code);

describe("decide", () => {
  it("pays a real invoice from a known sender at a usual amount", () => {
    expect(decide(clean)).toEqual({ verdict: "pay", reasons: [] });
  });

  it("blocks an invoice PayPal has no record of", () => {
    expect(decide({ ...clean, real: { state: "not_found" } }).verdict).toBe("block");
  });

  it("blocks an invoice addressed to someone else", () => {
    expect(codes({ ...clean, real: { state: "not_yours" } })).toEqual(["not_yours"]);
  });

  it("blocks on scam wording even from a known sender, and lists the fired flags", () => {
    const result = decide({ ...clean, wording: { isScam: 0.96, flags: { pressure: 0.9, off_platform: 0.85, advance_fee: 0.1 }, model: "m", ms: 1 } });
    expect(result.verdict).toBe("block");
    expect(result.reasons.map((r) => r.code)).toEqual(["reads_like_scam", "pressure", "off_platform"]);
  });

  it("never pays a first-time sender without asking", () => {
    const result = decide({ ...clean, expected: { senderEmail: "new@vendor.com", timesPaid: 0, largestPaid: null } });
    expect(result.verdict).toBe("ask");
    expect(result.reasons.map((r) => r.code)).toEqual(["new_sender"]);
  });

  it("asks when the sender gave no verified email", () => {
    expect(codes({ ...clean, expected: { senderEmail: null, timesPaid: 0, largestPaid: null } })).toEqual(["unverified_sender"]);
  });

  it("asks when the amount is far above what this sender was paid before", () => {
    expect(codes({ ...clean, amount: 300 })).toEqual(["unusual_amount"]);
  });

  it("asks above the owner's automatic payment limit", () => {
    expect(codes({ ...clean, amount: 200, autoPayLimit: 150 })).toEqual(["over_limit"]);
  });

  it("asks when the wording is in the unsure band", () => {
    expect(decide({ ...clean, wording: { isScam: 0.5, flags: {}, model: "m", ms: 1 } }).verdict).toBe("ask");
  });

  it("asks when the wording could not be checked", () => {
    expect(codes({ ...clean, wording: null })).toEqual(["wording_unchecked"]);
  });

  it("asks when PayPal could not be reached", () => {
    expect(decide({ ...clean, real: { state: "error", detail: "timeout" } }).verdict).toBe("ask");
  });

  it("never pays an invoice the agent has already paid, even if PayPal still shows it unpaid", () => {
    const result = decide({ ...clean, alreadyPaid: { amount: 120, currency: "USD", at: "2026-10-14T00:59:12Z", source: "agent" } });
    expect(result).toEqual({ verdict: "closed", reasons: [{ code: "already_paid", text: "Already paid on 2026-10-14" }] });
  });

  it("does nothing with an invoice that is already paid", () => {
    expect(decide({ ...clean, status: "PAID" }).verdict).toBe("closed");
  });
});

describe("decideEmailWithoutInvoice", () => {
  it("blocks a PayPal-looking email with no real invoice, naming the look-alike link", () => {
    const result = decideEmailWithoutInvoice({ lookalikeHosts: ["secure-paypa1-billing.com"], mentionsPayPal: true });
    expect(result?.verdict).toBe("block");
    expect(result?.reasons.map((r) => r.code)).toEqual(["no_invoice_in_email", "lookalike_link"]);
  });

  it("ignores an email that has nothing to do with PayPal", () => {
    expect(decideEmailWithoutInvoice({ lookalikeHosts: [], mentionsPayPal: false })).toBeNull();
  });
});
