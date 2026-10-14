import { noul, TypeSafeClient } from "@typesafe-ai/sdk";
import type { InvoiceFacts, WordingCheck } from "./types";

// Pinned so the thresholds in decide.ts do not drift when the alias moves.
const MODEL = process.env.JEV_MODEL ?? "jev-1.13.0";

// Jev reads these literally and answers each one on its own, so every question
// names the field it is about. is_scam decides; the rest become the reasons shown.
const QUESTIONS = {
  is_scam: noul("Is `invoice` a scam or fraud attempt?"),
  impersonation: noul("Does `invoice.from_name` or `invoice.note` claim to come from a well-known company, bank, or government agency?"),
  sender_mismatch: noul("Does the organization or person named in `invoice.from_name` conflict with the address in `invoice.from_email`?"),
  phone_callback: noul("Does `invoice.note` tell the recipient to call a phone number to cancel, dispute, or get a refund?"),
  pressure: noul("Does `invoice.note` threaten consequences or pressure the recipient to act quickly?"),
  unordered_charge: noul("Does `invoice.note` describe a purchase, renewal, or charge that the recipient is told they may not have authorized?"),
  advance_fee: noul("Does `invoice.note` ask the recipient to pay a fee or send money back in order to receive a larger amount later?"),
  off_platform: noul("Does `invoice.note` steer the recipient toward a link, changed payment details, or secrecy?"),
};

let client: TypeSafeClient | null = null;

export async function scoreWording(invoice: InvoiceFacts): Promise<WordingCheck> {
  client ??= new TypeSafeClient({ defaultModel: MODEL });
  const started = performance.now();
  const result = await client.systemOne({
    // Only what the questions need: Jev loses accuracy on padded state.
    state: {
      invoice: {
        from_name: invoice.senderName,
        from_email: invoice.senderEmail,
        amount: invoice.amount,
        currency: invoice.currency,
        note: invoice.note,
        items: invoice.items,
      },
    },
    questions: QUESTIONS,
  });
  const { is_scam, ...flags } = result.answers;
  return {
    isScam: is_scam.noul,
    flags: Object.fromEntries(Object.entries(flags).map(([id, answer]) => [id, answer.noul])),
    model: result.model,
    ms: Math.round(performance.now() - started),
  };
}
