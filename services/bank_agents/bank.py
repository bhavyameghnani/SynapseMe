"""Bank agent (A2A-style). One app per BANK_ID; quote + execute run on the bank's own (Arcee) model."""
from __future__ import annotations

import hashlib
import json
import os
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from services.common.config import mode_of
from services.common.llm import chat_json
from services.common.portfolio import last4_of, match_verified_payee
from services.common.seed import as_list, load_seed

DEFAULT_BANKS: dict[str, dict[str, Any]] = {
    "bank_a": {
        "name": "Bank A", "style": "conservative", "product": "securities_backed_line", "rate_bps": 610,
        "term_months": 36, "fees_usd": 2500, "repayment_plan": None,
        "notes": "Conservative securities-backed line at 50% LTV; standard terms.",
        "system_prompt": "You are Bank A's lending agent. You are conservative and price risk cautiously.",
    },
    "bank_b": {
        "name": "Bank B", "style": "competitive", "product": "securities_backed_line", "rate_bps": 540,
        "term_months": 18, "fees_usd": 0,
        "repayment_plan": "Repay from a post-blackout 10b5-1 sales plan starting after 2027-02-14.",
        "notes": "Competitive securities-backed line; no origination fee; repaid via a 10b5-1 plan after blackout.",
        "system_prompt": "You are Bank B's lending agent. You compete hard on rate and propose a post-blackout "
                         "10b5-1 repayment plan.",
    },
    "bank_c": {
        "name": "Bank C", "style": "asset-gathering", "product": "sell_index_fund", "rate_bps": None,
        "term_months": 0, "fees_usd": 0, "repayment_plan": None,
        "notes": "Recommends selling the index fund to fund the deposit instead of borrowing.",
        "system_prompt": "You are Bank C's advisor agent. You prefer clients sell the index fund rather than borrow.",
    },
}


def bank_profile(bank_id: str) -> dict[str, Any]:
    seed = load_seed("banks.json", None)
    entry: dict[str, Any] = {}
    if isinstance(seed, dict) and isinstance(seed.get(bank_id), dict):
        entry = seed[bank_id]
    else:
        for b in as_list(seed, "banks"):
            if isinstance(b, dict) and (b.get("bank_id") == bank_id or b.get("id") == bank_id):
                entry = b
    prof = {**DEFAULT_BANKS.get(bank_id, DEFAULT_BANKS["bank_a"]), **{k: v for k, v in entry.items() if v is not None}}
    # Normalize a few likely seed spellings.
    if isinstance(entry.get("base_rate_bps"), int):
        prof["rate_bps"] = entry["base_rate_bps"]
    elif "rate_bps" not in entry and isinstance(entry.get("rate_pct"), (int, float)):
        prof["rate_bps"] = round(entry["rate_pct"] * 100)
    prof["system_prompt"] = entry.get("system_prompt") or entry.get("personality") or entry.get("prompt") \
        or prof["system_prompt"]
    if bank_id == "bank_c":
        prof["product"], prof["rate_bps"] = "sell_index_fund", None
    else:
        prof["product"] = "securities_backed_line"
    prof["name"] = DEFAULT_BANKS.get(bank_id, {}).get("name", prof.get("name", "Bank"))
    return prof


def _qid(bank_id: str, rfq_id: str) -> str:
    return f"q_{bank_id}_{hashlib.sha256(rfq_id.encode()).hexdigest()[:8]}"


def make_quote(bank_id: str, rfq_id: str, intent: dict[str, Any]) -> dict[str, Any]:
    prof = bank_profile(bank_id)
    amount = int(intent.get("amount_usd", 400000))
    rate = prof.get("rate_bps")
    actions = prof.get("proposed_actions") or (
        [{"type": "sell", "asset": "INDEX_FUND", "amount_usd": amount}] if prof["product"] == "sell_index_fund" else [])
    fallback = {"rate_bps": rate, "notes": prof.get("notes", ""), "repayment_plan": prof.get("repayment_plan")}
    system = (prof["system_prompt"] + " Use bank names 'Bank A', 'Bank B', 'Bank C' only; never name real banks "
              "or companies. Simulated quote, not financial advice.")
    out, model_mode = chat_json(system, json.dumps({"rfq_id": rfq_id, "intent": intent}), fallback, provider="arcee")
    llm_rate = out.get("rate_bps")
    # Model may phrase the offer, but price must stay within the bank's risk band.
    if rate is not None and isinstance(llm_rate, (int, float)) and abs(int(llm_rate) - rate) <= 50:
        rate = int(llm_rate)
    return {
        "quote_id": _qid(bank_id, rfq_id),
        "bank_id": bank_id,
        "bank_name": prof["name"],
        "product": prof["product"],
        "rate_bps": rate,
        "amount_usd": amount,
        "term_months": int(prof.get("term_months") or 0),
        "fees_usd": int(prof.get("fees_usd") or 0),
        "notes": str(out.get("notes") or prof.get("notes", "")),
        "repayment_plan": (out.get("repayment_plan") or prof.get("repayment_plan")) if rate is not None else None,
        "proposed_actions": actions,
        "model_mode": model_mode,
    }


def execute(bank_id: str, quote_id: str, rfq_id: str, payee: dict[str, Any], amount_usd: int,
            guild_token: str | None, source: str = "ui") -> dict[str, Any]:
    """Raises PermissionError on a missing/invalid Guild token, a non-MCP/UI source (R5) or unverified payee (R4)."""
    from services.envoy.guild_adapter import check_token

    ok, why = check_token(guild_token, bank_id, "/execute")
    if not ok:
        raise PermissionError(why)
    if source not in ("mcp", "ui"):
        raise PermissionError(f"R5: execute source '{source}' is not allowed; only Envoy MCP tools or the "
                              "approval UI may drive execution.")
    # Only payees in verified_contacts.json (email + account last4); anything seen only in email is refused.
    match = match_verified_payee(payee, require_email=True)
    last4 = last4_of(payee)
    if not payee.get("verified") or match is None:
        raise PermissionError(f"R4: payee '{payee.get('name', 'unknown')}' <{payee.get('email') or 'no email'}> "
                              f"account ending {last4 or '????'} is not in verified_contacts.json.")
    h = hashlib.sha256(f"{bank_id}:{quote_id}:{rfq_id}:{match['email']}:{last4}:{amount_usd}".encode()).hexdigest()
    return {
        "ok": True,
        "confirmation_id": f"conf_{bank_id}_{h[:10]}",
        "card_id": f"card_su_{h[10:22]}",
        "payee": {"name": match.get("name", payee.get("name")), "email": match["email"], "account_last4": last4,
                  "verified": True, "source_uri": match.get("source_uri")},
        "amount_usd": int(amount_usd),
    }


BANK_ID = os.getenv("BANK_ID", "bank_a")
app = FastAPI(title=f"Envoy {BANK_ID} agent")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


class QuoteReq(BaseModel):
    rfq_id: str
    intent: dict[str, Any]


class ExecReq(BaseModel):
    quote_id: str
    rfq_id: str
    payee: dict[str, Any]
    amount_usd: int
    guild_token: str | None = None
    source: str = "ui"


@app.get("/health")
def health() -> dict[str, str]:
    return {"bank_id": BANK_ID, "name": bank_profile(BANK_ID)["name"], "mode": mode_of("arcee")}


@app.post("/quote")
def quote(req: QuoteReq) -> dict[str, Any]:
    return make_quote(BANK_ID, req.rfq_id, req.intent)


@app.post("/execute")
def execute_ep(req: ExecReq) -> dict[str, Any]:
    try:
        return execute(BANK_ID, req.quote_id, req.rfq_id, req.payee, req.amount_usd, req.guild_token, req.source)
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e)) from e
