# Invoice Guard

An agent that pays a small business's PayPal invoices, and only pays what it can trust.

Built for the [PayPal AI Hackathon](https://paypalaihackathon.devpost.com/). Work in progress: invoices are checked and given a verdict, but nothing is paid automatically yet.

## What it does

Paste a PayPal invoice link. The app runs three checks and decides.

| Check | Done by | Question |
|---|---|---|
| Is it real? | PayPal | Does this invoice exist, and is it addressed to this account? |
| Is it expected? | The app's own payment record | Has this sender been paid before, and is the amount usual? |
| Does it read like a scam? | Jev (TypeSafe AI) | Pressure, impersonation, a fee for a later reward, and so on |

| Verdict | When |
|---|---|
| Safe to pay | Real, known sender, usual amount, clean wording, inside the owner's limit |
| Blocked | PayPal has no record of it, it is addressed to someone else, or the wording is clearly a scam |
| Needs you | Anything in between, and every first-time sender |

The agent never pays a sender for the first time without asking.

## Run it

Needs Node.js 20 or newer.

```bash
npm install
cp .env.example .env
```

Fill in `.env` (each key is explained in the file), then:

```bash
npm run dev
```

Open http://localhost:3000. No database setup is needed locally; the app keeps an embedded Postgres in `.data/`.

```bash
npm test
```

## How it is built

- `src/lib/paypal.ts` reads an invoice from PayPal by its ID.
- `src/lib/jev.ts` asks Jev eight yes/no questions about the wording.
- `src/lib/decide.ts` turns the three checks into a verdict. Plain code, covered by tests.
- `src/lib/explain.ts` asks Claude, through OpenRouter, for a short explanation when the owner has to decide.
- `src/lib/review.ts` runs the whole thing for one invoice.
- `spike/` holds the Python experiments that tested each piece first.

## AI tools used

- **Jev** (`jev-1.13.0`, TypeSafe AI) scores each invoice's wording and returns a probability per question.
- **Claude** (via OpenRouter) writes the explanation shown to the owner.

## License

MIT. See [LICENSE](LICENSE).
