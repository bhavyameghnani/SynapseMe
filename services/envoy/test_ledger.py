import copy

import pytest

from services.common.events import GENESIS_HASH, AgentEvent
from services.envoy import ledger


@pytest.fixture(autouse=True)
def tmp_ledger(tmp_path, monkeypatch):
    monkeypatch.setattr(ledger, "LEDGER_PATH", tmp_path / "ledger.jsonl")
    monkeypatch.setattr(ledger, "RECEIPT_PATH", tmp_path / "receipt.json")
    monkeypatch.setattr(ledger, "KEY_PATH", tmp_path / ".signing_key")
    monkeypatch.setattr(ledger, "_loaded", False)
    ledger._events.clear()
    yield
    ledger._events.clear()
    ledger._loaded = False


def _fill(n: int = 3) -> None:
    for i in range(n):
        ledger.append(AgentEvent(step=i, actor="envoy", kind="verify", summary=f"event {i}",
                                 data={"amount_usd": 400000.0, "i": i}))


def test_chain_links_and_verifies():
    _fill()
    evs = ledger.all()
    assert evs[0]["prev_hash"] == GENESIS_HASH
    assert all(evs[i]["prev_hash"] == evs[i - 1]["hash"] for i in range(1, len(evs)))
    assert ledger.verify_chain(evs)


def test_tamper_detected():
    _fill()
    evs = copy.deepcopy(ledger.all())
    evs[1]["summary"] = "Wire to attacker"
    assert not ledger.verify_chain(evs)


def test_receipt_signature():
    _fill()
    rec = ledger.receipt()
    assert rec["algorithm"] == "ed25519" and rec["final_hash"] == ledger.all()[-1]["hash"]
    assert ledger.verify_signature(rec["final_hash"], rec["signature"], rec["public_key"])
    assert ledger.verify_receipt(rec)
    bad = copy.deepcopy(rec)
    bad["events"][0]["data"]["amount_usd"] = 1
    assert not ledger.verify_receipt(bad)
    assert not ledger.verify_signature("0" * 64, rec["signature"], rec["public_key"])


def test_persisted_and_reset():
    _fill(2)
    ledger._loaded = False
    ledger._events.clear()
    assert len(ledger.all()) == 2
    ledger.reset()
    assert ledger.all() == []
