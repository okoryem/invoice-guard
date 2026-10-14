import { autoPayLimit, saveReview, vendorHistory } from "./db";
import { decide } from "./decide";
import { explain } from "./explain";
import { scoreWording } from "./jev";
import { fetchInvoice, parseInvoiceId } from "./paypal";
import type { ExpectedCheck, Review, WordingCheck } from "./types";

/** Runs the three checks on one invoice link or ID, decides, and stores the result. */
export async function reviewInvoice(input: string): Promise<Review | { error: string }> {
  const id = parseInvoiceId(input);
  if (!id) return { error: "That does not look like a PayPal invoice link or ID." };

  // 1. Is it real? PayPal's own record is the source of truth, not the email it arrived in.
  const { real, invoice } = await fetchInvoice(id);

  let expected: ExpectedCheck | null = null;
  let wording: WordingCheck | null = null;
  if (invoice) {
    // 2. Is it expected? and 3. Does it read like a scam? Independent, so run together.
    const history = invoice.senderEmail ? vendorHistory(invoice.senderEmail) : Promise.resolve({ timesPaid: 0, largestPaid: null });
    const [h, w] = await Promise.all([history, scoreWording(invoice).catch(() => null)]);
    expected = { senderEmail: invoice.senderEmail, ...h };
    wording = w;
  }

  const { verdict, reasons } = decide({
    real,
    status: invoice?.status ?? null,
    amount: invoice?.amount ?? 0,
    expected,
    wording,
    autoPayLimit: await autoPayLimit(),
  });

  const review: Review = {
    id,
    input: input.trim(),
    verdict,
    reasons,
    explanation: verdict === "ask" || verdict === "block" ? await explain(verdict, reasons, invoice) : "",
    real,
    expected,
    wording,
    invoice,
    reviewedAt: new Date().toISOString(),
  };
  await saveReview(review);
  return review;
}
