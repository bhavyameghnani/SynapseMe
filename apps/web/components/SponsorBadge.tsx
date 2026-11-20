"use client";

import { useState } from "react";
import type { SponsorKey } from "@/lib/types";

export const SPONSORS: Record<SponsorKey, { name: string; role: string }> = {
  airbyte: { name: "Airbyte", role: "Context layer" },
  cognee: { name: "Cognee", role: "Agent memory" },
  superlinked: { name: "Superlinked", role: "Extraction & rerank" },
  persona: { name: "Persona", role: "Know Your Agent" },
  guild: { name: "Guild AI", role: "Agent control plane" },
  singlestore: { name: "SingleStore", role: "Real-time data" },
  arcee: { name: "Arcee", role: "Bank agent models" },
  firedrill: { name: "Firedrill", role: "Attack drills" },
  statsig: { name: "Statsig", role: "Feature gates" },
  amplitude: { name: "Amplitude", role: "Analytics" },
  aws: { name: "AWS", role: "Infrastructure" },
  openai: { name: "OpenAI", role: "Planner LLM" },
};

// Sponsors shown in this demo; the rest are future scope (docs/future_scope.md).
export const ACTIVE_SPONSORS: SponsorKey[] = (process.env.NEXT_PUBLIC_ACTIVE_SPONSORS ?? "cognee,persona,guild")
  .split(",")
  .map((s) => s.trim())
  .filter((s): s is SponsorKey => s in SPONSORS);

function Logo({ k, mode, size }: { k: SponsorKey; mode?: string; size: "sm" | "md" }) {
  // Show the text pill until the official logo actually loads, so a missing file never renders broken.
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const meta = SPONSORS[k] ?? { name: k, role: "" };
  const h = size === "sm" ? 16 : 20;
  const isMock = mode !== "real";
  return (
    <span
      title={`${meta.name}: ${meta.role}${isMock ? " (mock adapter)" : ""}`}
      className="relative inline-flex items-center"
    >
      {!failed && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/logos/${k}.svg`}
          alt={`${meta.name} logo`}
          style={{ height: h }}
          className={loaded ? "w-auto" : "absolute h-0 w-0 opacity-0"}
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
        />
      )}
      {!loaded && (
        <span
          className={`inline-flex items-center rounded-full border border-stone-300 bg-white px-2 font-medium text-stone-600 ${
            size === "sm" ? "h-4 text-[10px]" : "h-5 text-[11px]"
          }`}
        >
          {meta.name}
        </span>
      )}
      {isMock && (
        <span className="ml-0.5 inline-block h-1.5 w-1.5 rounded-full bg-stone-400" aria-label="mock" title="mock adapter" />
      )}
    </span>
  );
}

export function SponsorBadge({
  keys,
  modes,
  size = "sm",
  label = false,
}: {
  keys: SponsorKey[];
  modes?: Record<string, string>;
  size?: "sm" | "md";
  label?: boolean;
}) {
  const uniq = Array.from(new Set(keys)).filter((k) => k in SPONSORS && ACTIVE_SPONSORS.includes(k));
  if (!uniq.length) return null;
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      {label && <span className="text-[10px] uppercase tracking-wider text-stone-400">Powered by</span>}
      {uniq.map((k) => (
        <Logo key={k} k={k} mode={modes?.[k]} size={size} />
      ))}
    </span>
  );
}

export default SponsorBadge;
