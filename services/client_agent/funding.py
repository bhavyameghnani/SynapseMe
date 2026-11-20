"""True-cost calculator for the four ways to fund the $400k deposit (simulated, not tax advice)."""
from __future__ import annotations

from typing import Any

from services.common.portfolio import holdings
from services.common.seed import DEMO_TODAY, as_list, load_seed
from services.envoy import mandate

HORIZON_MONTHS = 12
INDICATIVE_RATE_BPS = 540  # Bank B rate sheet email (em_004); the RFQ sets the real price.


def _market() -> tuple[dict[str, int], dict[str, int], dict[str, int], str]:
    """(value by asset, value by symbol, cost basis by symbol, mode) from SingleStore/SQLite, else seed."""
    try:
        from services.market import db

        pos, lots = db.positions(), db.tax_lots()
        by_asset: dict[str, int] = {}
        by_sym: dict[str, int] = {}
        for p in pos:
            by_asset[p["asset"]] = by_asset.get(p["asset"], 0) + int(p["value_usd"])
            by_sym[p["symbol"]] = by_sym.get(p["symbol"], 0) + int(p["value_usd"])
        basis: dict[str, int] = {}
        for t in lots:
            basis[t["symbol"]] = basis.get(t["symbol"], 0) + int(t["cost_basis_usd"])
        return by_asset, by_sym, basis, db.mode()
    except Exception:
        h = holdings()
        by_asset = {k: int(v) for k, v in (h.get("totals_by_asset") or {}).items()}
        by_sym: dict[str, int] = {}
        for p in h.get("positions", []):
            by_sym[p["symbol"]] = by_sym.get(p["symbol"], 0) + int(p["value_usd"])
        basis: dict[str, int] = {}
        for t in h.get("tax_lots", []):
            basis[t["symbol"]] = basis.get(t["symbol"], 0) + int(t["cost_basis_usd"])
        return by_asset, by_sym, basis, "mock"


_seed_inbox: list[dict[str, Any]] | None = None  # classified once (SIE calls are not free)


def _inbox() -> list[dict[str, Any]]:
    """Classified inbox: live IMAP/Airbyte emails when the reader has any, else the seed inbox."""
    try:
        from services.client_agent import ingest_imap

        live = [e for e in ingest_imap.cached_emails() if not e.get("simulated")] if ingest_imap.enabled() else []
        if live:
            return live
    except Exception:
        pass
    global _seed_inbox
    if _seed_inbox is None:
        from services.client_agent import fraud_check

        _seed_inbox = [{**fraud_check.classify_seed_email(e), "source": "seed"}
                       for e in as_list(load_seed("emails.json", []), "emails")]
    return _seed_inbox


def _uri(e: dict[str, Any]) -> str:
    return f"email://{e['uid']}" if e.get("source", "seed") == "seed" else f"{e['source']}://inbox/{e['uid']}"


def context_facts() -> dict[str, list[dict[str, Any]]]:
    """Email/listing facts the agent may MENTION next to each option. They never set amounts, payees or actions."""
    def fact(text: str, uri: str, trust: str, kind: str) -> dict[str, Any]:
        return {"fact": text, "source_uri": uri, "trust": trust, "kind": kind, "can_instruct": False,
                "mention_only": True}

    general: list[dict[str, Any]] = []
    sale: list[dict[str, Any]] = []
    lst = load_seed("listing.json", {}) or {}
    if lst.get("deposit_due"):
        general.append(fact(f"Listing: ${int(lst.get('deposit_usd', 0)):,} deposit due {lst['deposit_due']}",
                            lst.get("source_uri", "listing://"), lst.get("trust", "claimed"), "deadline"))
    # Untrusted (lookalike / hidden-instruction) email is never used, even as context.
    for e in (x for x in _inbox() if x.get("trust") != "untrusted" and not x.get("flag")):
        text = f"{e.get('subject', '')} {e.get('body', '')}".lower()
        if "deposit" in text and e.get("extracted", {}).get("deadlines") and e.get("verified_payee") \
                and e["from_addr"] == e["verified_payee"].get("email"):
            general.append(fact(f"Verified escrow ({e['from_addr']}): deposit due "
                                f"{e['extracted']['deadlines'][0]}", _uri(e), e["trust"], "deadline"))
        if "cost-basis" in text or "cost basis" in text:
            sale.append(fact(f"{e.get('from_name') or e['from_addr']} asked for cost-basis lots: "
                             f"\"{e.get('subject', '')}\"", _uri(e), e["trust"], "request"))
    h = holdings()
    bl = h.get("blackout") or {}
    rsu = [fact(f"Company stock is in a trading blackout until {bl.get('until')}", "file://data/seed/holdings.json",
                "verified", "constraint")] if bl.get("until") else []
    return {"general": general[:3], "sale": sale[:2], "rsu": rsu}


def deposit_usd() -> int:
    return int((load_seed("listing.json", {}) or {}).get("deposit_usd", 400000))


def options(today: str = DEMO_TODAY) -> tuple[list[dict[str, Any]], str]:
    h = holdings()
    by_asset, by_sym, basis, mode = _market()
    need = deposit_usd()
    tax = h.get("tax_assumptions") or {}
    rate_pct = float(tax.get("ltcg_fed_pct", 15.0)) + float(tax.get("state_pct", 0.8))
    ctx = {"today": today, "asset_values": by_asset}
    out: list[dict[str, Any]] = []

    # 1. Sell RSUs (company stock): blocked by blackout.
    d = mandate.evaluate({"type": "sell", "asset": "COMPANY_STOCK", "amount_usd": need, "date": today}, ctx)
    out.append({"id": "sell_rsus", "label": "Sell company stock (RSUs)", "amount_usd": need,
                "true_cost_usd": 0, "cost_breakdown": {}, "status": "blocked" if d.result == "deny" else "viable",
                "rule": d.rule, "reason": d.reason})

    # 2. Sell the whole index fund: ~$60k tax on the embedded gain and raises concentration.
    fund_val, fund_basis = by_sym.get("IDX500", by_asset.get("INDEX_FUND", 900000)), basis.get("IDX500", 520000)
    gain = max(0, fund_val - fund_basis)
    tax_usd = round(gain * rate_pct / 100)
    d = mandate.evaluate({"type": "sell", "asset": "INDEX_FUND", "amount_usd": fund_val,
                          "proceeds_out_usd": need, "date": today}, ctx)
    out.append({"id": "sell_index_fund", "label": "Sell the index fund", "amount_usd": fund_val,
                "true_cost_usd": tax_usd,
                "cost_breakdown": {"realized_gain_usd": gain, "est_tax_usd": tax_usd},
                "status": "rejected" if d.result == "deny" else "viable", "rule": d.rule,
                "reason": f"About ${tax_usd:,} simulated tax on a ${gain:,} gain at {rate_pct:.1f}%. {d.reason}"})

    # 3. Use cash (+ T-bills): lost yield over the horizon, drains liquidity.
    cash = by_asset.get("CASH", 0)
    tbills = by_asset.get("TREASURIES", 0)
    apys = [int(p.get("apy_bps", 0)) for p in h.get("positions", []) if p.get("asset") == "CASH"]
    apy_bps = round(sum(apys) / len(apys)) if apys else 420
    lost = round(need * apy_bps / 10000 * HORIZON_MONTHS / 12)
    liquid_left = cash + tbills - need
    out.append({"id": "use_cash", "label": "Pay from cash", "amount_usd": need, "true_cost_usd": lost,
                "cost_breakdown": {"lost_yield_usd": lost, "liquid_left_usd": liquid_left},
                "status": "viable", "rule": None,
                "reason": f"Possible, but uses all ${cash:,} of cash plus T-bills, leaving ${liquid_left:,} liquid; "
                          f"loses about ${lost:,} of yield ({apy_bps / 100:.2f}% APY) over {HORIZON_MONTHS} months."})

    # 4. Borrow against the portfolio: interest minus the cash yield kept; priced by RFQ.
    interest = round(need * INDICATIVE_RATE_BPS / 10000 * HORIZON_MONTHS / 12)
    out.append({"id": "borrow", "label": "Borrow against the portfolio", "amount_usd": need,
                "true_cost_usd": interest - lost,
                "cost_breakdown": {"est_interest_usd": interest, "kept_cash_yield_usd": -lost},
                "status": "rfq", "rule": None,
                "reason": f"No sale, no tax, concentration unchanged. Indicative {INDICATIVE_RATE_BPS / 100:.2f}% "
                          f"costs ~${interest:,} interest, minus ${lost:,} yield kept on cash. Send to RFQ for "
                          "competing quotes."})
    facts = context_facts()
    per = {"sell_rsus": facts["rsu"] + facts["sale"], "sell_index_fund": facts["sale"], "use_cash": [], "borrow": []}
    for o in out:
        o["context"] = facts["general"] + per.get(o["id"], [])
    return out, mode
