"use client";

import { ChevronLeft, ChevronRight, MailPlus, RotateCcw, Wrench } from "lucide-react";
import { useState } from "react";
import type { AgentEvent } from "@/lib/types";
import type { Source } from "@/lib/useDemo";
import { SponsorBadge } from "./SponsorBadge";
import { cx, sponsorsOf } from "./ui";

export const STEP_TITLES = [
  "Inbox",
  "Ingest",
  "Rogue agent",
  "Verified",
  "Fake wire",
  "Funding",
  "RFQ",
  "Two keys",
  "Execute",
  "Audit",
  "Drills",
  "Autonomy",
];

export function PresenterBar({
  viewStep,
  ranStep,
  maxStep,
  busy,
  source,
  mode,
  onNext,
  onBack,
  onReset,
  onGoTo,
  onReconnect,
  inboxSource,
  admin = false,
  onSimulate,
  simulating = false,
}: {
  viewStep: number;
  ranStep: number;
  maxStep: number;
  busy: boolean;
  source: Source;
  mode: "mock" | "live";
  onNext: () => void;
  onBack: () => void;
  onReset: () => void;
  onGoTo: (s: number) => void;
  onReconnect: () => void;
  inboxSource?: string;
  admin?: boolean;
  onSimulate?: () => void;
  simulating?: boolean;
}) {
  const [menu, setMenu] = useState(false);
  const pill =
    source === "probing"
      ? { text: "Connecting…", cls: "bg-stone-200 text-stone-600" }
      : source === "offline"
        ? { text: "MOCK · offline fixtures", cls: "bg-amber-100 text-amber-800 ring-1 ring-amber-300" }
        : inboxSource === "imap"
          ? { text: "LIVE · Gmail", cls: "bg-emerald-100 text-emerald-800 ring-1 ring-emerald-300" }
          : mode === "live"
          ? { text: "LIVE", cls: "bg-emerald-100 text-emerald-800 ring-1 ring-emerald-300" }
          : { text: "MOCK", cls: "bg-stone-200 text-stone-700 ring-1 ring-stone-300" };
  return (
    <header className="flex items-center gap-4 border-b border-stone-200 bg-white px-5 py-2.5">
      <div className="flex items-baseline gap-2">
        <span className="font-serif text-xl font-semibold tracking-tight text-stone-900">Envoy</span>
        <span className="hidden text-xs text-stone-400 xl:inline">the door banks can approve</span>
      </div>
      <nav className="ml-4 flex flex-1 items-center gap-1">
        {Array.from({ length: maxStep + 1 }, (_, s) => (
          <button
            key={s}
            onClick={() => onGoTo(s)}
            disabled={s > ranStep}
            title={STEP_TITLES[s]}
            className={cx(
              "flex h-8 min-w-8 items-center justify-center gap-1 rounded-md px-2 text-xs font-medium transition",
              s === viewStep && "bg-accent-600 text-white",
              s !== viewStep && s <= ranStep && "bg-accent-50 text-accent-800 hover:bg-accent-100",
              s > ranStep && "text-stone-400",
              s === 11 && "italic",
            )}
          >
            <span className="font-mono">{s}</span>
            <span className="hidden 2xl:inline">{STEP_TITLES[s]}</span>
          </button>
        ))}
      </nav>
      <button
        onClick={onReconnect}
        title="Click to re-probe the envoy backend"
        className={cx("rounded-full px-2.5 py-1 text-[11px] font-bold tracking-wide", pill.cls)}
      >
        {pill.text}
      </button>
      {admin && onSimulate && (
        <div className="relative">
          <button
            onClick={() => setMenu((m) => !m)}
            title="Admin"
            className={cx(
              "flex h-7 w-7 items-center justify-center rounded-md text-stone-400 hover:bg-stone-100 hover:text-stone-700",
              menu && "bg-stone-100 text-stone-700",
            )}
          >
            <Wrench size={14} />
          </button>
          {menu && (
            <div className="absolute right-0 top-9 z-50 w-64 rounded-lg border border-stone-200 bg-white p-1.5 shadow-lg">
              <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-400">Admin</div>
              <button
                onClick={() => {
                  setMenu(false);
                  onSimulate();
                }}
                disabled={simulating}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-stone-700 hover:bg-stone-50 disabled:opacity-50"
              >
                <MailPlus size={14} className="text-stone-400" />
                <span className="flex-1">{simulating ? "Injecting…" : "Simulate new email"}</span>
                <kbd className="rounded border border-stone-300 px-1 font-mono text-[10px] text-stone-500">E</kbd>
              </button>
              <p className="px-2 pb-1 pt-0.5 text-[11px] leading-snug text-stone-400">
                Injects the lookalike escrow email through the same classifier path (works offline).
              </p>
            </div>
          )}
        </div>
      )}
      <div className="flex items-center gap-1.5">
        <button
          onClick={onBack}
          disabled={viewStep < 0}
          className="flex h-9 items-center gap-1 rounded-lg border border-stone-300 px-3 text-sm text-stone-700 hover:bg-stone-50 disabled:opacity-40"
        >
          <ChevronLeft size={16} /> Back
        </button>
        <button
          onClick={onNext}
          disabled={busy || (viewStep >= ranStep && ranStep >= maxStep)}
          className="flex h-9 items-center gap-1 rounded-lg bg-accent-600 px-4 text-sm font-semibold text-white hover:bg-accent-700 disabled:opacity-50"
        >
          {busy ? "Running…" : "Next"} <ChevronRight size={16} />
        </button>
        <button
          onClick={onReset}
          disabled={busy}
          title="Reset (R)"
          className="flex h-9 items-center gap-1 rounded-lg border border-stone-300 px-3 text-sm text-stone-700 hover:bg-stone-50 disabled:opacity-40"
        >
          <RotateCcw size={14} /> Reset
        </button>
      </div>
    </header>
  );
}

export function Footer({ events }: { events: AgentEvent[] }) {
  const { keys, modes } = sponsorsOf(events);
  return (
    <footer className="flex items-center justify-between gap-4 border-t border-stone-200 bg-white px-5 py-2 text-[11px] text-stone-500">
      <div className="flex min-h-5 items-center gap-2">
        {keys.length > 0 && <SponsorBadge keys={keys} modes={modes} />}
        {keys.length > 0 && (
          <span className="flex items-center gap-1 text-stone-400">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-stone-400" /> = mock adapter
          </span>
        )}
      </div>
      <span>Demo with fictional data. Not financial, tax, or legal advice.</span>
    </footer>
  );
}
