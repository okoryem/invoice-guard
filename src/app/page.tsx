"use client";

import { useEffect, useRef, useState } from "react";
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
  const input = useRef<HTMLInputElement>(null);

  // The selected invoice lives in the URL so a view can be linked to and reloaded.
  function select(id: string | null) {
    setSelectedId(id);
    const url = new URL(window.location.href);
    if (id) url.searchParams.set("invoice", id);
    else url.searchParams.delete("invoice");
    window.history.replaceState(null, "", url);
  }

  function fail(message: string) {
    setError(message);
    input.current?.focus();
  }

  useEffect(() => {
    fetch("/api/invoices")
      .then((r) => r.json())
      .then((data) => {
        setReviews(data.reviews ?? []);
        const linked = new URLSearchParams(window.location.search).get("invoice");
        const all: Review[] = data.reviews ?? [];
        setSelectedId((current) => current ?? all.find((r) => r.id === linked)?.id ?? all[0]?.id ?? null);
      })
      .catch(() => setError("Earlier checks could not be loaded. Reload the page to try again."));
  }, []);

  async function check(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (!link.trim()) return fail("Paste a PayPal invoice link or ID first.");
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/invoices", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ link }) });
      const data = await res.json();
      if (!res.ok) {
        return fail(data.error ?? "The invoice could not be checked. Try again.");
      }
      setReviews((all) => [data.review, ...all.filter((r) => r.id !== data.review.id)]);
      select(data.review.id);
      setLink("");
    } catch {
      fail("The invoice could not be checked. Make sure the app is running, then try again.");
    } finally {
      setBusy(false);
    }
  }

  const selected = reviews.find((r) => r.id === selectedId) ?? null;

  return (
    <>
      <a href="#main" className="skip-link pill pill-primary">
        Skip to Content
      </a>
      <header className="sticky top-0 z-10 border-b border-hairline-soft bg-canvas">
        <div className="mx-auto flex h-14 w-full max-w-[1280px] items-center justify-between px-6 lg:px-12">
          <span className="text-[20px] font-[540] tracking-[-0.3px]" translate="no">
            Invoice Guard
          </span>
          <span className="eyebrow">PayPal sandbox</span>
        </div>
      </header>

      <main id="main" className="mx-auto flex w-full max-w-[1280px] flex-1 flex-col gap-12 px-6 py-12 lg:px-12">
        <div className="grid items-end gap-8 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <h1 className="text-[44px] font-[340] leading-[1.05] tracking-[-0.96px] text-balance sm:text-[64px]">Pays the invoices you can trust. Stops the rest.</h1>
          <dl className="grid grid-cols-3 gap-6 border-t border-ink pt-4">
            {COUNTED.map((verdict) => (
              <div key={verdict}>
                <dt className="eyebrow">{VERDICT[verdict].label}</dt>
                <dd className="mt-3 text-[40px] font-[340] leading-none tracking-[-0.8px] tabular-nums">{reviews.filter((r) => r.verdict === verdict).length}</dd>
              </div>
            ))}
          </dl>
        </div>

        <form onSubmit={check}>
          <label htmlFor="link" className="eyebrow">
            PayPal invoice link or ID
          </label>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row">
            <input
              id="link"
              ref={input}
              name="link"
              type="text"
              inputMode="url"
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder="https://www.paypal.com/invoice/p/#…"
              aria-describedby={error ? "link-error" : undefined}
              aria-invalid={error ? true : undefined}
              className="min-h-12 min-w-0 flex-1 rounded-lg border border-hairline bg-canvas px-3.5 py-3 text-[18px] tracking-[-0.26px] placeholder:text-ink/50"
              autoComplete="off"
              spellCheck={false}
            />
            <button type="submit" disabled={busy} className="pill pill-primary">
              {busy ? "Checking…" : "Check Invoice"}
            </button>
          </div>
          <p id="link-error" role="alert" className="mt-3 min-h-6 font-[480]">
            {error}
          </p>
        </form>

        <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <section aria-label="Checked invoices">
            <InvoiceTable reviews={reviews} onSelect={select} />
          </section>
          {selected ? (
            <ReviewDetail review={selected} />
          ) : (
            <section className="rounded-(--radius-block) bg-block-lime p-8">
              <p className="eyebrow">Three checks</p>
              <p className="mt-4 text-[26px] font-[340] leading-[1.35] tracking-[-0.26px]">
                PayPal confirms the invoice is real. Your payment record says whether it is expected. Jev reads the wording for signs of a scam.
              </p>
            </section>
          )}
        </div>
      </main>
    </>
  );
}
