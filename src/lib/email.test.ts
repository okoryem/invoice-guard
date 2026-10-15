import { describe, expect, it } from "vitest";
import { readEmail } from "./email";

describe("readEmail", () => {
  it("finds the invoice in a forwarded PayPal invoice email", () => {
    const found = readEmail({
      subject: "Fwd: Invoice from Greenleaf Lawn Care (0001)",
      text: "---------- Forwarded message ---------\nFrom: service@paypal.com\nView and pay invoice: https://www.paypal.com/invoice/p/#9443VJVU85XWC8UL",
    });
    expect(found).toEqual({ invoiceIds: ["INV2-9443-VJVU-85XW-C8UL"], lookalikeHosts: [], mentionsPayPal: true });
  });

  it("reads a link hidden behind URL encoding in the HTML", () => {
    const found = readEmail({ html: '<a href="https://www.paypal.com/invoice/p/%239443VJVU85XWC8UL">View invoice</a>' });
    expect(found.invoiceIds).toEqual(["INV2-9443-VJVU-85XW-C8UL"]);
  });

  it("notices a link that imitates PayPal", () => {
    const found = readEmail({
      subject: "Your PayPal account is limited",
      html: '<a href="https://secure-paypa1-billing.com/verify">Pay invoice</a>',
    });
    expect(found).toEqual({ invoiceIds: [], lookalikeHosts: ["secure-paypa1-billing.com"], mentionsPayPal: true });
  });

  it("does not treat real PayPal hosts as look-alikes", () => {
    expect(readEmail({ text: "https://www.sandbox.paypal.com/invoice/p/#9443VJVU85XWC8UL" }).lookalikeHosts).toEqual([]);
  });

  it("finds nothing in an unrelated email", () => {
    expect(readEmail({ subject: "Lunch on Friday?", text: "Are we still on?" })).toEqual({ invoiceIds: [], lookalikeHosts: [], mentionsPayPal: false });
  });
});
