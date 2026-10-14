import { listReviews } from "@/lib/db";
import { reviewInvoice } from "@/lib/review";

export async function GET() {
  return Response.json({ reviews: await listReviews() });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (typeof body?.link !== "string" || !body.link.trim()) {
    return Response.json({ error: "Paste a PayPal invoice link or ID." }, { status: 400 });
  }
  const result = await reviewInvoice(body.link);
  if ("error" in result) return Response.json(result, { status: 400 });
  return Response.json({ review: result });
}
