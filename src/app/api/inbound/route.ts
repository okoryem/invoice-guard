import { reviewEmail } from "@/lib/review";

// Forwarded emails, delivered by an inbound email service. Accepts Postmark's inbound JSON
// (From, Subject, TextBody, HtmlBody) or a plain { from, subject, text, html }.
// Protected by the demo password like every other route: put it in the webhook URL as
// https://any-name:PASSWORD@host/api/inbound.
const MAX_BYTES = 2_000_000;

export async function POST(request: Request) {
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BYTES) {
    return Response.json({ error: "Email too large." }, { status: 413 });
  }
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return Response.json({ error: "Expected a JSON email." }, { status: 400 });

  const text = (value: unknown) => (typeof value === "string" ? value : undefined);
  const result = await reviewEmail({
    from: text(body.FromFull?.Email) ?? text(body.From) ?? text(body.from),
    subject: text(body.Subject) ?? text(body.subject),
    text: text(body.TextBody) ?? text(body.text),
    html: text(body.HtmlBody) ?? text(body.html),
  });
  // Always 200 for a readable email, so the email service does not retry it.
  if ("error" in result) return Response.json({ reviews: [], note: result.error });
  return Response.json({ reviews: result });
}
