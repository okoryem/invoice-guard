import { connection } from "next/server";
import { autoPayLimit, MAX_AUTO_PAY_LIMIT, setSetting } from "@/lib/db";

export async function GET() {
  await connection();
  return Response.json({ autoPayLimit: await autoPayLimit() });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const limit = Number(body?.autoPayLimit);
  if (!Number.isFinite(limit) || limit < 0 || limit > MAX_AUTO_PAY_LIMIT) {
    return Response.json({ error: `Enter an amount from $0 to $${MAX_AUTO_PAY_LIMIT.toLocaleString("en-US")}.` }, { status: 400 });
  }
  const rounded = Math.round(limit * 100) / 100;
  await setSetting("auto_pay_limit", String(rounded));
  return Response.json({ autoPayLimit: rounded });
}
