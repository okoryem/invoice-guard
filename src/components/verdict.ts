import type { Verdict } from "@/lib/types";

export const VERDICT: Record<Verdict, { label: string; chip: string; banner: string }> = {
  pay: { label: "Safe to pay", chip: "bg-pay-soft text-pay", banner: "border-pay/30 bg-pay-soft text-pay" },
  ask: { label: "Needs you", chip: "bg-ask-soft text-ask", banner: "border-ask/30 bg-ask-soft text-ask" },
  block: { label: "Blocked", chip: "bg-block-soft text-block", banner: "border-block/30 bg-block-soft text-block" },
  closed: { label: "Nothing due", chip: "bg-closed-soft text-closed", banner: "border-line bg-closed-soft text-closed" },
};

export function money(amount: number, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount);
}
