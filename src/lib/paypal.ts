import type { InvoiceFacts, RealCheck } from "./types";

const BASE = process.env.PAYPAL_API_BASE ?? "https://api-m.sandbox.paypal.com";

let cached: { token: string; expiresAt: number } | null = null;

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
    res = await fetch(`${BASE}/v2/invoicing/invoices/${id}`, {
      headers: { Authorization: `Bearer ${await accessToken()}` },
    });
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
