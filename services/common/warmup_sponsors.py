"""Pre-flight check for the real sponsor adapters. check_all() never raises; each check is bounded (~3s)
and they run in parallel. mode is the mode the adapter will actually use right now ("mock" if a real
call would fail), so it matches the honest mock dot in the UI.
"""
from __future__ import annotations

from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor
from concurrent.futures import TimeoutError as FutureTimeout

from services.common.config import env, mock_mode, openai_enabled, use_real

PER_CHECK_S = 3.5


def _persona() -> tuple[bool, str]:
    from services.envoy import kya

    return kya.ping()


def _cognee() -> tuple[bool, str]:
    from services.client_agent import memory

    return memory.ping(force=True)


def _guild() -> tuple[bool, str]:
    from services.envoy import guild_adapter

    return guild_adapter.ping(force=True)


def _singlestore() -> tuple[bool, str]:
    from services.market import db

    try:
        conn = db._connect_singlestore()
    except Exception as e:
        return False, f"SingleStore unreachable: {type(e).__name__}"
    try:
        res = db.ensure_schema_and_seed(conn)
        return True, f"SingleStore connected; schema ready; seeded {res['loaded'] or 'nothing (already loaded)'}"
    except Exception as e:
        return False, f"SingleStore schema/seed failed: {type(e).__name__}"
    finally:
        conn.close()


def _arcee() -> tuple[bool, str]:
    from services.common import llm

    return llm.ping_arcee()


def _openai() -> tuple[bool, str]:
    import httpx

    try:
        r = httpx.get("https://api.openai.com/v1/models", timeout=3.0,
                      headers={"Authorization": f"Bearer {env('OPENAI_API_KEY')}"})
        r.raise_for_status()
        return True, "OpenAI key accepted"
    except Exception as e:
        return False, f"OpenAI unreachable: {type(e).__name__}"


CHECKS: dict[str, tuple[Callable[[], bool], Callable[[], tuple[bool, str]]]] = {
    "persona": (lambda: use_real("persona"), _persona),
    "cognee": (lambda: use_real("cognee"), _cognee),
    "guild": (lambda: use_real("guild"), _guild),
    "singlestore": (lambda: use_real("singlestore"), _singlestore),
    "arcee": (lambda: use_real("arcee"), _arcee),
    "openai": (openai_enabled, _openai),
}


def _safe(fn: Callable[[], tuple[bool, str]]) -> tuple[bool, str]:
    try:
        ok, detail = fn()
        return bool(ok), str(detail)
    except Exception as e:
        return False, f"check crashed: {type(e).__name__}"


def check_all() -> list[dict]:
    """[{sponsor, mode: "real"|"mock", ok, detail}]. ok=True for mock-by-choice; False if real failed."""
    out: dict[str, dict] = {}
    wanted = {}
    for name, (enabled, fn) in CHECKS.items():
        try:
            on = enabled()
        except Exception:
            on = False
        if on:
            wanted[name] = fn
        else:
            why = "MOCK_MODE=1" if mock_mode() else "flag off / key missing"
            out[name] = {"sponsor": name, "mode": "mock", "ok": True, "detail": f"mock ({why})"}
    if wanted:
        pool = ThreadPoolExecutor(max_workers=len(wanted))
        futs = {name: pool.submit(_safe, fn) for name, fn in wanted.items()}
        for name, fut in futs.items():
            try:
                ok, detail = fut.result(timeout=PER_CHECK_S)
            except FutureTimeout:
                ok, detail = False, f"timed out after {PER_CHECK_S}s"
            except Exception as e:
                ok, detail = False, f"check crashed: {type(e).__name__}"
            out[name] = {"sponsor": name, "mode": "real" if ok else "mock", "ok": ok,
                         "detail": detail if ok else f"{detail}; falling back to mock"}
        pool.shutdown(wait=False, cancel_futures=True)
    return [out[k] for k in CHECKS]


if __name__ == "__main__":
    for row in check_all():
        print(f"{row['sponsor']:<12} {row['mode']:<5} {'ok ' if row['ok'] else 'ERR'} {row['detail']}")
