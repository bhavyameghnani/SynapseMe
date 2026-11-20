"use client";

// Inbox state for the UI: GET /inbox polling (3s) + SSE events carrying data.inbox_email, with an offline
// fallback where "Simulate new email" runs the TS classifier port. Email is context only: nothing here acts.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as api from "./api";
import { simulatedLookalike } from "./fraud";
import type { AgentEvent, InboxEmail, InboxStatus } from "./types";
import type { Source } from "./useDemo";

const POLL_MS = 3000;
const BACKLOG_MS = 2500; // anything seen this soon after connecting is history, not "new mail"

const ts = (e: InboxEmail) => {
  const t = Date.parse(e.date);
  return Number.isFinite(t) ? t : 0;
};

export type InboxApi = ReturnType<typeof useInbox>;

export function useInbox({
  source,
  events,
  injectOffline,
  onNotice,
}: {
  source: Source;
  events: AgentEvent[];
  injectOffline: (email: InboxEmail) => Promise<void>;
  onNotice: (msg: string) => void;
}) {
  const [status, setStatus] = useState<InboxStatus | null>(null);
  const [remote, setRemote] = useState<InboxEmail[]>([]);
  const [local, setLocal] = useState<InboxEmail[]>([]);
  const [supported, setSupported] = useState<boolean | null>(null);
  const [fresh, setFresh] = useState<string[]>([]);
  const [toasts, setToasts] = useState<string[]>([]);
  const [simulating, setSimulating] = useState(false);
  const known = useRef(new Set<string>());
  const settleAt = useRef(Date.now() + BACKLOG_MS);

  // Poll /inbox while the backend is up; back off if the endpoint doesn't exist yet.
  useEffect(() => {
    if (source !== "live") {
      setStatus(null);
      setRemote([]);
      setSupported(null);
      return;
    }
    settleAt.current = Date.now() + BACKLOG_MS;
    let stop = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let misses = 0;
    const tick = async () => {
      try {
        const r = await api.getInbox();
        if (stop) return;
        setRemote(Array.isArray(r.emails) ? r.emails : []);
        setStatus(r.status ?? null);
        setSupported(true);
        misses = 0;
      } catch {
        try {
          const st = await api.getInboxStatus();
          if (stop) return;
          setStatus(st);
          setSupported(true);
        } catch {
          if (stop) return;
          misses++;
          setSupported(false);
        }
      }
      if (!stop) timer = setTimeout(tick, misses > 2 ? POLL_MS * 5 : POLL_MS);
    };
    void tick();
    return () => {
      stop = true;
      if (timer) clearTimeout(timer);
    };
  }, [source]);

  // A ledger reset clears locally simulated mail and alerts.
  useEffect(() => {
    if (events.length === 0) {
      setLocal([]);
      setToasts([]);
      setFresh([]);
    }
  }, [events.length]);

  const fromEvents = useMemo(() => {
    const out: InboxEmail[] = [];
    for (const e of events) {
      const m = e.data?.inbox_email as InboxEmail | undefined;
      // The step-4 seed flag (data.email_id) also carries inbox_email; it isn't "new mail".
      if (m && m.uid && !e.data?.email_id) out.push(m);
    }
    return out;
  }, [events]);

  const emails = useMemo(() => {
    const byUid = new Map<string, InboxEmail>();
    // Later sources win (SSE/local copies may carry the classifier result before the poll does).
    for (const m of [...remote, ...fromEvents, ...local]) if (m?.uid) byUid.set(m.uid, { ...byUid.get(m.uid), ...m });
    return Array.from(byUid.values()).sort((a, b) => ts(b) - ts(a));
  }, [remote, fromEvents, local]);

  // Detect new arrivals for the slide-in animation and the flagged toast.
  useEffect(() => {
    const newOnes = emails.filter((m) => !known.current.has(m.uid));
    if (!newOnes.length) return;
    newOnes.forEach((m) => known.current.add(m.uid));
    if (Date.now() < settleAt.current && !newOnes.some((m) => m.simulated)) return;
    setFresh((f) => [...newOnes.map((m) => m.uid), ...f]);
    const flagged = newOnes.filter((m) => m.flag).map((m) => m.uid);
    if (flagged.length) setToasts((t) => [...flagged, ...t]);
  }, [emails]);

  const simulate = useCallback(async () => {
    if (simulating) return;
    setSimulating(true);
    try {
      if (source === "live") {
        try {
          const r = await api.simulateInbox();
          if (r?.email?.uid) setLocal((l) => [r.email, ...l]);
          return;
        } catch {
          // Endpoint missing or failed: show the card locally, keep it out of the backend's ledger.
          setLocal((l) => [simulatedLookalike(), ...l]);
          onNotice("Simulated locally: envoy has no /inbox/simulate yet (not in the signed ledger)");
          return;
        }
      }
      await injectOffline(simulatedLookalike());
    } finally {
      setSimulating(false);
    }
  }, [simulating, source, injectOffline, onNotice]);

  const dismissToast = useCallback((uid: string) => setToasts((t) => t.filter((x) => x !== uid)), []);

  const byUid = useMemo(() => new Map(emails.map((m) => [m.uid, m])), [emails]);
  const newFlagged = useMemo(() => fresh.map((u) => byUid.get(u)).filter((m): m is InboxEmail => !!m?.flag), [fresh, byUid]);
  const toastEmails = useMemo(() => toasts.map((u) => byUid.get(u)).filter((m): m is InboxEmail => !!m), [toasts, byUid]);

  return {
    status,
    supported,
    emails,
    fresh: useMemo(() => new Set(fresh), [fresh]),
    newFlagged,
    toastEmails,
    dismissToast,
    simulate,
    simulating,
  };
}
