"""Guild control plane: credential policy (who may call which endpoint), session tokens, session trace.

Agents never hold bank credentials: envoy mints a short-lived, single-use, Ed25519-signed session token
scoped to one bank endpoint, and the bank verifies it against envoy's public key.

REAL (USE_GUILD=1 + GUILD_API_KEY): the local policy stays the enforcement source of truth; Guild's public
REST API (https://api.guild.ai/v1, spec https://docs.guild.ai/openapi.json) validates the key (GET /me) and
mirrors the credential policy and the session trace into the workspace as DRAFT workspace contexts
(POST /workspaces/{ws}/contexts). Guild has no public "check this policy" endpoint; its own credential
policies (https://docs.guild.ai/platform/credential-policies) apply to credentials it proxies.
"""
from __future__ import annotations

import fnmatch
import json
import secrets
import threading
import time
from typing import Any

import httpx
from nacl.encoding import HexEncoder
from nacl.exceptions import BadSignatureError
from nacl.signing import VerifyKey

from services.common.config import env, use_real
from services.common.events import now_iso
from services.common.seed import load_seed

DEFAULT_POLICY: dict[str, Any] = {
    "default": "deny",
    "rules": [
        {"caller": "client_agent", "allow": ["envoy:/rfq", "envoy:/approve", "envoy:/kya/verify"],
         "deny": ["bank_*:*"]},
        {"caller": "envoy", "allow": ["bank_*:/quote", "bank_*:/health"], "deny": ["bank_*:/execute"]},
        {"caller": "bank_*", "allow": ["bank_*:/execute", "bank_*:/quote"]},
        {"caller": "rogue_agent", "allow": [], "deny": ["*"]},
    ],
}
GUILD_API = "https://api.guild.ai/v1"
TIMEOUT_S = 3.0
_real: dict[str, Any] = {"checked_at": 0.0, "ok": False, "detail": "", "policy_pushed": False,
                         "last_push_ok": True, "context_ids": []}
_lock = threading.Lock()
TOKEN_TTL_S = int((load_seed("guild_policy.json", {}) or {}).get("credentials", {}).get("token_ttl_seconds", 300))
_trace: list[dict[str, Any]] = []
_used_nonces: set[str] = set()


def load_policy() -> dict[str, Any]:
    p = load_seed("guild_policy.json", None)
    ok = isinstance(p, dict) and (p.get("rules") or p.get("policies") or p.get("principals"))
    return p if ok else DEFAULT_POLICY


def _rules(policy: dict[str, Any]) -> list[dict[str, Any]]:
    if isinstance(policy.get("principals"), dict):
        return [{"caller": k, **v} for k, v in policy["principals"].items() if isinstance(v, dict)]
    return policy.get("rules") or policy.get("policies") or []


def _as_list(v: Any) -> list[str]:
    if v is None:
        return []
    return [v] if isinstance(v, str) else [str(x) for x in v]


def _match(patterns: list[str], value: str) -> str | None:
    return next((p for p in patterns if fnmatch.fnmatch(value, p)), None)


def trace(caller: str, endpoint: str, allowed: bool, reason: str) -> None:
    _trace.append({"ts": now_iso(), "caller": caller, "endpoint": endpoint, "allowed": allowed, "reason": reason,
                   "mode": mode()})


def get_trace() -> list[dict[str, Any]]:
    return list(_trace)


def reset_trace() -> None:
    _trace.clear()


def mode() -> str:
    return "real" if use_real("guild") and _guild_real_available() else "mock"


def _api() -> str:
    return (env("GUILD_API_URL") or GUILD_API).rstrip("/")


def _headers() -> dict[str, str]:
    # Account API key as one Bearer token "<key id>:<secret>" (docs: api-reference/introduction#authentication).
    return {"Authorization": f"Bearer {env('GUILD_API_KEY')}", "Accept": "application/json"}


def ping(timeout: float = TIMEOUT_S, force: bool = False) -> tuple[bool, str]:
    """GET /me (+ GET /workspaces/{ws} when GUILD_WORKSPACE is set). Cached for 60s."""
    if not (use_real("guild") and env("GUILD_API_KEY")):
        return False, "USE_GUILD off or GUILD_API_KEY missing"
    with _lock:
        if not force and time.time() - _real["checked_at"] < 60:
            return _real["ok"], _real["detail"]
    try:
        r = httpx.get(f"{_api()}/me", headers=_headers(), timeout=timeout)
        r.raise_for_status()
        detail = "Guild API key accepted"
        if env("GUILD_WORKSPACE"):
            w = httpx.get(f"{_api()}/workspaces/{env('GUILD_WORKSPACE')}", headers=_headers(), timeout=timeout)
            w.raise_for_status()
            detail += f"; workspace {env('GUILD_WORKSPACE')} reachable"
        ok = True
    except Exception as e:
        ok, detail = False, f"Guild unreachable/rejected: {type(e).__name__}"
    with _lock:
        _real.update(checked_at=time.time(), ok=ok, detail=detail)
    return ok, detail


def _guild_real_available() -> bool:
    ok, _ = ping()
    return ok and _real["last_push_ok"]


def _push_context(markdown: str, summary: str) -> str | None:
    """Mirror a record into the Guild workspace as a DRAFT context (never auto-fed to other agents)."""
    ws = env("GUILD_WORKSPACE")
    if not ws or not _guild_real_available():
        return None
    try:
        r = httpx.post(f"{_api()}/workspaces/{ws}/contexts", headers=_headers(), timeout=TIMEOUT_S,
                       json={"status": "DRAFT", "context": markdown, "summary": summary[:200]})
        r.raise_for_status()
        cid = str((r.json() or {}).get("id") or "")
        with _lock:
            _real["last_push_ok"] = True
            _real["context_ids"].append(cid)
        return cid or "ok"
    except Exception:
        with _lock:
            _real["last_push_ok"] = False
        return None


def _in_background(fn: Any, *args: Any) -> None:
    threading.Thread(target=fn, args=args, daemon=True).start()


def publish_policy() -> str | None:
    """Mirror the local credential policy into Guild once per process."""
    if _real["policy_pushed"]:
        return None
    _real["policy_pushed"] = True
    md = "# Envoy credential policy (source of truth: envoy)\n\n```json\n" + json.dumps(
        load_policy(), indent=2) + "\n```\n"
    return _push_context(md, "Envoy credential policy: client_agent never calls bank endpoints directly")


def export_trace() -> str | None:
    """Mirror the current session trace into Guild; returns the context id (or None in mock / on error)."""
    rows = get_trace()
    if not rows:
        return None
    md = "# Envoy session trace\n\n| ts | caller | endpoint | allowed | reason |\n|---|---|---|---|---|\n" + "".join(
        f"| {t['ts']} | {t['caller']} | {t['endpoint']} | {t['allowed']} | {t['reason']} |\n" for t in rows)
    return _push_context(md, f"Envoy session trace ({len(rows)} decisions)")


def real_status() -> dict[str, Any]:
    return {k: v for k, v in _real.items()}


def authorize(caller: str, endpoint: str) -> tuple[bool, str]:
    """e.g. ("client_agent", "bank_b:/execute") -> (False, reason). Deny patterns win over allow."""
    if use_real("guild") and not _real["policy_pushed"] and env("GUILD_API_KEY"):
        _in_background(publish_policy)
    policy = load_policy()
    for rule in _rules(policy):
        if not fnmatch.fnmatch(caller, str(rule.get("caller") or rule.get("agent") or "")):
            continue
        hit = _match(_as_list(rule.get("deny")), endpoint)
        if hit:
            reason = f"Guild policy: {caller} is denied {endpoint} (pattern '{hit}')."
            trace(caller, endpoint, False, reason)
            return False, reason
        hit = _match(_as_list(rule.get("allow")), endpoint)
        if hit:
            reason = f"Guild policy: {caller} may call {endpoint} (pattern '{hit}')."
            trace(caller, endpoint, True, reason)
            return True, reason
    reason = f"Guild policy: no rule lets {caller} call {endpoint} (default deny)."
    trace(caller, endpoint, False, reason)
    return False, reason


def _pubkey_hex() -> str:
    from services.envoy import ledger

    return ledger.public_key_hex()


def issue_session_token(bank_id: str, endpoint: str = "/execute", caller: str = "envoy") -> str:
    from services.envoy import ledger

    payload = {"iss": "envoy", "sub": caller, "aud": f"{bank_id}:{endpoint}",
               "exp": int(time.time()) + TOKEN_TTL_S, "nonce": secrets.token_hex(8)}
    body = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    token = f"gst.{body.encode().hex()}.{ledger.sign(body)}"
    trace(caller, f"{bank_id}:{endpoint}", True, f"Guild issued a single-use session token for {bank_id}{endpoint}.")
    if use_real("guild") and env("GUILD_API_KEY"):
        _in_background(export_trace)  # mirror the trace at the moment money can move
    return token


def check_token(token: str | None, bank_id: str, endpoint: str = "/execute", consume: bool = True) -> tuple[bool, str]:
    if not token or not token.startswith("gst."):
        return False, "Missing Guild session token: agents never hold bank credentials."
    try:
        _, body_hex, sig = token.split(".")
        body = bytes.fromhex(body_hex).decode()
        VerifyKey(_pubkey_hex(), encoder=HexEncoder).verify(body.encode(), bytes.fromhex(sig))
        payload = json.loads(body)
    except (ValueError, BadSignatureError):
        return False, "Guild session token signature is invalid."
    if payload.get("aud") != f"{bank_id}:{endpoint}":
        return False, f"Guild token is scoped to {payload.get('aud')}, not {bank_id}:{endpoint}."
    if payload.get("exp", 0) < time.time():
        return False, "Guild session token expired."
    if payload["nonce"] in _used_nonces:
        return False, "Guild session token already used (single-use)."
    if consume:
        _used_nonces.add(payload["nonce"])
    return True, f"Valid single-use Guild token for {bank_id}:{endpoint}."
