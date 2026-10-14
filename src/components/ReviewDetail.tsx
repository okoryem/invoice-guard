import { FLAG_FIRED, FLAG_TEXT } from "@/lib/decide";
import type { Review } from "@/lib/types";
import { money, VERDICT } from "./verdict";

type Mark = "good" | "warn" | "bad" | "skip";

// Shape and word carry the result as well as colour.
const MARK: Record<Mark, { badge: string; word: string; path: string }> = {
  good: { badge: "bg-block-mint", word: "Passed", path: "M4.5 8.5l2.5 2.5 4.5-5.5" },
  warn: { badge: "bg-block-cream", word: "Check", path: "M8 4v5M8 11.5v.5" },
  bad: { badge: "bg-block-coral", word: "Failed", path: "M5 5l6 6M11 5l-6 6" },
  skip: { badge: "bg-surface-soft", word: "Skipped", path: "M5 8h6" },
};

function Check({ title, by, mark, summary, children }: { title: string; by: string; mark: Mark; summary: string; children?: React.ReactNode }) {
  const m = MARK[mark];
  return (
    <section className="rounded-(--radius-block) border border-hairline p-6">
      <div className="flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-3 text-[20px] font-[540] tracking-[-0.2px]">
          <span className={`grid size-7 shrink-0 place-items-center rounded-full ${m.badge}`}>
            <svg viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d={m.path} />
            </svg>
          </span>
          {title}
        </h3>
        <span className="eyebrow text-right">{by}</span>
      </div>
      <p className="mt-3 leading-[1.45]">
        <span className="font-[540]">{m.word}.</span> {summary}
      </p>
      {children}
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

export function ReviewDetail({ review }: { review: Review }) {
  const v = VERDICT[review.verdict];
  const inv = review.invoice;
  const flags = review.wording ? Object.entries(review.wording.flags).sort((a, b) => b[1] - a[1]) : [];

  return (
    <div className="flex flex-col gap-4" aria-live="polite">
      <section className={`rounded-(--radius-block) p-8 ${v.block}`}>
        <p className="eyebrow break-all" translate="no">
          {review.id}
        </p>
        <h2 className="mt-4 text-[40px] font-[340] leading-[1.05] tracking-[-0.8px]">{v.label}</h2>
        {inv && (
          <p className="mt-3 text-[20px] leading-[1.4]">
            <span className="font-[540] tabular-nums">{money(inv.amount, inv.currency)}</span> to {inv.senderName ?? inv.senderEmail ?? "an unnamed sender"}
            {inv.dueDate && `, due ${inv.dueDate}`}
          </p>
        )}
        {review.explanation && <p className="mt-4 leading-[1.45]">{review.explanation}</p>}
        {review.verdict === "pay" && <p className="mt-4 leading-[1.45]">Every check passed. Automatic payment is the next piece to be built.</p>}
        {review.verdict === "ask" && inv?.payUrl && (
          <a href={inv.payUrl} target="_blank" rel="noreferrer" className="pill pill-primary mt-6">
            Review and Pay on PayPal
          </a>
        )}
      </section>

      {inv?.note && (
        <section className="rounded-(--radius-block) bg-surface-soft p-6">
          <h3 className="eyebrow">What the sender wrote</h3>
          <p className="mt-3 whitespace-pre-wrap leading-[1.45]">{inv.note}</p>
        </section>
      )}

      <Check title="Is it real?" by="PayPal" {...realCheck(review)} />
      <Check title="Is it expected?" by="Your payments" {...expectedCheck(review)} />
      <Check title="Does it read like a scam?" by={review.wording ? `Jev, ${review.wording.ms} ms` : "Jev"} {...wordingCheck(review)}>
        {flags.length > 0 && (
          <ul className="mt-5 flex flex-col gap-2.5 border-t border-hairline-soft pt-5">
            {flags.map(([code, p]) => (
              <li key={code} className="grid grid-cols-[1fr_4.5rem_2.75rem] items-center gap-3 text-[15px] leading-[1.35]">
                <span className={p >= FLAG_FIRED ? "font-[540]" : undefined}>{FLAG_TEXT[code] ?? code}</span>
                <span className="h-1.5 overflow-hidden rounded-full bg-hairline" aria-hidden="true">
                  <span className="block h-full rounded-full bg-ink" style={{ width: `${Math.round(p * 100)}%` }} />
                </span>
                <span className="text-right tabular-nums">{Math.round(p * 100)}%</span>
              </li>
            ))}
          </ul>
        )}
      </Check>
    </div>
  );
}
