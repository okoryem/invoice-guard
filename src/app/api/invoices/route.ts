import { listReviews } from "@/lib/db";
import { parseInvoiceId } from "@/lib/paypal";
import { reviewEmail, reviewInvoice } from "@/lib/review";

export async function GET() {
  return Response.json({ reviews: await listReviews() });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (typeof body?.link !== "string" || !body.link.trim()) {
    return Response.json({ error: "Paste a PayPal invoice link or ID." }, { status: 400 });
  }
  // Anything longer than a link with no invoice ID in plain sight is treated as a pasted email.
  if (!parseInvoiceId(body.link) && body.link.length > 80) {
    const reviews = await reviewEmail({ text: body.link }, "paste");
    if ("error" in reviews) return Response.json(reviews, { status: 400 });
    if (!reviews.length) return Response.json({ error: "PayPal could not read the invoice in that email." }, { status: 400 });
    return Response.json({ review: reviews[0], reviews });
  }
  const result = await reviewInvoice(body.link);
  if ("error" in result) return Response.json(result, { status: 400 });
  return Response.json({ review: result, reviews: [result] });
}
