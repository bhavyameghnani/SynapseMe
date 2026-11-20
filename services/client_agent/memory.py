"""Cognee long-term memory with provenance. Untrusted memories can never become instructions.

The local store is authoritative for the UI and for policy (can_instruct). REAL (USE_COGNEE=1 +
COGNEE_BASE_URL [+ COGNEE_API_KEY]) mirrors every memory into Cognee over its REST API
(https://docs.cognee.ai/api-reference/introduction):
  POST /api/v1/remember  multipart: raw_data[], datasetName, external_metadata (JSON), run_in_background
  POST /api/v1/recall    {query, datasets, search_type, top_k}
  POST /api/v1/forget    {dataset}
  GET  /api/v1/datasets  (key check)
Auth: `X-Api-Key` (Cognee Cloud, tenant URL https://<tenant>.aws.cognee.ai). Pushes are batched on one
background worker so remember() returns in microseconds; any failure flips mode() back to "mock".
"""
from __future__ import annotations

import hashlib
import json
import queue
import threading
import time
from typing import Any

import httpx

from services.common.config import env, use_real
from services.common.events import now_iso

DATASET = "emma"
TIMEOUT_S = 3.0
BATCH_WINDOW_S = 0.4
_store: dict[str, dict[str, Any]] = {}
_q: queue.Queue[tuple[str, Any]] = queue.Queue()
_state: dict[str, Any] = {"ping_ok": None, "ping_at": 0.0, "last_push_ok": True, "pushed": 0, "error": None,
                         "inflight": 0}
_worker: threading.Thread | None = None
_wlock = threading.Lock()


def _configured() -> bool:
    return use_real("cognee") and bool(env("COGNEE_BASE_URL"))


def _base() -> str:
    return env("COGNEE_BASE_URL").rstrip("/")


def _headers() -> dict[str, str]:
    h = {"X-Api-Key": env("COGNEE_API_KEY")} if env("COGNEE_API_KEY") else {}
    if env("COGNEE_TENANT_ID"):
        h["X-Tenant-Id"] = env("COGNEE_TENANT_ID")
    return h


def ping(timeout: float = TIMEOUT_S, force: bool = False) -> tuple[bool, str]:
    """GET /api/v1/datasets validates the URL + key without writing anything. Cached for 60s."""
    if not _configured():
        return False, "USE_COGNEE off or COGNEE_BASE_URL missing"
    if not force and _state["ping_ok"] is not None and time.time() - _state["ping_at"] < 60:
        return bool(_state["ping_ok"]), _state["error"] or "Cognee reachable"
    try:
        r = httpx.get(f"{_base()}/api/v1/datasets", headers=_headers(), follow_redirects=True, timeout=timeout)
        r.raise_for_status()
        _state.update(ping_ok=True, ping_at=time.time(), error=None)
        return True, "Cognee reachable"
    except Exception as e:
        _state.update(ping_ok=False, ping_at=time.time(), error=f"Cognee unreachable: {type(e).__name__}")
        return False, _state["error"]


def _tagged(mem: dict[str, Any]) -> str:
    # Provenance travels inside the text too, so a graph answer can never drop the trust label.
    return (f"[kind={mem['kind']} trust={mem['trust']} can_instruct={str(mem['can_instruct']).lower()} "
            f"source={mem['source_uri']} fetched_at={mem['fetched_at']}] {mem['text']}")


def _push_batch(mems: list[dict[str, Any]]) -> None:
    files: list[tuple[str, tuple[None, str]]] = [("raw_data", (None, _tagged(m))) for m in mems]
    meta = [{"memory_id": m["id"], "kind": m["kind"], "trust": m["trust"], "can_instruct": m["can_instruct"],
             "source_uri": m["source_uri"], "fetched_at": m["fetched_at"], **(m.get("meta") or {})} for m in mems]
    files += [("datasetName", (None, DATASET)), ("external_metadata", (None, json.dumps(meta, default=str))),
              ("node_set", (None, "envoy")), ("run_in_background", (None, "true")),
              ("self_improvement", (None, "false"))]
    r = httpx.post(f"{_base()}/api/v1/remember", headers=_headers(), follow_redirects=True, files=files, timeout=10.0)
    r.raise_for_status()


def _forget_remote() -> None:
    r = httpx.post(f"{_base()}/api/v1/forget", headers=_headers(), follow_redirects=True, json={"dataset": DATASET}, timeout=TIMEOUT_S)
    if r.status_code not in (200, 404):  # 404: dataset doesn't exist yet
        r.raise_for_status()


def _run() -> None:
    carry: tuple[str, Any] | None = None
    while True:
        op, payload = carry or _q.get()
        carry = None
        done = 1
        try:
            if _state["ping_ok"] is None:
                ping()
            if not _state["ping_ok"]:
                continue
            if op == "forget_all":
                _forget_remote()
            elif op == "remember":
                batch = [payload]
                deadline = time.time() + BATCH_WINDOW_S
                while time.time() < deadline:
                    try:
                        nop, np = _q.get(timeout=max(0.0, deadline - time.time()))
                    except queue.Empty:
                        break
                    if nop != "remember":
                        carry = (nop, np)  # handled next, preserving order
                        break
                    batch.append(np)
                done = len(batch)
                _push_batch(batch)
                _state["pushed"] += len(batch)
            _state.update(last_push_ok=True, error=None)
        except Exception as e:
            _state.update(last_push_ok=False, error=f"Cognee {op} failed: {type(e).__name__}")
        finally:
            with _wlock:
                _state["inflight"] -= done


def _enqueue(op: str, payload: Any) -> None:
    global _worker
    with _wlock:
        if _worker is None or not _worker.is_alive():
            _worker = threading.Thread(target=_run, daemon=True, name="cognee-sync")
            _worker.start()
        _state["inflight"] += 1
    _q.put((op, payload))


def remember(text: str, source_uri: str, trust: str, fetched_at: str | None = None,
             kind: str = "memory", meta: dict[str, Any] | None = None) -> dict[str, Any]:
    """kind: "memory" (default) or "observation" (facts seen in email). Returns the local Memory dict."""
    mid = "mem_" + hashlib.sha256(f"{source_uri}|{text}".encode()).hexdigest()[:10]
    mem: dict[str, Any] = {"id": mid, "text": text, "source_uri": source_uri, "trust": trust,
                           "fetched_at": fetched_at or now_iso(), "can_instruct": trust == "verified",
                           "kind": kind}
    if meta:
        mem["meta"] = meta
    _store[mid] = mem
    if _configured():
        _enqueue("remember", dict(mem))
    return mem


def recall(query: str = "", trust: str | None = None) -> list[dict[str, Any]]:
    q = query.lower()
    return [m for m in _store.values() if (not q or q in m["text"].lower()) and (not trust or m["trust"] == trust)]


def recall_remote(query: str, top_k: int = 5, search_type: str = "CHUNKS") -> list[dict[str, Any]]:
    """Semantic recall from Cognee. Results are context only: can_instruct is always False."""
    if not _configured():
        return []
    try:
        r = httpx.post(f"{_base()}/api/v1/recall", headers=_headers(), follow_redirects=True, timeout=TIMEOUT_S,
                       json={"query": query, "datasets": [DATASET], "search_type": search_type, "top_k": top_k})
        r.raise_for_status()
        data = r.json()
    except Exception:
        return []
    items = data if isinstance(data, list) else data.get("results", []) if isinstance(data, dict) else []
    out = []
    for it in items[:top_k]:
        text = it if isinstance(it, str) else (it.get("text") or it.get("search_result") or json.dumps(it, default=str))
        out.append({"text": str(text)[:1000], "source": "cognee", "can_instruct": False})
    return out


def forget(mid: str) -> bool:
    return _store.pop(mid, None) is not None


def all_memories() -> list[dict[str, Any]]:
    return list(_store.values())


def clear() -> None:
    _store.clear()
    if _configured():
        _enqueue("forget_all", None)


def flush(timeout: float = 5.0) -> bool:
    """Wait (bounded) for queued Cognee pushes; True if the queue drained."""
    end = time.time() + timeout
    while time.time() < end:
        if _state["inflight"] <= 0:
            return True
        time.sleep(0.05)
    return False


def status() -> dict[str, Any]:
    return {"configured": _configured(), **_state, "queued": _q.qsize()}


def mode() -> str:
    if not _configured():
        return "mock"
    if _state["ping_ok"] is None:
        ping()
    return "real" if _state["ping_ok"] and _state["last_push_ok"] else "mock"
