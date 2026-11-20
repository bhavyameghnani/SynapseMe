"""Emma's personal agent (:8200). Talks only to Envoy, never to a bank directly."""
from __future__ import annotations

import asyncio
import time
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from services.client_agent import extract, fraud_check, funding, ingest, ingest_imap, memory, planner
from services.common.config import env, mode_of
from services.common.events import now_iso
from services.common.portfolio import verified_payees

AGENT_ID = "emma-agent-01"


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    # Live Gmail reader only with LIVE_MODE=1 and an app password; otherwise the seed inbox is used.
    task = asyncio.create_task(ingest_imap.run_poller()) if ingest_imap.enabled() else None
    yield
    if task:
        task.cancel()


app = FastAPI(title="Envoy client agent", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


def memories_from(ctx: dict[str, Any]) -> list[dict[str, Any]]:
    """One memory per fact, carrying source, trust and fetch time."""
    memory.clear()
    out: list[dict[str, Any]] = []
    for e in ctx["emails"]:
        fields = extract.extract(e.get("body", ""))
        detail = f" (account {fields['account']})" if fields.get("account") else ""
        out.append(memory.remember(f"{e.get('from_name')} <{e.get('from_email')}>: {e.get('subject')}{detail}",
                                   ingest.email_uri(e), e.get("trust", "claimed"), e.get("received_at")))
    h = ctx["holdings"]
    if h:
        out.append(memory.remember(
            f"Holdings ${h.get('total_value_usd', 0):,}; company stock {h.get('concentration', {}).get('pct')}%; "
            f"blackout until {h.get('blackout', {}).get('until')}", "file://holdings.json", "verified",
            h.get("as_of")))
    for p in verified_payees():
        out.append(memory.remember(f"Verified payee {p['name']} <{p['email']}> account ending {p['account_last4']}",
                                   p["source_uri"], "verified", p.get("verified_on")))
    lst = ctx["listing"]
    if lst:
        out.append(memory.remember(f"Listing {lst.get('address')}: deposit ${lst.get('deposit_usd', 0):,} due "
                                   f"{lst.get('deposit_due')}", lst.get("source_uri", "listing://"),
                                   lst.get("trust", "claimed"), lst.get("fetched_at")))
    return out


class PlanReq(BaseModel):
    goal: str = "Fund the $400k home deposit safely"


@app.get("/health")
def health() -> dict[str, Any]:
    return {"agent_id": AGENT_ID, "modes": {k: mode_of(k) for k in ("airbyte", "cognee", "superlinked")}}


@app.post("/ingest")
def ingest_ep() -> dict[str, Any]:
    ctx = ingest.load_all()
    mems = memories_from(ctx)
    return {**ctx, "memories": mems,
            "modes": {"airbyte": ingest.mode(), "cognee": memory.mode(), "superlinked": extract.mode()}}


@app.get("/memory")
def memory_ep() -> list[dict[str, Any]]:
    if not memory.all_memories():
        memories_from(ingest.load_all())
    return memory.all_memories()


@app.get("/funding_options")
def funding_ep() -> list[dict[str, Any]]:
    return funding.options()[0]


@app.post("/plan")
def plan_ep(req: PlanReq) -> dict[str, Any]:
    return planner.plan(req.goal)[0]


@app.get("/inbox/status")
def inbox_status() -> dict[str, Any]:
    if ingest_imap.enabled():
        return ingest_imap.status()
    return {"source": "seed", "connected": False, "watching": False, "last_poll_at": None,
            "last_error": None if env("LIVE_MODE") != "1" else "GMAIL_APP_PASSWORD not set",
            "count": 0, "flagged_count": 0}


def simulate_email() -> dict[str, Any]:
    """The lookalike attack, through the same classifier + memory + envoy path as a real IMAP message."""
    raw = {**fraud_check.SIMULATED_ATTACK, "uid": f"sim-{int(time.time() * 1000)}", "date": now_iso(),
           "simulated": True}
    return {**fraud_check.classify(raw), "source": "simulated"}


@app.post("/inbox/simulate")
def inbox_simulate(push: bool = True) -> dict[str, Any]:
    e = simulate_email()
    if push:
        ingest_imap.deliver(e)  # remember + POST envoy /inbox/ingest
    else:
        ingest_imap.remember(e)
    return {"email": e}
