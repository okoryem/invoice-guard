"use client";

import { useEffect, useRef, useState } from "react";
import { Icon, type IconName } from "@/components/icons";
import { InvoiceTable } from "@/components/InvoiceTable";
import { ReviewDetail, type ReviewAction } from "@/components/ReviewDetail";
import { Sidebar } from "@/components/Sidebar";
import { money, TONE, type Tone } from "@/components/verdict";
import type { Review } from "@/lib/types";

// What the owner sees as lists. An invoice the agent stopped on stays in "Needs you" until
// the owner pays or rejects it.
type View = "all" | "paid" | "needs" | "blocked";
const VIEWS: { id: View; label: string; match: (r: Review) => boolean }[] = [
  { id: "all", label: "All", match: () => true },
  { id: "paid", label: "Paid", match: (r) => r.outcome?.state === "paid" },
  { id: "needs", label: "Needs you", match: (r) => r.verdict === "ask" && r.outcome?.state !== "paid" && r.outcome?.state !== "rejected" },
  { id: "blocked", label: "Blocked", match: (r) => r.verdict === "block" },
];

function total(reviews: Review[]) {
  return money(reviews.reduce((sum, r) => sum + (r.invoice?.amount ?? 0), 0), "USD");
}

function Tile({ tone, icon, value, label, note }: { tone: Tone; icon: IconName; value: string | number; label: string; note: string }) {
  const t = TONE[tone];
  return (
    <div className={`rounded-2xl p-5 ${t.soft}`}>
      <span className={`grid size-10 place-items-center rounded-full text-white ${t.strong}`}>
        <Icon name={icon} />
      </span>
      <p className="mt-4 text-[24px] font-semibold tabular-nums">{value}</p>
      <p className="mt-1 font-medium text-[#425166]">{label}</p>
      <p className={`mt-2 text-[12px] font-medium ${t.ink}`}>{note}</p>
    </div>
  );
}

export default function Home() {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<View>("all");
  const [acting, setActing] = useState<ReviewAction | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  // The selected invoice lives in the URL so a view can be linked to and reloaded.
  function select(id: string | null) {
    setSelectedId(id);
    setActionError(null);
    const url = new URL(window.location.href);
    if (id) url.searchParams.set("invoice", id);
    else url.searchParams.delete("invoice");
    window.history.replaceState(null, "", url);
  }

  function fail(message: string) {
    setError(message);
    input.current?.focus();
  }

  // Invoices forwarded by email arrive on the server, so check for them while the page is open.
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState !== "visible") return;
      fetch("/api/invoices")
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => data && setReviews(data.reviews ?? []))
        .catch(() => {});
    };
    const timer = setInterval(refresh, 15_000);
    return () => clearInterval(timer);
  }, []);

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
      const added: Review[] = data.reviews ?? [data.review];
      setReviews((all) => [...added, ...all.filter((r) => !added.some((a) => a.id === r.id))]);
      select(data.review.id);
      setLink("");
    } catch {
      fail("The invoice could not be checked. Make sure the app is running, then try again.");
    } finally {
      setBusy(false);
    }
  }

  async function act(action: ReviewAction) {
    if (!selectedId || acting) return;
    setActing(action);
    setActionError(null);
    try {
      const res = await fetch(`/api/invoices/${selectedId}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
      const data = await res.json();
      if (!res.ok) return setActionError(data.error ?? "That did not work. Try again.");
      setReviews((all) => all.map((r) => (r.id === data.review.id ? data.review : r)));
    } catch {
      setActionError("That did not work. Make sure the app is running, then try again.");
    } finally {
      setActing(null);
    }
  }

  const selected = reviews.find((r) => r.id === selectedId) ?? null;
  const shown = reviews.filter(VIEWS.find((v) => v.id === view)!.match);

  const paid = reviews.filter(VIEWS[1].match);
  const needs = reviews.filter(VIEWS[2].match);
  const blocked = reviews.filter(VIEWS[3].match);

  return (
    <div className="flex min-h-screen">
      <a href="#main" className="skip-link btn btn-primary">
        Skip to Content
      </a>
      <Sidebar />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 bg-page/90 backdrop-blur">
          <form onSubmit={check} className="flex flex-wrap items-center gap-x-8 gap-y-3 px-6 py-5 lg:px-8">
            <h1 className="text-[28px] font-semibold lg:text-[32px]">Dashboard</h1>
            <div className="flex min-w-0 flex-1 basis-[420px] flex-col gap-3 sm:flex-row">
              <label htmlFor="link" className="sr-only">
                PayPal invoice link or ID
              </label>
              <div className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl bg-card px-4 shadow-(--shadow-card) focus-within:ring-2 focus-within:ring-primary">
                <span className="text-primary">
                  <Icon name="search" />
                </span>
                <input
                  id="link"
                  ref={input}
                  name="link"
                  type="text"
                  inputMode="url"
                  value={link}
                  onChange={(e) => setLink(e.target.value)}
                  placeholder="Paste a PayPal invoice link, ID, or a whole email…"
                  aria-describedby="link-error"
                  aria-invalid={error ? true : undefined}
                  className="min-h-12 min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted"
                  autoComplete="off"
                  spellCheck={false}
                />
              </div>
              <button type="submit" disabled={busy} className="btn btn-primary">
                {busy ? "Checking…" : "Check Invoice"}
              </button>
            </div>
          </form>
          <p id="link-error" role="alert" className="px-6 text-[14px] font-medium text-pink-ink empty:hidden lg:px-8">
            {error}
          </p>
        </header>

        <main id="main" className="flex flex-col gap-6 px-6 pb-10 pt-2 lg:px-8">
          <section className="card p-6">
            <h2 className="text-[20px] font-semibold">Invoices so far</h2>
            <p className="text-muted">What the agent did with everything it was shown</p>
            <div className="mt-6 grid grid-cols-2 gap-4 xl:grid-cols-4">
              <Tile tone="green" icon="check" value={paid.length} label="Paid" note={`${total(paid)} sent`} />
              <Tile tone="orange" icon="clock" value={needs.length} label="Needs you" note={`${total(needs)} waiting`} />
              <Tile tone="pink" icon="ban" value={blocked.length} label="Blocked" note={`${total(blocked)} stopped`} />
              <Tile tone="purple" icon="shield" value={reviews.length} label="Checked" note="Three checks each" />
            </div>
          </section>

          <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <section aria-labelledby="invoices-title" className="card p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 id="invoices-title" className="text-[20px] font-semibold">
                  Invoices
                </h2>
                <div role="group" aria-label="Show" className="flex flex-wrap gap-2">
                  {VIEWS.map((v) => (
                    <button
                      key={v.id}
                      type="button"
                      aria-pressed={view === v.id}
                      onClick={() => setView(v.id)}
                      className={`rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors ${view === v.id ? "bg-primary text-white" : "text-muted hover:bg-page hover:text-ink"}`}
                    >
                      {v.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="mt-4">
                <InvoiceTable reviews={shown} onSelect={select} />
              </div>
            </section>

            {selected ? (
              <div className="flex flex-col gap-3">
                {actionError && (
                  <p role="alert" className="font-medium text-pink-ink">
                    {actionError}
                  </p>
                )}
                <ReviewDetail review={selected} onAct={act} acting={acting} />
              </div>
            ) : (
              <section className="card p-6">
                <h2 className="text-[20px] font-semibold">How it decides</h2>
                <p className="mt-2 leading-[1.6] text-muted">
                  PayPal confirms the invoice is real. Your payment record says whether it is expected. Jev reads the wording for signs of a scam. Known vendors with clean invoices are paid; anything else waits for you.
                </p>
              </section>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
