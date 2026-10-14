import { describe, expect, it } from "vitest";
import { parseInvoiceId } from "./paypal";

describe("parseInvoiceId", () => {
  it("reads a full invoice ID", () => {
    expect(parseInvoiceId(" inv2-7tg6-n7ra-ug76-eyrm ")).toBe("INV2-7TG6-N7RA-UG76-EYRM");
  });
  it("reads the link a recipient is sent", () => {
    expect(parseInvoiceId("https://www.sandbox.paypal.com/invoice/p/#7TG6N7RAUG76EYRM")).toBe("INV2-7TG6-N7RA-UG76-EYRM");
  });
  it("reads the sender's link", () => {
    expect(parseInvoiceId("https://www.paypal.com/invoice/details/INV2-7TG6-N7RA-UG76-EYRM")).toBe("INV2-7TG6-N7RA-UG76-EYRM");
  });
  it("rejects text with no invoice in it", () => {
    expect(parseInvoiceId("please pay me $50")).toBeNull();
  });
});
