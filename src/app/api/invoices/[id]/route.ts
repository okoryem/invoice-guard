import { act, type Action } from "@/lib/review";

const ACTIONS: Action[] = ["approve", "reject", "confirm", "override"];

export async function POST(request: Request, ctx: RouteContext<"/api/invoices/[id]">) {
  const { id } = await ctx.params;
  const body = await request.json().catch(() => null);
  if (!ACTIONS.includes(body?.action)) {
    return Response.json({ error: "Unknown action." }, { status: 400 });
  }
  const result = await act(id, body.action);
  if ("error" in result) return Response.json(result, { status: 409 });
  return Response.json({ review: result });
}
