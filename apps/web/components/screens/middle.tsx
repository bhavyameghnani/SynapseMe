"use client";

import { BadgeCheck, CreditCard, Fingerprint, KeyRound, Landmark, Loader2, Lock, Mail, Send } from "lucide-react";
import { useEffect, useState } from "react";
import type { FundingOption, Quote } from "@/lib/types";
import { Card, Empty, RuleChips, ScreenHeader, SourceChip, TrustChip, cx, pct, usd } from "../ui";
import type { ScreenProps } from "./early";

const humanize = (k: string) => k.replace(/_usd$/, "").replace(/_/g, " ").replace(/12mo/, "(12 mo)");

// ---------- 5 Funding options ----------
export function FundingScreen({ events, onNext }: ScreenProps & { onNext?: () => void }) {
  const options: FundingOption[] = events.filter((e) => e.kind === "option" && e.data?.option).map((e) => e.data.option);
  return (
    <div>
      <ScreenHeader
        step={5}
        title="Four ways to pay a $400k deposit, at their true cost"
        subtitle="Live positions, prices and tax lots, checked against the mandate before anything is offered."
        events={events}
        preferred={["singlestore"]}
      />
      {options.length === 0 ? (
        <Empty>No funding options yet.</Empty>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          {options.map((o) => {
            const bad = o.status === "blocked" || o.status === "rejected";
            const rfq = o.status === "rfq";
            return (
              <div
                key={o.id}
                className={cx(
                  "animate-fade-in rounded-2xl border bg-white p-5 shadow-sm",
                  bad && "border-rose-200 bg-rose-50/30",
                  rfq && "border-2 border-accent-500",
                  !bad && !rfq && "border-stone-200",
                )}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className={cx("font-serif text-xl font-semibold", bad ? "text-stone-500" : "text-stone-900")}>{o.label}</div>
                    <div className="text-sm text-stone-500">covers {usd(o.amount_usd)}</div>
                  </div>
                  <span
                    className={cx(
                      "rounded-full px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide",
                      bad && "bg-rose-600 text-white",
                      rfq && "bg-accent-600 text-white",
                      o.status === "viable" && "bg-stone-200 text-stone-700",
                    )}
                  >
                    {o.status}
                  </span>
                </div>
                <div className="mt-4 flex items-baseline gap-2">
                  {bad && !o.true_cost_usd ? (
                    <span className="font-serif text-4xl font-semibold text-stone-400">Not allowed</span>
                  ) : (
                    <>
                      <span className={cx("font-serif text-4xl font-semibold tabular-nums", bad ? "text-stone-400 line-through" : "text-stone-900")}>
                        {usd(o.true_cost_usd)}
                      </span>
                      <span className="text-sm text-stone-500">{o.status === "rfq" ? "est. net cost" : "true cost"}</span>
                    </>
                  )}
                </div>
                <div className="mt-2 flex flex-wrap gap-x-4 text-xs text-stone-500">
                  {Object.entries(o.cost_breakdown ?? {}).map(([k, v]) => (
                    <span key={k}>
                      {humanize(k)}: <b className="tabular-nums text-stone-700">{usd(v)}</b>
                    </span>
                  ))}
                </div>
                <div className="mt-3 flex items-start gap-2 text-sm text-stone-700">
                  <RuleChips rule={o.rule} />
                  <span>{o.reason}</span>
                </div>
                {(o.context?.length ?? 0) > 0 && (
                  <div className="mt-3 rounded-lg border border-dashed border-stone-300 bg-stone-50/70 p-2.5">
                    <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-stone-500">
                      <Mail size={11} /> From Emma&apos;s inbox (context only)
                    </div>
                    <ul className="space-y-1">
                      {o.context!.map((c, i) => (
                        <li key={i} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[13px] text-stone-700">
                          <TrustChip trust={c.trust} />
                          <span>{c.fact}</span>
                          <span className="ml-auto font-mono text-[10px] text-stone-400">{c.source_uri}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {rfq && (
                  <button
                    onClick={onNext}
                    className="mt-4 inline-flex items-center gap-2 rounded-lg bg-accent-600 px-4 py-2 text-sm font-semibold text-white hover:bg-accent-700"
                  >
                    <Send size={15} /> Request quotes
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---------- 6 RFQ board ----------
export function RfqScreen({ events }: ScreenProps) {
  const rfq = events.find((e) => e.kind === "rfq");
  const quotes: Quote[] = events.filter((e) => e.kind === "quote" && e.data?.quote).map((e) => e.data.quote);
  // Rejections with a rule id are red; "rejected" with no rule (outcome not_selected) is neutral.
  const verdicts = events.filter((e) => e.data?.quote_id && e.decision?.result === "rejected");
  const rejected = new Map(verdicts.filter((e) => e.decision?.rule).map((e) => [e.data.quote_id as string, e]));
  const notSelected = new Map(
    verdicts.filter((e) => !e.decision?.rule || e.data?.outcome === "not_selected").map((e) => [e.data.quote_id as string, e]),
  );
  const selected = events.find((e) => e.decision?.result === "selected");
  const selId = selected?.data?.quote_id as string | undefined;
  return (
    <div>
      <ScreenHeader
        step={6}
        title="One intent, three bank agents, competing quotes"
        subtitle="Each bank runs its own model on its own infrastructure. Envoy ranks only the quotes the mandate allows."
        events={events}
        preferred={["arcee", "guild"]}
      />
      {rfq && (
        <div className="mb-5 flex flex-wrap items-center gap-3 rounded-xl bg-stone-900 px-4 py-3 text-sm text-stone-200">
          <span className="font-mono text-stone-400">{rfq.data?.rfq_id}</span>
          <SourceChip source={rfq.data?.source ?? rfq.data?.intent?.source} dark />
          <span>
            Need <b className="text-white">{usd(rfq.data?.intent?.need_usd ?? rfq.data?.intent?.amount_usd ?? 400000)}</b>
            {rfq.data?.intent?.deadline ? ` by ${rfq.data.intent.deadline}` : ""} · {String(rfq.data?.intent?.purpose ?? "home deposit").replace(/_/g, " ")}
          </span>
          {Array.isArray(rfq.data?.intent?.constraints) && (
            <span className="ml-auto flex gap-1">
              {rfq.data.intent.constraints.map((c: string) => (
                <span key={c} className="rounded bg-stone-700 px-1.5 font-mono text-xs">{c}</span>
              ))}
            </span>
          )}
        </div>
      )}
      {quotes.length === 0 ? (
        <Empty>Waiting for quotes…</Empty>
      ) : (
        <div className="grid grid-cols-3 gap-5">
          {quotes.map((q) => {
            const rej = rejected.get(q.quote_id);
            const ns = rej ? undefined : notSelected.get(q.quote_id);
            const sel = q.quote_id === selId;
            return (
              <div
                key={q.quote_id}
                className={cx(
                  "relative animate-fade-in rounded-2xl border bg-white p-6 shadow-sm transition",
                  sel && "border-2 border-emerald-500 shadow-lg ring-4 ring-emerald-100",
                  rej && "border-rose-200 bg-stone-50",
                  !sel && !rej && "border-stone-200",
                )}
              >
                {sel && (
                  <span className="absolute -top-3 left-6 rounded-full bg-emerald-600 px-3 py-0.5 text-xs font-bold uppercase tracking-wide text-white">
                    Selected
                  </span>
                )}
                {rej && (
                  <span className="absolute -top-3 left-6 rounded-full bg-rose-600 px-3 py-0.5 text-xs font-bold uppercase tracking-wide text-white">
                    Rejected · {rej.decision?.rule ?? "rule"}
                  </span>
                )}
                {ns && (
                  <span className="absolute -top-3 left-6 rounded-full bg-stone-200 px-3 py-0.5 text-xs font-bold uppercase tracking-wide text-stone-600">
                    Not selected: higher rate
                  </span>
                )}
                <div className="flex items-center gap-2">
                  <Landmark size={18} className="text-stone-400" />
                  <span className="font-serif text-xl font-semibold text-stone-800">{q.bank_name}</span>
                  <span className="ml-auto text-[10px] uppercase tracking-wider text-stone-400">
                    {q.product === "securities_backed_line" ? "securities-backed line" : q.product.replace(/_/g, " ")}
                  </span>
                </div>
                <div className={cx("mt-5 font-serif font-semibold tabular-nums leading-none", rej ? "text-5xl text-stone-400 line-through" : "text-7xl text-stone-900")}>
                  {q.rate_bps != null ? pct(q.rate_bps) : "Sell fund"}
                </div>
                <div className="mt-2 text-sm text-stone-500">
                  {q.rate_bps != null ? `APR · ${q.term_months} months · fees ${usd(q.fees_usd)}` : `liquidate ${usd(q.amount_usd)} of the index fund`}
                </div>
                <p className="mt-4 text-sm text-stone-700">{q.notes}</p>
                {q.repayment_plan && (
                  <p className="mt-2 rounded-lg bg-emerald-50 p-2.5 text-sm text-emerald-800">{q.repayment_plan}</p>
                )}
                {rej && <p className="mt-2 rounded-lg bg-rose-50 p-2.5 text-sm text-rose-800">{rej.decision?.reason}</p>}
                {ns && <p className="mt-2 rounded-lg bg-stone-100 p-2.5 text-sm text-stone-600">{ns.decision?.reason}</p>}
                {sel && selected?.decision?.reason && <p className="mt-2 text-xs text-stone-500">{selected.decision.reason}</p>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---------- 7 Two keys ----------
function useDelayedPass(delayMs: number) {
  const [passed, setPassed] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setPassed(true), delayMs);
    return () => clearTimeout(t);
  }, [delayMs]);
  return passed;
}

function KeyCard({ name, data, delay }: { name: string; data?: Record<string, unknown>; delay: number }) {
  const anim = useDelayedPass(delay);
  const ic = (data?.identity_check ?? {}) as { provider?: string; inquiry_id?: string; status?: string };
  const passed = anim && ic.status === "passed";
  const failed = anim && !!data && ic.status !== "passed";
  return (
    <div
      className={cx(
        "rounded-2xl border-2 bg-white p-6 transition-colors duration-500",
        passed ? "border-emerald-500" : failed ? "border-rose-500" : "border-stone-200",
      )}
    >
      <div className="flex items-center gap-4">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-accent-100 font-serif text-2xl font-semibold text-accent-800">
          {name[0]}
        </span>
        <div>
          <div className="font-serif text-2xl font-semibold text-stone-900">{name}</div>
          <div className="text-sm text-stone-500">{name === "Emma" ? "Principal" : "Co-signer (partner)"}</div>
        </div>
        <KeyRound className={cx("ml-auto", passed ? "text-emerald-600" : "text-stone-300")} size={30} />
      </div>
      <div className="mt-6 flex items-center gap-3 rounded-xl bg-stone-50 p-4">
        {!data ? (
          <span className="text-stone-400">Awaiting approval…</span>
        ) : passed ? (
          <>
            <BadgeCheck className="text-emerald-600" size={26} />
            <div>
              <div className="font-semibold text-emerald-700">Identity check passed</div>
              <div className="font-mono text-xs text-stone-500">
                {ic.provider ?? "persona"} · {ic.inquiry_id}
              </div>
            </div>
          </>
        ) : failed ? (
          <span className="font-semibold text-rose-700">Identity check {ic.status ?? "failed"}</span>
        ) : (
          <>
            <Loader2 className="animate-spin text-accent-600" size={24} />
            <div className="flex items-center gap-2 text-stone-600">
              <Fingerprint size={16} /> Verifying identity…
            </div>
          </>
        )}
      </div>
      {data && passed && (
        <div className="mt-4 text-sm text-stone-600">
          Approved <b className="text-stone-900">{usd(data.amount_usd)}</b> · quote <span className="font-mono">{String(data.quote_id)}</span>{" "}
          <SourceChip source={typeof data.source === "string" ? data.source : undefined} />
        </div>
      )}
    </div>
  );
}

export function TwoKeysScreen({ events }: ScreenProps) {
  const p = events.find((e) => e.actor === "human:emma" && e.kind === "approve");
  const d = events.find((e) => e.actor === "human:dev" && e.kind === "approve");
  return (
    <div>
      <ScreenHeader
        step={7}
        title="Two keys: Emma and Dev both approve"
        subtitle="Rule R3: anything over $100k needs the principal and every co-signer, each with a live identity check."
        events={events}
        preferred={["persona"]}
      />
      <div className="grid grid-cols-2 gap-6">
        <KeyCard name="Emma" data={p?.data} delay={700} />
        <KeyCard name="Dev" data={d?.data} delay={1500} />
      </div>
      <div className="mt-6 flex items-center gap-2 text-sm text-stone-500">
        <Lock size={14} /> The agent cannot approve on anyone&apos;s behalf. Approvals are signed into the ledger.
      </div>
    </div>
  );
}

// ---------- 8 Execute ----------
export function ExecuteScreen({ events }: ScreenProps) {
  const ex = events.find((e) => e.kind === "execute" && e.actor.startsWith("bank_"));
  const tok = events.find((e) => e.kind === "verify");
  const d = ex?.data ?? {};
  return (
    <div>
      <ScreenHeader
        step={8}
        title="Bank B's agent executes inside Bank B"
        subtitle="Envoy hands the bank a scoped, single-use token. Emma's agent never touches bank credentials."
        events={events}
        preferred={["guild"]}
      />
      {tok && (
        <div className="mb-5 flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          <BadgeCheck size={18} className="text-emerald-600" /> {tok.summary}
          <span className="ml-auto flex items-center gap-2">
            {tok.data?.single_use && <span className="rounded bg-white px-1.5 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200">single-use</span>}
            {tok.data?.token_sha256 && <span className="font-mono text-xs text-emerald-800/70">token sha256 {String(tok.data.token_sha256).slice(0, 12)}…</span>}
            <RuleChips rule={tok.decision?.rule} tone="allow" />
          </span>
        </div>
      )}
      {!ex ? (
        <Empty>Waiting for bank confirmation…</Empty>
      ) : (
        <div className="grid grid-cols-[1.2fr_1fr] gap-5">
          <Card className="animate-fade-in p-6">
            <div className="text-xs font-bold uppercase tracking-wider text-emerald-600">Confirmed</div>
            <div className="mt-2 font-serif text-6xl font-semibold tabular-nums text-stone-900">{usd(d.amount_usd)}</div>
            <div className="mt-1 text-stone-500">deposit wired to the verified escrow</div>
            <dl className="mt-6 grid grid-cols-[160px_1fr] gap-y-3 text-[15px]">
              <dt className="text-stone-500">Confirmation</dt>
              <dd className="font-mono font-semibold text-stone-900">{d.confirmation_id}</dd>
              <dt className="text-stone-500">Payee</dt>
              <dd className="flex items-center gap-2 text-stone-900">
                {d.payee?.name}
                {d.payee?.email && <span className="font-mono text-sm text-stone-500">{d.payee.email}</span>}
                <span className="font-mono text-stone-500">•••• {d.payee?.account_last4}</span>
                {d.payee?.verified && <BadgeCheck size={16} className="text-emerald-600" />}
              </dd>
              <dt className="text-stone-500">Single-use card</dt>
              <dd className="flex items-center gap-2 font-mono text-stone-900">
                <CreditCard size={16} className="text-stone-400" /> {d.card_id}
              </dd>
            </dl>
          </Card>
          <Card className="animate-fade-in p-6">
            <div className="text-xs font-bold uppercase tracking-wider text-stone-500">Loan terms</div>
            <div className="mt-2 font-serif text-6xl font-semibold tabular-nums text-stone-900">{pct(d.loan?.rate_bps)}</div>
            <div className="mt-1 text-stone-500">securities-backed line · Bank B</div>
            <dl className="mt-6 grid grid-cols-[140px_1fr] gap-y-3 text-[15px]">
              <dt className="text-stone-500">Principal</dt>
              <dd className="tabular-nums text-stone-900">{usd(d.loan?.amount_usd)}</dd>
              {d.loan?.term_months != null && (
                <>
                  <dt className="text-stone-500">Term</dt>
                  <dd className="text-stone-900">{d.loan.term_months} months</dd>
                </>
              )}
              <dt className="text-stone-500">Stock sold</dt>
              <dd className="text-stone-900">None (blackout respected)</dd>
            </dl>
          </Card>
        </div>
      )}
    </div>
  );
}
