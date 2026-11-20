"""Market data access: SingleStore when enabled (SINGLESTORE_URL), else SQLite at data/market.db.

REAL: `singlestoredb.connect(url)` (https://singlestoredb-python.labs.singlestore.com/getting-started.html),
URL like `user:password@host:3306/envoy` (a `mysql://` or `singlestoredb://` prefix is accepted).
Any connection or query error falls back to SQLite and mode() reports "mock".
"""
from __future__ import annotations

import json
import re
import sqlite3
from pathlib import Path
from typing import Any

from services.common.config import ROOT, SEED, env, use_real

DB_PATH = ROOT / "data" / "market.db"
SCHEMA = Path(__file__).with_name("schema.sql")
CONNECT_TIMEOUT_S = 3
_mode = "mock"
_schema_ready = False


def _singlestore_url() -> str:
    url = env("SINGLESTORE_URL").strip()
    if not url or "user:pass@host" in url:
        raise RuntimeError("SINGLESTORE_URL not set")
    return re.sub(r"^(mysql|singlestoredb|singlestore)://", "", url)


def _connect_singlestore() -> Any:
    url = _singlestore_url()
    try:
        import singlestoredb  # type: ignore
    except ImportError:
        from urllib.parse import urlparse

        import pymysql  # type: ignore

        u = urlparse("mysql://" + url)
        return pymysql.connect(
            host=u.hostname, port=u.port or 3306, user=u.username, password=u.password,
            database=(u.path or "/").lstrip("/") or None, ssl={"ssl": {}}, connect_timeout=CONNECT_TIMEOUT_S,
        )
    return singlestoredb.connect(url, connect_timeout=CONNECT_TIMEOUT_S)


def _sqlite() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def get_conn() -> Any:
    global _mode
    if use_real("singlestore"):
        try:
            conn = _connect_singlestore()
            _mode = "real"
            return conn
        except Exception:
            pass  # fall back to SQLite so the demo never breaks
    _mode = "mock"
    return _sqlite()


def mode() -> str:
    return _mode


def placeholder(conn: Any) -> str:
    return "?" if isinstance(conn, sqlite3.Connection) else "%s"


def _schema_statements(if_not_exists: bool) -> list[str]:
    out = []
    for stmt in SCHEMA.read_text().split(";"):
        sql = "\n".join(ln for ln in stmt.splitlines() if not ln.strip().startswith("--")).strip()
        if not sql:
            continue
        if if_not_exists:
            if sql.upper().startswith("DROP"):
                continue
            sql = re.sub(r"^CREATE TABLE (?!IF NOT EXISTS)", "CREATE TABLE IF NOT EXISTS ", sql,
                         flags=re.IGNORECASE)
        out.append(sql)
    return out


def _seed_rows() -> dict[str, list[tuple]]:
    h = json.loads((SEED / "holdings.json").read_text())
    px = {p["symbol"]: p["price_usd"] for p in h["positions"]}
    return {
        "positions": [(p["account"], p["bank_id"], p["asset"], p["symbol"], p["quantity"], p["value_usd"])
                      for p in h["positions"]],
        "prices": [(s, v, h["as_of"]) for s, v in px.items()],
        "tax_lots": [(t["lot_id"], t["symbol"], t["acquired"], t["quantity"], t["cost_basis_usd"])
                     for t in h["tax_lots"]],
    }


def ensure_schema_and_seed(conn: Any | None = None) -> dict[str, Any]:
    """Idempotent: CREATE TABLE IF NOT EXISTS from schema.sql, then load holdings into any empty table."""
    own = conn is None
    conn = conn or get_conn()
    ph = placeholder(conn)
    loaded: dict[str, int] = {}
    try:
        cur = conn.cursor()
        for sql in _schema_statements(if_not_exists=True):
            cur.execute(sql)
        for table, rows in _seed_rows().items():
            cur.execute(f"SELECT COUNT(*) FROM {table}")
            if int(cur.fetchone()[0]) == 0 and rows:
                cur.executemany(f"INSERT INTO {table} VALUES ({','.join([ph] * len(rows[0]))})", rows)
                loaded[table] = len(rows)
        conn.commit()
    finally:
        if own:
            conn.close()
    return {"mode": "real" if not isinstance(conn, sqlite3.Connection) else "mock", "loaded": loaded}


def _rows(conn: Any, sql: str) -> list[dict]:
    cur = conn.cursor()
    cur.execute(sql)
    rows = cur.fetchall()
    if isinstance(conn, sqlite3.Connection):
        return [dict(r) for r in rows]
    cols = [d[0] for d in cur.description]
    return [dict(zip(cols, r)) if not isinstance(r, dict) else r for r in rows]


def _sqlite_ready(conn: sqlite3.Connection) -> bool:
    names = {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    return {"positions", "prices", "tax_lots"} <= names


def _query(sql: str) -> list[dict]:
    global _mode, _schema_ready
    if use_real("singlestore"):
        try:
            conn = get_conn()
            if _mode == "real":
                try:
                    if not _schema_ready:
                        ensure_schema_and_seed(conn)
                        _schema_ready = True
                    return _rows(conn, sql)
                finally:
                    conn.close()
            conn.close()
        except Exception:
            _mode = "mock"  # real query failed: answer from SQLite and say so
    _mode = "mock"
    conn = _sqlite()
    try:
        if not _sqlite_ready(conn):
            ensure_schema_and_seed(conn)
        return _rows(conn, sql)
    finally:
        conn.close()


def ping() -> tuple[bool, str]:
    """Connect + SELECT 1 against SingleStore (≤3s)."""
    if not use_real("singlestore"):
        return False, "USE_SINGLESTORE off"
    try:
        conn = _connect_singlestore()
        try:
            cur = conn.cursor()
            cur.execute("SELECT 1")
            cur.fetchall()
        finally:
            conn.close()
        return True, "SingleStore connected"
    except Exception as e:
        return False, f"SingleStore unreachable: {type(e).__name__}"


def positions() -> list[dict]:
    return _query("SELECT account, bank_id, asset, symbol, quantity, value_usd FROM positions")


def prices() -> list[dict]:
    return _query("SELECT symbol, price_usd, as_of FROM prices")


def tax_lots() -> list[dict]:
    return _query("SELECT lot_id, symbol, acquired, quantity, cost_basis_usd FROM tax_lots ORDER BY acquired")
