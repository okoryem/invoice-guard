import type { PriorPayment, Review } from "./types";

type Row = Record<string, unknown>;
interface Db {
  query(sql: string, params?: unknown[]): Promise<{ rows: Row[] }>;
}

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS reviews (
    id TEXT PRIMARY KEY,
    review JSONB NOT NULL,
    reviewed_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS payments (
    id SERIAL PRIMARY KEY,
    vendor_email TEXT NOT NULL,
    amount NUMERIC NOT NULL,
    currency TEXT NOT NULL,
    invoice_id TEXT,
    method TEXT NOT NULL,
    paid_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  // Added with the payment step. source is "agent" or "paypal_history"; reference is the
  // payout batch or PayPal transaction ID, unique so a history import never counts twice.
  `ALTER TABLE payments ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'agent'`,
  `ALTER TABLE payments ADD COLUMN IF NOT EXISTS reference TEXT`,
  `CREATE UNIQUE INDEX IF NOT EXISTS payments_reference ON payments (reference)`,
  `CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)`,
];

// Postgres when DATABASE_URL is set (Render), otherwise an embedded Postgres
// in .data/ so the app runs locally with nothing to install.
async function open(): Promise<Db> {
  let db: Db;
  if (process.env.DATABASE_URL) {
    const { Pool } = await import("pg");
    db = new Pool({ connectionString: process.env.DATABASE_URL });
  } else {
    const { PGlite } = await import("@electric-sql/pglite");
    const { mkdir } = await import("node:fs/promises");
    await mkdir(".data", { recursive: true });
    const lite = new PGlite(".data/pglite");
    db = { query: (sql, params) => lite.query<Row>(sql, params) };
  }
  for (const statement of SCHEMA) await db.query(statement);
  return db;
}

// One connection across hot reloads in development.
const holder = globalThis as unknown as { __db?: Promise<Db> };
const db = () =>
  (holder.__db ??= open().catch((err) => {
    // Let the next request retry instead of caching the failure.
    holder.__db = undefined;
    throw err;
  }));

export async function saveReview(review: Review): Promise<void> {
  await (await db()).query(
    `INSERT INTO reviews (id, review, reviewed_at) VALUES ($1, $2, $3)
     ON CONFLICT (id) DO UPDATE SET review = EXCLUDED.review, reviewed_at = EXCLUDED.reviewed_at`,
    [review.id, JSON.stringify(review), review.reviewedAt],
  );
}

export async function getReview(id: string): Promise<Review | null> {
  const { rows } = await (await db()).query("SELECT review FROM reviews WHERE id = $1", [id]);
  return rows.length ? parse(rows[0].review) : null;
}

export async function listReviews(): Promise<Review[]> {
  const { rows } = await (await db()).query("SELECT review FROM reviews ORDER BY reviewed_at DESC LIMIT 200");
  return rows.map((r) => parse(r.review));
}

function parse(value: unknown): Review {
  const review = (typeof value === "string" ? JSON.parse(value) : value) as Review;
  return { ...review, outcome: review.outcome ?? null };
}

/** Everything paid to this vendor: by the agent, or found in PayPal's history from before. */
export async function vendorHistory(email: string): Promise<{ timesPaid: number; largestPaid: number | null }> {
  const { rows } = await (await db()).query(
    "SELECT count(*) AS times, max(amount) AS largest FROM payments WHERE vendor_email = $1",
    [email.toLowerCase()],
  );
  const largest = rows[0]?.largest;
  return { timesPaid: Number(rows[0]?.times ?? 0), largestPaid: largest == null ? null : Number(largest) };
}

export async function paymentForInvoice(invoiceId: string): Promise<PriorPayment | null> {
  const { rows } = await (await db()).query(
    "SELECT amount, currency, paid_at, source FROM payments WHERE invoice_id = $1 ORDER BY paid_at LIMIT 1",
    [invoiceId],
  );
  if (!rows.length) return null;
  const r = rows[0];
  return { amount: Number(r.amount), currency: String(r.currency), at: new Date(r.paid_at as string).toISOString(), source: r.source as PriorPayment["source"] };
}

export interface PaymentRow {
  vendorEmail: string;
  amount: number;
  currency: string;
  invoiceId: string | null;
  method: string;
  source: "agent" | "paypal_history";
  reference: string;
  paidAt: string;
}

/** Returns false when a payment with this reference is already recorded. */
export async function recordPayment(p: PaymentRow): Promise<boolean> {
  const { rows } = await (await db()).query(
    `INSERT INTO payments (vendor_email, amount, currency, invoice_id, method, source, reference, paid_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (reference) DO NOTHING RETURNING id`,
    [p.vendorEmail.toLowerCase(), p.amount, p.currency, p.invoiceId, p.method, p.source, p.reference, p.paidAt],
  );
  return rows.length > 0;
}

export async function getSetting(key: string): Promise<string | null> {
  const { rows } = await (await db()).query("SELECT value FROM settings WHERE key = $1", [key]);
  return rows.length ? String(rows[0].value) : null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  await (await db()).query(
    "INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
    [key, value],
  );
}

export const MAX_AUTO_PAY_LIMIT = 100_000;

export async function autoPayLimit(): Promise<number> {
  return Number((await getSetting("auto_pay_limit")) ?? 1000);
}
