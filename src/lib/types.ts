export type Verdict = "pay" | "ask" | "block" | "closed";

export type RealCheck =
  | { state: "found" }
  | { state: "not_found" }
  | { state: "not_yours" }
  | { state: "error"; detail: string };

export interface ExpectedCheck {
  senderEmail: string | null;
  timesPaid: number;
  largestPaid: number | null;
}

export interface WordingCheck {
  isScam: number;
  flags: Record<string, number>;
  model: string;
  ms: number;
}

export interface Reason {
  code: string;
  text: string;
}

export interface InvoiceFacts {
  id: string;
  status: string;
  senderName: string | null;
  senderEmail: string | null;
  amount: number;
  currency: string;
  note: string;
  items: string[];
  dueDate: string | null;
  payUrl: string | null;
}

/** What happened after the verdict. The verdict is the agent's judgment; this is the action. */
export type Outcome =
  | { state: "paid"; by: "agent" | "owner"; method: "payout" | "paypal_invoice"; amount: number; currency: string; at: string; reference: string }
  | { state: "awaiting_payment"; at: string }
  | { state: "rejected"; at: string }
  | { state: "failed"; at: string; detail: string };

export interface PriorPayment {
  amount: number;
  currency: string;
  at: string;
  source: "agent" | "paypal_history";
}

export interface Review {
  id: string;
  input: string;
  verdict: Verdict;
  reasons: Reason[];
  explanation: string;
  real: RealCheck;
  expected: ExpectedCheck | null;
  wording: WordingCheck | null;
  invoice: InvoiceFacts | null;
  outcome: Outcome | null;
  /** How the invoice reached the app. Missing on reviews stored before email intake existed. */
  via?: Via;
  reviewedAt: string;
}

export interface Via {
  channel: "paste" | "email";
  from?: string;
  subject?: string;
}
