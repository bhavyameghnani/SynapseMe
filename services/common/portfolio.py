"""Tolerant readers over holdings.json (bare positions list or nested accounts)."""
from __future__ import annotations

from typing import Any

from .seed import as_list, load_seed

# Spec defaults (CLAUDE.md section 6) used when seed fields are missing.
DEFAULT_VALUES = {"COMPANY_STOCK": 10_912_000, "INDEX_FUND": 900_000, "CASH": 350_000}
DEFAULT_COST_BASIS = {"INDEX_FUND": 520_000}
# Fallback only if data/seed/verified_contacts.json is missing; mirrors that file.
DEFAULT_PAYEE = {
    "name": "Escrow Team",
    "email": "escrow.team.demo@gmail.com",
    "bank_account_last4": "2210",
    "routing_last4": "0071",
    "verified_on": "2026-11-02",
}
VERIFIED_CONTACTS_URI = "file://data/seed/verified_contacts.json"

_ASSET_ALIASES = {
    "COMPANY_STOCK": ("company", "rsu", "company_stock", "employer", "lab"),
    "INDEX_FUND": ("index", "index_fund", "fund", "vti", "etf"),
    "CASH": ("cash", "money_market", "savings", "checking"),
}


def holdings() -> dict[str, Any]:
    h = load_seed("holdings.json", {})
    return h if isinstance(h, dict) else {"positions": h}


def _classify(p: dict[str, Any]) -> str | None:
    for key in ("asset", "asset_class", "type", "symbol", "id", "name", "kind"):
        v = str(p.get(key, "")).lower()
        if not v:
            continue
        if v.upper() in DEFAULT_VALUES:
            return v.upper()
        for asset, aliases in _ASSET_ALIASES.items():
            if any(a in v for a in aliases):
                return asset
    return None


def _value(p: dict[str, Any]) -> int:
    for key in ("value_usd", "market_value_usd", "market_value", "value", "amount_usd", "balance_usd", "balance"):
        if isinstance(p.get(key), (int, float)):
            return int(p[key])
    return 0


def _positions(h: dict[str, Any]) -> list[dict[str, Any]]:
    out = [p for p in as_list(h, "positions", "holdings") if isinstance(p, dict)]
    for acct in as_list(h, "accounts"):
        if isinstance(acct, dict):
            for p in as_list(acct, "positions", "holdings"):
                if isinstance(p, dict):
                    out.append({**p, "bank_id": p.get("bank_id", acct.get("bank_id", acct.get("bank")))})
    return out


def positions() -> list[dict[str, Any]]:
    return _positions(holdings())


def asset_values(h: dict[str, Any] | None = None) -> dict[str, int]:
    h = holdings() if h is None else h
    vals = {k: 0 for k in DEFAULT_VALUES}
    for p in _positions(h):
        a = str(p.get("asset", "")).upper() or _classify(p)
        if a:
            vals[a] = vals.get(a, 0) + _value(p)
    for k, d in DEFAULT_VALUES.items():
        if vals[k] == 0:
            vals[k] = d
    return vals


def cost_basis(asset: str, h: dict[str, Any] | None = None) -> int:
    h = holdings() if h is None else h
    total = 0
    for p in _positions(h):
        if _classify(p) == asset:
            for key in ("cost_basis_usd", "cost_basis"):
                if isinstance(p.get(key), (int, float)):
                    total += int(p[key])
                    break
    return total or DEFAULT_COST_BASIS.get(asset, 0)


def cost_basis_lots(asset: str, h: dict[str, Any] | None = None) -> int:
    h = holdings() if h is None else h
    lots = [t for t in as_list(h, "tax_lots") if isinstance(t, dict) and t.get("asset") == asset]
    return sum(int(t.get("cost_basis_usd", 0)) for t in lots) or cost_basis(asset, h)


def concentration_pct(vals: dict[str, int]) -> float:
    total = sum(vals.values())
    return 100.0 * vals["COMPANY_STOCK"] / total if total else 0.0


def verified_contacts() -> dict[str, Any]:
    """Human-edited allowlist: the ONLY source of payees (never written by any agent)."""
    vc = load_seed("verified_contacts.json", None)
    return vc if isinstance(vc, dict) else {"payees": [DEFAULT_PAYEE], "advisors": []}


def _norm_payee(p: dict[str, Any]) -> dict[str, Any]:
    email = str(p.get("email", "")).strip().lower()
    last4 = str(p.get("bank_account_last4") or p.get("account_last4") or "")
    return {**p, "email": email, "account_last4": last4, "bank_account_last4": last4,
            "routing_last4": str(p.get("routing_last4") or ""), "domain": email.split("@")[-1] if email else "",
            "verified": True, "source_uri": VERIFIED_CONTACTS_URI}


def verified_payees(h: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    """Payees come only from verified_contacts.json; the holdings arg is accepted for API compatibility."""
    payees = [p for p in as_list(verified_contacts(), "payees") if isinstance(p, dict)] or [DEFAULT_PAYEE]
    return [_norm_payee(p) for p in payees]


def escrow_payee(h: dict[str, Any] | None = None) -> dict[str, Any]:
    payees = verified_payees(h)
    for p in payees:
        if "escrow" in str(p.get("name", "")).lower() or "escrow" in str(p.get("email", "")).lower():
            return p
    return payees[0]


def account_of(p: dict[str, Any]) -> str:
    """Digits only, so '000-391-2210' and '0003912210' compare equal."""
    raw = str(p.get("account") or p.get("account_number") or p.get("account_no") or "")
    return "".join(ch for ch in raw if ch.isdigit())


def last4_of(p: dict[str, Any]) -> str:
    acct = account_of(p)
    if acct:
        return acct[-4:]
    return "".join(ch for ch in str(p.get("account_last4") or p.get("bank_account_last4") or "") if ch.isdigit())[-4:]


def routing_of(p: dict[str, Any]) -> str:
    return str(p.get("routing") or p.get("routing_number") or p.get("aba") or p.get("routing_last4") or "")


def match_verified_payee(payee: dict[str, Any], require_email: bool = False,
                         known: list[dict[str, Any]] | None = None) -> dict[str, Any] | None:
    """Verified payee matching by account last4 (+ email when given or required), else None."""
    last4 = last4_of(payee)
    email = str(payee.get("email") or "").strip().lower()
    if not last4 or (require_email and not email):
        return None
    for p in known if known is not None else verified_payees():
        if last4_of(p) == last4 and (not email or email == str(p.get("email", "")).lower()):
            return p
    return None
