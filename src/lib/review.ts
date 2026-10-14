import { autoPayLimit, getReview, paymentForInvoice, recordPayment, saveReview, vendorHistory } from "./db";
import { decide } from "./decide";
import { explain } from "./explain";
import { syncHistory } from "./history";
import { scoreWording } from "./jev";
import { fetchInvoice, parseInvoiceId, sendPayout } from "./paypal";
import type { ExpectedCheck, InvoiceFacts, Outcome, Review, WordingCheck } from "./types";

/** Runs the three checks on one invoice link or ID, decides, pays if safe, and stores the result. */
export async function reviewInvoice(input: string): Promise<Review | { error: string }> {
  const id = parseInvoiceId(input);
  if (!id) return { error: "That does not look like a PayPal invoice link or ID. Paste the link from the invoice email, or an ID like INV2-XXXX-XXXX-XXXX-XXXX." };

  await syncHistory();

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
    alreadyPaid: await paymentForInvoice(id),
  });

  // Keep what the owner already did with this invoice; a re-check must not undo a rejection.
  const previous = await getReview(id);
  let outcome: Outcome | null = previous?.outcome ?? null;
  if (verdict === "pay" && invoice?.senderEmail && (!outcome || outcome.state === "failed")) {
    outcome = await pay(invoice, "agent");
  }

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
    outcome,
    reviewedAt: new Date().toISOString(),
  };
  await saveReview(review);
  return review;
}

async function pay(invoice: InvoiceFacts, by: "agent" | "owner"): Promise<Outcome> {
  const now = new Date().toISOString();
  const result = await sendPayout(invoice.id, invoice.senderEmail!, invoice.amount, invoice.currency);
  if (!result.ok) return { state: "failed", at: now, detail: result.detail };
  // An earlier payout is recorded with its own amount and time, not this invoice's.
  const amount = result.earlier ? result.amount : invoice.amount;
  await recordPayment({
    vendorEmail: invoice.senderEmail!,
    amount,
    currency: invoice.currency,
    invoiceId: invoice.id,
    method: "payout",
    source: "agent",
    reference: result.reference,
    paidAt: result.at,
  });
  return { state: "paid", by: result.earlier ? "agent" : by, method: "payout", amount, currency: invoice.currency, at: result.at, reference: result.reference };
}

export type Action = "approve" | "reject" | "confirm";

/**
 * The owner's decision on an invoice the agent stopped on.
 * approve: a vendor paid before is paid by payout at once. A first-time vendor, or one with no
 *   verified email, is paid by the owner on PayPal's own invoice page, so the invoice closes properly.
 * confirm: after paying on PayPal, re-read the invoice and record the payment if PayPal shows it paid.
 * reject: nothing is paid.
 */
export async function act(id: string, action: Action): Promise<Review | { error: string }> {
  const review = await getReview(id);
  if (!review) return { error: "This invoice has not been checked yet." };
  if (review.outcome?.state === "paid") return { error: "This invoice is already paid." };
  const now = new Date().toISOString();

  if (action === "reject") {
    review.outcome = { state: "rejected", at: now };
  } else if (action === "approve") {
    if (review.verdict === "block") return { error: "Blocked invoices cannot be approved." };
    if (review.verdict !== "ask" || !review.invoice) return { error: "There is nothing to approve on this invoice." };
    const known = review.invoice.senderEmail && (review.expected?.timesPaid ?? 0) > 0;
    review.outcome = known ? await pay(review.invoice, "owner") : { state: "awaiting_payment", at: now };
  } else {
    const { invoice } = await fetchInvoice(id);
    if (!invoice) return { error: "PayPal could not be reached to check the payment. Try again." };
    if (invoice.status !== "PAID" && invoice.status !== "MARKED_AS_PAID") {
      return { error: "PayPal does not show this invoice as paid yet. Pay it on PayPal, then check again." };
    }
    const paid = review.invoice ?? invoice;
    if (paid.senderEmail) {
      await recordPayment({
        vendorEmail: paid.senderEmail,
        amount: paid.amount,
        currency: paid.currency,
        invoiceId: id,
        method: "paypal_invoice",
        source: "agent",
        reference: `invoice-${id}`,
        paidAt: now,
      });
    }
    review.invoice = invoice;
    review.outcome = { state: "paid", by: "owner", method: "paypal_invoice", amount: paid.amount, currency: paid.currency, at: now, reference: id };
  }

  await saveReview(review);
  return review;
}
