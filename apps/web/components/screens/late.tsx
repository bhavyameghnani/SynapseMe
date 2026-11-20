"use client";

import { Download, ShieldCheck, ShieldX, ToggleLeft, ToggleRight } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import * as api from "@/lib/api";
import { FIXTURE_DRILLS, buildFixtureReceipt } from "@/lib/fixtures";
import type { DrillResults, Receipt } from "@/lib/types";
import { verifyReceipt, type ReceiptCheck } from "@/lib/verify";
import { SponsorBadge } from "../SponsorBadge";
import { EventCard } from "../Timeline";
import { Card, ScreenHeader, cx, sponsorsOf, usd } from "../ui";
import type { ScreenProps } from "./early";

type LiveProps = ScreenProps & { live: boolean; onSelectStep: (s: number) => void };

function tamper(r: Receipt): { receipt: Receipt; note: string } {
  const copy: Receipt = JSON.parse(JSON.stringify(r));
  const idx =
    copy.events.findIndex((e) => e.kind === "execute" && e.actor.startsWith("bank_") && typeof e.data?.amount_usd === "number") >= 0
      ? copy.events.findIndex((e) => e.kind === "execute" && e.actor.startsWith("bank_"))
      : copy.events.findIndex((e) => typeof e.data?.amount_usd === "number");
  if (idx >= 0) {
    const ev = copy.events[idx];
    const before = ev.data.amount_usd as number;
    ev.data.amount_usd = before * 10;
    return { receipt: copy, note: `Event #${idx + 1} amount changed ${usd(before)} → ${usd(before * 10)}` };
  }
  if (copy.events.length) {
    copy.events[0].summary += " (edited)";
    return { receipt: copy, note: "Event #1 summary edited" };
  }
  return { receipt: copy, note: "Nothing to tamper with" };
}

// ---------- 9 Audit trail ----------
export function AuditScreen({ events, all, live, onSelectStep }: LiveProps) {
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tampered, setTampered] = useState(false);
  const [check, setCheck] = useState<ReceiptCheck | null>(null);
  const [verifying, setVerifying] = useState(false);

  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const r = live ? await api.getReceipt() : buildFixtureReceipt(all);
        if (!cancel) setReceipt(r);
      } catch (e) {
        if (!cancel) {
          setErr(`Could not fetch receipt from envoy (${(e as Error).message}); built from local events.`);
          setReceipt(buildFixtureReceipt(all));
        }
      }
    })();
    return () => {
      cancel = true;
    };
  }, [live, all]);

  const shown = useMemo(() => (receipt && tampered ? tamper(receipt) : null), [receipt, tampered]);
  const active = shown?.receipt ?? receipt;

  // Once "Verify" is pressed, the shown verdict always tracks the current (possibly tampered) receipt.
  const [wantVerify, setWantVerify] = useState(false);
  useEffect(() => {
    if (!wantVerify || !active) return;
    let cancel = false;
    setVerifying(true);
    verifyReceipt(active).then((c) => {
      if (!cancel) {
        setCheck(c);
        setVerifying(false);
      }
    });
    return () => {
      cancel = true;
    };
  }, [wantVerify, active]);
  const runVerify = useCallback(() => setWantVerify(true), []);

  // ?verify=1 (and ?tamper=1) run the checks on load: handy for a backup recording.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.get("tamper") === "1") setTampered(true);
    if (q.get("verify") === "1") setWantVerify(true);
  }, []);

  const download = () => {
    if (!receipt) return;
    const blob = new Blob([JSON.stringify(receipt, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "envoy-receipt.json";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const stack = sponsorsOf(all);
  const statusById = new Map(check?.events.map((c) => [c.id, c.hashOk && c.linkOk ? "ok" : "bad"] as const) ?? []);
  const approvals = all.filter((e) => e.kind === "approve").map((e) => (e.actor === "human:emma" ? "Emma" : "Dev"));
  const executed = all.find((e) => e.kind === "execute" && e.actor.startsWith("bank_"));
  const rejections = all.filter((e) => e.decision?.result === "deny" || e.decision?.result === "rejected");

  return (
    <div>
      <ScreenHeader
        step={9}
        title="Every step, signed"
        subtitle="Hash-chained events with an Ed25519 signature over the final hash. Verified here, in your browser."
        events={events}
        preferred={["guild"]}
      />
      <div className="grid grid-cols-[1fr_380px] gap-5">
        <div className="min-w-0">
          <div className="mb-3 grid grid-cols-4 gap-3 text-sm">
            {[
              ["Seen", `${all.reduce((n, e) => n + (e.sources?.length ?? 0), 0)} sources`],
              ["Rejected", `${rejections.length} actions`],
              ["Approved by", approvals.length ? approvals.join(" + ") : "n/a"],
              ["Executed", executed ? `${usd(executed.data?.amount_usd)} → verified escrow` : "n/a"],
            ].map(([k, v]) => (
              <Card key={k} className="p-3">
                <div className="text-[11px] uppercase tracking-wider text-stone-400">{k}</div>
                <div className="font-semibold text-stone-800">{v}</div>
              </Card>
            ))}
          </div>
          <div className="max-h-[540px] space-y-2 overflow-y-auto pr-1">
            {(active?.events ?? all).map((ev) => (
              <EventCard
                key={ev.id + (tampered ? "t" : "")}
                ev={ev}
                status={statusById.get(ev.id) as "ok" | "bad" | undefined}
                onSelect={() => onSelectStep(ev.step)}
              />
            ))}
          </div>
        </div>
        <div className="space-y-4">
          <Card className="p-5">
            <div className="space-y-2">
              <button
                onClick={download}
                disabled={!receipt}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-stone-300 bg-white px-4 py-2.5 font-semibold text-stone-800 hover:bg-stone-50 disabled:opacity-50"
              >
                <Download size={16} /> Download signed receipt (JSON)
              </button>
              <button
                onClick={runVerify}
                disabled={!active || verifying}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-accent-600 px-4 py-2.5 font-semibold text-white hover:bg-accent-700 disabled:opacity-50"
              >
                <ShieldCheck size={16} /> {verifying ? "Verifying…" : "Verify receipt"}
              </button>
              <button
                onClick={() => setTampered((t) => !t)}
                className={cx(
                  "flex w-full items-center justify-center gap-2 rounded-lg border px-4 py-2.5 font-semibold",
                  tampered ? "border-rose-400 bg-rose-50 text-rose-700" : "border-stone-300 text-stone-600 hover:bg-stone-50",
                )}
              >
                {tampered ? <ToggleRight size={18} /> : <ToggleLeft size={18} />} Tamper demo {tampered ? "ON" : "OFF"}
              </button>
              {shown && <p className="text-xs text-rose-700">{shown.note}</p>}
              {err && <p className="text-xs text-amber-700">{err}</p>}
            </div>
          </Card>
          {check && (
            <div
              className={cx(
                "animate-fade-in rounded-2xl border-2 p-5",
                check.valid ? "border-emerald-500 bg-emerald-50" : "border-rose-500 bg-rose-50",
              )}
            >
              <div className="flex items-center gap-3">
                {check.valid ? <ShieldCheck className="text-emerald-600" size={40} /> : <ShieldX className="text-rose-600" size={40} />}
                <div className={cx("font-serif text-3xl font-semibold", check.valid ? "text-emerald-800" : "text-rose-700")}>
                  {check.valid ? "✅ Receipt valid" : "❌ Receipt invalid"}
                </div>
              </div>
              <ul className="mt-3 space-y-1 text-sm">
                <li>
                  {check.chainOk ? "✅" : "❌"} Hash chain ({check.events.filter((c) => c.hashOk && c.linkOk).length}/{check.events.length} events)
                </li>
                <li>{check.finalHashOk ? "✅" : "❌"} Final hash matches last event</li>
                <li>{check.signatureOk ? "✅" : "❌"} Ed25519 signature</li>
                {check.firstBadIndex != null && <li className="text-rose-700">First break at event #{check.firstBadIndex + 1}</li>}
              </ul>
              {active && (
                <div className="mt-3 break-all font-mono text-[10px] text-stone-500">
                  <div>final {active.final_hash}</div>
                  <div>pubkey {active.public_key}</div>
                </div>
              )}
            </div>
          )}
          <Card className="p-5">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-stone-500">Stack used in this decision</div>
            <SponsorBadge keys={stack.keys} modes={stack.modes} size="md" />
          </Card>
        </div>
      </div>
    </div>
  );
}

// ---------- 10 Drills ----------
const CAT_LABEL: Record<string, string> = {
  fake_wire: "Fake wire instructions",
  injected_listing: "Injected listing text",
  over_limit: "Over limit / no co-sign",
  rogue_agent: "Rogue agent, shared creds",
  blackout_sell: "Selling during blackout",
  unapproved_counterparty: "Unapproved counterparty",
};

export function DrillsScreen({ events, live }: LiveProps) {
  const fromEvent = events.find((e) => e.kind === "drill")?.data?.results as DrillResults | undefined;
  const [fetched, setFetched] = useState<DrillResults | null>(null);
  useEffect(() => {
    if (fromEvent || !live) return;
    api.getDrills().then(setFetched).catch(() => setFetched(null));
  }, [fromEvent, live]);
  const r = fromEvent ?? fetched ?? FIXTURE_DRILLS;
  const data = (r.by_category ?? []).map((c) => ({ ...c, label: CAT_LABEL[c.category] ?? c.category }));
  const failed = (r.scenarios ?? []).filter((s) => s.actual !== "blocked");
  return (
    <div>
      <ScreenHeader
        step={10}
        title="We attacked it 50 times"
        subtitle="Adversarial drills against the same rules Emma's agent runs under. If any had succeeded, we'd fix the rule, not hide the result."
        events={events}
        preferred={["firedrill"]}
      />
      <div className="mb-6 flex items-baseline gap-4">
        <span className="font-serif text-6xl font-semibold tabular-nums text-stone-900">{r.total}</span>
        <span className="text-2xl text-stone-500">attack drills</span>
        <span className="text-3xl text-stone-300">·</span>
        <span className={cx("font-serif text-6xl font-semibold tabular-nums", r.succeeded ? "text-rose-600" : "text-emerald-600")}>
          {r.succeeded}
        </span>
        <span className="text-2xl text-stone-500">succeeded</span>
      </div>
      <Card className="p-5">
        <div className="mb-2 flex items-center justify-between text-sm">
          <span className="font-semibold text-stone-700">Drills by attack type, all blocked</span>
          <span className="text-xs text-stone-400">
            mode {r.mode} · ran {r.ran_at}
          </span>
        </div>
        <div className="h-[340px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} layout="vertical" margin={{ left: 20, right: 96, top: 4, bottom: 4 }} barCategoryGap={10}>
              <CartesianGrid horizontal={false} stroke="#e7e5e4" />
              <XAxis type="number" allowDecimals={false} domain={[0, (max: number) => max + 1]} tick={{ fill: "#78716c", fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="label" width={210} tick={{ fill: "#44403c", fontSize: 14 }} axisLine={false} tickLine={false} />
              <Tooltip
                cursor={{ fill: "#f5f5f4" }}
                formatter={(v: number, k: string) => [v, k === "blocked" ? "Blocked" : "Succeeded"]}
              />
              <Bar dataKey="blocked" stackId="a" fill="#1f6466" radius={[0, 4, 4, 0]} maxBarSize={34} isAnimationActive={false}>
                <LabelList
                  dataKey="blocked"
                  position="right"
                  formatter={(v: number) => `${v} blocked`}
                  style={{ fill: "#44403c", fontSize: 13 }}
                />
              </Bar>
              <Bar dataKey="succeeded" stackId="a" fill="#e11d48" radius={[0, 4, 4, 0]} maxBarSize={34} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>
      {failed.length > 0 && (
        <Card className="mt-4 border-rose-300 p-4 text-sm text-rose-800">
          <b>{failed.length} drill(s) succeeded:</b> {failed.map((f) => f.id).join(", ")}
        </Card>
      )}
    </div>
  );
}

// ---------- 11 Autonomy ----------
export function AutonomyScreen({ events }: ScreenProps) {
  const ev = events.find((e) => e.data?.gate);
  const [enabled, setEnabled] = useState(true);
  const [limit, setLimit] = useState<number>(ev?.data?.value_usd ?? 25000);
  const funnel: { stage: string; count: number }[] = ev?.data?.funnel ?? [];
  return (
    <div>
      <ScreenHeader
        step={11}
        title="Autonomy, earned gradually"
        subtitle="A feature gate lets small, mandate-compliant actions skip the two-key step. Everything is still logged."
        events={events}
        preferred={["statsig", "amplitude"]}
      />
      <div className="grid grid-cols-[360px_1fr] gap-5">
        <Card className="p-6">
          <div className="text-xs font-semibold uppercase tracking-wider text-stone-500">Gate · {ev?.data?.gate ?? "auto_approve_under_usd"}</div>
          <button
            onClick={() => setEnabled((x) => !x)}
            className={cx(
              "mt-4 flex w-full items-center justify-between rounded-xl border px-4 py-3 text-lg font-semibold",
              enabled ? "border-accent-500 bg-accent-50 text-accent-800" : "border-stone-300 text-stone-500",
            )}
          >
            Auto-approve under {usd(limit)}
            {enabled ? <ToggleRight size={28} /> : <ToggleLeft size={28} />}
          </button>
          <input
            type="range"
            min={0}
            max={100000}
            step={5000}
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
            className="mt-5 w-full accent-[#1f6466]"
            disabled={!enabled}
          />
          <p className="mt-4 text-sm text-stone-600">
            {enabled
              ? `Actions under ${usd(limit)} that pass every mandate rule execute without a co-sign. Over ${usd(limit)}, or any rule hit, still needs two keys.`
              : "Every action requires explicit approval."}
          </p>
        </Card>
        <Card className="p-5">
          <div className="mb-2 text-sm font-semibold text-stone-700">Approvals funnel</div>
          <div className="h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={funnel} margin={{ top: 24, right: 8, left: 0, bottom: 4 }}>
                <CartesianGrid vertical={false} stroke="#e7e5e4" />
                <XAxis dataKey="stage" tick={{ fill: "#44403c", fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fill: "#78716c", fontSize: 12 }} axisLine={false} tickLine={false} />
                <Tooltip cursor={{ fill: "#f5f5f4" }} />
                <Bar dataKey="count" fill="#1f6466" radius={[4, 4, 0, 0]} isAnimationActive={false}>
                  <LabelList dataKey="count" position="top" style={{ fill: "#44403c", fontSize: 13 }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>
    </div>
  );
}

