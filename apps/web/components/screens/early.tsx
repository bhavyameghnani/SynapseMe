"use client";

import { Bot, Eye, FileText, Fingerprint, Mail, ShieldAlert, ShieldCheck, ShieldX, Zap } from "lucide-react";
import type { AgentEvent, Email, InboxEmail, Memory, Trust } from "@/lib/types";
import type { InboxApi } from "@/lib/useInbox";
import { FlaggedCard, inboxEmailFromEvent } from "../FlaggedCard";
import { Card, Empty, RuleChip, RuleChips, ScreenHeader, TrustChip, cx } from "../ui";

export type ScreenProps = { events: AgentEvent[]; all: AgentEvent[] };

const find = (evs: AgentEvent[], pred: (e: AgentEvent) => boolean) => evs.find(pred);

export function IntroScreen() {
  return (
    <div className="flex h-full flex-col items-center justify-center text-center">
      <div className="text-xs font-semibold uppercase tracking-[0.3em] text-accent-600">Envoy</div>
      <h1 className="mt-3 font-serif text-5xl font-semibold text-stone-900">The door banks can approve</h1>
      <p className="mt-5 max-w-xl text-lg text-stone-500">
        A governed exchange where Emma&apos;s personal agent and the banks&apos; own agents meet: verified, bound by her
        rules, and recorded in a signed audit trail.
      </p>
      <p className="mt-10 max-w-lg font-serif text-xl italic text-stone-700">
        “Before, a fraudster had to fool Emma. Now they only have to fool her agent, unless Envoy stands in between.”
      </p>
      <p className="mt-12 text-sm text-stone-400">
        Press <kbd className="rounded border border-stone-300 bg-white px-1.5 py-0.5 font-mono">→</kbd> or{" "}
        <kbd className="rounded border border-stone-300 bg-white px-1.5 py-0.5 font-mono">Space</kbd> to begin
      </p>
    </div>
  );
}

// ---------- 0 Inbox ----------
type Row = {
  id: string;
  name: string;
  addr: string;
  subject: string;
  snippet: string;
  date: string;
  trust?: Trust;
  attach: boolean;
  flagged: boolean;
  fresh: boolean;
};

const TRUSTS: Trust[] = ["verified", "claimed", "untrusted"];
const asTrust = (t: unknown): Trust | undefined => (TRUSTS.includes(t as Trust) ? (t as Trust) : undefined);

function Dot({ tone, pulse }: { tone: "ok" | "warn" | "idle"; pulse?: boolean }) {
  const c = tone === "ok" ? "bg-emerald-500" : tone === "warn" ? "bg-amber-500" : "bg-stone-400";
  return (
    <span className="relative inline-flex h-2 w-2">
      {pulse && <span className={cx("absolute inline-flex h-full w-full animate-ping rounded-full opacity-60", c)} />}
      <span className={cx("relative inline-flex h-2 w-2 rounded-full", c)} />
    </span>
  );
}

function SourcesStrip({
  inbox,
  live,
  seedCount,
  pdfs,
  admin,
}: {
  inbox?: InboxApi;
  live: boolean;
  seedCount: number;
  pdfs: number;
  admin: boolean;
}) {
  const st = inbox?.status;
  const gmailTone = st?.last_error ? "warn" : st?.connected || st?.watching ? "ok" : live ? "ok" : "idle";
  const context: [string, string, number | string, "ok" | "warn" | "idle", boolean][] = [
    ["Gmail", st?.source === "imap" ? "IMAP · read-only" : st?.source === "airbyte" ? "Airbyte" : "seed", st?.count ?? seedCount, gmailTone, !!st?.watching],
    ["Drive", "PDF attachments", pdfs, live ? "ok" : "idle", false],
    ["Equity portal", "RSU vests", 3, live ? "ok" : "idle", false],
  ];
  const banks = ["Bank A", "Bank B", "Bank C"];
  return (
    <div className="mb-5">
      <div className="flex flex-wrap items-stretch gap-2">
        <div className="flex items-center gap-1 pr-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-400">
          <Eye size={12} /> Context
        </div>
        {context.map(([name, sub, n, tone, pulse]) => (
          <div key={name} className="flex items-center gap-2 rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-sm">
            <Dot tone={tone} pulse={pulse} />
            <span className="font-medium text-stone-800">{name}</span>
            <span className="text-[11px] text-stone-400">{sub}</span>
            <span className="rounded bg-stone-100 px-1.5 font-mono text-[11px] tabular-nums text-stone-600">{n}</span>
          </div>
        ))}
        <div className="mx-1 w-px self-stretch bg-stone-200" />
        <div className="flex items-center gap-1 pr-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-accent-600">
          <Zap size={12} /> Actions
        </div>
        {banks.map((b) => (
          <div key={b} className="flex items-center gap-2 rounded-lg border border-accent-200 bg-accent-50 px-3 py-1.5 text-sm">
            <Dot tone={live ? "ok" : "idle"} />
            <span className="font-medium text-accent-900">{b}</span>
            <span className="text-[11px] font-semibold text-accent-700">via Envoy</span>
            <span className="rounded bg-white px-1.5 font-mono text-[11px] tabular-nums text-accent-800">2</span>
          </div>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
        <span className="text-stone-500">Email is read for context. Payments only move through Envoy.</span>
        <WatchIndicator inbox={inbox} live={live} />
        {admin && inbox && (
          <button
            onClick={() => void inbox.simulate()}
            disabled={inbox.simulating}
            className="ml-auto rounded border border-dashed border-stone-300 px-2 py-0.5 text-[11px] text-stone-500 hover:border-stone-400 hover:text-stone-700 disabled:opacity-50"
            title="Admin: inject the lookalike escrow email (E)"
          >
            {inbox.simulating ? "Injecting…" : "Simulate new email (E)"}
          </button>
        )}
      </div>
    </div>
  );
}

function WatchIndicator({ inbox, live }: { inbox?: InboxApi; live: boolean }) {
  const st = inbox?.status;
  if (st?.last_error)
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2 py-0.5 text-amber-800 ring-1 ring-amber-200">
        <Dot tone="warn" pulse /> Watching inbox… reconnecting ({st.last_error})
      </span>
    );
  if (st?.watching)
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-800 ring-1 ring-emerald-200">
        <Dot tone="ok" pulse /> Watching inbox…
        {st.last_poll_at && (
          <span className="text-emerald-700/60">
            last poll {new Date(st.last_poll_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit" })}
          </span>
        )}
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-stone-100 px-2 py-0.5 text-stone-500">
      <Dot tone="idle" /> {live && inbox?.supported !== false ? "Inbox connected (not watching)" : "Seed inbox · offline"}
    </span>
  );
}

export function InboxScreen({
  events,
  inbox,
  live = false,
  admin = false,
}: ScreenProps & { inbox?: InboxApi; live?: boolean; admin?: boolean }) {
  const ev = find(events, (e) => e.kind === "ingest" && Array.isArray(e.data?.emails));
  const counts = ev?.data?.counts ?? { emails: 63, advisors: 5, banks: 3, pdfs: 11 };
  const seed: Email[] = Array.isArray(ev?.data?.emails) ? ev!.data.emails : [];
  const seedIds = new Set(seed.map((m) => m.id));
  const arrived: Row[] = (inbox?.emails ?? [])
    .filter((m) => !seedIds.has(m.uid))
    .map((m) => ({
      id: m.uid,
      name: m.from_name || m.from_addr,
      addr: m.from_addr,
      subject: m.subject,
      snippet: m.body,
      date: m.date,
      trust: asTrust(m.trust),
      attach: (m.attachments?.length ?? 0) > 0,
      flagged: !!m.flag,
      fresh: !!inbox?.fresh.has(m.uid),
    }));
  const remoteById = new Map((inbox?.emails ?? []).map((m) => [m.uid, m]));
  const seedRows: Row[] = seed.map((m, i) => {
    const r = remoteById.get(m.id);
    return {
      id: m.id ?? String(i),
      name: String(m.from_name ?? m.from_email ?? m.from ?? ""),
      addr: String(m.from_email ?? m.from ?? ""),
      subject: m.subject,
      snippet: String(m.snippet ?? m.body ?? ""),
      date: String(m.received_at ?? m.date ?? ""),
      trust: asTrust(r?.trust ?? m.trust),
      attach: (m.attachments?.length ?? 0) > 0,
      flagged: !!r?.flag,
      fresh: false,
    };
  });
  const rows = [...arrived, ...seedRows];
  const total = Math.max(Number(counts.emails) || 0, seed.length) + arrived.length;
  const flagged = inbox?.newFlagged ?? [];
  return (
    <div>
      <ScreenHeader
        step={0}
        title="Emma's wealth runs on email"
        subtitle="Before Envoy: every advisor, bank and escrow officer writes to one inbox. Which of these can her agent trust?"
        events={events}
        preferred={["airbyte"]}
      />
      <SourcesStrip inbox={inbox} live={live} seedCount={total} pdfs={Number(counts.pdfs) || 11} admin={admin} />
      <div className="mb-5 flex items-baseline gap-6">
        {[
          ["emails", total],
          ["advisors", counts.advisors],
          ["banks", counts.banks],
          ["PDFs", counts.pdfs],
        ].map(([label, n], i) => (
          <div key={String(label)} className="flex items-baseline gap-2">
            {i > 0 && <span className="text-2xl text-stone-300">·</span>}
            <span className="font-serif text-5xl font-semibold tabular-nums text-stone-900">{n ?? "n/a"}</span>
            <span className="text-lg text-stone-500">{label}</span>
          </div>
        ))}
      </div>
      {flagged.length > 0 && (
        <div className="mb-5 space-y-3">
          {flagged.map((m) => (
            <FlaggedCard key={m.uid} email={m} />
          ))}
        </div>
      )}
      <Card className="overflow-hidden">
        <div className="max-h-[520px] divide-y divide-stone-100 overflow-y-auto">
          {rows.length === 0 && <div className="p-6 text-stone-400">No emails in payload.</div>}
          {rows.map((m) => (
            <div
              key={m.id}
              className={cx(
                "flex items-center gap-4 px-4 py-2.5 text-sm hover:bg-stone-50",
                m.fresh && "animate-slide-in",
                m.fresh && (m.flagged ? "bg-rose-50" : "bg-accent-50/60"),
              )}
            >
              <Mail size={15} className={cx("shrink-0", m.flagged ? "text-rose-500" : "text-stone-400")} />
              <div className="w-64 shrink-0 truncate">
                <div className="truncate font-medium text-stone-800">{m.name}</div>
                <div className="truncate font-mono text-[11px] text-stone-400">{m.addr}</div>
              </div>
              <div className="min-w-0 flex-1 truncate">
                {m.fresh && <span className="mr-1.5 rounded bg-accent-600 px-1 py-px text-[10px] font-bold uppercase text-white">new</span>}
                <span className="font-medium text-stone-800">{m.subject}</span>
                <span className="text-stone-400"> · {m.snippet}</span>
              </div>
              {m.flagged && (
                <span className="shrink-0 rounded bg-rose-600 px-1.5 py-px text-[10px] font-bold uppercase tracking-wide text-white">flagged</span>
              )}
              {m.trust && <TrustChip trust={m.trust} className="shrink-0" />}
              {m.attach && <FileText size={14} className="shrink-0 text-stone-400" />}
              <div className="w-16 shrink-0 text-right text-xs tabular-nums text-stone-400">
                {m.date && Number.isFinite(Date.parse(m.date))
                  ? new Date(m.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })
                  : ""}
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

// ---------- 1 Ingest ----------
export function IngestScreen({ events }: ScreenProps) {
  const memories: Memory[] = events.filter((e) => e.kind === "memory" && e.data?.memory).map((e) => e.data.memory);
  const ingest = events.find((e) => e.kind === "ingest");
  const total: number | undefined = ingest?.data?.memory_total;
  const groups: { trust: Trust; title: string; blurb: string; cls: string }[] = [
    { trust: "verified", title: "Verified", blurb: "From authenticated sources. May drive actions.", cls: "border-emerald-200" },
    { trust: "claimed", title: "Claimed", blurb: "Stated by a sender; needs confirmation before acting.", cls: "border-amber-200" },
    { trust: "untrusted", title: "Untrusted", blurb: "Unknown or suspicious origin. Can never become an instruction.", cls: "border-rose-200" },
  ];
  return (
    <div>
      <ScreenHeader
        step={1}
        title="The agent reads everything, and remembers where it came from"
        subtitle={`Every fact is stored with its source, fetch time and trust level.${
          total ? ` Showing the ${memories.length} key memories of ${total}.` : ""
        }`}
        events={events}
        preferred={["airbyte", "cognee", "superlinked"]}
      />
      {memories.length === 0 ? (
        <Empty>No memories in this step yet.</Empty>
      ) : (
        <div className="grid grid-cols-3 gap-4">
          {groups.map((g) => {
            const items = memories.filter((m) => m.trust === g.trust);
            return (
              <div key={g.trust} className={cx("rounded-xl border-t-4 bg-white p-4 shadow-sm", g.cls)}>
                <div className="flex items-baseline justify-between">
                  <h3 className="font-serif text-xl font-semibold text-stone-900">{g.title}</h3>
                  <span className="font-serif text-3xl font-semibold tabular-nums text-stone-700">{items.length}</span>
                </div>
                <p className="mb-3 text-xs text-stone-500">{g.blurb}</p>
                <div className="space-y-2">
                  {items.map((m) => (
                    <div key={m.id} className="animate-fade-in rounded-lg border border-stone-200 p-2.5 text-sm">
                      <p className="leading-snug text-stone-800">{m.text}</p>
                      <div className="mt-1.5 flex items-center gap-1.5">
                        <TrustChip trust={m.trust} />
                        <span
                          className={cx(
                            "rounded px-1.5 py-px text-[10px] font-medium",
                            m.can_instruct ? "bg-accent-50 text-accent-700" : "bg-stone-100 text-stone-500",
                          )}
                        >
                          {m.can_instruct ? "can instruct" : "info only"}
                        </span>
                      </div>
                      <div className="mt-1 truncate font-mono text-[10px] text-stone-400">{m.source_uri}</div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---------- 2 Rogue ----------
export function RogueScreen({ events }: ScreenProps) {
  const rej = find(events, (e) => e.kind === "reject") ?? find(events, (e) => e.decision?.result === "deny");
  const d = rej?.data ?? find(events, (e) => e.actor === "rogue_agent")?.data ?? {};
  return (
    <div>
      <ScreenHeader
        step={2}
        title="A scraper with Emma's password knocks on the door"
        subtitle="Shared credentials are how outside agents get into banks today, and why banks block them."
        events={events}
        preferred={["persona", "guild"]}
      />
      <div className="grid grid-cols-[1fr_auto_1fr_auto_1fr] items-center gap-4">
        <Card className="p-5 text-center">
          <Bot className="mx-auto text-rose-600" size={36} />
          <div className="mt-2 font-mono text-lg font-semibold text-stone-800">{d.agent_id ?? "scraper-7f"}</div>
          <div className="text-xs text-stone-500">credential: {d.credential ?? "shared_password"}</div>
        </Card>
        <span className="text-3xl text-stone-300">→</span>
        <Card className="border-rose-300 p-5 text-center">
          <ShieldX className="mx-auto text-rose-600" size={36} />
          <div className="mt-2 font-semibold text-stone-800">Envoy gateway</div>
          <div className="text-xs text-stone-500">Know Your Agent check</div>
        </Card>
        <span className="text-3xl text-rose-300">✕</span>
        <Card className="p-5 text-center opacity-50">
          <div className="font-semibold text-stone-700">Bank A · Bank B · Bank C</div>
          <div className="text-xs text-stone-500">never reached</div>
        </Card>
      </div>
      {rej && (
        <div className="mt-8 animate-fade-in rounded-2xl border-2 border-rose-500 bg-rose-50 p-8">
          <div className="flex items-center gap-4">
            <ShieldAlert className="text-rose-600" size={52} />
            <div>
              <div className="font-serif text-4xl font-semibold text-rose-700">Rejected: unverified agent</div>
              <div className="mt-1 text-rose-700/80">{rej.decision?.reason ?? rej.summary}</div>
            </div>
            <div className="ml-auto"><RuleChips rule={rej.decision?.rule} /></div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- 3 Verified + mandate ----------
type Rule = { id: string; type: string; [k: string]: unknown };

export function describeRule(r: Rule): string {
  switch (r.type) {
    case "no_sell_during_blackout":
      return `No selling company stock during the blackout (until ${r.until})`;
    case "max_concentration":
      return `Company stock may not exceed ${r.max_pct}% of the portfolio${r.must_not_increase ? ", and must not increase" : ""}`;
    case "co_sign_over_usd":
      return `Anything over $${Number(r.amount).toLocaleString("en-US")} needs both Emma and Dev`;
    case "wire_only_to_verified_payees":
      return "Money moves only to verified payees";
    case "untrusted_content_cannot_instruct":
      return "Untrusted content (emails, listings) can never instruct the agent";
    case "approved_counterparties":
      return `Only approved counterparties: ${(Array.isArray(r.list) ? r.list : [])
        .map((b: unknown) => String(b).replace("bank_", "Bank ").replace(/ (\w)$/, (_, c: string) => " " + c.toUpperCase()))
        .join(", ")}`;
    default:
      return r.type.replace(/_/g, " ");
  }
}

export function VerifiedScreen({ events }: ScreenProps) {
  const v = find(events, (e) => e.kind === "verify");
  const m = find(events, (e) => e.kind === "mandate_check");
  const mandate = m?.data?.mandate as { principal?: string; co_signers?: string[]; rules?: Rule[] } | undefined;
  return (
    <div>
      <ScreenHeader
        step={3}
        title="Emma's agent is verified, and carries her rules"
        subtitle="Not logged in with her password: an attested agent bound to a verified person, holding no bank credentials."
        events={events}
        preferred={["persona", "guild"]}
      />
      <div className="grid grid-cols-[360px_1fr] gap-6">
        <div className="animate-fade-in rounded-2xl border-2 border-emerald-500 bg-emerald-50 p-6">
          <ShieldCheck className="text-emerald-600" size={44} />
          <div className="mt-3 font-serif text-3xl font-semibold text-emerald-800">Agent verified</div>
          <div className="mt-3 space-y-1 text-sm text-emerald-900/80">
            <div>
              agent <span className="font-mono font-semibold">{v?.data?.agent_id ?? "emma-agent-01"}</span>
            </div>
            <div>
              inquiry <span className="font-mono">{v?.data?.inquiry_id ?? "n/a"}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Fingerprint size={14} /> principal: Emma (identity verified)
            </div>
          </div>
          {v?.decision?.reason && <p className="mt-4 text-sm text-emerald-900/70">{v.decision.reason}</p>}
        </div>
        <Card className="p-6">
          <div className="flex items-baseline justify-between">
            <h3 className="font-serif text-2xl font-semibold text-stone-900">Mandate</h3>
            <span className="text-sm text-stone-500">
              principal <b className="text-stone-700">{mandate?.principal ?? "emma"}</b> · co-signer{" "}
              <b className="text-stone-700">{(mandate?.co_signers ?? ["dev"]).join(", ")}</b>
            </span>
          </div>
          <ol className="mt-4 space-y-2.5">
            {(mandate?.rules ?? []).map((r) => (
              <li key={r.id} className="flex items-center gap-3 rounded-lg border border-stone-200 px-3 py-2.5">
                <RuleChip rule={r.id} tone="neutral" />
                <span className="text-[15px] text-stone-800">{describeRule(r)}</span>
              </li>
            ))}
            {!mandate?.rules?.length && <li className="text-stone-400">Mandate not in payload.</li>}
          </ol>
        </Card>
      </div>
    </div>
  );
}

// ---------- 4 Fake wire ----------
export function FakeWireScreen({ events, inbox }: ScreenProps & { inbox?: InboxApi }) {
  const wire = find(events, (e) => e.kind === "flag" && (!!e.data?.email_id || !!e.data?.inbox_email?.signals?.lookalike_sender));
  const inj = find(events, (e) => e.kind === "flag" && !!e.data?.injection);
  const realCheck = find(events, (e) => e.kind === "mandate_check" && !!e.data?.verified_payee);
  const wireEmail: InboxEmail | null = wire ? inboxEmailFromEvent(wire) : null;
  const vp = wire?.data?.verified_payee ?? realCheck?.data?.verified_payee ?? {};
  const realExtracted = realCheck?.data?.extracted ?? {};
  const realFrom = String(vp.email ?? wireEmail?.lookalike_of ?? "escrow.team.demo@gmail.com");
  const last4 = String(vp.account_last4 ?? vp.bank_account_last4 ?? "2210");
  const arrivals = (inbox?.newFlagged ?? []).filter((m) => m.uid !== wireEmail?.uid);
  return (
    <div>
      <ScreenHeader
        step={4}
        title="The fake wire is caught before anything moves"
        subtitle="Same display name, same subject line. One character different in the sender, and an unverified account."
        events={events}
        preferred={["cognee", "superlinked"]}
      />
      {arrivals.length > 0 && (
        <div className="mb-5 space-y-3">
          {arrivals.map((m) => (
            <FlaggedCard key={m.uid} email={m} />
          ))}
        </div>
      )}
      {!wire || !wireEmail ? (
        <Empty>No wire flag in this step.</Empty>
      ) : (
        <div className="grid grid-cols-[1.4fr_1fr] gap-5">
          <div>
            <FlaggedCard email={wireEmail} />
            {wire.decision?.reason && <p className="mt-2 text-sm text-stone-600">{wire.decision.reason}</p>}
            <div className="mt-1 font-mono text-[11px] text-stone-400">source {wire.sources?.[0]?.uri}</div>
          </div>
          <div className="h-fit animate-fade-in rounded-2xl border-2 border-emerald-400 bg-white p-5">
            <div className="text-xs font-bold uppercase tracking-wider text-emerald-600">Verified escrow payee</div>
            <div className="mt-3 text-sm text-stone-500">From</div>
            <div className="break-all font-mono text-lg text-stone-900">{realFrom}</div>
            <div className="mt-3 font-medium text-stone-800">{vp.name ?? "Escrow Team"}</div>
            <dl className="mt-4 grid grid-cols-2 gap-2 text-sm">
              <dt className="text-stone-500">Account</dt>
              <dd className="font-mono text-emerald-700">{realExtracted.account ?? `•••• ${last4}`}</dd>
              <dt className="text-stone-500">Routing</dt>
              <dd className="font-mono text-emerald-700">
                {realExtracted.routing ?? (vp.routing_last4 ? `•••• ${vp.routing_last4}` : "n/a")}
              </dd>
            </dl>
            <p className="mt-4 flex items-start gap-2 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">
              {realCheck?.decision?.rule && <RuleChip rule={realCheck.decision.rule} tone="allow" />}
              <span>
                {realCheck?.decision?.reason ??
                  "Original instructions from the verified address, confirmed out of band. The only payee R4 allows."}
              </span>
            </p>
            <p className="mt-3 text-xs text-stone-500">
              Payees come only from <span className="font-mono">verified_contacts.json</span>, edited by humans. Nothing in
              an email can add or change one.
            </p>
            {(vp.source_uri ?? vp.source) && (
              <div className="mt-2 font-mono text-[11px] text-stone-400">source {vp.source_uri ?? vp.source}</div>
            )}
          </div>
        </div>
      )}
      {inj && (
        <Card className="mt-5 animate-fade-in border-rose-300 p-5">
          <div className="flex items-center justify-between">
            <div className="font-semibold text-stone-800">Hidden instruction in the house listing</div>
            <span className="flex items-center gap-2">
              <TrustChip trust="untrusted" />
              <RuleChips rule={inj.decision?.rule} />
            </span>
          </div>
          <div className="mt-3 rounded-lg bg-stone-900 p-3 font-mono text-sm text-stone-300">
            …redwood deck with canyon views, and a detached studio perfect for a home office.{" "}
            <span className="rounded bg-rose-500/30 px-1 text-rose-200">{String(inj.data.injection)}</span> Showings by
            appointment…
          </div>
          <p className="mt-2 text-sm text-stone-600">{inj.decision?.reason}</p>
          <div className="mt-1 font-mono text-[11px] text-stone-400">source {inj.sources?.[0]?.uri}</div>
        </Card>
      )}
    </div>
  );
}
