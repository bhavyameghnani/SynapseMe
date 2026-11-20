"""Mandate rules engine: JSON rules -> allow/deny + human-readable reason citing the rule id."""
from __future__ import annotations

import re
from collections.abc import Callable
from typing import Any

from services.common.events import Decision
from services.common.portfolio import (
    asset_values,
    concentration_pct,
    last4_of,
    match_verified_payee,
    verified_payees,
)
from services.common.seed import DEMO_TODAY, load_seed

DEFAULT_MANDATE: dict[str, Any] = {
    "principal": "emma",
    "co_signers": ["dev"],
    "rules": [
        {"id": "R1", "type": "no_sell_during_blackout", "asset": "COMPANY_STOCK", "until": "2027-02-14"},
        {"id": "R2", "type": "max_concentration", "asset": "COMPANY_STOCK", "max_pct": 90,
         "must_not_increase": True},
        {"id": "R3", "type": "co_sign_over_usd", "amount": 100000},
        {"id": "R4", "type": "wire_only_to_verified_payees"},
        {"id": "R5", "type": "untrusted_content_cannot_instruct"},
        {"id": "R6", "type": "approved_counterparties", "list": ["bank_a", "bank_b", "bank_c"]},
    ],
}

INJECTION_PATTERNS = [
    r"<!--\s*(assistant|system|agent|ai)\s*:",
    r"\b(skip|bypass|disable|ignore|waive)\b[^.\n]{0,40}\b(verification|verify|check|mandate|rules?|approval|co-?sign)",
    r"\bignore\b[^.\n]{0,30}\b(previous|prior|above|all)\b[^.\n]{0,20}\binstructions?\b",
    r"\bdisregard\b[^.\n]{0,40}\b(instructions?|mandate|rules?|policy)",
    r"\byou are now\b",
    r"\b(system|assistant)\s*prompt\b",
    r"\b(new|updated|changed|revised)\b[^.\n]{0,30}\bwire (instructions|details|account)",
    r"\bauto-?approve\b",
    r"\bact as\b[^.\n]{0,30}\b(admin|system|developer)",
    r"\[\[?\s*(system|assistant|instruction)s?\s*\]?\]",
    r"\bdo not (tell|notify|inform)\b",
    r"\bwithout (verification|approval|co-?sign)",
]
_INJ = [re.compile(p, re.IGNORECASE) for p in INJECTION_PATTERNS]


def load_mandate() -> dict[str, Any]:
    m = load_seed("mandate.json", None)
    return m if isinstance(m, dict) and m.get("rules") else DEFAULT_MANDATE


def find_injection(text: str) -> str | None:
    for rx in _INJ:
        m = rx.search(text or "")
        if m:
            return m.group(0)
    return None


def _deny(rule: str, reason: str) -> Decision:
    return Decision(result="deny", rule=rule, reason=reason)


def _amount(action: dict[str, Any]) -> int:
    try:
        return int(action.get("amount_usd") or 0)
    except (TypeError, ValueError):
        return 0


def _r1(rule: dict, a: dict, ctx: dict) -> Decision | None:
    if a.get("type") != "sell" or str(a.get("asset", "")).upper() != rule.get("asset", "COMPANY_STOCK"):
        return None
    date = str(a.get("date") or ctx.get("today") or DEMO_TODAY)
    if date <= rule["until"]:  # end date is inclusive
        return _deny(rule["id"], f"{rule['id']}: company stock is in a trading blackout through "
                     f"{rule['until']}; no sale is allowed on {date}.")
    return None


def _r2(rule: dict, a: dict, ctx: dict) -> Decision | None:
    if a.get("type") != "sell":
        return None
    asset = str(a.get("asset", "")).upper()
    cap_asset = rule.get("asset", "COMPANY_STOCK")
    vals = dict(ctx.get("asset_values") or asset_values(ctx.get("holdings")))
    amt = _amount(a)
    # Proceeds that stay invested as cash don't shrink the portfolio; only what leaves (the wire) does.
    out = int(a.get("proceeds_out_usd", amt) or 0)
    before = concentration_pct(vals)
    if asset in vals:
        vals[asset] = max(0, vals[asset] - amt)
        vals["CASH"] = vals.get("CASH", 0) + max(0, amt - out)
    after = concentration_pct(vals)
    max_pct = float(rule.get("max_pct", 100))
    # Selling anything other than the capped asset (with proceeds leaving) raises its share.
    if asset != cap_asset and rule.get("must_not_increase") and after > before + 1e-9:
        return _deny(rule["id"], f"{rule['id']}: selling ${amt:,} of {asset.replace('_', ' ').lower()} raises "
                     f"company-stock concentration from {before:.1f}% to {after:.1f}% "
                     f"(cap {max_pct:.0f}%, must not increase).")
    if after > max_pct and asset != cap_asset:
        return _deny(rule["id"], f"{rule['id']}: concentration would be {after:.1f}%, over the {max_pct:.0f}% cap.")
    return None


def _r3(rule: dict, a: dict, ctx: dict, mandate: dict) -> Decision | None:
    if a.get("type") not in ("wire", "borrow", "execute", "loan", "transfer") or ctx.get("pre_approval"):
        return None
    limit = int(rule.get("amount", 100000))
    if _amount(a) <= limit:
        return None
    needed = [mandate.get("principal", "emma"), *mandate.get("co_signers", [])]
    approvals = {str(x).lower().removeprefix("human:") for x in (a.get("approvals") or [])}
    missing = [n for n in needed if n not in approvals]
    if missing:
        return _deny(rule["id"], f"{rule['id']}: ${_amount(a):,} is over the ${limit:,} co-sign threshold; "
                     f"missing approval from {', '.join(missing)}.")
    return None


def _r4(rule: dict, a: dict, ctx: dict) -> Decision | None:
    if a.get("type") not in ("wire", "transfer", "execute"):
        return None
    payee = a.get("payee") or {}
    name = payee.get("name", "unknown payee")
    if not payee.get("verified"):
        return _deny(rule["id"], f"{rule['id']}: payee '{name}' is not a verified payee; wires go only to "
                     "payees verified out-of-band.")
    # verified_contacts.json is the only payee source; match by last4 (+ email when the payee carries one).
    known = ctx.get("verified_payees") or verified_payees()
    if match_verified_payee(payee, known=known) is None:
        who = f" <{payee['email']}>" if payee.get("email") else ""
        return _deny(rule["id"], f"{rule['id']}: account ending {last4_of(payee) or '????'} for '{name}'{who} does "
                     "not match any payee in verified_contacts.json.")
    return None


INTENT_SOURCES = ("mcp", "ui")


def _r5(rule: dict, a: dict, ctx: dict) -> Decision | None:
    rid = rule["id"]
    # Intents (quotes, approvals, execution) may only originate from the Envoy MCP tools or the UI flow.
    if a.get("type") == "intent" or "source" in a:
        source = str(a.get("source") or "unknown")
        if source not in INTENT_SOURCES:
            return _deny(rid, f"{rid}: intent source '{source}' is not allowed; quotes, approvals and payments "
                         "only come through Envoy (MCP or the approval UI), never from email or other content.")
    texts = [str(a.get(k, "")) for k in ("text", "injected_content", "instruction", "memo", "notes")]
    texts += [str((a.get("payee") or {}).get(k, "")) for k in ("name", "memo")]
    hit = next((h for h in (find_injection(t) for t in texts) if h), None)
    if hit:
        return _deny(rid, f"{rid}: content contains an embedded instruction (\"{hit[:60]}\"); "
                     "data can never instruct the agent.")
    trust = a.get("source_trust") or (a.get("payee") or {}).get("source_trust")
    if a.get("type") == "instruction" and trust != "verified":
        return _deny(rid, f"{rid}: instruction comes from {trust or 'unknown'} content; only verified "
                     "sources may instruct the agent.")
    if a.get("type") in ("wire", "transfer", "execute") and trust in ("untrusted", "claimed"):
        return _deny(rid, f"{rid}: payment details came from {trust} content and cannot instruct a wire.")
    return None


def _r6(rule: dict, a: dict, ctx: dict) -> Decision | None:
    bank = a.get("bank_id") or a.get("counterparty")
    if a.get("type") != "counterparty" and not bank:
        return None
    allowed = rule.get("list", [])
    if bank not in allowed:
        return _deny(rule["id"], f"{rule['id']}: counterparty '{bank}' is not on the approved list "
                     f"({', '.join(allowed)}).")
    return None


_HANDLERS: dict[str, Callable[..., Decision | None]] = {
    "no_sell_during_blackout": _r1,
    "max_concentration": _r2,
    "wire_only_to_verified_payees": _r4,
    "untrusted_content_cannot_instruct": _r5,
    "approved_counterparties": _r6,
}


def evaluate_all(action: dict[str, Any], ctx: dict[str, Any] | None = None) -> list[Decision]:
    """Every deny that applies (used to cite R4+R5 together)."""
    ctx = ctx or {}
    mandate = ctx.get("mandate") or load_mandate()
    out: list[Decision] = []
    for rule in mandate["rules"]:
        if rule["type"] == "co_sign_over_usd":
            d = _r3(rule, action, ctx, mandate)
        else:
            h = _HANDLERS.get(rule["type"])
            d = h(rule, action, ctx) if h else None
        if d:
            out.append(d)
    return out


def evaluate(action: dict[str, Any], ctx: dict[str, Any] | None = None) -> Decision:
    """First deny wins; else allow (rule=None)."""
    denies = evaluate_all(action, ctx)
    if denies:
        return denies[0]
    return Decision(result="allow", rule=None, reason=f"All mandate rules pass for {action.get('type', 'action')}.")


def combined(action: dict[str, Any], ctx: dict[str, Any] | None = None) -> Decision:
    denies = evaluate_all(action, ctx)
    if not denies:
        return evaluate(action, ctx)
    return Decision(result="deny", rule="+".join(d.rule or "" for d in denies),
                    reason=" ".join(d.reason for d in denies))
