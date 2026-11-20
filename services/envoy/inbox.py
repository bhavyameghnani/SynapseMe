"""Envoy-side inbox state. The client agent owns IMAP + the classifier and pushes InboxEmails here.

Email is context only: ingesting an email emits audit events, never an action.
"""
from __future__ import annotations

import threading
import time
from typing import Any

from services.common.config import env, mock_mode
from services.common.events import Decision, Source, canonical_json, now_iso, sha256_hex
from services.common.seed import as_list, load_seed

_lock = threading.Lock()
_live: dict[str, dict[str, Any]] = {}  # uid -> InboxEmail (imap / airbyte / simulated)
_seed_cache: list[dict[str, Any]] | None = None
_status: dict[str, Any] = {"source": "seed", "connected": False, "watching": False, "last_poll_at": None,
                           "last_error": None}
_last_report = 0.0
STALE_S = 60  # client agent heartbeat older than this -> watching=false


def live_mode() -> bool:
    return env("LIVE_MODE", "0") == "1"


def _seed_emails() -> list[dict[str, Any]]:
    global _seed_cache
    if _seed_cache is None:
        from services.client_agent import fraud_check

        _seed_cache = [{**fraud_check.classify_seed_email(e), "source": "seed"}
                       for e in as_list(load_seed("emails.json", []), "emails")]
    return _seed_cache


def _serve_seed() -> bool:
    # Seed inbox when offline (MOCK_MODE) or until a live reader has reported in.
    return mock_mode() or not live_mode() or _status["source"] == "seed"


def emails() -> list[dict[str, Any]]:
    with _lock:
        live = list(_live.values())
    out = live + (_seed_emails() if _serve_seed() else [])
    return sorted(out, key=lambda e: (str(e.get("date") or ""), str(e.get("uid"))), reverse=True)


def status() -> dict[str, Any]:
    all_ = emails()
    st = dict(_status)
    if st["source"] != "seed" and time.time() - _last_report > STALE_S:
        st["watching"] = False
    st["count"] = len(all_)
    st["flagged_count"] = sum(1 for e in all_ if e.get("flag"))
    return st


def report_status(s: dict[str, Any]) -> None:
    global _last_report
    keys = ("source", "connected", "watching", "last_poll_at", "last_error")
    _status.update({k: s[k] for k in keys if k in s})
    _last_report = time.time()


def _src(e: dict[str, Any]) -> Source:
    uri = f"{e.get('source', 'imap')}://inbox/{e['uid']}"
    return Source(label=f"Email from {e['from_addr']}: {e['subject'][:60]}", uri=uri, trust=e["trust"],
                  fetched_at=now_iso(), sha256=sha256_hex(canonical_json(e)))


def ingest(e: dict[str, Any], step: int) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    """Store one InboxEmail and emit ingest (+ flag) AgentEvents. Re-ingesting a uid is a no-op."""
    from services.envoy.demo import emit

    uid = str(e.get("uid") or "")
    if not uid:
        raise ValueError("InboxEmail.uid is required")
    with _lock:
        if uid in _live:
            return _live[uid], []
        _live[uid] = e
    origin = e.get("source", "imap")
    sponsors = ["airbyte"] if origin == "airbyte" else []
    sponsors += ["superlinked", "cognee"]
    modes = {**(e.get("sponsor_modes") or {}), **({"airbyte": "real"} if origin == "airbyte" else {})}
    sig = [k for k, v in (e.get("signals") or {}).items() if v]
    label = "Simulated email" if e.get("simulated") else "New email"
    evs = [emit(step, "client_agent", "ingest",
                f"{label} read for context [{e['trust']}] from {e['from_addr']}: {e['subject'][:70]}",
                sources=[_src(e)], sponsors=sponsors, modes=modes,
                data={"inbox_email": e, "channel": "inbox", "signals": sig})]
    f = e.get("flag")
    if f:
        rule = "+".join(f.get("rules") or ["R5"])
        what = "Lookalike sender" if e["signals"].get("lookalike_sender") else (
            "Hidden instruction" if e["signals"].get("hidden_instruction") else "Bank details mismatch")
        evs.append(emit(step, "envoy", "flag",
                        f"FLAGGED {f['level']}: {what} — {e['from_addr']}"
                        + (f" vs verified {e['lookalike_of']}" if e.get("lookalike_of") else "")
                        + "; never acted on — payment instructions only come through Envoy",
                        sources=[_src(e)],
                        decision=Decision(result="deny", rule=rule, reason=f["reason"]),
                        sponsors=["superlinked", "cognee"], modes=modes,
                        data={"inbox_email": e, "channel": "inbox"}))
    return e, evs


def has(uid: str) -> bool:
    with _lock:
        return str(uid) in _live


def live_count() -> int:
    with _lock:
        return sum(1 for e in _live.values() if not e.get("simulated"))


def reset_simulated() -> None:
    with _lock:
        for uid in [u for u, e in _live.items() if e.get("simulated")]:
            _live.pop(uid, None)
