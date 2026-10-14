import type { Verdict } from "@/lib/types";

// One pastel block per verdict, from the DESIGN.md block palette.
export const VERDICT: Record<Verdict, { label: string; block: string }> = {
  pay: { label: "Safe to pay", block: "bg-block-mint" },
  ask: { label: "Needs you", block: "bg-block-cream" },
  block: { label: "Blocked", block: "bg-block-coral" },
  closed: { label: "Nothing due", block: "bg-surface-soft" },
};

export function money(amount: number, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount);
}
