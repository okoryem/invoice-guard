"use client";

import { useEffect, useState } from "react";

export function Settings() {
  const [saved, setSaved] = useState<number | null>(null);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((data) => {
        setSaved(data.autoPayLimit);
        setValue(String(data.autoPayLimit));
      })
      .catch(() => setMessage({ ok: false, text: "Settings could not be loaded. Reload the page to try again." }));
  }, []);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ autoPayLimit: Number(value) }) });
      const data = await res.json();
      if (!res.ok) return setMessage({ ok: false, text: data.error ?? "That did not save. Try again." });
      setSaved(data.autoPayLimit);
      setValue(String(data.autoPayLimit));
      setMessage({ ok: true, text: "Saved. It applies to invoices checked from now on." });
    } catch {
      setMessage({ ok: false, text: "That did not save. Make sure the app is running, then try again." });
    } finally {
      setBusy(false);
    }
  }

  const changed = saved !== null && value.trim() !== "" && Number(value) !== saved;

  return (
    <section id="settings" aria-labelledby="settings-title" className="card p-6">
      <h2 id="settings-title" className="text-[20px] font-semibold">
        Settings
      </h2>
      <form onSubmit={save} className="mt-4 max-w-xl">
        <label htmlFor="limit" className="font-medium">
          Pay known vendors automatically up to
        </label>
        <p id="limit-help" className="mt-1 text-[14px] leading-[1.6] text-muted">
          Anything above this waits for you, even from a vendor you have paid before. Set it to 0 to approve every payment yourself. First-time vendors always wait for you.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <div className="flex items-center rounded-xl bg-page px-4 ring-1 ring-line focus-within:ring-2 focus-within:ring-primary">
            <span className="text-muted" aria-hidden="true">
              $
            </span>
            <input
              id="limit"
              name="limit"
              type="number"
              inputMode="decimal"
              min={0}
              max={100000}
              step="0.01"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              aria-describedby="limit-help limit-message"
              className="min-h-11 w-36 bg-transparent px-2 tabular-nums outline-none"
              autoComplete="off"
            />
          </div>
          <button type="submit" disabled={busy || !changed} className="btn btn-primary">
            {busy ? "Saving…" : "Save Limit"}
          </button>
        </div>
        <p id="limit-message" role="status" className={`mt-3 min-h-6 text-[14px] font-medium ${message?.ok ? "text-green-ink" : "text-pink-ink"}`}>
          {message?.text}
        </p>
      </form>
    </section>
  );
}
