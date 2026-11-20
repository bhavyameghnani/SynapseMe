import type { AgentEvent, DemoState, DrillResults, InboxEmail, InboxStatus, ModeInfo, Receipt } from "./types";

export const ENVOY_URL = process.env.NEXT_PUBLIC_ENVOY_URL ?? "http://localhost:8000";

async function req<T>(path: string, init?: RequestInit, timeoutMs = 4000): Promise<T> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${ENVOY_URL}${path}`, {
      ...init,
      signal: ctrl.signal,
      headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
    });
    if (!res.ok) throw new Error(`${path} → HTTP ${res.status}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(t);
  }
}

export const getState = (timeoutMs = 1500) => req<DemoState>("/demo/state", undefined, timeoutMs);
export const getMode = (timeoutMs = 1500) => req<ModeInfo>("/mode", undefined, timeoutMs);
export const getAllEvents = () => req<AgentEvent[]>("/events/all");
export const step = (n: number) =>
  req<{ step: number; events: AgentEvent[] }>(`/demo/step/${n}`, { method: "POST" }, 15000);
export const reset = () => req<{ ok: boolean }>("/demo/reset", { method: "POST" });
export const getReceipt = () => req<Receipt>("/receipt");
export const getDrills = () => req<DrillResults>("/drills/results");

export const getInbox = (timeoutMs = 2500) =>
  req<{ status: InboxStatus; emails: InboxEmail[] }>("/inbox", undefined, timeoutMs);
export const getInboxStatus = (timeoutMs = 2500) => req<InboxStatus>("/inbox/status", undefined, timeoutMs);
export const simulateInbox = () => req<{ email: InboxEmail }>("/inbox/simulate", { method: "POST" }, 6000);

export type Unsubscribe = () => void;

/**
 * Subscribe to the envoy event stream. Uses SSE (`agent_event`, `reset`) and falls back to
 * polling `/events/all` if EventSource errors out.
 */
export function subscribe(
  onEvent: (ev: AgentEvent) => void,
  onReset: () => void,
  onSnapshot: (evs: AgentEvent[]) => void,
): Unsubscribe {
  let closed = false;
  let es: EventSource | null = null;
  let poll: ReturnType<typeof setInterval> | null = null;

  const startPolling = () => {
    if (poll || closed) return;
    const tick = async () => {
      try {
        onSnapshot(await getAllEvents());
      } catch {
        /* backend may be momentarily down */
      }
    };
    void tick();
    poll = setInterval(tick, 1000);
  };

  if (typeof EventSource !== "undefined") {
    try {
      es = new EventSource(`${ENVOY_URL}/events`);
      es.addEventListener("agent_event", (m) => {
        try {
          onEvent(JSON.parse((m as MessageEvent<string>).data) as AgentEvent);
        } catch {
          /* ignore malformed message */
        }
      });
      es.addEventListener("reset", () => onReset());
      es.onerror = () => {
        // EventSource auto-reconnects; if it's closed for good, switch to polling.
        if (es && es.readyState === EventSource.CLOSED) {
          es.close();
          es = null;
          startPolling();
        }
      };
    } catch {
      startPolling();
    }
  } else {
    startPolling();
  }

  return () => {
    closed = true;
    es?.close();
    if (poll) clearInterval(poll);
  };
}
