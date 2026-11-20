"""Firedrill attack drills: run every scenario against the live policy code, write drills/results.json.

USE_FIREDRILL=1 tries the Firedrill product first; any failure falls back to this local runner
(same scenario format). If a drill succeeds, fix the rule; never hide the result.
"""
from __future__ import annotations

import json
import sys
from collections import Counter
from pathlib import Path
from typing import Any

import yaml

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from services.common.config import env, use_real
from services.common.events import now_iso
from services.envoy import guild_adapter, kya, mandate

SCENARIOS = ROOT / "drills" / "scenarios"
RESULTS = ROOT / "drills" / "results.json"
CATEGORY_ORDER = ["fake_wire", "injected_listing", "over_limit", "rogue_agent", "blackout_sell",
                  "unapproved_counterparty"]


def load_scenarios() -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for f in sorted(SCENARIOS.glob("*.y*ml")):
        data = yaml.safe_load(f.read_text(encoding="utf-8")) or []
        out.extend(data if isinstance(data, list) else [data])
    return out


def evaluate(s: dict[str, Any]) -> tuple[bool, str | None, str]:
    """Returns (blocked, blocked_by, reason)."""
    action = dict(s.get("action") or {})
    if action.get("type") == "agent_call":
        # Two independent layers: identity (KYA) and credential policy (Guild). Report every layer that blocks.
        ok, kya_why, _ = kya.verify_agent(str(action.get("agent_id", "")), str(action.get("credential", "")))
        # A verified KYA credential binds the caller to Emma's client agent role.
        caller = "client_agent" if ok else str(action.get("caller") or "rogue_agent")
        allowed, guild_why = guild_adapter.authorize(caller, str(action.get("endpoint", "")))
        layers = [(n, w) for n, passed, w in (("KYA", ok, kya_why), ("GUILD", allowed, guild_why)) if not passed]
        if layers:
            return True, "+".join(n for n, _ in layers), " ".join(w for _, w in layers)
        return False, None, "Agent call was allowed."
    if s.get("injected_content") and "text" not in action and action.get("type") == "instruction":
        action["text"] = s["injected_content"]
    d = mandate.combined(action, {"today": "2026-12-01"})
    if d.result == "deny":
        return True, d.rule, d.reason
    return False, None, d.reason


def _firedrill_real(scenarios: list[dict[str, Any]]) -> dict[str, Any] | None:
    if not (use_real("firedrill") and env("FIREDRILL_API_KEY")):
        return None
    try:
        import firedrill  # type: ignore  # noqa: F401
    except Exception:
        return None
    return None  # SDK surface not confirmed at the venue; local runner is authoritative.


def run(write: bool = True) -> dict[str, Any]:
    scenarios = load_scenarios()
    real = _firedrill_real(scenarios)
    if real:
        return real
    rows = []
    for s in scenarios:
        blocked, by, reason = evaluate(s)
        rows.append({"id": s["id"], "category": s["category"], "target_rule": s.get("target_rule"),
                     "expected": s.get("expected", "blocked"), "actual": "blocked" if blocked else "succeeded",
                     "blocked_by": by, "reason": reason, "description": s.get("description", "")})
    cats = sorted({r["category"] for r in rows},
                  key=lambda c: CATEGORY_ORDER.index(c) if c in CATEGORY_ORDER else 99)
    total_by = Counter(r["category"] for r in rows)
    blocked_by = Counter(r["category"] for r in rows if r["actual"] == "blocked")
    blocked = sum(blocked_by.values())
    results = {
        "total": len(rows), "succeeded": len(rows) - blocked, "blocked": blocked,
        "by_category": [{"category": c, "total": total_by[c], "blocked": blocked_by[c],
                         "succeeded": total_by[c] - blocked_by[c]} for c in cats],
        "scenarios": rows, "ran_at": now_iso(), "mode": "mock",
    }
    if write:
        RESULTS.write_text(json.dumps(results, indent=1, ensure_ascii=False), encoding="utf-8")
    return results


def main() -> int:
    r = run()
    print(f"{r['total']} drills · {r['blocked']} blocked · {r['succeeded']} succeeded  ({r['mode']})")
    for c in r["by_category"]:
        print(f"  {c['category']:<24} {c['blocked']:>2}/{c['total']} blocked")
    for s in r["scenarios"]:
        if s["actual"] != "blocked":
            print(f"  SUCCEEDED: {s['id']} ({s['target_rule']}): {s['reason']}")
    return 0 if r["succeeded"] == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
