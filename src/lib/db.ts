import type { Review } from "./types";

type Row = Record<string, unknown>;
interface Db {
  query(sql: string, params?: unknown[]): Promise<{ rows: Row[] }>;
}

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS reviews (
    id TEXT PRIMARY KEY,
    review JSONB NOT NULL,
    reviewed_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE TABLE IF NOT EXISTS payments (
    id SERIAL PRIMARY KEY,
    vendor_email TEXT NOT NULL,
    amount NUMERIC NOT NULL,
    currency TEXT NOT NULL,
    invoice_id TEXT,
    method TEXT NOT NULL,
    paid_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
`;

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
    await lite.exec(SCHEMA);
    return db;
  }
  for (const statement of SCHEMA.split(";").map((s) => s.trim()).filter(Boolean)) await db.query(statement);
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

export async function listReviews(): Promise<Review[]> {
  const { rows } = await (await db()).query("SELECT review FROM reviews ORDER BY reviewed_at DESC LIMIT 200");
  return rows.map((r) => (typeof r.review === "string" ? JSON.parse(r.review) : r.review) as Review);
}

/** What the agent itself has paid this vendor. The agent's own ledger, because PayPal's history lags by hours. */
export async function vendorHistory(email: string): Promise<{ timesPaid: number; largestPaid: number | null }> {
  const { rows } = await (await db()).query(
    "SELECT count(*) AS times, max(amount) AS largest FROM payments WHERE vendor_email = $1",
    [email.toLowerCase()],
  );
  const largest = rows[0]?.largest;
  return { timesPaid: Number(rows[0]?.times ?? 0), largestPaid: largest == null ? null : Number(largest) };
}

export async function autoPayLimit(): Promise<number> {
  const { rows } = await (await db()).query("SELECT value FROM settings WHERE key = 'auto_pay_limit'");
  return rows.length ? Number(rows[0].value) : 1000;
}
