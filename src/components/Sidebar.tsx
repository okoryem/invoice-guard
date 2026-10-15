import { Icon } from "./icons";

// Set at build time to the inbound email address, once an email service is connected.
const INBOUND = process.env.NEXT_PUBLIC_INBOUND_ADDRESS;

export function Sidebar() {
  return (
    <aside className="sticky top-0 hidden h-screen w-[248px] shrink-0 flex-col bg-card px-6 py-8 lg:flex">
      <div className="flex items-center gap-3 px-2">
        <span className="grid size-10 place-items-center rounded-lg bg-primary text-white">
          <Icon name="shield" className="size-6" />
        </span>
        <span className="whitespace-nowrap text-[20px] font-semibold" translate="no">
          Invoice Guard
        </span>
      </div>

      <nav aria-label="Main" className="mt-12">
        <a href="#main" aria-current="page" className="flex items-center gap-4 rounded-2xl bg-primary px-6 py-4 font-semibold text-white shadow-[0_20px_50px_rgba(55,69,87,0.1)]">
          <Icon name="grid" />
          Dashboard
        </a>
        <a href="#settings" className="mt-2 flex items-center gap-4 rounded-2xl px-6 py-4 text-muted transition-colors hover:bg-page hover:text-ink">
          <Icon name="sliders" />
          Settings
        </a>
      </nav>

      {INBOUND && (
        <div className="mt-8 rounded-2xl bg-page p-4">
          <p className="text-[13px] font-medium">Forward invoice emails to</p>
          <p className="mt-1 break-all text-[13px] text-primary" translate="no">
            {INBOUND}
          </p>
        </div>
      )}

      <div className="mt-auto rounded-[20px] bg-primary p-6 text-center text-white">
        <span className="mx-auto grid size-12 place-items-center rounded-xl bg-white text-primary">
          <Icon name="coins" className="size-6" />
        </span>
        <p className="mt-4 text-[18px] font-semibold">PayPal sandbox</p>
        <p className="mt-2 text-[13px] leading-[1.5] text-white/85">Every payment here is test money. Nothing real moves.</p>
      </div>
    </aside>
  );
}
