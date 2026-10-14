import { connection } from "next/server";

// For Render's health check. Answers without touching PayPal, Jev, or the database.
export async function GET() {
  await connection();
  return Response.json({ ok: true });
}
