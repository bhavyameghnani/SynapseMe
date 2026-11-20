"""Push synthetic Envoy sessions to Amplitude so funnels/charts have data. All users are fictional.

Usage: uv run python scripts/seed_amplitude.py [--sessions 300] [--days 14] [--dry-run]
"""
from __future__ import annotations

import argparse
import random
import sys
import time
import uuid
from pathlib import Path

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from services.common.config import env

URL = "https://api2.amplitude.com/batch"
BANKS = ["bank_a", "bank_b", "bank_c"]
ATTACKS = {"fake_wire": 12, "injected_listing": 10, "over_limit_no_cosign": 8,
           "rogue_agent": 8, "blackout_sale": 6, "unapproved_counterparty": 6}


def session(user: str, t0: int, rng: random.Random) -> list[dict]:
    """One run through the Envoy flow with realistic drop-off; t0 in ms."""
    sid = t0
    evs: list[dict] = []
    t = t0

    def add(event_type: str, props: dict, gap: tuple[int, int] = (2, 40)) -> None:
        nonlocal t
        t += rng.randint(*gap) * 1000
        evs.append({"user_id": user, "device_id": f"dev-{user}", "session_id": sid, "time": t,
                    "event_type": event_type, "event_properties": props, "insert_id": str(uuid.uuid4()),
                    "platform": "Web", "app_version": "envoy-demo-0.1"})

    amount = rng.choice([25_000, 80_000, 150_000, 250_000, 400_000, 600_000])
    add("envoy_step", {"step": 1, "name": "ingest", "emails": rng.randint(20, 90)})
    rogue = rng.random() < 0.3
    if rogue:
        add("envoy_step", {"step": 2, "name": "rogue_rejected", "result": "deny", "rule": "KYA"})
    add("envoy_step", {"step": 3, "name": "agent_verified", "result": "allow"})
    if rng.random() < 0.45:
        add("envoy_step", {"step": 4, "name": "fake_wire_flagged", "result": "deny", "rule": "R4"})
    add("envoy_step", {"step": 5, "name": "funding_options", "options": 4, "rejected": 2, "amount_usd": amount})
    if rng.random() < 0.12:
        return evs  # abandoned after seeing options
    rates = {"bank_a": round(rng.uniform(5.8, 6.4), 2), "bank_b": round(rng.uniform(5.1, 5.7), 2)}
    best = min(rates, key=rates.get)
    add("envoy_step", {"step": 6, "name": "rfq", "quotes": 3, "selected": best, "best_rate": rates[best],
                       "rejected_bank": "bank_c", "rejected_rule": "R2", "amount_usd": amount})
    needs_two_keys = amount > 100_000
    if needs_two_keys:
        for who in ("emma", "dev"):
            ok = rng.random() > 0.06
            add("envoy_step", {"step": 7, "name": "approval", "approver": who, "approved": ok,
                               "amount_usd": amount}, gap=(10, 600))
            if not ok:
                return evs
    else:
        add("envoy_step", {"step": 7, "name": "auto_approved", "approver": "agent", "approved": True,
                           "amount_usd": amount, "gate": "auto_approve_under_usd"})
    add("envoy_step", {"step": 8, "name": "executed", "executed": True, "bank": best, "amount_usd": amount,
                       "payee": "verified_escrow"})
    add("envoy_step", {"step": 9, "name": "receipt_verified", "valid": True})
    return evs


def drills(t_end: int) -> list[dict]:
    evs = []
    for cat, n in ATTACKS.items():
        for i in range(n):
            evs.append({"user_id": "firedrill-runner", "device_id": "dev-firedrill", "time": t_end - i * 1000,
                        "event_type": "drill_result", "insert_id": str(uuid.uuid4()),
                        "event_properties": {"category": cat, "blocked": True, "succeeded": False}})
    return evs


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--sessions", type=int, default=300)
    p.add_argument("--days", type=int, default=14)
    p.add_argument("--seed", type=int, default=7)
    p.add_argument("--dry-run", action="store_true")
    a = p.parse_args()

    key = env("AMPLITUDE_API_KEY")
    if not key and not a.dry_run:
        sys.exit("AMPLITUDE_API_KEY not set in .env")
    rng = random.Random(a.seed)
    now = int(time.time() * 1000)
    users = [f"demo-user-{i:03d}" for i in range(60)]
    events: list[dict] = []
    for _ in range(a.sessions):
        t0 = now - rng.randint(60, a.days * 86400) * 1000
        events += session(rng.choice(users), t0, rng)
    events += drills(now)
    print(f"{len(events)} events, {a.sessions} sessions, {len(users)} users")
    if a.dry_run:
        print(events[0])
        return
    with httpx.Client(timeout=15) as c:
        for i in range(0, len(events), 1000):
            r = c.post(URL, json={"api_key": key, "events": events[i:i + 1000]})
            print(f"batch {i // 1000}: {r.status_code} {r.text[:200]}")
            r.raise_for_status()


if __name__ == "__main__":
    main()
