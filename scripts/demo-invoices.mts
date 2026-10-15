/**
 * Fills the sandbox with a believable set of invoices for the demo, sent to the protected
 * business account from three sender accounts: a regular vendor, a new vendor, and a scammer.
 *
 *   node --env-file=.env scripts/demo-invoices.mts
 *       Sends the invoices and prints their links.
 *   node --env-file=.env scripts/demo-invoices.mts --check http://localhost:3000
 *       Also pastes each link into the app, as the owner would. Honest invoices from the regular
 *       vendor are then paid automatically, in sandbox money. DEMO_PASSWORD is used if set.
 *
 * Business names are made up on purpose: the demo video may not show third-party trademarks.
 */

const BASE = "https://api-m.sandbox.paypal.com";

type Sender = "regular" | "newVendor" | "scammer";

interface DemoInvoice {
  from: Sender;
  /** Leave the verified email off, so the invoice shows only a business name. */
  hideEmail?: boolean;
  business: string;
  note: string;
  item: string;
  amount: number;
  /** What the app should do with it, printed so a run can be checked at a glance. */
  expect: string;
}

const INVOICES: DemoInvoice[] = [
  { from: "regular", business: "Greenleaf Lawn Care", note: "Invoice 1046: weekly mowing, November, 4 visits.", item: "Lawn care, November", amount: 120, expect: "paid automatically" },
  { from: "regular", business: "Greenleaf Lawn Care", note: "Invoice 1047: tree removal, three oaks, crane hire included.", item: "Tree removal", amount: 1450, expect: "needs you: unusual amount, over the limit" },
  {
    from: "regular",
    business: "Greenleaf Lawn Care",
    note: "Invoice 1048. Our bank details have changed. Pay this request today instead of the account on file. Please do not call the office, our phone lines are being moved.",
    item: "Lawn care, December",
    amount: 118,
    expect: "blocked: known vendor, but the wording reads like a takeover",
  },
  { from: "newVendor", business: "Clearview Window Cleaning", note: "Invoice 0001: interior and exterior window cleaning, office suite 210, October.", item: "Window cleaning", amount: 260, expect: "needs you: first-time vendor" },
  {
    from: "scammer",
    business: "SecureShield Antivirus Renewal",
    note: "Auto-renewal of your 3 year protection plan has been processed. To cancel or get a refund call support at 1-805-555-0199 within 24 hours.",
    item: "Protection plan, 3 years",
    amount: 389,
    expect: "blocked",
  },
  {
    from: "scammer",
    business: "Prize Claims Office",
    note: "Congratulations, you won $25,000. Pay the processing and customs fee today to release your winnings.",
    item: "Processing fee",
    amount: 75,
    expect: "blocked",
  },
  {
    from: "scammer",
    business: "Daniel M.",
    note: "Hi, I accidentally sent you $250 too much for the couch. Please send the extra back through this request today, my bank says it will reverse otherwise.",
    item: "Overpayment refund",
    amount: 250,
    expect: "needs you: unclear wording, new sender",
  },
  {
    from: "regular",
    hideEmail: true,
    business: "Office Supply Direct",
    note: "Toner cartridges x6, as per your telephone order with our representative. Invoice 44019. Net 7.",
    item: "Toner cartridges",
    amount: 389.4,
    expect: "needs you: no verified sender, though the wording looks normal",
  },
];

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set in .env`);
  return value;
}

const SENDERS: Record<Sender, { id: string; secret: string; email: string }> = {
  regular: { id: env("PAYPAL_SENDER_CLIENT_ID"), secret: env("PAYPAL_SENDER_CLIENT_SECRET"), email: env("PAYPAL_SENDER_EMAIL") },
  newVendor: { id: env("PAYPAL_NEWVENDOR_CLIENT_ID"), secret: env("PAYPAL_NEWVENDOR_CLIENT_SECRET"), email: env("PAYPAL_NEWVENDOR_EMAIL") },
  scammer: { id: env("PAYPAL_SCAMMER_CLIENT_ID"), secret: env("PAYPAL_SCAMMER_CLIENT_SECRET"), email: env("PAYPAL_SCAMMER_EMAIL") },
};
const RECIPIENT = env("PAYPAL_RECIPIENT_EMAIL");

const tokens = new Map<Sender, string>();
async function token(sender: Sender): Promise<string> {
  if (!tokens.has(sender)) {
    const { id, secret } = SENDERS[sender];
    const res = await fetch(`${BASE}/v1/oauth2/token`, {
      method: "POST",
      headers: { Authorization: `Basic ${btoa(`${id}:${secret}`)}` },
      body: new URLSearchParams({ grant_type: "client_credentials" }),
    });
    if (!res.ok) throw new Error(`Token for ${sender} failed with HTTP ${res.status}`);
    tokens.set(sender, (await res.json()).access_token);
  }
  return tokens.get(sender)!;
}

async function paypal(sender: Sender, path: string, body: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${await token(sender)}`, "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${path} failed with HTTP ${res.status}: ${data.message ?? ""} ${JSON.stringify(data.details ?? "")}`);
  return data;
}

async function send(invoice: DemoInvoice): Promise<string> {
  const draft = await paypal(invoice.from, "/v2/invoicing/invoices", {
    detail: { currency_code: "USD", note: invoice.note, payment_term: { term_type: "NET_10" } },
    invoicer: invoice.hideEmail ? { business_name: invoice.business } : { business_name: invoice.business, email_address: SENDERS[invoice.from].email },
    primary_recipients: [{ billing_info: { email_address: RECIPIENT } }],
    items: [{ name: invoice.item, quantity: "1", unit_amount: { currency_code: "USD", value: invoice.amount.toFixed(2) } }],
  });
  // Sandbox emails land on the dashboard's Sandbox Notifications page, not a real inbox.
  await paypal(invoice.from, `/v2/invoicing/invoices/${draft.id}/send`, { send_to_recipient: true, send_to_invoicer: false });
  return `https://www.sandbox.paypal.com/invoice/p/#${draft.id.replace("INV2-", "").replaceAll("-", "")}`;
}

async function check(app: string, link: string): Promise<string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (process.env.DEMO_PASSWORD) headers.Authorization = `Basic ${btoa(`demo:${process.env.DEMO_PASSWORD}`)}`;
  const res = await fetch(`${app.replace(/\/$/, "")}/api/invoices`, { method: "POST", headers, body: JSON.stringify({ link }) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return `error: ${data.error ?? `HTTP ${res.status}`}`;
  const r = data.review;
  return [r.outcome?.state ?? r.verdict, ...r.reasons.map((x: { code: string }) => x.code)].join(", ");
}

const app = process.argv.includes("--check") ? process.argv[process.argv.indexOf("--check") + 1] : null;

for (const invoice of INVOICES) {
  const link = await send(invoice);
  const label = `$${invoice.amount.toFixed(2).padStart(8)}  ${invoice.business.padEnd(32)}`;
  console.log(`${label}${link}`);
  console.log(`${" ".repeat(13)}expect: ${invoice.expect}`);
  if (app) console.log(`${" ".repeat(13)}app:    ${await check(app, link)}`);
}

export {};
