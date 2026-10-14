import { FLAG_FIRED, FLAG_TEXT } from "@/lib/decide";
import type { Review } from "@/lib/types";
import { money, VERDICT } from "./verdict";

type Mark = "good" | "warn" | "bad" | "skip";
const MARK: Record<Mark, { dot: string; word: string }> = {
  good: { dot: "bg-pay", word: "text-pay" },
  warn: { dot: "bg-ask", word: "text-ask" },
  bad: { dot: "bg-block", word: "text-block" },
  skip: { dot: "bg-line", word: "text-muted" },
};

function Check({ title, by, mark, summary, children }: { title: string; by: string; mark: Mark; summary: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-card p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="flex items-center gap-2 font-semibold">
          <span className={`inline-block size-2.5 rounded-full ${MARK[mark].dot}`} />
          {title}
        </h3>
        <span className="text-xs text-muted">{by}</span>
      </div>
      <p className={`mt-1 text-sm ${MARK[mark].word}`}>{summary}</p>
      {children}
    </div>
  );
}

function realCheck(review: Review): { mark: Mark; summary: string } {
  switch (review.real.state) {
    case "found":
      return { mark: "good", summary: "PayPal has this invoice, and it is addressed to your account." };
    case "not_found":
      return { mark: "bad", summary: "PayPal has no record of this invoice. The message only imitates PayPal." };
    case "not_yours":
      return { mark: "bad", summary: "The invoice exists, but it is not addressed to your account." };
    case "error":
      return { mark: "warn", summary: "PayPal could not be reached to confirm it." };
  }
}

function expectedCheck(review: Review): { mark: Mark; summary: string } {
  const e = review.expected;
  if (!e) return { mark: "skip", summary: "Not checked, because there is no invoice to check." };
  if (!e.senderEmail) return { mark: "warn", summary: "The sender gave no verified email, so they cannot be matched to anyone you have paid." };
  if (e.timesPaid === 0) return { mark: "warn", summary: `First invoice from ${e.senderEmail}. You have never paid them.` };
  const usual = review.reasons.some((r) => r.code === "unusual_amount") ? "This amount is well above that." : "This amount is in the usual range.";
  return {
    mark: usual.includes("above") ? "warn" : "good",
    summary: `Paid ${e.timesPaid} time${e.timesPaid === 1 ? "" : "s"} before, up to ${money(e.largestPaid ?? 0, review.invoice?.currency ?? "USD")}. ${usual}`,
  };
}

function wordingCheck(review: Review): { mark: Mark; summary: string } {
  const w = review.wording;
  if (!w) return { mark: review.invoice ? "warn" : "skip", summary: review.invoice ? "The wording could not be checked." : "Not checked, because there is no invoice to read." };
  const pct = Math.round(w.isScam * 100);
  if (w.isScam >= 0.8) return { mark: "bad", summary: `${pct}% likely a scam, judged from the wording.` };
  if (w.isScam > 0.2) return { mark: "warn", summary: `${pct}% likely a scam. Not clear either way.` };
  return { mark: "good", summary: `${pct}% likely a scam. The wording looks ordinary.` };
}

export function ReviewDetail({ review }: { review: Review }) {
  const v = VERDICT[review.verdict];
  const inv = review.invoice;
  const flags = review.wording ? Object.entries(review.wording.flags).sort((a, b) => b[1] - a[1]) : [];

  return (
    <div className="flex flex-col gap-4">
      <div className={`rounded-xl border p-4 ${v.banner}`}>
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-lg font-semibold">{v.label}</h2>
          <span className="font-mono text-xs opacity-80">{review.id}</span>
        </div>
        {inv && (
          <p className="mt-1 text-sm text-ink">
            <span className="font-semibold">{money(inv.amount, inv.currency)}</span> to {inv.senderName ?? inv.senderEmail ?? "an unnamed sender"}
            {inv.dueDate && <span className="text-muted"> · due {inv.dueDate}</span>}
          </p>
        )}
        {review.explanation && <p className="mt-2 text-sm leading-relaxed text-ink">{review.explanation}</p>}
        {review.verdict === "pay" && <p className="mt-2 text-sm text-ink">Every check passed. Automatic payment is the next piece to be built.</p>}
        {review.verdict === "ask" && inv?.payUrl && (
          <a href={inv.payUrl} target="_blank" rel="noreferrer" className="mt-3 inline-block rounded-lg bg-ink px-3 py-1.5 text-sm font-medium text-white">
            Open on PayPal to review and pay
          </a>
        )}
      </div>

      {inv?.note && (
        <div className="rounded-xl border border-line bg-card p-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">What the sender wrote</h3>
          <p className="mt-1 whitespace-pre-wrap text-sm">{inv.note}</p>
        </div>
      )}

      <Check title="Is it real?" by="PayPal" {...realCheck(review)} />
      <Check title="Is it expected?" by="Your payment history" {...expectedCheck(review)} />
      <Check title="Does it read like a scam?" by={review.wording ? `Jev · ${review.wording.ms} ms` : "Jev"} {...wordingCheck(review)}>
        {flags.length > 0 && (
          <ul className="mt-3 flex flex-col gap-1.5">
            {flags.map(([code, p]) => (
              <li key={code} className="grid grid-cols-[1fr_5rem_2.5rem] items-center gap-2 text-xs">
                <span className={p >= FLAG_FIRED ? "font-medium text-ink" : "text-muted"}>{FLAG_TEXT[code] ?? code}</span>
                <span className="h-1.5 overflow-hidden rounded-full bg-line">
                  <span className={`block h-full rounded-full ${p >= FLAG_FIRED ? "bg-block" : "bg-muted/50"}`} style={{ width: `${Math.round(p * 100)}%` }} />
                </span>
                <span className="text-right tabular-nums text-muted">{Math.round(p * 100)}%</span>
              </li>
            ))}
          </ul>
        )}
      </Check>
    </div>
  );
}
