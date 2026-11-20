"use client";

import { ChevronDown, ChevronRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { AgentEvent, InboxEmail } from "@/lib/types";
import { SponsorBadge } from "./SponsorBadge";
import { FlaggedCard } from "./FlaggedCard";
import { ACTOR_META, ActorAvatar, DecisionPill, SourceChip, TrustChip, cx, intentSource, isNegative } from "./ui";

export function EventCard({
  ev,
  active,
  onSelect,
  status,
  defaultOpen = false,
}: {
  ev: AgentEvent;
  active?: boolean;
  onSelect?: () => void;
  status?: "ok" | "bad";
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const neg = isNegative(ev.decision);
  const via = intentSource(ev);
  const inboxEmail = ev.kind === "flag" && ev.data?.inbox_email?.flag ? (ev.data.inbox_email as InboxEmail) : null;
  const emailIntentRefused = via === "email" && (ev.kind === "reject" || ev.decision?.result === "deny");
  return (
    <div
      className={cx(
        "animate-fade-in rounded-lg border bg-white p-3 text-sm transition",
        neg ? "border-rose-200" : ev.decision ? "border-emerald-200" : "border-stone-200",
        active && "ring-2 ring-accent-400",
      )}
    >
      <div className="flex items-start gap-2.5">
        <ActorAvatar actor={ev.actor} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-stone-500">
            <span className="font-semibold text-stone-700">{ACTOR_META[ev.actor]?.label ?? ev.actor}</span>
            <span className="rounded bg-stone-100 px-1 font-mono text-[10px] text-stone-600">{ev.kind}</span>
            <button className="font-mono text-[10px] text-stone-400 hover:text-accent-600" onClick={onSelect} title="Go to this step">
              step {ev.step}
            </button>
            <SourceChip source={via} />
            {status && (
              <span className={cx("ml-auto font-bold", status === "ok" ? "text-emerald-600" : "text-rose-600")}>
                {status === "ok" ? "✓ hash ok" : "✗ tampered"}
              </span>
            )}
          </div>
          <p className="mt-0.5 leading-snug text-stone-800">{ev.summary}</p>
          {emailIntentRefused && (
            <div className="mt-1.5 rounded-md border border-rose-200 bg-rose-50 px-2 py-1.5 text-[11px] text-rose-800">
              <span className="font-semibold">Intent from email refused (R5).</span> Email is context only; quotes,
              approvals and payments only come through Envoy via MCP or the UI.
            </div>
          )}
          {inboxEmail && <FlaggedCard email={inboxEmail} compact className="mt-2 shadow-none" />}
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <DecisionPill decision={ev.decision} />
            {ev.sources?.map((s, i) => <TrustChip key={i} trust={s.trust} />)}
            <span className="ml-auto">
              <SponsorBadge keys={ev.sponsors ?? []} modes={ev.sponsor_modes} />
            </span>
          </div>
          <button
            onClick={() => setOpen((o) => !o)}
            className="mt-1.5 inline-flex items-center gap-1 text-[11px] text-stone-400 hover:text-stone-700"
          >
            {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            details · <span className="font-mono">{ev.hash?.slice(0, 10) || "unhashed"}…</span>
          </button>
          {open && (
            <div className="mt-2 space-y-2 rounded-md bg-stone-50 p-2 text-[11px] text-stone-600">
              {ev.decision && (
                <div>
                  <span className="font-semibold text-stone-700">Decision: </span>
                  {ev.decision.result}
                  {ev.decision.rule ? ` (${ev.decision.rule})` : ""}: {ev.decision.reason}
                </div>
              )}
              {ev.sources?.length ? (
                <div className="space-y-1">
                  <div className="font-semibold text-stone-700">Sources</div>
                  {ev.sources.map((s, i) => (
                    <div key={i} className="rounded border border-stone-200 bg-white p-1.5">
                      <div className="flex items-center gap-1.5">
                        <TrustChip trust={s.trust} />
                        <span className="font-medium text-stone-700">{s.label}</span>
                      </div>
                      <div className="mt-0.5 break-all font-mono text-[10px]">{s.uri}</div>
                      <div className="break-all font-mono text-[10px] text-stone-400">
                        sha256 {s.sha256 || "n/a"} · {s.fetched_at}
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
              <div className="break-all font-mono text-[10px]">
                <div>id {ev.id} · {ev.ts}</div>
                <div>prev {ev.prev_hash}</div>
                <div>hash {ev.hash}</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function Timeline({
  events,
  viewStep,
  onSelectStep,
}: {
  events: AgentEvent[];
  viewStep: number;
  onSelectStep: (s: number) => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [events.length]);
  return (
    <aside className="flex h-full min-h-0 flex-col border-l border-stone-200 bg-stone-100/60">
      <div className="flex items-center justify-between border-b border-stone-200 px-4 py-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">Live audit trail</div>
          <div className="text-[11px] text-stone-400">hash-chained · append-only</div>
        </div>
        <span className="rounded-full bg-white px-2 py-0.5 font-mono text-xs text-stone-600 ring-1 ring-stone-200">
          {events.length} events
        </span>
      </div>
      <div ref={listRef} className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
        {events.length === 0 && <p className="p-6 text-center text-sm text-stone-400">No events yet. Press Next to begin.</p>}
        {events.map((ev) => (
          <EventCard key={ev.id} ev={ev} active={ev.step === viewStep} onSelect={() => onSelectStep(ev.step)} />
        ))}
      </div>
    </aside>
  );
}
