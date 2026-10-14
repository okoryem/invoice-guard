"use client";

import { useEffect, useState } from "react";
import { InvoiceTable } from "@/components/InvoiceTable";
import { ReviewDetail } from "@/components/ReviewDetail";
import { VERDICT } from "@/components/verdict";
import type { Review, Verdict } from "@/lib/types";

const COUNTED: Verdict[] = ["pay", "ask", "block"];

export default function Home() {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/invoices")
      .then((r) => r.json())
      .then((data) => {
        setReviews(data.reviews ?? []);
        setSelectedId((current) => current ?? data.reviews?.[0]?.id ?? null);
      })
      .catch(() => setError("Could not load earlier checks."));
  }, []);

  async function check(event: React.FormEvent) {
    event.preventDefault();
    if (!link.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/invoices", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ link }) });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "The invoice could not be checked.");
        return;
      }
      setReviews((all) => [data.review, ...all.filter((r) => r.id !== data.review.id)]);
      setSelectedId(data.review.id);
      setLink("");
    } catch {
      setError("The invoice could not be checked. Is the server running?");
    } finally {
      setBusy(false);
    }
  }

  const selected = reviews.find((r) => r.id === selectedId) ?? null;

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Invoice Guard</h1>
          <p className="text-sm text-muted">Pays the PayPal invoices you can trust. Stops the ones you cannot.</p>
        </div>
        <dl className="flex gap-2">
          {COUNTED.map((verdict) => (
            <div key={verdict} className={`rounded-xl px-4 py-2 ${VERDICT[verdict].chip}`}>
              <dd className="text-xl font-semibold tabular-nums leading-tight">{reviews.filter((r) => r.verdict === verdict).length}</dd>
              <dt className="text-xs font-medium">{VERDICT[verdict].label}</dt>
            </div>
          ))}
        </dl>
      </header>

      <form onSubmit={check} className="rounded-xl border border-line bg-card p-4">
        <label htmlFor="link" className="text-sm font-medium">
          Paste a PayPal invoice link or ID
        </label>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          <input
            id="link"
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="https://www.paypal.com/invoice/p/#… or INV2-XXXX-XXXX-XXXX-XXXX"
            className="min-w-0 flex-1 rounded-lg border border-line bg-paper px-3 py-2 font-mono text-sm outline-none focus:border-accent"
            autoComplete="off"
          />
          <button type="submit" disabled={busy || !link.trim()} className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
            {busy ? "Checking…" : "Check invoice"}
          </button>
        </div>
        {error && <p className="mt-2 text-sm text-block">{error}</p>}
      </form>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <InvoiceTable reviews={reviews} onSelect={setSelectedId} />
        {selected ? (
          <ReviewDetail review={selected} />
        ) : (
          <div className="rounded-xl border border-dashed border-line p-6 text-sm text-muted">
            Each invoice gets three checks: PayPal confirms it is real, your payment history says whether it is expected, and Jev reads the wording for signs of a scam.
          </div>
        )}
      </div>
    </main>
  );
}
