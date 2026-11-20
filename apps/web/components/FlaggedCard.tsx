"use client";

import { Check, ShieldAlert, X } from "lucide-react";
import type { ReactNode } from "react";
import { VERIFIED_ESCROW } from "@/lib/fraud";
import type { AgentEvent, InboxEmail, InboxSignals } from "@/lib/types";
import { RuleChip, TrustChip, cx } from "./ui";

export const NEVER_ACTED = "Never acted on — payment instructions only come through Envoy.";

const SIGNALS: { key: keyof InboxSignals; label: string }[] = [
  { key: "lookalike_sender", label: "Lookalike sender" },
  { key: "payment_change_language", label: "Payment-change language" },
  { key: "bank_details_mismatch", label: "Bank details mismatch" },
  { key: "hidden_instruction", label: "Hidden instruction" },
];

/** Character-level diff: same-length strings compare position by position, otherwise prefix/suffix. */
export function charDiff(a: string, b: string): { ch: string; diff: boolean }[] {
  if (a.length === b.length) return [...a].map((ch, i) => ({ ch, diff: ch !== b[i] }));
  let p = 0;
  while (p < a.length && p < b.length && a[p] === b[p]) p++;
  let s = 0;
  while (s < a.length - p && s < b.length - p && a[a.length - 1 - s] === b[b.length - 1 - s]) s++;
  return [...a].map((ch, i) => ({ ch, diff: i >= p && i < a.length - s }));
}

function DiffAddr({ addr, other, tone }: { addr: string; other: string; tone: "bad" | "good" }) {
  return (
    <span className="break-all font-mono">
      {charDiff(addr, other).map((c, i) =>
        c.diff ? (
          <mark
            key={i}
            className={cx(
              "rounded px-[3px] font-bold",
              tone === "bad" ? "bg-rose-600 text-white" : "bg-emerald-600 text-white",
            )}
          >
            {c.ch}
          </mark>
        ) : (
          <span key={i}>{c.ch}</span>
        ),
      )}
    </span>
  );
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function Highlight({ text, phrases }: { text: string; phrases: string[] }): ReactNode {
  const ps = phrases.filter(Boolean);
  if (!ps.length) return text;
  const re = new RegExp(`(${ps.map(esc).join("|")})`, "gi");
  return text.split(re).map((part, i) =>
    ps.some((p) => p.toLowerCase() === part.toLowerCase()) ? (
      <mark key={i} className="rounded bg-amber-200 px-0.5 text-stone-900">
        {part}
      </mark>
    ) : (
      <span key={i}>{part}</span>
    ),
  );
}

/** Build an InboxEmail view from a flag event (new shape: data.inbox_email; legacy step-4 shape otherwise). */
export function inboxEmailFromEvent(ev: AgentEvent): InboxEmail | null {
  if (ev.data?.inbox_email) return ev.data.inbox_email as InboxEmail;
  const d = ev.data ?? {};
  if (!d.from) return null;
  const acct = String(d.extracted?.account ?? "");
  const rules = String(ev.decision?.rule ?? "R4+R5").split("+");
  const lookalike = String(d.lookalike_of ?? "");
  return {
    uid: String(d.email_id ?? ev.id),
    from_name: "",
    from_addr: String(d.from),
    to: "",
    subject: "Updated wire instructions — please use new account",
    date: ev.ts,
    body: "",
    attachments: [],
    trust: "untrusted",
    signals: { lookalike_sender: !!lookalike, payment_change_language: true, bank_details_mismatch: !!acct, hidden_instruction: false },
    matched_phrases: ["Updated wire", "new account"],
    lookalike_of: lookalike.includes("@") ? lookalike : lookalike ? `${String(d.from).split("@")[0]}@${lookalike}` : null,
    extracted: { accounts_last4: acct ? [acct.replace(/\D/g, "").slice(-4)] : [], routing_last4: [], deadlines: [] },
    verified_payee: d.verified_payee
      ? {
          name: String(d.verified_payee.name ?? ""),
          email: String(d.verified_payee.email ?? lookalike),
          bank_account_last4: String(d.verified_payee.account_last4 ?? d.verified_payee.bank_account_last4 ?? ""),
        }
      : null,
    flag: { level: "high", rules, reason: String(ev.decision?.reason ?? "") },
    simulated: false,
  };
}

export function FlaggedCard({
  email,
  compact = false,
  onDismiss,
  className,
}: {
  email: InboxEmail;
  compact?: boolean;
  onDismiss?: () => void;
  className?: string;
}) {
  const verifiedAddr = email.lookalike_of ?? email.verified_payee?.email ?? VERIFIED_ESCROW.email;
  const verifiedLast4 = email.verified_payee?.bank_account_last4 ?? VERIFIED_ESCROW.bank_account_last4;
  const seenLast4 = email.extracted?.accounts_last4?.find((a) => a !== verifiedLast4) ?? email.extracted?.accounts_last4?.[0];
  const rules = email.flag?.rules?.length ? email.flag.rules : ["R4", "R5"];
  const phrases = (email.matched_phrases ?? []).filter((p) => p.toLowerCase() !== email.from_addr.toLowerCase());
  const showSender = email.signals?.lookalike_sender || email.from_addr !== verifiedAddr;
  return (
    <div
      className={cx(
        "animate-fade-in overflow-hidden rounded-2xl border-2 border-rose-500 bg-white shadow-lg shadow-rose-100",
        className,
      )}
    >
      <div className={cx("flex items-center gap-2 bg-rose-600 text-white", compact ? "px-3 py-1.5" : "px-5 py-2.5")}>
        <ShieldAlert size={compact ? 15 : 20} />
        <span className={cx("font-bold uppercase tracking-wider", compact ? "text-[11px]" : "text-sm")}>
          Flagged{email.flag?.level ? ` · ${email.flag.level}` : ""}
        </span>
        {email.simulated && (
          <span className="rounded bg-white/20 px-1.5 text-[10px] font-semibold uppercase tracking-wide">simulated</span>
        )}
        <span className="ml-auto flex gap-1">
          {rules.map((r) => (
            <span key={r} className="rounded bg-white px-1.5 font-mono text-[11px] font-bold text-rose-700">
              {r}
            </span>
          ))}
        </span>
        {onDismiss && (
          <button onClick={onDismiss} className="ml-1 rounded p-0.5 hover:bg-white/20" title="Dismiss">
            <X size={14} />
          </button>
        )}
      </div>
      <div className={cx(compact ? "space-y-2 p-3 text-[12px]" : "space-y-4 p-5")}>
        <div className={cx("font-semibold text-stone-900", compact ? "text-[13px]" : "text-lg")}>
          “<Highlight text={email.subject} phrases={phrases} />”
        </div>

        {showSender && (
          <div className={cx("grid gap-2", compact ? "grid-cols-1" : "grid-cols-2")}>
            <div className="rounded-lg border border-rose-200 bg-rose-50 p-2.5">
              <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-rose-600">
                Sender <TrustChip trust="untrusted" />
              </div>
              <div className={cx("mt-1 text-rose-900", compact ? "text-[12px]" : "text-base")}>
                <DiffAddr addr={email.from_addr} other={verifiedAddr} tone="bad" />
              </div>
            </div>
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-2.5">
              <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-emerald-700">
                Verified sender <TrustChip trust="verified" />
              </div>
              <div className={cx("mt-1 text-emerald-900", compact ? "text-[12px]" : "text-base")}>
                <DiffAddr addr={verifiedAddr} other={email.from_addr} tone="good" />
              </div>
            </div>
          </div>
        )}

        {seenLast4 && (
          <div className={cx("flex flex-wrap items-center gap-x-3 gap-y-1", compact ? "text-[12px]" : "text-sm")}>
            <span className="text-stone-500">Account</span>
            <span className="font-mono font-bold text-rose-700 line-through decoration-2">•••• {seenLast4}</span>
            <span className="text-stone-400">≠</span>
            <span className="font-mono font-bold text-emerald-700">•••• {verifiedLast4}</span>
            <span className="text-stone-500">verified payee</span>
          </div>
        )}

        {!compact && email.body && (
          <div className="max-h-40 overflow-y-auto whitespace-pre-line rounded-lg bg-stone-50 p-3 text-sm leading-relaxed text-stone-700">
            <Highlight text={email.body} phrases={phrases} />
          </div>
        )}

        {!compact && phrases.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 text-sm">
            <span className="text-stone-500">Matched phrases</span>
            {phrases.map((p) => (
              <span key={p} className="rounded bg-amber-100 px-1.5 py-px font-mono text-xs text-amber-900 ring-1 ring-amber-200">
                {p}
              </span>
            ))}
          </div>
        )}

        <ul className={cx("grid gap-x-4 gap-y-1", compact ? "grid-cols-2 text-[11px]" : "grid-cols-2 text-sm")}>
          {SIGNALS.map(({ key, label }) => {
            const on = !!email.signals?.[key];
            return (
              <li key={key} className={cx("flex items-center gap-1.5", on ? "font-semibold text-rose-700" : "text-stone-400")}>
                {on ? <Check size={compact ? 12 : 15} strokeWidth={3} /> : <X size={compact ? 12 : 15} />}
                <span className={compact ? "" : "font-mono text-[13px]"}>{compact ? label : key}</span>
              </li>
            );
          })}
        </ul>

        <div className="flex items-center gap-1.5">
          {rules.map((r) => (
            <RuleChip key={r} rule={r} />
          ))}
          <span className={cx("text-stone-500", compact ? "text-[11px]" : "text-xs")}>
            {rules.includes("R4") && "R4 wire only to verified payees"}
            {rules.includes("R4") && rules.includes("R5") && " · "}
            {rules.includes("R5") && "R5 untrusted content cannot instruct"}
          </span>
        </div>
      </div>
      <div
        className={cx(
          "border-t border-rose-200 bg-rose-50 font-semibold text-rose-800",
          compact ? "px-3 py-1.5 text-[11px]" : "px-5 py-2.5 text-sm",
        )}
      >
        {NEVER_ACTED}
      </div>
    </div>
  );
}
