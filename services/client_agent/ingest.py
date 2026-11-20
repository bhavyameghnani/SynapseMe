"""Airbyte context layer: inbox, holdings and the listing in one index. REAL stub falls back to seed."""
from __future__ import annotations

from typing import Any

from services.common.config import env, use_real
from services.common.seed import as_list, load_seed

_mode = "mock"


def _airbyte_fetch() -> dict[str, Any] | None:
    # REAL: Airbyte agent connectors / Context Store. SDK surface unconfirmed, so any failure -> seed.
    if not (use_real("airbyte") and env("AIRBYTE_API_KEY")):
        return None
    try:
        import airbyte  # type: ignore  # noqa: F401
    except Exception:
        return None
    return None


def load_all() -> dict[str, Any]:
    global _mode
    real = _airbyte_fetch()
    if real:
        _mode = "real"
        return real
    _mode = "mock"
    return {
        "emails": as_list(load_seed("emails.json", []), "emails"),
        "holdings": load_seed("holdings.json", {}) or {},
        "listing": load_seed("listing.json", {}) or {},
    }


def mode() -> str:
    return _mode


def email_uri(e: dict[str, Any]) -> str:
    return f"email://{e.get('id')}"
