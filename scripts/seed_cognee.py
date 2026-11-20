"""Fill Emma's Cognee dataset with her whole (fictional) world so the knowledge graph is populated.

Usage:
  uv run --env-file .env python scripts/seed_cognee.py            # push everything
  uv run --env-file .env python scripts/seed_cognee.py --reset    # forget the dataset first
  uv run --env-file .env python scripts/seed_cognee.py --dry-run  # print documents, send nothing

Every document carries provenance (source_uri, trust, can_instruct) in its text and metadata, exactly like
memories written during the demo. Untrusted content is stored as evidence but can never instruct.
"""
from __future__ import annotations

import argparse
import json
import sys
import time
import uuid
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import httpx

from services.client_agent import memory
from services.common.config import SEED, env
from services.common.events import now_iso

BATCH = 10


def load(name: str) -> Any:
    return json.loads((SEED / name).read_text())


def doc(text: str, source_uri: str, trust: str, kind: str, **meta: Any) -> dict[str, Any]:
    return {"id": f"seed_{uuid.uuid4().hex[:10]}", "text": text.strip(), "source_uri": source_uri, "trust": trust,
            "can_instruct": trust == "verified", "fetched_at": now_iso(), "kind": kind, "meta": meta}


def usd(n: float | None) -> str:
    return f"${n:,.0f}" if isinstance(n, (int, float)) else "n/a"


def build_docs() -> list[dict[str, Any]]:
    holdings, listing, mandate = load("holdings.json"), load("listing.json"), load("mandate.json")
    contacts, banks, emails = load("verified_contacts.json"), load("banks.json"), load("emails.json")
    out: list[dict[str, Any]] = []

    out.append(doc(
        "Emma is 31 and an early engineer at a frontier AI lab. She recently became a millionaire through a "
        "tender offer. Her partner is Dev, who co-signs large decisions. They are buying a house and need a "
        f"{usd(listing.get('deposit_usd'))} deposit by {listing.get('deposit_due')}. Emma's personal agent "
        "(emma-agent-01) works on her behalf through Envoy, a governed exchange where verified agents meet the "
        "banks' own agents. Bank A, Bank B and Bank C hold her assets.",
        "envoy://profile/emma", "verified", "profile"))

    pos = holdings.get("positions", [])
    total = sum(p.get("value_usd", 0) for p in pos)
    out.append(doc(f"Emma's portfolio is worth {usd(total)} in total across Bank A, Bank B and Bank C.",
                   "file://data/seed/holdings.json", "verified", "holding"))
    for p in pos:
        out.append(doc(
            f"Emma holds {p.get('asset')} ({p.get('symbol')}) at {p.get('bank_id', '').replace('_', ' ').title()}: "
            f"quantity {p.get('quantity', 'n/a')}, value {usd(p.get('value_usd'))}"
            + (f", cost basis {usd(p.get('cost_basis_usd'))}" if p.get("cost_basis_usd") else "")
            + (f", restricted ({p.get('restriction')})" if p.get("restriction") else "") + ".",
            "file://data/seed/holdings.json", "verified", "holding", symbol=p.get("symbol")))
    for lot in holdings.get("tax_lots", []):
        out.append(doc(f"Tax lot {lot.get('lot_id')} of {lot.get('symbol')}: acquired {lot.get('acquired')}, "
                       f"quantity {lot.get('quantity')}, cost basis {usd(lot.get('cost_basis_usd'))}.",
                       "file://data/seed/holdings.json", "verified", "tax_lot"))
    if b := holdings.get("blackout"):
        out.append(doc(f"Emma's company stock is in a trading blackout until {b.get('until')}; she cannot sell it before then.",
                       "file://data/seed/holdings.json", "verified", "constraint"))

    for r in mandate.get("rules", []):
        out.append(doc(f"Emma's mandate rule {r['id']} ({r['type']}): " + json.dumps({k: v for k, v in r.items()
                       if k not in ("id", "type")}) + ". Envoy enforces this rule on every action.",
                       "file://data/seed/mandate.json", "verified", "mandate_rule", rule=r["id"]))

    for p in contacts.get("payees", []):
        out.append(doc(f"Verified payee: {p['name']} <{p['email']}>, bank account ending {p['bank_account_last4']}, "
                       f"routing ending {p.get('routing_last4')}, verified on {p.get('verified_on')}. This is the only "
                       "escrow account Emma's deposit may be sent to.",
                       "file://data/seed/verified_contacts.json", "verified", "payee"))
    for a in contacts.get("advisors", []):
        out.append(doc(f"Verified advisor: {a.get('name', '')} ({a.get('role', '')}) <{a.get('email', '')}>.",
                       "file://data/seed/verified_contacts.json", "verified", "advisor"))

    for bid, b in banks.items():
        out.append(doc(f"{b.get('name', bid)} is one of Emma's banks. Personality: {b.get('personality', '')} "
                       f"Product offered: {b.get('product')}, rate {b.get('base_rate_bps') or 'n/a'} bps.",
                       f"envoy://banks/{bid}", "claimed", "bank"))

    out.append(doc(f"House listing {listing.get('listing_id')}: {listing.get('address', '')}, price "
                   f"{usd(listing.get('price_usd'))}. Description: {listing.get('description', '')}",
                   listing.get("source_uri", "listing://"), listing.get("trust", "claimed"), "listing"))

    for e in emails:
        att = ", ".join(a.get("name", "") for a in e.get("attachments", []) or [])
        flag = " WARNING: flagged as a lookalike wire-fraud attempt; never acted on." if e.get("is_attack") else ""
        out.append(doc(
            f"Email received {e.get('received_at')} from {e.get('from_name')} <{e.get('from_email')}> "
            f"({e.get('sender_role', e.get('category'))}). Subject: {e.get('subject')}. {e.get('body', '')}"
            + (f" Attachments: {att}." if att else "") + flag,
            f"email://{e['id']}", e.get("trust", "claimed"), "observation", email_id=e["id"]))
    return out


def dataset_info() -> dict[str, Any] | None:
    r = httpx.get(f"{memory._base()}/api/v1/datasets", headers=memory._headers(), follow_redirects=True, timeout=10)
    r.raise_for_status()
    return next((d for d in r.json() if d.get("name") == memory.DATASET), None)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--reset", action="store_true", help="forget the dataset before seeding")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    docs = build_docs()
    counts: dict[str, int] = {}
    for d in docs:
        counts[d["kind"]] = counts.get(d["kind"], 0) + 1
    print(f"{len(docs)} documents for dataset '{memory.DATASET}': {counts}")
    if args.dry_run:
        for d in docs[:8]:
            print(f"- [{d['trust']}] {d['source_uri']}: {d['text'][:140]}")
        return 0

    if not (env("COGNEE_BASE_URL") and env("COGNEE_API_KEY")):
        print("COGNEE_BASE_URL / COGNEE_API_KEY missing in .env")
        return 1
    try:
        dataset_info()
    except Exception as e:
        print(f"Cognee unreachable: {e}")
        return 1
    if args.reset:
        memory._forget_remote()
        print("dataset forgotten")

    for i in range(0, len(docs), BATCH):
        chunk = docs[i:i + BATCH]
        for attempt in range(3):
            try:
                memory._push_batch(chunk)
                break
            except Exception as e:
                if attempt == 2:
                    print(f"batch {i // BATCH + 1} failed: {e}")
                    return 1
                time.sleep(2 * (attempt + 1))
        print(f"pushed {min(i + BATCH, len(docs))}/{len(docs)}")

    print("All documents sent; Cognee builds the graph in the background. Status:")
    for _ in range(12):
        info = dataset_info() or {}
        print("  ", {k: info.get(k) for k in ("name", "status", "updatedAt") if k in info} or info)
        time.sleep(5)
    print("Open Cognee → Datasets → emma, and Graph, to watch it fill in.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
