"""Append-only, hash-chained audit ledger with Ed25519-signed receipts."""
from __future__ import annotations

import asyncio
import json
import threading
from pathlib import Path
from typing import Any

from nacl.encoding import HexEncoder
from nacl.exceptions import BadSignatureError
from nacl.signing import SigningKey, VerifyKey

from services.common.events import GENESIS_HASH, AgentEvent, event_hash, now_iso

HERE = Path(__file__).resolve().parent
LEDGER_PATH = HERE / "ledger.jsonl"
KEY_PATH = HERE / ".signing_key"
RECEIPT_PATH = HERE / "receipt.json"

_lock = threading.Lock()
_events: list[dict[str, Any]] = []
_loaded = False
# Each subscriber is (loop, queue); publish is thread-safe via call_soon_threadsafe.
_subscribers: list[tuple[asyncio.AbstractEventLoop, asyncio.Queue]] = []


def _load() -> None:
    global _loaded
    if _loaded:
        return
    _events.clear()
    if LEDGER_PATH.exists():
        for line in LEDGER_PATH.read_text(encoding="utf-8").splitlines():
            if line.strip():
                _events.append(json.loads(line))
    _loaded = True


def _signing_key() -> SigningKey:
    if KEY_PATH.exists():
        return SigningKey(KEY_PATH.read_text().strip().encode(), encoder=HexEncoder)
    key = SigningKey.generate()
    KEY_PATH.write_text(key.encode(encoder=HexEncoder).decode())
    try:
        KEY_PATH.chmod(0o600)
    except OSError:
        pass
    return key


def public_key_hex() -> str:
    return _signing_key().verify_key.encode(encoder=HexEncoder).decode()


def _publish(kind: str, payload: Any) -> None:
    for loop, q in tuple(_subscribers):  # snapshot: unsubscribe may mutate the list
        try:
            loop.call_soon_threadsafe(q.put_nowait, (kind, payload))
        except RuntimeError:
            unsubscribe(q)


def subscribe() -> asyncio.Queue:
    q: asyncio.Queue = asyncio.Queue()
    _subscribers.append((asyncio.get_running_loop(), q))
    return q


def unsubscribe(q: asyncio.Queue) -> None:
    _subscribers[:] = [(lp, s) for lp, s in _subscribers if s is not q]


def append(event: AgentEvent) -> AgentEvent:
    with _lock:
        _load()
        event.prev_hash = _events[-1]["hash"] if _events else GENESIS_HASH
        event.hash = ""
        body = event.model_dump(mode="json")
        event.hash = event_hash(body)
        body["hash"] = event.hash
        _events.append(body)
        with LEDGER_PATH.open("a", encoding="utf-8") as f:
            f.write(json.dumps(body, ensure_ascii=False) + "\n")
    _publish("agent_event", body)
    return event


def all() -> list[dict[str, Any]]:
    with _lock:
        _load()
        return [dict(e) for e in _events]


def final_hash() -> str:
    evs = all()
    return evs[-1]["hash"] if evs else GENESIS_HASH


def reset() -> None:
    global _loaded
    with _lock:
        _events.clear()
        LEDGER_PATH.write_text("", encoding="utf-8")
        RECEIPT_PATH.unlink(missing_ok=True)
        _loaded = True
    _publish("reset", {"ok": True})


def verify_chain(events: list[dict[str, Any]]) -> bool:
    prev = GENESIS_HASH
    for e in events:
        if e.get("prev_hash") != prev or event_hash(e) != e.get("hash"):
            return False
        prev = e["hash"]
    return True


def sign(message: str) -> str:
    return _signing_key().sign(message.encode("utf-8")).signature.hex()


def verify_signature(message: str, signature_hex: str, public_key: str) -> bool:
    try:
        VerifyKey(public_key, encoder=HexEncoder).verify(message.encode("utf-8"), bytes.fromhex(signature_hex))
        return True
    except (BadSignatureError, ValueError):
        return False


def receipt() -> dict[str, Any]:
    events = all()
    fh = events[-1]["hash"] if events else GENESIS_HASH
    rec = {
        "events": events,
        "final_hash": fh,
        "signature": sign(fh),
        "public_key": public_key_hex(),
        "algorithm": "ed25519",
        "signed_at": now_iso(),
    }
    RECEIPT_PATH.write_text(json.dumps(rec, ensure_ascii=False, indent=1), encoding="utf-8")
    return rec


def verify_receipt(rec: dict[str, Any]) -> bool:
    events = rec.get("events", [])
    fh = events[-1]["hash"] if events else GENESIS_HASH
    return (
        verify_chain(events)
        and fh == rec.get("final_hash")
        and verify_signature(rec["final_hash"], rec.get("signature", ""), rec.get("public_key", ""))
    )
