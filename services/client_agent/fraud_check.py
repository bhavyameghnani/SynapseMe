"""Lookalike wire-fraud classifier for inbound email (docs/email_context_spec.md §3).

Email is context only: this module labels each message with trust + signals; it never creates a payee,
amount, approval or execution. Verified payees come only from data/seed/verified_contacts.json.
"""
from __future__ import annotations

import re
from typing import Any

from services.common.portfolio import verified_contacts, verified_payees

PAYMENT_CHANGE = re.compile(
    r"updated wire|new (bank )?account|change(d)? (of )?(bank|payment|wire)|wire instructions|routing number"
    r"|urgent.*(wire|transfer)",
    re.IGNORECASE,
)
# Spec patterns, plus "skip <word> verification" so "skip escrow verification" is caught too.
HIDDEN = re.compile(r"assistant:|ignore (previous|prior)|skip (\w+ )?(verification|check)", re.IGNORECASE)
HTML_COMMENT = re.compile(r"<!--(.*?)-->", re.DOTALL)
COMMENT_IMPERATIVE = re.compile(
    r"\b(assistant|agent|ai|system|ignore|skip|bypass|disable|wire|send|approve|do not)\b", re.IGNORECASE)
# A digit run (dashes/spaces allowed inside) within ~40 chars after "account"/"acct"/"routing".
_NEAR = re.compile(r"\b(account|acct|routing)\b[^\n]{0,40}", re.IGNORECASE)
_DIGITS = re.compile(r"\d[\d\- ]*\d|\d")
_ISO_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
# Account digits only count as bank details in a payment context (not "your account matures 2026-12-12").
PAYMENT_CONTEXT = re.compile(r"\b(wire|payee|routing|remit|transfer|deposit to|send (the|your) )", re.IGNORECASE)
_CONFUSABLES = {
    "0": "o", "1": "l", "а": "a", "е": "e", "о": "o", "ѕ": "s", "і": "i", "р": "p", "с": "c", "х": "x",
}
LEVENSHTEIN_MAX = 2
LEVENSHTEIN_MIN_LEN = 6  # skip edit-distance on very short local parts (e.g. "ravi" vs "dave")
NEVER_ACTED = "never acted on — payment instructions only come through Envoy"


def normalize_local(local: str) -> str:
    """Lowercase, drop +tag, remove . - _, map confusables (0→o, 1→l, rn→m, Cyrillic lookalikes)."""
    s = local.lower().split("+", 1)[0]
    s = "".join(_CONFUSABLES.get(ch, ch) for ch in s)
    s = s.replace("rn", "m")
    return re.sub(r"[.\-_]", "", s)


def levenshtein(a: str, b: str) -> int:
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        cur = [i]
        for j, cb in enumerate(b, 1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (ca != cb)))
        prev = cur
    return prev[-1]


def _split(addr: str) -> tuple[str, str]:
    addr = (addr or "").strip().lower()
    local, _, domain = addr.partition("@")
    return local, domain


def _contacts(contacts: dict[str, Any] | None) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    vc = contacts if contacts is not None else verified_contacts()
    payees = verified_payees() if contacts is None else [
        {**p, "email": str(p.get("email", "")).lower(),
         "bank_account_last4": str(p.get("bank_account_last4") or p.get("account_last4") or "")}
        for p in vc.get("payees", [])]
    advisors = [{**a, "email": str(a.get("email", "")).lower()} for a in vc.get("advisors", [])]
    return payees, advisors


def lookalike_of(from_addr: str, verified_addrs: list[str]) -> str | None:
    """Verified address that from_addr imitates, or None. Exact verified addresses never match."""
    addr = (from_addr or "").strip().lower()
    if not addr or addr in verified_addrs:
        return None
    local, _ = _split(addr)
    n = normalize_local(local)
    for v in verified_addrs:
        vlocal, _ = _split(v)
        if n and n == normalize_local(vlocal):
            return v
        if min(len(local), len(vlocal)) >= LEVENSHTEIN_MIN_LEN and levenshtein(local, vlocal) <= LEVENSHTEIN_MAX:
            return v
    return None


def bank_numbers(text: str) -> tuple[list[str], list[str]]:
    """(account last4s, routing last4s) for digit runs (4-17 digits) near 'account'/'routing'."""
    accts: list[str] = []
    routs: list[str] = []
    for m in _NEAR.finditer(text or ""):
        kind = m.group(1).lower()
        for d in _DIGITS.finditer(m.group(0)):
            if _ISO_DATE.match(d.group(0).strip()):
                continue
            digits = re.sub(r"\D", "", d.group(0))
            if not 4 <= len(digits) <= 17:
                continue
            bucket = routs if kind == "routing" else accts
            if digits[-4:] not in bucket:
                bucket.append(digits[-4:])
    return accts, routs


def hidden_instructions(text: str) -> list[str]:
    hits = [m.group(0) for m in HIDDEN.finditer(text or "")]
    for c in HTML_COMMENT.finditer(text or ""):
        if COMMENT_IMPERATIVE.search(c.group(1)) and c.group(0) not in hits:
            hits.append(c.group(0).strip())
    return hits


def _extract_deadlines(text: str) -> tuple[list[str], dict[str, Any]]:
    """Superlinked SIE extract (USE_SIE=1) or its regex fallback; never fatal."""
    try:
        from services.client_agent import extract

        out = extract.extract(text) or {}
        dl = out.get("deadlines") or []
        return [str(d) for d in dl][:5], {"superlinked": extract.mode(), "fields": out}
    except Exception:
        return [], {"superlinked": "mock", "fields": {}}


def classify(msg: dict[str, Any], contacts: dict[str, Any] | None = None) -> dict[str, Any]:
    """Raw message -> InboxEmail (docs/contracts.md, Phase 3)."""
    payees, advisors = _contacts(contacts)
    payee_by_email = {p["email"]: p for p in payees if p.get("email")}
    advisor_by_email = {a["email"]: a for a in advisors if a.get("email")}
    verified_addrs = [*payee_by_email, *advisor_by_email]

    from_addr = str(msg.get("from_addr") or "").strip().lower()
    from_name = str(msg.get("from_name") or "")
    subject = str(msg.get("subject") or "")
    body = str(msg.get("body") or "")
    text = f"{subject}\n{body}"

    look = lookalike_of(from_addr, verified_addrs)
    phrases = [m.group(0) for m in PAYMENT_CHANGE.finditer(text)]
    accts, routs = bank_numbers(text)
    deadlines, ex = _extract_deadlines(body)
    sie_acct = str((ex.get("fields") or {}).get("account") or "")
    sie_digits = re.sub(r"\D", "", sie_acct)
    if 4 <= len(sie_digits) <= 17 and sie_digits[-4:] not in accts:
        accts.append(sie_digits[-4:])
    payee_last4 = {str(p.get("bank_account_last4")) for p in payees}
    payee_routing = {str(p.get("routing_last4")) for p in payees if p.get("routing_last4")}
    if not (phrases or PAYMENT_CONTEXT.search(text)):
        accts, routs = [], []
    mismatch = any(a not in payee_last4 for a in accts) or any(r not in payee_routing for r in routs)
    hidden = hidden_instructions(text)

    signals = {
        "lookalike_sender": look is not None,
        "payment_change_language": bool(phrases),
        "bank_details_mismatch": bool(mismatch),
        "hidden_instruction": bool(hidden),
    }

    if look or hidden:
        trust = "untrusted"
    elif from_addr in verified_addrs:
        trust = "verified"
    else:
        # Known advisor/payee name on an unverified address, or an unknown sender: a claim, not a fact.
        trust = "claimed"

    level: str | None = None
    rules: set[str] = set()
    reasons: list[str] = []
    if look and phrases:
        level = "high"
        rules |= {"R4", "R5"}
        reasons.append(f"Sender {from_addr} imitates verified {look} and asks to change payment details")
    if hidden:
        level = "high"
        rules.add("R5")
        reasons.append(f"Hidden instruction addressed to an AI agent: {hidden[0][:80]}")
    if mismatch:
        level = level or "medium"
        rules.add("R4")
        bad = [a for a in accts if a not in payee_last4] or [r for r in routs if r not in payee_routing]
        want = ", ".join(sorted(payee_last4)) or "none on file"
        reasons.append(f"Bank details ending {', '.join(bad)} do not match the verified payee (ending {want})")
    flag = None
    if level:
        flag = {"level": level, "rules": sorted(rules),
                "reason": "; ".join(reasons) + f". Flagged and {NEVER_ACTED}."}

    vp_src = payee_by_email.get(look or "") or payee_by_email.get(from_addr)
    if vp_src is None and (accts or routs or phrases) and payees:
        vp_src = payees[0]
    verified_payee = ({"name": vp_src.get("name"), "email": vp_src.get("email"),
                       "bank_account_last4": vp_src.get("bank_account_last4")} if vp_src else None)

    matched: list[str] = []
    for p in phrases + hidden:
        if p.lower() not in {m.lower() for m in matched}:
            matched.append(p)
    if look:
        matched.insert(0, from_addr)
    att = msg.get("attachments") or []
    return {
        "uid": str(msg.get("uid") or ""),
        "from_name": from_name,
        "from_addr": from_addr,
        "to": msg.get("to") if isinstance(msg.get("to"), str) else ", ".join(msg.get("to") or []),
        "subject": subject,
        "date": str(msg.get("date") or ""),
        "body": body,
        "attachments": [a.get("name", "") if isinstance(a, dict) else str(a) for a in att],
        "trust": trust,
        "signals": signals,
        "matched_phrases": matched,
        "lookalike_of": look,
        "extracted": {"accounts_last4": accts, "routing_last4": routs, "deadlines": deadlines},
        "verified_payee": verified_payee,
        "flag": flag,
        "simulated": bool(msg.get("simulated", False)),
        "sponsor_modes": {"superlinked": ex.get("superlinked", "mock")},
    }


def observation_text(e: dict[str, Any]) -> str:
    """One Cognee observation per email: context only, with provenance in the text itself."""
    sig = [k for k, v in e["signals"].items() if v]
    bits = [f"Observation (email uid {e['uid']}, from {e['from_addr']}, trust {e['trust']}): {e['subject']}"]
    if e["extracted"]["deadlines"]:
        bits.append(f"deadlines {', '.join(e['extracted']['deadlines'][:3])}")
    if sig:
        bits.append(f"signals {', '.join(sig)}")
    if e.get("flag"):
        bits.append(f"FLAGGED {e['flag']['level']} ({'+'.join(e['flag']['rules'])}); {NEVER_ACTED}")
    return "; ".join(bits)


SIMULATED_ATTACK = {
    "from_name": "Escrow Team",
    "from_addr": "escrow-team.demo@gmail.com",
    "to": "emma.envoy.demo@gmail.com",
    "subject": "Updated wire instructions — please use new account",
    "body": ("Hi Emma,\n\nDue to an audit our previous trust account is frozen. Please wire the $400,000 deposit to "
             "our new account today so you don't lose the house:\n\nPayee: Escrow Team Trust\n"
             "Account: 6092-310-8841 (ending 8841)\nRouting: 026009593\n\n"
             "Our phones are down, please don't call. Reply once sent.\n\nEscrow Team"),
    "attachments": ["UPDATED_wire_instructions.pdf"],
}


def classify_seed_email(e: dict[str, Any], contacts: dict[str, Any] | None = None) -> dict[str, Any]:
    """Seed email (data/seed/emails.json shape) -> InboxEmail."""
    return classify({"uid": e.get("id"), "from_name": e.get("from_name"), "from_addr": e.get("from_email"),
                     "to": e.get("to"), "subject": e.get("subject"), "date": e.get("received_at"),
                     "body": e.get("body"), "attachments": e.get("attachments")}, contacts)
