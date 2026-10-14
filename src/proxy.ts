import { NextResponse, type NextRequest } from "next/server";

// One shared password for the hosted demo. Anyone with the link could otherwise check
// invoices, spend the Jev and OpenRouter credits, and trigger sandbox payouts.
// Unset locally, so development needs no login.
export function proxy(request: NextRequest) {
  const password = process.env.DEMO_PASSWORD;
  if (!password) return NextResponse.next();

  const header = request.headers.get("authorization") ?? "";
  if (header.startsWith("Basic ")) {
    const decoded = atob(header.slice(6));
    const given = decoded.slice(decoded.indexOf(":") + 1);
    if (sameText(given, password)) return NextResponse.next();
  }
  return new NextResponse("A password is needed to see this demo. It is in the project's README.", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Invoice Guard demo", charset="UTF-8"' },
  });
}

/** Compares without stopping at the first difference, so timing reveals nothing. */
function sameText(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

export const config = {
  // Render's health check must get through without the password.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/health).*)"],
};
