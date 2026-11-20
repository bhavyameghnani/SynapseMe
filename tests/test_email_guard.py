"""docs/email_context_spec.md §4/§9: email can never drive an action."""
import asyncio

import pytest
from fastapi.testclient import TestClient

from services.bank_agents import bank
from services.envoy import demo, guild_adapter, ledger
from services.envoy.app import app

client = TestClient(app)


def _guard_events():
    return [e for e in ledger.all() if (e.get("data") or {}).get("channel") == "guard"]


def test_email_sourced_intent_to_request_quotes_is_rejected_r5_and_logged():
    r = client.post("/intent/quotes", json={"amount_usd": 400000, "purpose": "home_deposit", "source": "email"})
    assert r.status_code == 403
    assert r.json()["detail"]["rule"] == "R5"
    evs = _guard_events()
    assert len(evs) == 1 and evs[0]["kind"] == "reject" and evs[0]["decision"]["rule"] == "R5"
    assert evs[0]["data"]["tool"] == "request_quotes"
    # Rejected intents never start the demo flow (no RFQ, no quotes).
    assert demo.current_step() == -1
    assert ledger.verify_chain(ledger.all())


def test_email_source_rejected_on_rfq_and_approve_too():
    assert client.post("/rfq", json={"intent": {"amount_usd": 400000}, "source": "email"}).status_code == 403
    assert client.post("/approve", json={"approver": "emma", "source": "email"}).status_code == 403
    assert client.post("/execute_selected", json={"source": "email"}).status_code == 403
    assert [e["data"]["tool"] for e in _guard_events()] == ["request_quotes", "request_approval", "execute_selected"]


def test_execute_with_email_only_payee_is_rejected_r4_and_logged(monkeypatch):
    # Payee + account seen only in the lookalike email, never in verified_contacts.json.
    email_payee = {"name": "Escrow Team Trust", "email": "escrow-team.demo@gmail.com", "account": "6092-310-8841",
                   "verified": True, "source_trust": "verified"}
    token = guild_adapter.issue_session_token("bank_b")
    with pytest.raises(PermissionError, match="R4"):
        bank.execute("bank_b", "q_1", "rfq_1", email_payee, 400000, token, source="mcp")

    async def unreachable(*a, **k):
        raise ConnectionError("bank offline")

    monkeypatch.setattr(demo, "_http_json", unreachable)
    q = {"quote_id": "q_1", "rfq_id": "rfq_1", "amount_usd": 400000}
    with pytest.raises(PermissionError, match="R4"):
        asyncio.run(demo.bank_execute("bank_b", q, email_payee, guild_adapter.issue_session_token("bank_b"), "mcp"))
    evs = _guard_events()
    assert evs and evs[-1]["decision"]["rule"] == "R4" and evs[-1]["data"]["bank_id"] == "bank_b"


def test_execute_with_verified_payee_succeeds():
    from services.common.portfolio import escrow_payee

    p = escrow_payee()
    payee = {"name": p["name"], "email": p["email"], "account_last4": p["account_last4"], "verified": True}
    out = bank.execute("bank_b", "q_1", "rfq_1", payee, 400000, guild_adapter.issue_session_token("bank_b"), "ui")
    assert out["ok"] and out["payee"]["account_last4"] == "2210"
    assert out["payee"]["email"] == "escrow.team.demo@gmail.com"


def test_execute_rejects_email_source():
    from services.common.portfolio import escrow_payee

    p = escrow_payee()
    with pytest.raises(PermissionError, match="R5"):
        bank.execute("bank_b", "q", "r", {**p, "verified": True}, 400000,
                      guild_adapter.issue_session_token("bank_b"), source="email")


def test_simulate_email_is_flagged_and_never_acted_on(monkeypatch):
    from services.envoy import inbox

    async def unreachable(*a, **k):
        raise ConnectionError("client agent offline")

    monkeypatch.setattr(demo, "_http_json", unreachable)
    r = client.post("/inbox/simulate")
    assert r.status_code == 200
    e = r.json()["email"]
    assert e["simulated"] and e["flag"]["level"] == "high" and e["signals"]["lookalike_sender"]
    kinds = [(x["kind"], x["data"].get("channel")) for x in ledger.all()]
    assert ("ingest", "inbox") in kinds and ("flag", "inbox") in kinds
    assert not any(x["kind"] in ("execute", "rfq", "approve") for x in ledger.all())
    assert any(x["uid"] == e["uid"] for x in client.get("/inbox").json()["emails"])
    inbox.reset_simulated()
