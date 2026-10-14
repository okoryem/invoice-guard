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
  reviewedAt: string;
}
