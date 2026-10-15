import type { Review, Verdict } from "@/lib/types";

export type Tone = "green" | "orange" | "pink" | "purple" | "slate";

// Soft tile, strong icon circle, and a dark text colour that keeps contrast on the soft tile.
export const TONE: Record<Tone, { soft: string; strong: string; ink: string; bar: string }> = {
  green: { soft: "bg-mint-soft", strong: "bg-green", ink: "text-green-ink", bar: "bg-green" },
  orange: { soft: "bg-cream-soft", strong: "bg-orange", ink: "text-orange-ink", bar: "bg-orange" },
  pink: { soft: "bg-pink-soft", strong: "bg-pink", ink: "text-pink-ink", bar: "bg-pink" },
  purple: { soft: "bg-lilac-soft", strong: "bg-purple", ink: "text-purple-ink", bar: "bg-purple" },
  slate: { soft: "bg-slate-soft", strong: "bg-slate-ink", ink: "text-slate-ink", bar: "bg-slate-ink" },
};

const VERDICT: Record<Verdict, { label: string; tone: Tone }> = {
  pay: { label: "Safe to pay", tone: "green" },
  ask: { label: "Needs you", tone: "orange" },
  block: { label: "Blocked", tone: "pink" },
  closed: { label: "Nothing due", tone: "slate" },
};

/** What to show for an invoice: what happened to it if anything has, otherwise the agent's verdict. */
export function standing(review: Review): { label: string; tone: Tone } {
  switch (review.outcome?.state) {
    case "paid":
      return { label: "Paid", tone: "green" };
    case "rejected":
      return { label: "Rejected", tone: "slate" };
    case "overridden":
      return { label: "Unblocked, needs you", tone: "orange" };
    case "awaiting_payment":
      return { label: "Approved, unpaid", tone: "orange" };
    case "failed":
      return { label: "Payment failed", tone: "pink" };
    default:
      return VERDICT[review.verdict];
  }
}

export function money(amount: number, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount);
}
