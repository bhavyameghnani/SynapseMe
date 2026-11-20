"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as api from "./api";
import { buildFixtureStep, buildInboxEvents } from "./fixtures";
import type { AgentEvent, InboxEmail } from "./types";

export const MAX_STEP = 11;
export type Source = "probing" | "live" | "offline";

function mergeEvents(prev: AgentEvent[], incoming: AgentEvent[]): AgentEvent[] {
  if (!incoming.length) return prev;
  const seen = new Set(prev.map((e) => e.id));
  const add = incoming.filter((e) => e && e.id && !seen.has(e.id));
  return add.length ? [...prev, ...add] : prev;
}

export function useDemo() {
  const [source, setSource] = useState<Source>("probing");
  const [backendMock, setBackendMock] = useState(true);
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [viewStep, setViewStep] = useState(-1);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const eventsRef = useRef<AgentEvent[]>([]);
  eventsRef.current = events;
  const unsubRef = useRef<api.Unsubscribe | null>(null);

  const ranStep = useMemo(() => events.reduce((m, e) => Math.max(m, e.step), -1), [events]);

  const connectLive = useCallback(async (): Promise<boolean> => {
    try {
      const st = await api.getState();
      setBackendMock(st.mode !== "live");
      unsubRef.current?.();
      setEvents([]);
      unsubRef.current = api.subscribe(
        (ev) => setEvents((p) => mergeEvents(p, [ev])),
        () => {
          setEvents([]);
          setViewStep(-1);
        },
        (evs) => setEvents((p) => (evs.length < p.length ? evs : mergeEvents(p, evs))),
      );
      setSource("live");
      setNotice(null);
      return true;
    } catch {
      setSource("offline");
      return false;
    }
  }, []);

  useEffect(() => {
    void connectLive();
    return () => unsubRef.current?.();
  }, [connectLive]);

  // Follow the backend when steps are run elsewhere (e.g. curl) and we were at the latest step.
  const lastRan = useRef(-1);
  useEffect(() => {
    if (ranStep > lastRan.current) setViewStep((v) => (v === lastRan.current ? ranStep : v));
    if (ranStep < lastRan.current) setViewStep((v) => Math.min(v, ranStep));
    lastRan.current = ranStep;
  }, [ranStep]);

  const runOffline = useCallback(async (target: number) => {
    let evs = [...eventsRef.current];
    const have = evs.reduce((m, e) => Math.max(m, e.step), -1);
    for (let s = have + 1; s <= target; s++) evs = [...evs, ...(await buildFixtureStep(s, evs))];
    eventsRef.current = evs;
    setEvents(evs);
    return evs;
  }, []);

  // Offline only: chain a newly "arrived" inbox email onto the local ledger at the current step.
  const injectEmailOffline = useCallback(
    async (email: InboxEmail) => {
      let evs = eventsRef.current;
      let at = evs.reduce((m, e) => Math.max(m, e.step), -1);
      if (at < 0) {
        // From the intro, land on the inbox first so step 0 isn't skipped.
        evs = await runOffline(0);
        at = 0;
        lastRan.current = 0;
        setViewStep(0);
      }
      const add = await buildInboxEvents(at, evs, email);
      eventsRef.current = [...evs, ...add];
      setEvents(eventsRef.current);
    },
    [runOffline],
  );

  const next = useCallback(async () => {
    if (busy) return;
    if (viewStep < ranStep) {
      setViewStep(viewStep + 1);
      return;
    }
    if (ranStep >= MAX_STEP) return;
    const target = ranStep + 1;
    setBusy(true);
    try {
      if (source === "live") {
        try {
          const res = await api.step(target);
          setEvents((p) => mergeEvents(p, res.events ?? []));
        } catch {
          // Backend dropped mid-demo: switch to fixtures for a clean, self-consistent chain.
          unsubRef.current?.();
          unsubRef.current = null;
          setSource("offline");
          setNotice("Backend unreachable: switched to offline fixtures");
          eventsRef.current = [];
          await runOffline(target);
        }
      } else {
        await runOffline(target);
      }
      lastRan.current = target;
      setViewStep(target);
    } finally {
      setBusy(false);
    }
  }, [busy, viewStep, ranStep, source, runOffline]);

  // Jump straight to step n (backend auto-runs skipped steps). Used by ?step=N for recovery mid-demo.
  const runTo = useCallback(
    async (n: number) => {
      const target = Math.max(-1, Math.min(MAX_STEP, n));
      if (target <= ranStep) return setViewStep(target);
      setBusy(true);
      try {
        if (source === "live") {
          try {
            await api.step(target);
            const all = await api.getAllEvents();
            setEvents((p) => mergeEvents(p, all));
          } catch {
            unsubRef.current?.();
            unsubRef.current = null;
            setSource("offline");
            eventsRef.current = [];
            await runOffline(target);
          }
        } else {
          await runOffline(target);
        }
        lastRan.current = target;
        setViewStep(target);
      } finally {
        setBusy(false);
      }
    },
    [ranStep, source, runOffline],
  );

  const back = useCallback(() => setViewStep((v) => Math.max(-1, v - 1)), []);

  const reset = useCallback(async () => {
    setBusy(true);
    try {
      if (source === "live") {
        try {
          await api.reset();
        } catch {
          setSource("offline");
        }
      }
      lastRan.current = -1;
      eventsRef.current = [];
      setEvents([]);
      setViewStep(-1);
    } finally {
      setBusy(false);
    }
  }, [source]);

  const reconnect = useCallback(async () => {
    setSource("probing");
    const ok = await connectLive();
    if (ok) {
      lastRan.current = -1;
      setViewStep(-1);
    } else {
      setNotice("Backend still unreachable: using offline fixtures");
    }
  }, [connectLive]);

  const goTo = useCallback((s: number) => setViewStep(Math.max(-1, Math.min(s, ranStep))), [ranStep]);

  const mode: "mock" | "live" = source === "live" && !backendMock ? "live" : "mock";

  return {
    source,
    mode,
    events,
    ranStep,
    viewStep,
    busy,
    notice,
    next,
    back,
    reset,
    reconnect,
    goTo,
    runTo,
    setNotice,
    injectEmailOffline,
  };
}
