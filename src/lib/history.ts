import { getSetting, paymentForInvoice, recordPayment, setSetting } from "./db";
import { outgoingPayments } from "./paypal";

const LOOKBACK_DAYS = 365;
const REFRESH_MS = 30 * 60_000;

/**
 * Copies past outgoing payments from PayPal into the agent's own record, so vendors paid
 * before the app was connected count as known. Runs at most every 30 minutes. A failure is
 * not fatal: the agent then knows only what it paid itself, and asks more often.
 */
export async function syncHistory(): Promise<void> {
  const last = await getSetting("history_synced_at");
  if (last && Date.now() - Date.parse(last) < REFRESH_MS) return;
  try {
    for (const p of await outgoingPayments(last ? 31 : LOOKBACK_DAYS)) {
      // The agent's own payouts show up here hours later. They are already recorded.
      if (p.invoiceId && (await paymentForInvoice(p.invoiceId))) continue;
      await recordPayment({
        vendorEmail: p.email,
        amount: p.amount,
        currency: p.currency,
        invoiceId: p.invoiceId,
        method: "history",
        source: "paypal_history",
        reference: p.reference,
        paidAt: p.at,
      });
    }
    await setSetting("history_synced_at", new Date().toISOString());
  } catch (err) {
    console.warn("PayPal history could not be loaded:", err);
  }
}
