import type { InvoiceFacts, RealCheck } from "./types";

const BASE = process.env.PAYPAL_API_BASE ?? "https://api-m.sandbox.paypal.com";

let cached: { token: string; expiresAt: number } | null = null;

async function call(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${await accessToken()}`);
  if (init.body) headers.set("Content-Type", "application/json");
  return fetch(`${BASE}${path}`, { ...init, headers });
}

async function accessToken(): Promise<string> {
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;
  const id = process.env.PAYPAL_CLIENT_ID;
  const secret = process.env.PAYPAL_CLIENT_SECRET;
  if (!id || !secret) throw new Error("PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET are not set");
  const res = await fetch(`${BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}` },
    body: new URLSearchParams({ grant_type: "client_credentials" }),
  });
  if (!res.ok) throw new Error(`PayPal token request failed with HTTP ${res.status}`);
  const data = await res.json();
  cached = { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return cached.token;
}

/**
 * Accepts an invoice ID (INV2-XXXX-XXXX-XXXX-XXXX) or either PayPal invoice link:
 * the recipient link ends in #XXXXXXXXXXXXXXXX, the sender link contains the full ID.
 */
export function parseInvoiceId(input: string): string | null {
  const text = input.trim();
  const full = text.match(/INV2(?:-[A-Z0-9]{4}){4}/i);
  if (full) return full[0].toUpperCase();
  const short = text.match(/invoice\/p\/#?([A-Z0-9]{16})\b/i) ?? text.match(/^([A-Z0-9]{16})$/i);
  if (short) return `INV2-${short[1].toUpperCase().match(/.{4}/g)!.join("-")}`;
  return null;
}

export async function fetchInvoice(id: string): Promise<{ real: RealCheck; invoice: InvoiceFacts | null }> {
  let res: Response;
  try {
    res = await call(`/v2/invoicing/invoices/${id}`);
  } catch (err) {
    return { real: { state: "error", detail: String(err) }, invoice: null };
  }
  // Tested in the sandbox: 404 for an ID that does not exist, 403 for an invoice
  // this account neither sent nor received.
  if (res.status === 404) return { real: { state: "not_found" }, invoice: null };
  if (res.status === 403) return { real: { state: "not_yours" }, invoice: null };
  if (!res.ok) return { real: { state: "error", detail: `HTTP ${res.status}` }, invoice: null };

  const data = await res.json();
  const amount = data.due_amount ?? data.amount ?? {};
  return {
    real: { state: "found" },
    invoice: {
      id: data.id,
      status: data.status,
      senderName: data.invoicer?.business_name ?? null,
      // PayPal refuses to send an invoice whose invoicer email is not the sender's own,
      // so this is trustworthy when present. It is optional.
      senderEmail: data.invoicer?.email_address?.toLowerCase() ?? null,
      amount: Number(amount.value ?? 0),
      currency: amount.currency_code ?? data.detail?.currency_code ?? "USD",
      note: [data.detail?.note, data.detail?.memo, data.detail?.terms_and_conditions].filter(Boolean).join("\n"),
      items: (data.items ?? []).map((i: { name?: string; description?: string }) => [i.name, i.description].filter(Boolean).join(": ")),
      dueDate: data.detail?.payment_term?.due_date ?? null,
      payUrl: data.detail?.metadata?.recipient_view_url ?? null,
    },
  };
}

export type PayoutResult =
  | { ok: true; reference: string; status: string; amount: number; at: string; earlier: boolean }
  | { ok: false; detail: string };

/**
 * Pays a vendor's verified email. PayPal has no API for a payer to pay an invoice, so this
 * moves the money but leaves the invoice open on PayPal. The batch ID is derived from the
 * invoice ID, so PayPal itself refuses a second payout for the same invoice within 30 days.
 */
export async function sendPayout(invoiceId: string, email: string, amount: number, currency: string): Promise<PayoutResult> {
  const res = await call("/v1/payments/payouts", {
    method: "POST",
    body: JSON.stringify({
      sender_batch_header: { sender_batch_id: `invoice-${invoiceId}`, email_subject: `Payment for invoice ${invoiceId}` },
      items: [
        {
          recipient_type: "EMAIL",
          receiver: email,
          amount: { value: amount.toFixed(2), currency },
          note: `Payment for invoice ${invoiceId}`,
          sender_item_id: invoiceId,
        },
      ],
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    // Already paid, from another copy of the app or before its record was lost. PayPal links
    // to the earlier batch, which is the proof of payment.
    const earlier = data.details?.find((d: { field?: string }) => d.field === "SENDER_BATCH_ID")?.link?.[0]?.href;
    if (earlier) return earlierPayout(earlier.split("/").pop());
    return { ok: false, detail: data.details?.[0]?.issue ?? data.message ?? `PayPal refused the payout (HTTP ${res.status})` };
  }
  const reference: string = data.batch_header.payout_batch_id;

  // A sandbox payout settles within seconds. Wait briefly so the owner sees the result.
  let status: string = data.batch_header.batch_status;
  for (let i = 0; i < 6 && !["SUCCESS", "DENIED", "CANCELED"].includes(status); i++) {
    await new Promise((r) => setTimeout(r, 1500));
    const poll = await call(`/v1/payments/payouts/${reference}`);
    if (poll.ok) status = (await poll.json()).batch_header.batch_status;
  }
  if (status === "DENIED" || status === "CANCELED") return { ok: false, detail: `PayPal ${status.toLowerCase()} the payout` };
  return { ok: true, reference, status, amount, at: new Date().toISOString(), earlier: false };
}

async function earlierPayout(reference: string): Promise<PayoutResult> {
  const res = await call(`/v1/payments/payouts/${reference}`);
  if (!res.ok) return { ok: false, detail: "PayPal says this invoice was paid out before, but the earlier payment could not be read" };
  const header = (await res.json()).batch_header;
  if (header.batch_status !== "SUCCESS") return { ok: false, detail: `An earlier payout for this invoice is ${String(header.batch_status).toLowerCase()}` };
  return {
    ok: true,
    reference,
    status: header.batch_status,
    amount: Number(header.amount?.value ?? 0),
    at: header.time_completed ?? header.time_created,
    earlier: true,
  };
}

export interface HistoryPayment {
  reference: string;
  email: string;
  amount: number;
  currency: string;
  at: string;
  invoiceId: string | null;
}

/**
 * Money this account sent, from PayPal's transaction history. The history lags by hours and
 * is searched 31 days at a time, so it is only used to learn about payments made before
 * the app was connected.
 */
export async function outgoingPayments(days: number): Promise<HistoryPayment[]> {
  const found: HistoryPayment[] = [];
  const end = Date.now();
  for (let to = end; to > end - days * 86_400_000; to -= 31 * 86_400_000) {
    const from = Math.max(to - 31 * 86_400_000, end - days * 86_400_000);
    for (let page = 1; ; page++) {
      const query = new URLSearchParams({
        start_date: new Date(from).toISOString().slice(0, 19) + "Z",
        end_date: new Date(to).toISOString().slice(0, 19) + "Z",
        fields: "transaction_info,payer_info",
        page_size: "500",
        page: String(page),
      });
      const res = await call(`/v1/reporting/transactions?${query}`);
      if (!res.ok) throw new Error(`PayPal history request failed with HTTP ${res.status}`);
      const data = await res.json();
      for (const t of data.transaction_details ?? []) {
        const info = t.transaction_info ?? {};
        const value = Number(info.transaction_amount?.value ?? 0);
        const email = t.payer_info?.email_address;
        // Outgoing money with a named counterparty. Fees and balance moves carry no email.
        if (value >= 0 || !email) continue;
        found.push({
          reference: info.transaction_id,
          email: email.toLowerCase(),
          amount: -value,
          currency: info.transaction_amount.currency_code,
          at: info.transaction_initiation_date,
          invoiceId: parseInvoiceId(`${info.transaction_note ?? ""} ${info.transaction_subject ?? ""} ${info.invoice_id ?? ""}`),
        });
      }
      if (page >= (data.total_pages ?? 1)) break;
    }
  }
  return found;
}
