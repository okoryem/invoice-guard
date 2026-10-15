import { parseInvoiceId } from "./paypal";

export interface EmailInput {
  from?: string;
  subject?: string;
  text?: string;
  html?: string;
}

export interface EmailFindings {
  invoiceIds: string[];
  /** Link hosts that dress up as PayPal without being paypal.com. */
  lookalikeHosts: string[];
  mentionsPayPal: boolean;
}

const URL_PATTERN = /https?:\/\/[^\s"'<>)\]]+/gi;
const REAL_PAYPAL = /(^|\.)paypal\.com$/i;
const LOOKS_LIKE_PAYPAL = /pay[\s._-]*pa[l1i|]/i;

function decode(value: string): string {
  try {
    return decodeURIComponent(value.replaceAll("&amp;", "&"));
  } catch {
    return value;
  }
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Pulls PayPal invoice IDs and suspicious links out of an email. The email is only a pointer:
 * whether an invoice is real is decided by asking PayPal for it, not by trusting the email.
 */
export function readEmail(email: EmailInput): EmailFindings {
  const html = email.html ?? "";
  const visible = html.replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/gi, " ").replace(/<[^>]+>/g, " ");
  const body = [email.subject, email.text, visible].filter(Boolean).join("\n");
  // Forwarding and click-tracking often URL-encode links, hiding the # in a PayPal invoice link.
  const urls = [...`${body}\n${html}`.matchAll(URL_PATTERN)].map((m) => decode(m[0]));

  const invoiceIds = new Set<string>();
  for (const candidate of [...urls, ...body.split(/\s+/)]) {
    const id = parseInvoiceId(candidate);
    if (id) invoiceIds.add(id);
  }

  const lookalikeHosts = new Set<string>();
  for (const url of urls) {
    const host = hostOf(url);
    if (host && LOOKS_LIKE_PAYPAL.test(host) && !REAL_PAYPAL.test(host)) lookalikeHosts.add(host);
  }

  return {
    invoiceIds: [...invoiceIds],
    lookalikeHosts: [...lookalikeHosts],
    mentionsPayPal: /paypal/i.test(`${body} ${email.from ?? ""}`),
  };
}
