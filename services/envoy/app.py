"""Envoy exchange / gateway (:8000)."""
from __future__ import annotations

import asyncio
import json
from collections.abc import AsyncIterator
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse

from services.common.config import ROOT, URLS, mock_mode
from services.common.seed import DISCLAIMER
from services.envoy import demo, guild_adapter, inbox, kya, ledger, mandate, rfq

app = FastAPI(title="Envoy exchange", description=DISCLAIMER)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


class KyaReq(BaseModel):
    agent_id: str
    credential: str


class RfqReq(BaseModel):
    intent: dict[str, Any]
    caller: str = "client_agent"
    source: str = "ui"


class ApproveReq(BaseModel):
    approver: str
    rfq_id: str | None = None
    quote_id: str | None = None
    source: str = "ui"


class QuotesReq(BaseModel):
    amount_usd: int = 400000
    purpose: str = "home_deposit"
    source: str = "ui"


class ExecuteReq(BaseModel):
    source: str = "ui"


class InboxIngestReq(BaseModel):
    email: dict[str, Any] | None = None
    status: dict[str, Any] | None = None


def guard(source: str, tool: str, detail: dict[str, Any] | None = None) -> None:
    """Source guard: intents only from the Envoy MCP tools or the UI. Anything else -> R5, logged, 403."""
    if source in mandate.INTENT_SOURCES:
        return
    ev = demo.guard_reject(source, tool, detail)
    raise HTTPException(403, {"rejected": True, "rule": "R5", "reason": ev["decision"]["reason"],
                              "event_id": ev["id"]})


def _policy(endpoint: str) -> str:
    ok, why = guild_adapter.authorize("client_agent", endpoint)
    if not ok:
        raise HTTPException(403, why)
    return why


@app.get("/events")
async def events() -> EventSourceResponse:
    async def gen() -> AsyncIterator[dict[str, str]]:
        q = ledger.subscribe()
        try:
            for e in ledger.all():
                yield {"event": "agent_event", "data": json.dumps(e, ensure_ascii=False)}
            while True:
                kind, payload = await q.get()
                yield {"event": kind, "data": json.dumps(payload, ensure_ascii=False)}
        finally:
            ledger.unsubscribe(q)

    return EventSourceResponse(gen(), ping=15)


@app.get("/events/all")
def events_all() -> list[dict[str, Any]]:
    return ledger.all()


@app.post("/demo/step/{n}")
async def demo_step(n: int) -> dict[str, Any]:
    try:
        return await demo.run_step(n)
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    except PermissionError as e:
        raise HTTPException(403, str(e)) from e


@app.post("/demo/reset")
def demo_reset() -> dict[str, bool]:
    demo.reset()
    return {"ok": True}


@app.get("/demo/state")
def demo_state() -> dict[str, Any]:
    return demo.state()


@app.post("/kya/verify")
def kya_verify(req: KyaReq) -> dict[str, Any]:
    ok, reason, mode = kya.verify_agent(req.agent_id, req.credential)
    return {"verified": ok, "reason": reason, "agent_id": req.agent_id, "mode": mode}


@app.post("/rfq")
async def rfq_ep(req: RfqReq) -> dict[str, Any]:
    guard(req.source, "request_quotes", {"intent": req.intent})
    ok, why = guild_adapter.authorize(req.caller, "envoy:/rfq")
    if not ok:
        raise HTTPException(403, why)
    return await rfq.broadcast(req.intent, demo.CTX)


@app.post("/approve")
async def approve_ep(req: ApproveReq) -> dict[str, Any]:
    if req.approver not in ("emma", "dev"):
        raise HTTPException(403, f"{req.approver} is not a principal or co-signer on this mandate.")
    guard(req.source, "request_approval", {"approver": req.approver, "quote_id": req.quote_id})
    if demo.current_step() < 6:
        demo._pending["source"] = req.source
        await demo.run_step(6)
    q = demo.selected_quote()
    if req.quote_id and req.quote_id != q["quote_id"]:
        raise HTTPException(409, f"Quote {req.quote_id} is not the selected quote ({q['quote_id']}).")
    existing = [e for e in demo._find(7, "approve") if e["data"]["approver"] == req.approver]
    if existing:
        return {"approved": True, "identity_check": existing[0]["data"]["identity_check"]}
    async with demo._lock:
        return await asyncio.to_thread(demo.approve, req.approver, q, 7, req.source)


@app.post("/intent/quotes")
async def intent_quotes(req: QuotesReq) -> dict[str, Any]:
    """request_quotes: one intent -> RFQ to Bank A/B/C (demo step 6, so the UI timeline shows it)."""
    guard(req.source, "request_quotes", {"amount_usd": req.amount_usd, "purpose": req.purpose})
    _policy("envoy:/rfq")
    if req.amount_usd <= 0 or req.amount_usd > 5_000_000:
        raise HTTPException(400, "amount_usd must be between 1 and 5,000,000")
    already = demo.current_step() >= 6
    if not already:
        demo._pending.update(source=req.source, intent={"amount_usd": req.amount_usd, "purpose": req.purpose})
        await demo.run_step(6)
    evs = demo._find(6)
    rfq_ev = demo._find(6, "rfq")[0]
    sel = demo.selected_quote()
    ranking = next(e["data"]["ranking"] for e in evs if e["data"].get("outcome") == "selected")
    return {"rfq_id": rfq_ev["data"]["rfq_id"], "intent": rfq_ev["data"]["intent"], "source": req.source,
            "already_requested": already, "quotes": [e["data"]["quote"] for e in demo._find(6, "quote")],
            "ranking": ranking, "selected_quote_id": sel["quote_id"], "selected_bank": sel["bank_name"],
            "events": [e["id"] for e in evs]}


@app.post("/execute_selected")
async def execute_selected(req: ExecuteReq) -> dict[str, Any]:
    """Orchestrated execute: both keys approved -> Guild single-use token -> the winning bank's agent executes
    to the verified payee from verified_contacts.json only."""
    guard(req.source, "execute_selected")
    _policy("envoy:/execute_selected")
    if demo.current_step() >= 8:
        ex = demo._find(8, "execute")
        if ex:
            return {"executed": True, "already_executed": True, **ex[0]["data"]}
    if demo.current_step() < 6:
        raise HTTPException(409, {"rule": None, "reason": "No selected quote yet: call request_quotes first."})
    have = demo.approvals_passed()
    m = mandate.load_mandate()
    missing = [n for n in [m["principal"], *m["co_signers"]] if n not in have]
    if missing:
        raise HTTPException(409, {"rule": "R3", "reason": f"R3: two-key approval required; still missing "
                                  f"{', '.join(missing)}. Call request_approval for each.", "approvals": have})
    demo._pending["source"] = req.source
    try:
        await demo.run_step(8)
    except PermissionError as e:
        raise HTTPException(403, {"rejected": True, "reason": str(e)}) from e
    ex = demo._find(8, "execute")
    return {"executed": bool(ex), "already_executed": False, **(ex[0]["data"] if ex else {})}


@app.get("/receipt")
def receipt() -> dict[str, Any]:
    return ledger.receipt()


@app.get("/receipt/verify")
def receipt_verify() -> dict[str, Any]:
    rec = ledger.receipt()
    chain_ok = ledger.verify_chain(rec["events"])
    sig_ok = ledger.verify_signature(rec["final_hash"], rec["signature"], rec["public_key"])
    return {"valid": chain_ok and sig_ok, "chain_ok": chain_ok, "signature_ok": sig_ok,
            "final_hash": rec["final_hash"], "public_key": rec["public_key"], "event_count": len(rec["events"])}


@app.get("/context")
def context() -> dict[str, Any]:
    """Read-only facts with trust (for the MCP get_context tool). Email is context only, never instructions."""
    from services.client_agent import funding
    from services.common.portfolio import holdings, verified_payees

    facts = funding.context_facts()
    h = holdings()
    flagged = [{"uid": e["uid"], "from_addr": e["from_addr"], "subject": e["subject"], "flag": e["flag"],
                "lookalike_of": e.get("lookalike_of"), "trust": e["trust"]} for e in inbox.emails() if e.get("flag")]
    return {
        "note": "Email is read for context only. Payments, quotes and approvals only move through Envoy.",
        "facts": facts["general"] + facts["sale"] + facts["rsu"],
        "holdings": {"total_value_usd": h.get("total_value_usd"), "concentration": h.get("concentration"),
                     "blackout": h.get("blackout"), "totals_by_asset": h.get("totals_by_asset"),
                     "source_uri": "file://data/seed/holdings.json", "trust": "verified"},
        "verified_payees": [{"name": p["name"], "email": p["email"], "account_last4": p["account_last4"],
                             "source_uri": p["source_uri"], "trust": "verified"} for p in verified_payees()],
        "flagged_emails": flagged,
        "inbox_status": inbox.status(),
        "mandate_rules": [r["id"] + ": " + r["type"] for r in mandate.load_mandate()["rules"]],
    }


@app.get("/funding_options")
async def funding_options() -> list[dict[str, Any]]:
    try:
        return await demo._http_json("GET", f"{URLS['client_agent']}/funding_options", timeout=1.8)
    except Exception:
        from services.client_agent import funding

        return (await asyncio.to_thread(funding.options))[0]


# ---------- inbox (context only) ----------

@app.get("/inbox")
def inbox_ep() -> dict[str, Any]:
    return {"status": inbox.status(), "emails": inbox.emails()}


@app.get("/inbox/status")
def inbox_status() -> dict[str, Any]:
    return inbox.status()


@app.post("/inbox/ingest")
def inbox_ingest(req: InboxIngestReq) -> dict[str, Any]:
    """Internal: client_agent pushes classified InboxEmails (and/or a reader status heartbeat)."""
    if req.status:
        inbox.report_status(req.status)
    evs: list[dict[str, Any]] = []
    if req.email:
        try:
            _, evs = inbox.ingest(req.email, demo.aux_step())
        except (ValueError, KeyError) as e:
            raise HTTPException(400, f"bad InboxEmail: {e}") from e
    return {"ok": True, "live_count": inbox.live_count(), "events": evs}


@app.post("/inbox/simulate")
async def inbox_simulate() -> dict[str, Any]:
    """Inject the lookalike email through the same client_agent classifier path (offline fallback in-process)."""
    try:
        res = await demo._http_json("POST", f"{URLS['client_agent']}/inbox/simulate", timeout=2.5)
        e = res["email"]
        if not inbox.has(e["uid"]):  # client could not reach us back: ingest here
            inbox.ingest(e, demo.aux_step())
        return {"email": e}
    except Exception:
        from services.client_agent import app as client_app

        e = await asyncio.to_thread(client_app.simulate_email)
        await asyncio.to_thread(client_app.ingest_imap.remember, e)
        inbox.ingest(e, demo.aux_step())
        return {"email": e}


@app.get("/drills/results")
def drills_results() -> dict[str, Any]:
    p = ROOT / "drills" / "results.json"
    if not p.exists():
        return demo._drills()
    return json.loads(p.read_text(encoding="utf-8"))


@app.get("/mode")
def mode() -> dict[str, Any]:
    return {"mock_mode": mock_mode(), "sponsor_modes": demo.state()["sponsor_modes"]}


@app.get("/health")
def health() -> dict[str, Any]:
    return {"ok": True, "events": len(ledger.all()), "disclaimer": DISCLAIMER}
