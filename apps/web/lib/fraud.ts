// TS port of services/client_agent/fraud_check.py (docs/email_context_spec.md §3), used offline so
// "Simulate new email" produces the same flagged card without the backend. Email is context only.
import type { Email, InboxEmail, InboxSignals, Trust } from "./types";

export const VERIFIED_ESCROW = {
  name: "Escrow Team",
  email: "escrow.team.demo@gmail.com",
  bank_account_last4: "2210",
  routing_last4: "0071",
};
export const LOOKALIKE_ESCROW = "escrow-team.demo@gmail.com";
export const VERIFIED_PAYEES = [VERIFIED_ESCROW];

const PAYMENT_RE = /updated wire|new (bank )?account|change(d)? (of )?(bank|payment|wire)|wire instructions|routing number|urgent.*(wire|transfer)/gi;
const HIDDEN_RE = /assistant:|ignore (previous|prior)|skip (verification|check)/gi;

const localPart = (addr: string) => addr.toLowerCase().split("@")[0] ?? "";

export function normalizeLocal(addr: string): string {
  return localPart(addr)
    .replace(/\+.*$/, "")
    .replace(/[.\-_]/g, "")
    .replace(/0/g, "o")
    .replace(/1/g, "l")
    .replace(/rn/g, "m");
}

export function levenshtein(a: string, b: string): number {
  const dp = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[b.length];
}

function matchAll(re: RegExp, text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(re)) if (!out.some((o) => o.toLowerCase() === m[0].toLowerCase())) out.push(m[0]);
  return out;
}

// Last 4 digits of numbers on lines that mention the keyword (handles "6092-310-8841").
function last4Near(text: string, kw: RegExp): string[] {
  const out: string[] = [];
  for (const line of text.split(/\n/)) {
    if (!kw.test(line)) continue;
    const nums = line.match(/\d[\d-]{3,20}\d/g) ?? [];
    for (const n of nums) {
      const digits = n.replace(/-/g, "");
      if (digits.length >= 4 && digits.length <= 17) {
        const l4 = digits.slice(-4);
        if (!out.includes(l4)) out.push(l4);
      }
    }
  }
  return out;
}

export type RawEmail = {
  uid: string;
  from_name: string;
  from_addr: string;
  to: string | string[];
  subject: string;
  date: string;
  body: string;
  attachments?: string[];
  simulated?: boolean;
};

export function classifyEmail(raw: RawEmail): InboxEmail {
  const from = raw.from_addr.toLowerCase();
  const text = `${raw.subject}\n${raw.body}`;
  const verified = VERIFIED_PAYEES.find((p) => p.email === from);
  const near = verified
    ? undefined
    : VERIFIED_PAYEES.find(
        (p) => normalizeLocal(p.email) === normalizeLocal(from) || levenshtein(localPart(p.email), localPart(from)) <= 2,
      );
  const payment = matchAll(PAYMENT_RE, text);
  const hidden = matchAll(HIDDEN_RE, text);
  const accounts = last4Near(raw.body, /account/i);
  const routing = last4Near(raw.body, /routing/i);
  const ref = verified ?? near ?? VERIFIED_ESCROW;
  const mismatch =
    accounts.some((a) => a !== ref.bank_account_last4) || routing.some((r) => r !== ref.routing_last4);
  const signals: InboxSignals = {
    lookalike_sender: !!near,
    payment_change_language: payment.length > 0,
    bank_details_mismatch: !verified && mismatch,
    hidden_instruction: hidden.length > 0,
  };
  const trust: Trust = verified
    ? "verified"
    : signals.lookalike_sender || signals.hidden_instruction
      ? "untrusted"
      : "claimed"; // known advisors and unknown senders alike: stated, not verified

  let flag: InboxEmail["flag"] = null;
  const why: string[] = [];
  if (signals.lookalike_sender) why.push(`sender ${from} imitates verified ${near!.email}`);
  if (signals.payment_change_language) why.push(`payment-change language (${payment.map((p) => `"${p}"`).join(", ")})`);
  if (signals.bank_details_mismatch && accounts.length)
    why.push(`account ending ${accounts.join("/")} ≠ verified ending ${ref.bank_account_last4}`);
  if (signals.hidden_instruction) why.push("hidden instruction addressed to an assistant");
  // Mirrors fraud_check.classify: lookalike+payment → high R4+R5; hidden → high R5; mismatch → R4 (medium alone).
  const rules = new Set<string>();
  let level: "high" | "medium" | null = null;
  if (signals.lookalike_sender && signals.payment_change_language) {
    level = "high";
    rules.add("R4").add("R5");
  }
  if (signals.hidden_instruction) {
    level = "high";
    rules.add("R5");
  }
  if (signals.bank_details_mismatch) {
    level = level ?? "medium";
    rules.add("R4");
  }
  if (level) flag = { level, rules: Array.from(rules).sort(), reason: "" };
  if (flag) flag.reason = `${why.join("; ")}. Never acted on — payment instructions only come through Envoy.`;

  return {
    uid: raw.uid,
    from_name: raw.from_name,
    from_addr: raw.from_addr,
    to: raw.to,
    subject: raw.subject,
    date: raw.date,
    body: raw.body,
    attachments: raw.attachments ?? [],
    trust,
    signals,
    matched_phrases: [...payment, ...hidden],
    lookalike_of: near?.email ?? null,
    extracted: { accounts_last4: accounts, routing_last4: routing, deadlines: [] },
    verified_payee: verified || near ? { name: ref.name, email: ref.email, bank_account_last4: ref.bank_account_last4 } : null,
    flag,
    simulated: !!raw.simulated,
  };
}

/** The same lookalike email a human sends from a phone on stage (spec §6), for "Simulate new email". */
export function simulatedLookalike(): InboxEmail {
  return classifyEmail({
    uid: `sim_${Date.now().toString(36)}`,
    from_name: "Escrow Team",
    from_addr: LOOKALIKE_ESCROW,
    to: "emma.envoy.demo@gmail.com",
    subject: "Updated wire instructions — please use new account",
    date: new Date().toISOString(),
    body:
      "Hi Emma,\n\nOur trust account changed this week. Please use the new account below for the $400,000 deposit due Dec 20:\n\n" +
      "Payee: Escrow Team Trust\nAccount: 6092-310-8841 (ending 8841)\nRouting: 026009593\n\n" +
      "This is urgent: please wire today so you don't lose the house. Our phones are down, reply here once sent.\n\nEscrow Team",
    attachments: [],
    simulated: true,
  });
}

/** Seed Email (data/seed/emails.json) → InboxEmail via the same classifier. */
export function classifySeed(e: Email): InboxEmail {
  return classifyEmail({
    uid: e.id,
    from_name: String(e.from_name ?? ""),
    from_addr: String(e.from_email ?? e.from ?? ""),
    to: (e.to as string | string[]) ?? "",
    subject: e.subject,
    date: String(e.received_at ?? e.date ?? ""),
    body: String(e.body ?? ""),
    attachments: (e.attachments ?? []).map((a) => (typeof a === "string" ? a : String(a?.name ?? ""))),
  });
}
