"""RFQ: broadcast one intent to every bank agent in parallel, collect quotes, rank under the mandate."""
from __future__ import annotations

import asyncio
import hashlib
from typing import Any

import httpx

from services.bank_agents.bank import make_quote
from services.common.config import URLS
from services.common.events import now_iso
from services.envoy import guild_adapter, mandate

BANKS = ["bank_a", "bank_b", "bank_c"]


def rfq_id_for(intent: dict[str, Any]) -> str:
    return "rfq_" + hashlib.sha256(repr(sorted(intent.items())).encode()).hexdigest()[:10]


async def _one(client: httpx.AsyncClient, bank: str, rfq_id: str, intent: dict[str, Any]) -> tuple[dict, str]:
    ok, _ = guild_adapter.authorize("envoy", f"{bank}:/quote")
    if not ok:
        raise PermissionError(f"envoy may not call {bank}:/quote")
    try:
        r = await client.post(f"{URLS[bank]}/quote", json={"rfq_id": rfq_id, "intent": intent})
        r.raise_for_status()
        return r.json(), "http"
    except Exception:
        # Bank unreachable: call its agent in-process so the demo never breaks.
        return await asyncio.to_thread(make_quote, bank, rfq_id, intent), "in_process"


async def collect(intent: dict[str, Any], rfq_id: str | None = None) -> tuple[str, list[dict], dict[str, str]]:
    rfq_id = rfq_id or rfq_id_for(intent)
    async with httpx.AsyncClient(timeout=3.0) as client:
        results = await asyncio.gather(*(_one(client, b, rfq_id, intent) for b in BANKS))
    quotes = [q for q, _ in results]
    transport = {q["bank_id"]: t for q, t in results}
    return rfq_id, quotes, transport


def check_quote(q: dict[str, Any], ctx: dict[str, Any] | None = None) -> Any:
    """Mandate check for a quote: R6 counterparty, then each proposed action (e.g. R2 for a fund sale)."""
    d = mandate.evaluate({"type": "counterparty", "bank_id": q["bank_id"]}, ctx)
    if d.result == "deny":
        return d
    # Approvals come later (step 7), so R3 is not checked at quote time.
    qctx = {**(ctx or {}), "pre_approval": True}
    for act in q.get("proposed_actions") or []:
        a = {**act, "date": qctx.get("today")}
        if act.get("type") == "sell":
            a["proceeds_out_usd"] = min(int(q.get("amount_usd") or 0), int(act.get("amount_usd") or 0))
        d = mandate.evaluate(a, qctx)
        if d.result == "deny":
            return d
    if q.get("rate_bps") is None:
        return mandate.Decision(result="deny", rule=None, reason="No financing rate offered.")
    return mandate.Decision(result="allow", rule=None,
                            reason=f"{q['bank_name']} passes R6 (approved counterparty) and proposes no rule-breaking actions.")


def rank(quotes: list[dict[str, Any]], ctx: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for q in quotes:
        d = check_quote(q, ctx)
        rows.append({"quote_id": q["quote_id"], "bank_id": q["bank_id"], "bank_name": q["bank_name"],
                     "rate_bps": q.get("rate_bps"), "eligible": d.result == "allow", "rule": d.rule,
                     "reason": d.reason})
    eligible = sorted((r for r in rows if r["eligible"]), key=lambda r: (r["rate_bps"], r["bank_id"]))
    best = eligible[0]["quote_id"] if eligible else None
    for r in rows:
        if r["quote_id"] == best:
            r["result"] = "selected"
            r["reason"] = f"Lowest eligible rate ({r['rate_bps'] / 100:.2f}%). " + r["reason"]
        elif r["eligible"]:
            r["result"] = "not_selected"
            r["reason"] = (f"Eligible but more expensive ({r['rate_bps'] / 100:.2f}% vs "
                           f"{eligible[0]['rate_bps'] / 100:.2f}%).")
        else:
            r["result"] = "rejected"
    order = {"selected": 0, "not_selected": 1, "rejected": 2}
    return sorted(rows, key=lambda r: (order[r["result"]], r.get("rate_bps") or 10**6))


async def broadcast(intent: dict[str, Any], ctx: dict[str, Any] | None = None) -> dict[str, Any]:
    rfq_id, quotes, transport = await collect(intent)
    return {"rfq_id": rfq_id, "quotes": quotes, "ranking": rank(quotes, ctx), "transport": transport,
            "sent_at": now_iso()}
