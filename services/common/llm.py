"""OpenAI-compatible chat helper with a deterministic fallback so the demo never breaks.

provider="arcee": Arcee's OpenAI-compatible API (https://docs.arcee.ai/api-reference/your-first-api-call),
falling back to OpenAI, then to the template. Mode is "real" only if the requested provider answered.
"""
from __future__ import annotations

import json
import re
import time
from typing import Any

from .config import env, openai_enabled, use_real

ARCEE_DEFAULT_BASE_URL = "https://api.arcee.ai/api/v1"
ARCEE_DEFAULT_MODEL = "trinity-mini"
ARCEE_COOLDOWN_S = 60  # after an Arcee failure, go straight to the fallback for a minute
_last_provider: dict[str, Any] = {"arcee_failed_at": 0.0}


def _client(base_url: str | None, api_key: str, timeout: float = 8.0):
    from openai import OpenAI

    return OpenAI(base_url=base_url or None, api_key=api_key, timeout=timeout, max_retries=0)


def arcee_configured() -> bool:
    return use_real("arcee") and bool(env("ARCEE_API_KEY"))


def _arcee_target() -> tuple[str, str, str]:
    return (env("ARCEE_BASE_URL") or ARCEE_DEFAULT_BASE_URL, env("ARCEE_API_KEY"),
            env("ARCEE_MODEL") or ARCEE_DEFAULT_MODEL)


def _parse_json(text: str) -> dict[str, Any]:
    text = (text or "").strip()
    fenced = re.search(r"```(?:json)?\s*(\{.*\})\s*```", text, re.DOTALL)
    if fenced:
        text = fenced.group(1)
    elif not text.startswith("{") and "{" in text:
        text = text[text.index("{"): text.rindex("}") + 1]
    out = json.loads(text or "{}")
    if not isinstance(out, dict):
        raise TypeError("model did not return a JSON object")
    return out


def _complete(client: Any, model: str, system: str, user: str) -> dict[str, Any]:
    messages = [{"role": "system", "content": system}, {"role": "user", "content": user}]
    try:
        resp = client.chat.completions.create(model=model, messages=messages,
                                              response_format={"type": "json_object"}, temperature=0.2)
    except Exception as e:
        # Some open-weight endpoints reject response_format; retry once asking for JSON in the prompt.
        if "response_format" not in str(e) and "json" not in str(e).lower():
            raise
        messages[0]["content"] = system + "\nRespond with a single JSON object only."
        resp = client.chat.completions.create(model=model, messages=messages, temperature=0.2)
    return _parse_json(resp.choices[0].message.content or "{}")


def chat_json_ex(system: str, user: str, fallback: dict[str, Any], *,
                 provider: str = "openai") -> tuple[dict[str, Any], str]:
    """Return (parsed_json, answered_by) where answered_by is 'arcee' | 'openai' | 'template'."""
    if provider == "arcee" and arcee_configured() and time.time() - _last_provider["arcee_failed_at"] > ARCEE_COOLDOWN_S:
        base, key, model = _arcee_target()
        try:
            out = _complete(_client(base, key, timeout=6.0), model, system, user)
            _last_provider["arcee"] = "arcee"
            return out, "arcee"
        except Exception as e:
            _last_provider.update(arcee_error=type(e).__name__, arcee_failed_at=time.time())
    if openai_enabled():
        try:
            out = _complete(_client(None, env("OPENAI_API_KEY")), env("OPENAI_MODEL", "gpt-4o-mini"), system, user)
            _last_provider[provider] = "openai"
            return out, "openai"
        except Exception:
            pass
    _last_provider[provider] = "template"
    return fallback, "template"


def chat_json(system: str, user: str, fallback: dict[str, Any], *, provider: str = "openai") -> tuple[dict[str, Any], str]:
    """Return (parsed_json, mode). mode is 'real' only if the requested provider itself answered."""
    out, by = chat_json_ex(system, user, fallback, provider=provider)
    return out, "real" if by == provider else "mock"


def last_provider(provider: str = "arcee") -> str:
    """Which provider answered the most recent chat_json(provider=...) call."""
    return str(_last_provider.get(provider, "template"))


def ping_arcee(timeout: float = 3.0) -> tuple[bool, str]:
    """Cheap reachability/auth check: GET {base}/models."""
    if not arcee_configured():
        return False, "USE_ARCEE off or ARCEE_API_KEY missing"
    import httpx

    base, key, model = _arcee_target()
    try:
        r = httpx.get(f"{base.rstrip('/')}/models", headers={"Authorization": f"Bearer {key}"}, timeout=timeout)
        r.raise_for_status()
        _last_provider["arcee_failed_at"] = 0.0
        return True, f"Arcee reachable at {base} (model {model})"
    except Exception as e:
        _last_provider["arcee_failed_at"] = time.time()
        return False, f"Arcee unreachable: {type(e).__name__}"
