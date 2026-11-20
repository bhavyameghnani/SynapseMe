"""Env flags. MOCK_MODE=1 forces every sponsor adapter to mock."""
from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[2]
SEED = ROOT / "data" / "seed"
load_dotenv(ROOT / ".env", override=False)

FLAG = {
    "airbyte": "USE_AIRBYTE", "cognee": "USE_COGNEE", "superlinked": "USE_SIE",
    "persona": "USE_PERSONA", "guild": "USE_GUILD", "singlestore": "USE_SINGLESTORE",
    "arcee": "USE_ARCEE", "firedrill": "USE_FIREDRILL", "statsig": "USE_STATSIG",
    "amplitude": "USE_AMPLITUDE",
}


def env(name: str, default: str = "") -> str:
    return os.getenv(name, default)


def mock_mode() -> bool:
    return env("MOCK_MODE", "1") == "1"


def use_real(sponsor: str) -> bool:
    if mock_mode():
        return False
    return env(FLAG.get(sponsor, ""), "0") == "1"


def mode_of(sponsor: str) -> str:
    return "real" if use_real(sponsor) else "mock"


def openai_enabled() -> bool:
    return not mock_mode() and bool(env("OPENAI_API_KEY"))


URLS = {
    "envoy": env("ENVOY_URL", "http://localhost:8000"),
    "client_agent": env("CLIENT_AGENT_URL", "http://localhost:8200"),
    "bank_a": env("BANK_A_URL", "http://localhost:8101"),
    "bank_b": env("BANK_B_URL", "http://localhost:8102"),
    "bank_c": env("BANK_C_URL", "http://localhost:8103"),
}
