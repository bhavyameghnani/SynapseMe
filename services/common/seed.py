"""Seed-data helpers shared by every service (tolerant of missing files)."""
from __future__ import annotations

import json
from typing import Any

from .config import SEED
from .events import sha256_hex

DISCLAIMER = "Demo with fictional data. Not financial, tax, or legal advice."
DEMO_TODAY = "2026-12-01"


def load_seed(name: str, default: Any = None) -> Any:
    path = SEED / name
    if not path.exists():
        return default
    with path.open(encoding="utf-8") as f:
        return json.load(f)


def seed_sha(name: str) -> str:
    path = SEED / name
    return sha256_hex(path.read_bytes()) if path.exists() else sha256_hex(name)


def as_list(obj: Any, *keys: str) -> list[Any]:
    """Seed files may be a bare list or {key: [...]} -- accept both."""
    if isinstance(obj, list):
        return obj
    if isinstance(obj, dict):
        for k in keys:
            if isinstance(obj.get(k), list):
                return obj[k]
    return []
