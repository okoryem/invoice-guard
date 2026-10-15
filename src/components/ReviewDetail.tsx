import { FLAG_FIRED, FLAG_TEXT } from "@/lib/decide";
import type { Outcome, Review } from "@/lib/types";
import { Icon, type IconName } from "./icons";
import { money, standing, TONE, type Tone } from "./verdict";

type Mark = "good" | "warn" | "bad" | "skip";

// Icon and word carry the result as well as colour.
const MARK: Record<Mark, { tone: Tone; icon: IconName; word: string }> = {
  good: { tone: "green", icon: "check", word: "Passed" },
  warn: { tone: "orange", icon: "alert", word: "Check" },
  bad: { tone: "pink", icon: "ban", word: "Failed" },
  skip: { tone: "slate", icon: "minus", word: "Skipped" },
};

function Check({ title, by, mark, summary, children }: { title: string; by: string; mark: Mark; summary: string; children?: React.ReactNode }) {
  const m = MARK[mark];
  return (
    <section className="border-t border-line py-5 first:border-t-0 first:pt-0">
      <div className="flex items-start gap-4">
        <span className={`grid size-10 shrink-0 place-items-center rounded-full text-white ${TONE[m.tone].strong}`}>
          <Icon name={m.icon} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3">
            <h3 className="text-[16px] font-semibold">{title}</h3>
            <span className="text-[12px] text-muted">{by}</span>
          </div>
          <p className="mt-1 text-[14px] leading-[1.6] text-muted">
            <span className={`font-medium ${TONE[m.tone].ink}`}>{m.word}.</span> {summary}
          </p>
          {children}
        </div>
      </div>
    </section>
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
  if (!e) return { mark: "skip", summary: "There is no invoice to check." };
  if (!e.senderEmail) return { mark: "warn", summary: "The sender gave no verified email, so they cannot be matched to anyone you have paid." };
  if (e.timesPaid === 0) return { mark: "warn", summary: `This is the first invoice from ${e.senderEmail}. You have never paid them.` };
  const unusual = review.reasons.some((r) => r.code === "unusual_amount");
  return {
    mark: unusual ? "warn" : "good",
    summary: `Paid ${e.timesPaid} time${e.timesPaid === 1 ? "" : "s"} before, up to ${money(e.largestPaid ?? 0, review.invoice?.currency ?? "USD")}. This amount is ${unusual ? "well above that" : "in the usual range"}.`,
  };
}

function wordingCheck(review: Review): { mark: Mark; summary: string } {
  const w = review.wording;
  if (!w) return review.invoice ? { mark: "warn", summary: "The wording could not be checked." } : { mark: "skip", summary: "There is no invoice to read." };
  const pct = Math.round(w.isScam * 100);
  if (w.isScam >= 0.8) return { mark: "bad", summary: `${pct}% likely a scam, judged from the wording.` };
  if (w.isScam > 0.2) return { mark: "warn", summary: `${pct}% likely a scam. Not clear either way.` };
  return { mark: "good", summary: `${pct}% likely a scam. The wording looks ordinary.` };
}

function outcomeText(o: Outcome): string {
  const when = new Date(o.at).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
  switch (o.state) {
    case "paid":
      return o.method === "payout"
        ? `${o.by === "agent" ? "Paid automatically" : "Paid on your approval"} on ${when}, ${money(o.amount, o.currency)} sent to the vendor's verified email. The invoice stays open on PayPal until the vendor marks it paid.`
        : `Paid on PayPal on ${when}. The vendor now counts as known.`;
    case "awaiting_payment":
      return "Approved. Pay it on PayPal's own invoice page, then check again so the vendor is remembered.";
    case "rejected":
      return `Rejected on ${when}. Nothing was paid.`;
    case "overridden":
      return `You marked this as not a scam on ${when}. It still needs your approval before anything is paid.`;
    case "failed":
      return `The payment did not go through: ${o.detail}.`;
  }
}

export type ReviewAction = "approve" | "reject" | "confirm" | "override";

export function ReviewDetail({ review, onAct, acting }: { review: Review; onAct: (action: ReviewAction) => void; acting: ReviewAction | null }) {
  const v = standing(review);
  const tone = TONE[v.tone];
  const inv = review.invoice;
  const flags = review.wording ? Object.entries(review.wording.flags).sort((a, b) => b[1] - a[1]) : [];

  return (
    <div className="flex flex-col gap-6" aria-live="polite">
      <section className="card p-6">
        <div className={`rounded-2xl p-5 ${tone.soft}`}>
          <div className="flex items-center gap-3">
            <span className={`grid size-10 place-items-center rounded-full text-white ${tone.strong}`}>
              <Icon name={v.tone === "green" ? "check" : v.tone === "pink" ? "ban" : v.tone === "orange" ? "clock" : "minus"} />
            </span>
            <div className="min-w-0">
              <h2 className="text-[22px] font-semibold leading-tight">{v.label}</h2>
              <p className="truncate text-[12px] text-muted" translate="no">
                {review.id}
              </p>
            </div>
          </div>
          {inv && (
            <p className="mt-4 text-[15px]">
              <span className="text-[24px] font-semibold tabular-nums">{money(inv.amount, inv.currency)}</span>
              <span className="text-muted"> to </span>
              <span className="font-medium">{inv.senderName ?? inv.senderEmail ?? "an unnamed sender"}</span>
              {inv.dueDate && <span className="text-muted">, due {inv.dueDate}</span>}
            </p>
          )}
          {review.explanation && <p className="mt-3 text-[14px] leading-[1.6]">{review.explanation}</p>}
          {review.verdict === "pay" && !review.outcome && <p className="mt-3 text-[14px] leading-[1.6]">Every check passed.</p>}
          {review.outcome && <p className={`mt-3 text-[14px] font-medium leading-[1.6] ${tone.ink}`}>{outcomeText(review.outcome)}</p>}
          <Actions review={review} onAct={onAct} acting={acting} />
        </div>

        {review.via?.channel === "email" && (
          <p className="mt-5 text-[13px] text-muted">
            Arrived by email{review.via.from && <> from <span className="font-medium text-ink">{review.via.from}</span></>}
            {review.via.subject && <>: “{review.via.subject}”</>}
          </p>
        )}

        {inv?.note && (
          <div className="mt-5">
            <h3 className="text-[13px] text-muted">What the sender wrote</h3>
            <p className="mt-1 whitespace-pre-wrap text-[14px] leading-[1.6]">{inv.note}</p>
          </div>
        )}
      </section>

      <section className="card p-6">
        <h2 className="mb-5 text-[20px] font-semibold">The three checks</h2>
        <Check title="Is it real?" by="PayPal" {...realCheck(review)} />
        <Check title="Is it expected?" by="Your payments" {...expectedCheck(review)} />
        <Check title="Does it read like a scam?" by={review.wording ? `Jev, ${review.wording.ms} ms` : "Jev"} {...wordingCheck(review)}>
          {flags.length > 0 && (
            <ul className="mt-4 flex flex-col gap-3">
              {flags.map(([code, p]) => (
                <li key={code} className="grid grid-cols-[1fr_4.5rem_2.75rem] items-center gap-3 text-[13px] leading-[1.4]">
                  <span className={p >= FLAG_FIRED ? "font-medium" : "text-muted"}>{FLAG_TEXT[code] ?? code}</span>
                  <span className="h-1 overflow-hidden rounded-full bg-line" aria-hidden="true">
                    <span className={`block h-full rounded-full ${p >= FLAG_FIRED ? "bg-pink" : "bg-primary"}`} style={{ width: `${Math.max(Math.round(p * 100), 2)}%` }} />
                  </span>
                  <span className="text-right tabular-nums text-muted">{Math.round(p * 100)}%</span>
                </li>
              ))}
            </ul>
          )}
        </Check>
      </section>
    </div>
  );
}

function Actions({ review, onAct, acting }: { review: Review; onAct: (action: ReviewAction) => void; acting: ReviewAction | null }) {
  const state = review.outcome?.state;
  const known = Boolean(review.invoice?.senderEmail) && (review.expected?.timesPaid ?? 0) > 0;
  const busy = acting !== null;

  if (state === "awaiting_payment") {
    return (
      <div className="mt-5 flex flex-wrap gap-3">
        {review.invoice?.payUrl && (
          <a href={review.invoice.payUrl} target="_blank" rel="noreferrer" className="btn btn-primary">
            Pay on PayPal
          </a>
        )}
        <button type="button" onClick={() => onAct("confirm")} disabled={busy} className="btn btn-outline">
          {acting === "confirm" ? "Checking…" : "I Paid It, Check Again"}
        </button>
      </div>
    );
  }
  // A blocked invoice that PayPal confirmed is real can be unblocked if the agent got it wrong.
  if (review.verdict === "block" && !state && review.real.state === "found" && review.invoice) {
    return (
      <div className="mt-5">
        <button type="button" onClick={() => onAct("override")} disabled={busy} className="btn btn-outline">
          {acting === "override" ? "Unblocking…" : "Not a Scam? Unblock"}
        </button>
      </div>
    );
  }
  const waiting = review.verdict === "ask" || state === "overridden";
  if (!waiting || state === "paid" || state === "rejected") return null;
  return (
    <div className="mt-5 flex flex-wrap gap-3">
      <button type="button" onClick={() => onAct("approve")} disabled={busy} className="btn btn-primary">
        {acting === "approve" ? "Paying…" : known ? "Approve and Pay" : "Approve"}
      </button>
      <button type="button" onClick={() => onAct("reject")} disabled={busy} className="btn btn-outline">
        {acting === "reject" ? "Rejecting…" : "Reject"}
      </button>
    </div>
  );
}
