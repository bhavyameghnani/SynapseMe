"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Footer, PresenterBar } from "@/components/Chrome";
import { FlaggedCard } from "@/components/FlaggedCard";
import { Timeline } from "@/components/Timeline";
import { FakeWireScreen, InboxScreen, IngestScreen, IntroScreen, RogueScreen, VerifiedScreen } from "@/components/screens/early";
import { AuditScreen, AutonomyScreen, DrillsScreen } from "@/components/screens/late";
import { ExecuteScreen, FundingScreen, RfqScreen, TwoKeysScreen } from "@/components/screens/middle";
import { MAX_STEP, useDemo } from "@/lib/useDemo";
import { useInbox } from "@/lib/useInbox";

export default function Page() {
  const demo = useDemo();
  const { events, viewStep, next, back, reset, goTo } = demo;
  const inbox = useInbox({
    source: demo.source,
    events,
    injectOffline: demo.injectEmailOffline,
    onNotice: demo.setNotice,
  });
  const { simulate } = inbox;
  const [admin, setAdmin] = useState(false);
  useEffect(() => setAdmin(new URLSearchParams(window.location.search).get("admin") === "1"), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "ArrowRight" || e.key === " ") {
        e.preventDefault();
        void next();
      } else if (e.key === "ArrowLeft") {
        back();
      } else if (e.key === "r" || e.key === "R") {
        void reset();
      } else if (e.key === "e" || e.key === "E") {
        // Admin shortcut: inject the lookalike escrow email (works offline).
        void simulate();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, back, reset, simulate]);

  // ?step=N jumps straight to step N once the backend probe settles.
  const jumped = useRef(false);
  useEffect(() => {
    if (jumped.current || demo.source === "probing") return;
    jumped.current = true;
    const n = Number(new URLSearchParams(window.location.search).get("step"));
    if (Number.isInteger(n) && n >= 0) void demo.runTo(n);
  }, [demo]);

  const stepEvents = useMemo(() => events.filter((e) => e.step === viewStep), [events, viewStep]);
  // Audit/receipt views use every event up to the step being viewed.
  const upTo = useMemo(() => events.filter((e) => e.step <= viewStep), [events, viewStep]);
  const props = { events: stepEvents, all: upTo };
  const live = demo.source === "live";

  let screen: JSX.Element;
  switch (viewStep) {
    case 0: screen = <InboxScreen {...props} inbox={inbox} live={live} admin={admin} />; break;
    case 1: screen = <IngestScreen {...props} />; break;
    case 2: screen = <RogueScreen {...props} />; break;
    case 3: screen = <VerifiedScreen {...props} />; break;
    case 4: screen = <FakeWireScreen {...props} inbox={inbox} />; break;
    case 5: screen = <FundingScreen {...props} onNext={() => void next()} />; break;
    case 6: screen = <RfqScreen {...props} />; break;
    case 7: screen = <TwoKeysScreen key={events.length} {...props} />; break;
    case 8: screen = <ExecuteScreen {...props} />; break;
    case 9: screen = <AuditScreen {...props} all={live ? events : upTo} live={live} onSelectStep={goTo} />; break;
    case 10: screen = <DrillsScreen {...props} live={live} onSelectStep={goTo} />; break;
    case 11: screen = <AutonomyScreen {...props} />; break;
    default: screen = <IntroScreen />;
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <PresenterBar
        viewStep={viewStep}
        ranStep={demo.ranStep}
        maxStep={MAX_STEP}
        busy={demo.busy}
        source={demo.source}
        mode={demo.mode}
        onNext={() => void next()}
        onBack={back}
        onReset={() => void reset()}
        onGoTo={goTo}
        onReconnect={() => void demo.reconnect()}
        inboxSource={inbox.status?.source}
        admin={admin}
        onSimulate={() => void simulate()}
        simulating={inbox.simulating}
      />
      {demo.notice && (
        <div className="flex items-center justify-between bg-amber-50 px-5 py-1.5 text-xs text-amber-800">
          {demo.notice}
          <button className="underline" onClick={() => demo.setNotice(null)}>dismiss</button>
        </div>
      )}
      <div className="grid min-h-0 flex-1 grid-cols-[1fr_400px]">
        <main key={viewStep} className="min-h-0 animate-fade-in overflow-y-auto px-8 py-6">
          {screen}
        </main>
        <Timeline events={events} viewStep={viewStep} onSelectStep={goTo} />
      </div>
      <Footer events={events} />
      {viewStep !== 0 && viewStep !== 4 && inbox.toastEmails.length > 0 && (
        <div className="pointer-events-none fixed bottom-12 right-[416px] z-40 flex w-[440px] flex-col gap-3">
          {inbox.toastEmails.slice(0, 2).map((m) => (
            <div key={m.uid} className="pointer-events-auto animate-toast-in">
              <div className="mb-1 flex items-center justify-between text-[11px] font-semibold text-rose-700">
                <span>New email flagged just now</span>
                <button className="underline hover:text-rose-900" onClick={() => goTo(0)}>
                  open inbox
                </button>
              </div>
              <FlaggedCard email={m} compact onDismiss={() => inbox.dismissToast(m.uid)} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
