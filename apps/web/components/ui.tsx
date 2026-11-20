import clsx from "clsx";
import type { ReactNode } from "react";
import type { Actor, AgentEvent, Decision, SponsorKey, Trust } from "@/lib/types";
import { SponsorBadge } from "./SponsorBadge";

export const cx = clsx;

export const usd = (n: unknown, compact = false): string => {
  const v = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(v)) return "n/a";
  if (compact && Math.abs(v) >= 1000) {
    if (Math.abs(v) >= 1_000_000) return `$${(v / 1_000_000).toFixed(v % 1_000_000 === 0 ? 0 : 1)}M`;
    return `$${(v / 1000).toFixed(v % 1000 === 0 ? 0 : 1)}k`;
  }
  return (v < 0 ? "−$" : "$") + Math.abs(Math.round(v)).toLocaleString("en-US");
};

export const pct = (bps: number | null | undefined) => (bps == null ? "n/a" : `${(bps / 100).toFixed(1)}%`);

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("rounded-xl border border-stone-200 bg-white shadow-sm", className)}>{children}</div>;
}

const TRUST_STYLE: Record<Trust, string> = {
  verified: "bg-emerald-50 text-emerald-700 border-emerald-200",
  claimed: "bg-amber-50 text-amber-700 border-amber-200",
  untrusted: "bg-rose-50 text-rose-700 border-rose-200",
};

export function TrustChip({ trust, className }: { trust: Trust; className?: string }) {
  return (
    <span
      className={cx(
        "inline-flex items-center rounded-full border px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide",
        TRUST_STYLE[trust] ?? "border-stone-200 bg-stone-50 text-stone-600",
        className,
      )}
    >
      {trust}
    </span>
  );
}

export function RuleChip({ rule, tone = "deny" }: { rule: string; tone?: "deny" | "allow" | "neutral" }) {
  return (
    <span
      className={cx(
        "inline-flex items-center rounded-md border px-1.5 py-px font-mono text-[11px] font-semibold",
        tone === "deny" && "border-rose-300 bg-rose-50 text-rose-700",
        tone === "allow" && "border-emerald-300 bg-emerald-50 text-emerald-700",
        tone === "neutral" && "border-stone-300 bg-stone-50 text-stone-600",
      )}
    >
      {rule}
    </span>
  );
}

// Rule ids can be compound ("R4+R5", "KYA+GUILD").
export function RuleChips({ rule, tone = "deny" }: { rule?: string | null; tone?: "deny" | "allow" | "neutral" }) {
  if (!rule) return null;
  return (
    <span className="inline-flex gap-1">
      {rule.split("+").map((r) => (
        <RuleChip key={r} rule={r} tone={tone} />
      ))}
    </span>
  );
}

// "rejected" with no rule is a neutral "not selected" (e.g. Bank A: higher rate), not a red rejection.
export const isNegative = (d?: Decision | null) =>
  !!d && (d.result === "deny" || (d.result === "rejected" && !!d.rule));

export function DecisionPill({ decision }: { decision?: Decision | null }) {
  if (!decision) return null;
  const neg = isNegative(decision);
  const neutral = decision.result === "rejected" && !decision.rule;
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
        neutral ? "bg-stone-300 text-stone-700" : neg ? "bg-rose-600 text-white" : "bg-emerald-600 text-white",
      )}
    >
      {neutral ? "not selected" : decision.result}
      {decision.rule ? <span className="font-mono opacity-90">· {decision.rule}</span> : null}
    </span>
  );
}

export const ACTOR_META: Record<Actor, { label: string; initials: string; cls: string }> = {
  client_agent: { label: "Emma's agent", initials: "EA", cls: "bg-accent-600 text-white" },
  envoy: { label: "Envoy", initials: "EN", cls: "bg-stone-800 text-white" },
  bank_a: { label: "Bank A agent", initials: "A", cls: "bg-slate-500 text-white" },
  bank_b: { label: "Bank B agent", initials: "B", cls: "bg-slate-700 text-white" },
  bank_c: { label: "Bank C agent", initials: "C", cls: "bg-slate-400 text-white" },
  "human:emma": { label: "Emma", initials: "E", cls: "bg-accent-100 text-accent-800 ring-1 ring-accent-300" },
  "human:dev": { label: "Dev", initials: "D", cls: "bg-accent-100 text-accent-800 ring-1 ring-accent-300" },
  rogue_agent: { label: "Unknown agent", initials: "?", cls: "bg-rose-600 text-white" },
};

export function ActorAvatar({ actor, size = 28 }: { actor: Actor; size?: number }) {
  const m = ACTOR_META[actor] ?? { label: actor, initials: "?", cls: "bg-stone-300" };
  return (
    <span
      title={m.label}
      style={{ width: size, height: size, fontSize: size * 0.38 }}
      className={cx("inline-flex shrink-0 items-center justify-center rounded-full font-semibold", m.cls)}
    >
      {m.initials}
    </span>
  );
}

// Order sponsors for a screen header, preferring the §2 table order, and only those that actually ran.
export function sponsorsOf(events: AgentEvent[], preferred: SponsorKey[] = []): {
  keys: SponsorKey[];
  modes: Record<string, string>;
} {
  const keys = new Set<SponsorKey>();
  const modes: Record<string, string> = {};
  for (const e of events) {
    for (const k of e.sponsors ?? []) {
      keys.add(k);
      const m = e.sponsor_modes?.[k];
      // a sponsor counts as "real" in a view if any event ran it for real
      if (m === "real" || !modes[k]) modes[k] = m ?? "mock";
    }
  }
  const ordered = [...preferred.filter((k) => keys.has(k)), ...Array.from(keys).filter((k) => !preferred.includes(k))];
  return { keys: ordered, modes };
}

export function ScreenHeader({
  step,
  title,
  subtitle,
  events,
  preferred,
}: {
  step: number;
  title: string;
  subtitle?: string;
  events: AgentEvent[];
  preferred: SponsorKey[];
}) {
  const { keys, modes } = sponsorsOf(events, preferred);
  return (
    <div className="mb-6 flex items-end justify-between gap-6 border-b border-stone-200 pb-4">
      <div className="min-w-0">
        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-accent-600">Step {step}</div>
        <h1 className="mt-1 font-serif text-3xl font-semibold text-stone-900">{title}</h1>
        {subtitle && <p className="mt-1 max-w-2xl text-sm text-stone-500">{subtitle}</p>}
      </div>
      <div className="shrink-0">
        <SponsorBadge keys={keys} modes={modes} size="md" label />
      </div>
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-xl border border-dashed border-stone-300 p-10 text-center text-stone-400">{children}</div>;
}

/** Where an intent came from (contracts: source "mcp" | "ui"; "email" is always refused by R5). */
export function intentSource(ev: AgentEvent): string | undefined {
  const s = ev.data?.source ?? ev.data?.intent?.source;
  return typeof s === "string" && s ? s : undefined;
}

export function SourceChip({ source, dark = false }: { source?: string | null; dark?: boolean }) {
  if (!source) return null;
  const label = source === "mcp" ? "via MCP" : source === "ui" ? "via UI" : `via ${source}`;
  return (
    <span
      title={source === "mcp" ? "Intent sent by Emma's agent through the Envoy MCP connector" : source === "email" ? "Email is context only" : "Intent sent from the Envoy UI"}
      className={cx(
        "inline-flex items-center rounded-full px-1.5 py-px text-[10px] font-semibold tracking-wide",
        source === "email"
          ? "bg-rose-100 text-rose-700 ring-1 ring-rose-300"
          : dark
            ? "bg-stone-700 text-stone-100"
            : source === "mcp"
              ? "bg-accent-100 text-accent-800 ring-1 ring-accent-200"
              : "bg-stone-100 text-stone-600 ring-1 ring-stone-200",
      )}
    >
      {label}
    </span>
  );
}
