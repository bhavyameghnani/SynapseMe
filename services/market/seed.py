"""Seed market tables from data/seed/holdings.json. Run: python -m services.market.seed"""
from __future__ import annotations

import json
from pathlib import Path

from services.common.config import SEED
from services.market import db

SCHEMA = Path(__file__).with_name("schema.sql")


def seed() -> str:
    h = json.loads((SEED / "holdings.json").read_text())
    db.DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = db.get_conn()
    ph = db.placeholder(conn)
    cur = conn.cursor()
    for stmt in SCHEMA.read_text().split(";"):
        lines = [ln for ln in stmt.splitlines() if not ln.strip().startswith("--")]
        if "\n".join(lines).strip():
            cur.execute("\n".join(lines))
    cur.executemany(
        f"INSERT INTO positions VALUES ({','.join([ph] * 6)})",
        [(p["account"], p["bank_id"], p["asset"], p["symbol"], p["quantity"], p["value_usd"])
         for p in h["positions"]],
    )
    px = {p["symbol"]: p["price_usd"] for p in h["positions"]}
    cur.executemany(f"INSERT INTO prices VALUES ({ph},{ph},{ph})",
                    [(s, v, h["as_of"]) for s, v in px.items()])
    cur.executemany(
        f"INSERT INTO tax_lots VALUES ({','.join([ph] * 5)})",
        [(t["lot_id"], t["symbol"], t["acquired"], t["quantity"], t["cost_basis_usd"]) for t in h["tax_lots"]],
    )
    conn.commit()
    conn.close()
    return db.mode()


if __name__ == "__main__":
    m = seed()
    print(f"market seeded ({m}): {len(db.positions())} positions, {len(db.prices())} prices, "
          f"{len(db.tax_lots())} tax lots")
