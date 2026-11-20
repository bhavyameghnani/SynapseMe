"""Shared AgentEvent model + canonical hashing. The browser verifier mirrors canonical_json exactly."""
from __future__ import annotations

import hashlib
import json
import os
import uuid
from datetime import UTC, datetime
from typing import Any, Literal

from pydantic import BaseModel, Field, model_validator

Actor = Literal[
    "client_agent", "envoy", "bank_a", "bank_b", "bank_c", "human:emma", "human:dev", "rogue_agent"
]
Kind = Literal[
    "ingest", "memory", "verify", "mandate_check", "flag", "option", "rfq", "quote",
    "reject", "approve", "execute", "drill",
]
Trust = Literal["verified", "claimed", "untrusted"]
SponsorKey = Literal[
    "airbyte", "cognee", "superlinked", "persona", "guild", "singlestore",
    "arcee", "firedrill", "statsig", "amplitude", "aws", "openai",
]
GENESIS_HASH = "0" * 64
# Sponsors credited in this demo; others are future scope (docs/future_scope.md).
ACTIVE_SPONSORS = {s.strip() for s in os.getenv("ACTIVE_SPONSORS", "cognee,persona,guild").split(",") if s.strip()}


def now_iso() -> str:
    return datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"


class Source(BaseModel):
    label: str
    uri: str
    trust: Trust
    fetched_at: str = Field(default_factory=now_iso)
    sha256: str = ""


class Decision(BaseModel):
    result: Literal["allow", "deny", "selected", "rejected"]
    rule: str | None = None
    reason: str


class AgentEvent(BaseModel):
    id: str = Field(default_factory=lambda: f"evt_{uuid.uuid4().hex[:12]}")
    ts: str = Field(default_factory=now_iso)
    step: int
    actor: Actor
    kind: Kind
    summary: str
    sources: list[Source] = Field(default_factory=list)
    decision: Decision | None = None
    sponsors: list[SponsorKey] = Field(default_factory=list)
    # sponsor -> "real" | "mock": which adapter actually ran (drives the mock dot in the UI)
    sponsor_modes: dict[str, str] = Field(default_factory=dict)
    # screen-specific payload (quotes, options, emails...). Ints/strings preferred; see canonical_json.
    data: dict[str, Any] = Field(default_factory=dict)
    prev_hash: str = ""
    hash: str = ""

    @model_validator(mode="after")
    def _active_sponsors_only(self) -> AgentEvent:
        if not self.hash:  # never rewrite an already-hashed event
            self.sponsors = [s for s in self.sponsors if s in ACTIVE_SPONSORS]
            self.sponsor_modes = {k: v for k, v in self.sponsor_modes.items() if k in ACTIVE_SPONSORS}
        return self


def _normalize(o: Any) -> Any:
    # Integral floats become ints so Python and JS serialize numbers identically.
    if isinstance(o, float):
        return int(o) if o.is_integer() else o
    if isinstance(o, dict):
        return {k: _normalize(v) for k, v in o.items()}
    if isinstance(o, (list, tuple)):
        return [_normalize(v) for v in o]
    return o


def canonical_json(obj: Any) -> str:
    return json.dumps(_normalize(obj), sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def sha256_hex(s: str | bytes) -> str:
    return hashlib.sha256(s.encode() if isinstance(s, str) else s).hexdigest()


def event_hash(event: dict[str, Any]) -> str:
    """hash = sha256(prev_hash + canonical_json(event minus 'hash'))."""
    body = {k: v for k, v in event.items() if k != "hash"}
    return sha256_hex(event["prev_hash"] + canonical_json(body))
