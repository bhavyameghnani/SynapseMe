"""Superlinked SIE: structured extraction (wire details, rates, deadlines) + rerank. Fallback: regex."""
from __future__ import annotations

import re
from typing import Any

from services.common.config import env, use_real

_mode = "mock"
_ACCT = re.compile(r"Account:\s*([0-9][0-9\- ]{5,}[0-9])", re.IGNORECASE)
_ROUT = re.compile(r"Routing:\s*([0-9]{9})", re.IGNORECASE)
_PAYEE = re.compile(r"Payee:\s*([^\n]+)", re.IGNORECASE)
_RATE = re.compile(r"(\d{1,2}\.\d{1,2})\s?%")
_DATE = re.compile(r"\b(\d{4}-\d{2}-\d{2}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.? \d{1,2}(?:, \d{4})?)")


def _sie() -> Any | None:
    if not (use_real("superlinked") and env("SIE_API_KEY")):
        return None
    try:
        from sie_sdk import SIEClient  # type: ignore

        return SIEClient(api_key=env("SIE_API_KEY"), base_url=env("SIE_BASE_URL") or None)
    except Exception:
        return None


def extract(text: str) -> dict[str, Any]:
    global _mode
    client = _sie()
    if client is not None:
        try:
            out = client.extract(text=text, fields=["payee", "account", "routing", "rates", "deadlines"])
            _mode = "real"
            return dict(out)
        except Exception:
            pass
    _mode = "mock"
    acct, rout, payee = _ACCT.search(text), _ROUT.search(text), _PAYEE.search(text)
    return {
        "payee": payee.group(1).strip() if payee else None,
        "account": acct.group(1).strip().split(" ")[0] if acct else None,
        "routing": rout.group(1) if rout else None,
        "rates_pct": [float(r) for r in _RATE.findall(text)],
        "deadlines": _DATE.findall(text),
    }


def score(query: str, docs: list[str]) -> list[float]:
    """Rerank: SIE score when available, else token overlap."""
    client = _sie()
    if client is not None:
        try:
            return [float(s) for s in client.score(query=query, documents=docs)]
        except Exception:
            pass
    q = set(query.lower().split())
    return [len(q & set(d.lower().split())) / (len(q) or 1) for d in docs]


def mode() -> str:
    return _mode
