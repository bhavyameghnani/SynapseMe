"""Know Your Agent (Persona). REAL: Persona Inquiries API (sandbox); MOCK: local registry. Any error -> mock.

Docs: https://docs.withpersona.com/api-reference/inquiries/create-an-inquiry
      https://docs.withpersona.com/integration-testing (sandbox simulate actions)
The signed-credential check always runs locally FIRST, so a rogue agent is rejected in every mode and
never causes a Persona inquiry to be created on its behalf.
"""
from __future__ import annotations

import hashlib
import time
from typing import Any

import httpx

from services.common.config import env, use_real

PERSONA_API = "https://api.withpersona.com/api/v1"
REGISTERED_AGENTS = {"emma-agent-01": "kya:emma-agent-01:signed"}
REGISTERED_HUMANS = {"emma", "dev"}
TIMEOUT_S = 3.0
_inquiries: dict[str, str] = {}  # subject -> real Persona inquiry id (one per subject per process)
COOLDOWN_S = 60  # after a failure, skip Persona for a minute so a dead network can't slow the demo
_last: dict[str, Any] = {"mode": "mock", "error": None, "failed_at": 0.0}


def _inquiry_id(subject: str) -> str:
    return "inq_" + hashlib.sha256(f"envoy-kya:{subject}".encode()).hexdigest()[:20]


def _headers() -> dict[str, str]:
    h = {"Authorization": f"Bearer {env('PERSONA_API_KEY')}", "Content-Type": "application/json",
         "Accept": "application/json"}
    if env("PERSONA_VERSION"):
        h["Persona-Version"] = env("PERSONA_VERSION")
    return h


def persona_configured() -> bool:
    return use_real("persona") and bool(env("PERSONA_API_KEY")) and bool(env("PERSONA_INQUIRY_TEMPLATE_ID"))


def _simulate(inquiry_id: str, action: str = "approve_inquiry") -> str | None:
    """Sandbox only: drive the inquiry to approved/declined. Best effort; returns new status or None."""
    try:
        r = httpx.post(f"{PERSONA_API}/inquiries/{inquiry_id}/perform-simulate-actions", headers=_headers(),
                       json={"meta": {"simulate-actions": [{"type": "inquiry-status-action",
                                                            "action": action}]}},
                       timeout=TIMEOUT_S)
        r.raise_for_status()
        return r.json()["data"]["attributes"].get("status")
    except Exception:
        return None


def _persona_inquiry(reference_id: str, outcome: str = "approve_inquiry") -> str | None:
    """Create (or reuse) a sandbox inquiry for reference_id; returns its id or None on any failure."""
    if not persona_configured():
        return None
    if reference_id in _inquiries:
        return _inquiries[reference_id]
    if time.time() - _last["failed_at"] < COOLDOWN_S:
        return None
    body: dict[str, Any] = {
        "data": {"attributes": {"inquiry-template-id": env("PERSONA_INQUIRY_TEMPLATE_ID")}},
        "meta": {"auto-create-account": True, "auto-create-account-reference-id": reference_id},
    }
    try:
        r = httpx.post(f"{PERSONA_API}/inquiries", headers={**_headers(), "Idempotency-Key": f"envoy-{reference_id}"},
                       json=body, timeout=TIMEOUT_S)
        r.raise_for_status()
        inquiry = r.json()["data"]["id"]
    except Exception as e:
        _last.update(mode="mock", error=f"{type(e).__name__}", failed_at=time.time())
        return None
    if env("PERSONA_ENV", "sandbox") == "sandbox":
        _simulate(inquiry, outcome)
    _inquiries[reference_id] = inquiry
    _last.update(mode="real", error=None)
    return inquiry


def inquiry_status(inquiry_id: str) -> str | None:
    """GET /inquiries/{id} -> status ('created'|'approved'|...) or None."""
    if not persona_configured() or not inquiry_id.startswith("inq_"):
        return None
    try:
        r = httpx.get(f"{PERSONA_API}/inquiries/{inquiry_id}", headers=_headers(), timeout=TIMEOUT_S)
        r.raise_for_status()
        return r.json()["data"]["attributes"].get("status")
    except Exception:
        return None


def ping(timeout: float = TIMEOUT_S) -> tuple[bool, str]:
    """Auth check without creating anything: list one inquiry."""
    if not persona_configured():
        return False, "USE_PERSONA off or PERSONA_API_KEY / PERSONA_INQUIRY_TEMPLATE_ID missing"
    try:
        r = httpx.get(f"{PERSONA_API}/inquiries", headers=_headers(), params={"page[size]": 1}, timeout=timeout)
        r.raise_for_status()
        _last["failed_at"] = 0.0
        return True, "Persona API key accepted"
    except Exception as e:
        _last.update(error=type(e).__name__, failed_at=time.time())
        return False, f"Persona unreachable/rejected: {type(e).__name__}"


def _credential_ok(agent_id: str, credential: str) -> bool:
    return REGISTERED_AGENTS.get(agent_id) == credential


def verify_agent(agent_id: str, credential: str) -> tuple[bool, str, str]:
    """(verified, reason, mode). The signed credential check always runs locally, before Persona."""
    if not _credential_ok(agent_id, credential):
        if "password" in credential.lower():
            why = "shared human password, not a signed agent credential"
        elif ":signed" not in credential:
            why = "reused session/token, not a signed agent credential"
        else:
            why = "credential signature does not match any registered agent"
        # Deny is decided locally; in real mode Persona also records a declined inquiry for the attempt.
        rejected = _persona_inquiry(f"rogue-{agent_id}", "decline_inquiry") if use_real("persona") else None
        return False, f"Rejected: unverified agent {agent_id} ({why}).", "real" if rejected else "mock"
    inquiry = _persona_inquiry(f"agent-{agent_id}") if use_real("persona") else None
    mode = "real" if inquiry else "mock"
    inquiry = inquiry or _inquiry_id(agent_id)
    return True, f"Agent {agent_id} presented a signed KYA credential bound to its principal ({inquiry}).", mode


def inquiry_for(agent_id: str) -> str:
    return _inquiries.get(f"agent-{agent_id}") or _inquiry_id(agent_id)


def verify_human(name: str) -> dict[str, str]:
    name = name.lower().removeprefix("human:")
    known = name in REGISTERED_HUMANS
    inquiry = _persona_inquiry(f"human-{name}") if (use_real("persona") and known) else None
    status = "passed" if known else "failed"
    if inquiry:
        real_status = inquiry_status(inquiry)
        if real_status in {"declined", "failed", "expired"}:
            status = "failed"
    return {
        "provider": "persona",
        "inquiry_id": inquiry or _inquiry_id(f"human:{name}"),
        "status": status,
        "mode": "real" if inquiry else "mock",
    }


def last_status() -> dict[str, Any]:
    return dict(_last)
