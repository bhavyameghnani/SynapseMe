import pytest

from services.envoy import ledger


@pytest.fixture(autouse=True)
def tmp_ledger(tmp_path, monkeypatch):
    """Every test gets its own empty ledger + signing key (never touches services/envoy/ledger.jsonl)."""
    monkeypatch.setenv("MOCK_MODE", "1")
    monkeypatch.setattr(ledger, "LEDGER_PATH", tmp_path / "ledger.jsonl")
    monkeypatch.setattr(ledger, "RECEIPT_PATH", tmp_path / "receipt.json")
    monkeypatch.setattr(ledger, "KEY_PATH", tmp_path / ".signing_key")
    monkeypatch.setattr(ledger, "_loaded", False)
    ledger._events.clear()
    yield
    ledger._events.clear()
    ledger._loaded = False
