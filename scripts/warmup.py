"""Pre-demo check: Gmail IMAP login (read-only) + every sponsor adapter. Prints green/red with a clear reason.

    make warmup
"""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from services.common.config import env, mock_mode

GREEN, RED, GRAY, RESET = "\033[32m", "\033[31m", "\033[90m", "\033[0m"


def line(ok: bool | None, name: str, detail: str) -> None:
    mark = f"{GRAY}o{RESET}" if ok is None else (f"{GREEN}●{RESET}" if ok else f"{RED}●{RESET}")
    print(f"  {mark} {name:<14} {detail}")


def main() -> int:
    print(f"Envoy warmup  (MOCK_MODE={'1' if mock_mode() else '0'}, LIVE_MODE={env('LIVE_MODE') or '0'})")
    failures = 0
    from services.client_agent import ingest_imap

    ok, why = ingest_imap.check_login()
    if not ok and env("LIVE_MODE", "0") != "1":
        line(None, "Gmail IMAP", f"{why}  (LIVE_MODE=0: seed inbox + 'Simulate new email' are used)")
    else:
        line(ok, "Gmail IMAP", why)
        failures += 0 if ok else 1
    try:
        from services.common.warmup_sponsors import check_all  # type: ignore[import-not-found]
    except Exception as ex:
        line(None, "sponsors", f"services.common.warmup_sponsors not available ({ex.__class__.__name__})")
        return 1 if failures else 0
    try:
        rows = check_all()
    except Exception as ex:
        line(False, "sponsors", f"check_all() raised {ex.__class__.__name__}: {ex}")
        return 1
    for r in rows:
        line(bool(r.get("ok")), str(r.get("sponsor")), f"[{r.get('mode', '?')}] {r.get('detail', '')}")
        failures += 0 if r.get("ok") else 1
    print(f"{failures} problem(s)." if failures else "All green.")
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
