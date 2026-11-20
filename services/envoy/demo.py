"""Demo orchestrator: steps 0-11, each emitting audited AgentEvents into the ledger.

All demo state is derived from the ledger itself, so an envoy restart resumes where it left off.
"""
from __future__ import annotations

import asyncio
import importlib.util
import json
from collections import Counter
from typing import Any

import httpx

from services.common.config import ROOT, URLS, env, mock_mode, mode_of, openai_enabled, use_real
from services.common.events import AgentEvent, Decision, Source, canonical_json, now_iso, sha256_hex
from services.common.portfolio import VERIFIED_CONTACTS_URI, escrow_payee, holdings, last4_of
from services.common.seed import DEMO_TODAY, DISCLAIMER, as_list, load_seed, seed_sha
from services.envoy import guild_adapter, kya, ledger, mandate, rfq

MAX_STEP = 11
EMMA_AGENT = ("emma-agent-01", "kya:emma-agent-01:signed")
ROGUE_AGENT = ("scraper-7f", "shared_password")
CTX = {"today": DEMO_TODAY}
KEY_EMAILS = ["em_001", "em_002", "em_004", "em_real_escrow", "em_fake_wire", "em_036", "em_051"]
_lock = asyncio.Lock()
_analytics: list[dict[str, Any]] = []
# Auxiliary events (live inbox, source-guard rejections) live at the current step but never advance the demo.
AUX_CHANNELS = ("inbox", "guard")
# Set by the MCP/UI intent endpoints before running step 6 / 8: who drove the action.
_pending: dict[str, Any] = {"source": "ui", "intent": None}


# ---------- helpers ----------

def _sha(obj: Any) -> str:
    return sha256_hex(obj if isinstance(obj, str) else canonical_json(obj))


def src(label: str, uri: str, trust: str, content: Any, fetched_at: str | None = None) -> Source:
    return Source(label=label, uri=uri, trust=trust, sha256=_sha(content), fetched_at=fetched_at or now_iso())


def _modes(sponsors: list[str], overrides: dict[str, str] | None = None) -> dict[str, str]:
    m = {s: ("real" if openai_enabled() else "mock") if s == "openai" else mode_of(s) for s in sponsors}
    m.update(overrides or {})
    return m


def emit(step: int, actor: str, kind: str, summary: str, *, sources: list[Source] | None = None,
         decision: Decision | None = None, sponsors: list[str] | None = None,
         modes: dict[str, str] | None = None, data: dict[str, Any] | None = None) -> dict[str, Any]:
    sp = sponsors or []
    ev = AgentEvent(step=step, actor=actor, kind=kind, summary=summary, sources=sources or [], decision=decision,
                    sponsors=sp, sponsor_modes=_modes(sp, modes), data=data or {})
    return ledger.append(ev).model_dump(mode="json")


def _emails() -> list[dict[str, Any]]:
    return as_list(load_seed("emails.json", []), "emails")


def _email(eid: str) -> dict[str, Any]:
    return next((e for e in _emails() if e.get("id") == eid), {})


def _email_src(e: dict[str, Any]) -> Source:
    return src(f"Email: {e.get('subject', '')[:60]} ({e.get('from_email')})", f"email://{e.get('id')}",
               e.get("trust", "claimed"), e, e.get("received_at"))


def _holdings_src() -> Source:
    h = holdings()
    return Source(label="Holdings (positions, tax lots)", uri="file://data/seed/holdings.json",
                  trust="verified", sha256=seed_sha("holdings.json"), fetched_at=h.get("as_of", now_iso()))


def _contacts_src() -> Source:
    return Source(label="Verified contacts (human-edited; the only payee source)", uri=VERIFIED_CONTACTS_URI,
                  trust="verified", sha256=seed_sha("verified_contacts.json"))


def _vp(payee: dict[str, Any]) -> dict[str, Any]:
    return {"name": payee.get("name"), "email": payee.get("email"), "account_last4": payee.get("account_last4"),
            "bank_account_last4": payee.get("bank_account_last4"), "routing_last4": payee.get("routing_last4"),
            "routing": payee.get("routing_last4"), "domain": payee.get("domain"),
            "source_uri": payee.get("source_uri"), "verified_on": payee.get("verified_on")}


def _mandate_src() -> Source:
    return Source(label="Emma's mandate (signed by Emma and Dev)", uri="file://data/seed/mandate.json",
                  trust="verified", sha256=seed_sha("mandate.json"))


def _listing_src(lst: dict[str, Any]) -> Source:
    return src(f"Listing {lst.get('address', '')}", lst.get("source_uri", "listing://"), lst.get("trust", "claimed"),
               lst, lst.get("fetched_at"))


def _events_by_step() -> dict[int, list[dict[str, Any]]]:
    out: dict[int, list[dict[str, Any]]] = {}
    for e in ledger.all():
        out.setdefault(e["step"], []).append(e)
    return out


def _is_aux(e: dict[str, Any]) -> bool:
    return (e.get("data") or {}).get("channel") in AUX_CHANNELS


def current_step() -> int:
    steps = [e["step"] for e in ledger.all() if not _is_aux(e)]
    return max(steps) if steps else -1


def aux_step() -> int:
    """Step to stamp on auxiliary events: the screen currently shown (0 before the demo starts)."""
    return max(current_step(), 0)


def guard_reject(source: str, tool: str, detail: dict[str, Any] | None = None) -> dict[str, Any]:
    """Log an intent rejected by the source guard (R5): only MCP tools or the UI may drive actions."""
    d = mandate.evaluate({"type": "intent", "source": source, "tool": tool, **(detail or {})}, CTX)
    return emit(aux_step(), "envoy", "reject",
                f"Rejected {tool}: intent from source '{source}' (R5). Email is context only; actions come "
                "only through Envoy",
                sources=[src(f"Intent submitted to {tool}", f"envoy://intent/{tool}", "untrusted",
                             {"source": source, "tool": tool, **(detail or {})}), _mandate_src()],
                decision=Decision(result="deny", rule=d.rule or "R5", reason=d.reason),
                data={"channel": "guard", "guard": True, "source": source, "tool": tool, "intent": detail or {}})


def payee_reject(bank: str, payee: dict[str, Any], reason: str, source: str) -> dict[str, Any]:
    return emit(aux_step(), "envoy", "reject",
                f"Rejected execute at {bank}: payee {payee.get('email') or payee.get('name')} "
                f"(…{last4_of(payee) or '????'}) is not in verified_contacts.json (R4)",
                sources=[src("Execute request payee", f"envoy://execute/{bank}", "untrusted", payee),
                         _contacts_src()],
                decision=Decision(result="deny", rule="R4", reason=reason),
                sponsors=["guild"], data={"channel": "guard", "guard": True, "source": source, "bank_id": bank,
                                          "payee": payee})


def _find(step: int, kind: str | None = None, actor: str | None = None) -> list[dict[str, Any]]:
    return [e for e in _events_by_step().get(step, [])
            if (kind is None or e["kind"] == kind) and (actor is None or e["actor"] == actor)]


async def _http_json(method: str, url: str, body: dict[str, Any] | None = None, timeout: float = 1.5) -> Any:
    async with httpx.AsyncClient(timeout=timeout) as c:
        r = await c.request(method, url, json=body)
        r.raise_for_status()
        return r.json()


def track(event: str, props: dict[str, Any]) -> None:
    """Amplitude adapter: REAL posts to the HTTP API, MOCK keeps a local event log."""
    row = {"event_type": event, "event_properties": props, "time": now_iso()}
    _analytics.append(row)
    if use_real("amplitude") and env("AMPLITUDE_API_KEY"):
        try:
            httpx.post("https://api2.amplitude.com/2/httpapi", timeout=1.5, json={
                "api_key": env("AMPLITUDE_API_KEY"),
                "events": [{"user_id": "emma-demo", "event_type": event, "event_properties": props}]})
        except Exception:
            pass


# ---------- steps ----------

def step0() -> None:
    emails = _emails()
    pdfs = sum(1 for e in emails for a in e.get("attachments", []) if str(a.get("name", "")).endswith(".pdf"))
    counts = {"emails": len(emails), "advisors": 5, "banks": 3, "pdfs": pdfs}
    emit(0, "envoy", "ingest",
         f"Inbox before Envoy: {counts['emails']} emails · {counts['advisors']} advisors · {counts['banks']} banks · "
         f"{counts['pdfs']} PDFs",
         sources=[Source(label="Emma's inbox (63 emails)", uri="file://data/seed/emails.json", trust="claimed",
                         sha256=seed_sha("emails.json"))],
         sponsors=["airbyte"], data={"counts": counts, "emails": emails})


async def step1() -> None:
    modes: dict[str, str] = {}
    try:
        res = await _http_json("POST", f"{URLS['client_agent']}/ingest", timeout=1.8)
        modes = res.get("modes", {})
    except Exception:
        from services.client_agent import app as client_app

        res = await asyncio.to_thread(client_app.ingest_ep)
        modes = res.get("modes", {})
    mems: list[dict[str, Any]] = res["memories"]
    counts = dict(Counter(m["trust"] for m in mems))
    counts = {k: counts.get(k, 0) for k in ("verified", "claimed", "untrusted")}
    sp = ["airbyte", "cognee", "superlinked"]
    emit(1, "client_agent", "ingest",
         f"Ingested {len(res['emails'])} emails, holdings and the listing into memory: {counts['verified']} verified · "
         f"{counts['claimed']} claimed · {counts['untrusted']} untrusted",
         sources=[Source(label="Inbox", uri="file://data/seed/emails.json", trust="claimed",
                         sha256=seed_sha("emails.json")), _holdings_src(), _listing_src(res["listing"])],
         sponsors=sp, modes=modes, data={"counts": counts, "memory_total": len(mems)})
    key_uris = {f"email://{i}" for i in KEY_EMAILS} | {"file://holdings.json", "email://em_real_escrow"}
    key_uris.add(res["listing"].get("source_uri", ""))
    for m in [m for m in mems if m["source_uri"] in key_uris or m["text"].startswith(("Holdings", "Verified payee"))]:
        note = "can instruct" if m["can_instruct"] else "read-only: can never become an instruction"
        emit(1, "client_agent", "memory", f"Remembered [{m['trust']}] {m['text'][:90]} ({note})",
             sources=[src(m["text"][:60], m["source_uri"], m["trust"], m["text"], m["fetched_at"])],
             sponsors=["cognee"], modes={"cognee": modes.get("cognee", "mock")}, data={"memory": m})


def step2() -> None:
    agent_id, cred = ROGUE_AGENT
    emit(2, "rogue_agent", "verify", f"Agent '{agent_id}' requests envoy:/rfq using Emma's shared password",
         sources=[src("Gateway request from scraper-7f", "envoy://gateway/rfq", "untrusted",
                      {"agent_id": agent_id, "credential": "***"})],
         sponsors=["persona", "guild"], data={"agent_id": agent_id, "credential": cred, "verified": False})
    ok, why, kmode = kya.verify_agent(agent_id, cred)
    _, gwhy = guild_adapter.authorize("rogue_agent", "envoy:/rfq")
    emit(2, "envoy", "reject", f"Rejected: unverified agent '{agent_id}'",
         sources=[src("Persona Know Your Agent check", f"persona://kya/{agent_id}", "verified", why)],
         decision=Decision(result="deny", rule="KYA", reason=f"{why} {gwhy}"),
         sponsors=["persona", "guild"], modes={"persona": kmode, "guild": guild_adapter.mode()},
         data={"agent_id": agent_id, "credential": cred, "verified": ok, "guild": gwhy})


def step3() -> None:
    agent_id, cred = EMMA_AGENT
    ok, why, kmode = kya.verify_agent(agent_id, cred)
    inq = kya.inquiry_for(agent_id)
    _, gwhy = guild_adapter.authorize("client_agent", "envoy:/rfq")
    emit(3, "envoy", "verify", f"Know Your Agent passed: {agent_id} acts for Emma (no password shared)",
         sources=[src("Persona KYA inquiry", f"persona://inquiries/{inq}", "verified", {"agent_id": agent_id, "ok": ok})],
         decision=Decision(result="allow" if ok else "deny", rule="KYA", reason=f"{why} {gwhy}"),
         sponsors=["persona", "guild"], modes={"persona": kmode, "guild": guild_adapter.mode()},
         data={"agent_id": agent_id, "verified": ok, "inquiry_id": inq,
               "credential_policy": "client_agent → envoy:/rfq, envoy:/approve only; never a bank endpoint"})
    m = mandate.load_mandate()
    emit(3, "envoy", "mandate_check", f"Mandate loaded: {len(m['rules'])} rules (R1–R6) bind this agent",
         sources=[_mandate_src()],
         decision=Decision(result="allow", rule=None, reason="Every action this agent proposes is checked against "
                           "R1–R6 before anything executes."),
         sponsors=["persona", "guild"], modes={"persona": kmode, "guild": guild_adapter.mode()},
         data={"mandate": m})


def step4() -> None:
    from services.client_agent import extract

    fake, real = _email("em_fake_wire"), _email("em_real_escrow")
    payee = escrow_payee()
    fields = extract.extract(fake.get("body", ""))
    sp = ["cognee", "superlinked"]
    modes = {"superlinked": extract.mode()}
    action = {"type": "wire", "amount_usd": 400000,
              "payee": {"name": fields.get("payee"), "account": fields.get("account"),
                        "routing": fields.get("routing"), "verified": False, "source_trust": fake.get("trust")},
              "approvals": []}
    d = mandate.combined(action, {**CTX, "pre_approval": True})
    vp = _vp(payee)
    fake_last4 = last4_of({"account": fields.get("account")})
    emit(4, "envoy", "flag",
         f"Fake wire caught: '{fake.get('subject')}' from lookalike sender {fake.get('from_email')}; "
         "blocked from any action",
         sources=[_email_src(fake), _email_src(real), _contacts_src()],
         decision=Decision(result="deny", rule=d.rule, reason=d.reason + f" Sender {fake.get('from_email')} "
                           f"imitates verified {payee.get('email')} (dash vs dot); account ending {fake_last4} "
                           f"≠ verified ending {vp['account_last4']}."),
         sponsors=sp, modes=modes,
         data={"email_id": fake.get("id"), "from": fake.get("from_email"), "lookalike_of": payee.get("email"),
               "extracted": {"account": fields.get("account"), "routing": fields.get("routing"),
                             "payee": fields.get("payee")},
               "verified_payee": vp, "memory_can_instruct": False})
    lst = load_seed("listing.json", {}) or {}
    inj = mandate.find_injection(lst.get("description", "")) or ""
    full = (lst.get("ground_truth") or {}).get("injection") or inj
    d2 = mandate.evaluate({"type": "instruction", "source_trust": lst.get("trust", "claimed"), "text": full})
    emit(4, "envoy", "flag", f"Hidden instruction in the listing flagged: {full}",
         sources=[_listing_src(lst)],
         decision=Decision(result="deny", rule="R5", reason=d2.reason),
         sponsors=sp, modes=modes, data={"listing_id": lst.get("listing_id"), "injection": full})
    rf = extract.extract(real.get("body", ""))
    ok = last4_of({"account": rf.get("account")}) == vp["account_last4"] and real.get("from_email") == payee["email"]
    emit(4, "envoy", "mandate_check",
         f"Original escrow instructions match the verified payee {payee.get('name')} (account ending {vp['account_last4']})",
         sources=[_email_src(real), _contacts_src()],
         decision=Decision(result="allow" if ok else "deny", rule="R4",
                           reason="R4: payee is in verified_contacts.json, verified out-of-band "
                                  f"({payee.get('verified_via', 'phone callback')}) on {payee.get('verified_on')}."),
         sponsors=sp, modes=modes,
         data={"email_id": real.get("id"), "extracted": {"account": rf.get("account"), "routing": rf.get("routing")},
               "verified_payee": vp})


async def step5() -> None:
    try:
        opts = await _http_json("GET", f"{URLS['client_agent']}/funding_options", timeout=1.8)
        mmode = mode_of("singlestore")
    except Exception:
        from services.client_agent import funding

        opts, mmode = await asyncio.to_thread(funding.options)
    for o in opts:
        status = o["status"]
        res = "deny" if status in ("blocked", "rejected") else "allow"
        verb = {"blocked": "Blocked", "rejected": "Rejected", "viable": "Viable", "rfq": "Send to RFQ"}[status]
        emit(5, "client_agent", "option",
             f"{o['label']}: true cost ${o['true_cost_usd']:,} · {verb}" + (f" ({o['rule']})" if o.get("rule") else ""),
             sources=[_holdings_src(), src("Market positions & tax lots", "singlestore://envoy/positions,tax_lots",
                                           "verified", o)],
             decision=Decision(result=res, rule=o.get("rule"), reason=o["reason"]),
             sponsors=["singlestore"], modes={"singlestore": mmode}, data={"option": o})
        emit(5, "envoy", "mandate_check", f"Mandate check on '{o['label']}': {res}"
             + (f" by {o['rule']}" if o.get("rule") else ""),
             sources=[_mandate_src()],
             decision=Decision(result=res, rule=o.get("rule"), reason=o["reason"]),
             sponsors=["singlestore"], modes={"singlestore": mmode},
             data={"option_id": o["id"], "status": status})


async def step6() -> None:
    from services.client_agent import planner

    plan, pmode = await asyncio.to_thread(planner.plan, "Fund the $400k home deposit safely")
    intent = {**plan["intent"], **(_pending.get("intent") or {})}
    source = _pending.get("source", "ui")
    ok, gwhy = guild_adapter.authorize("client_agent", "envoy:/rfq")
    if not ok:
        raise PermissionError(gwhy)
    res = await rfq.broadcast(intent, CTX)
    gmode = guild_adapter.mode()
    via = " (via Claude Desktop MCP)" if source == "mcp" else ""
    emit(6, "client_agent", "rfq",
         f"One intent broadcast to Bank A, Bank B and Bank C{via}: borrow ${intent['amount_usd']:,} for the home deposit",
         sources=[_holdings_src(), _listing_src(load_seed("listing.json", {}) or {})],
         decision=Decision(result="allow", rule="R6", reason=f"{gwhy} R6: all three counterparties are approved."),
         sponsors=["arcee", "guild", "openai"], modes={"openai": pmode, "guild": gmode},
         data={"rfq_id": res["rfq_id"], "intent": intent, "plan": plan["steps"], "transport": res["transport"],
               "source": source})
    for q in res["quotes"]:
        rate = f"{q['rate_bps'] / 100:.2f}%" if q.get("rate_bps") is not None else "no loan; proposes selling the index fund"
        emit(6, q["bank_id"], "quote", f"{q['bank_name']} quote: {rate}",
             sources=[src(f"{q['bank_name']} agent quote", f"{q['bank_id']}://quote/{q['quote_id']}", "claimed", q)],
             sponsors=["arcee"], modes={"arcee": q.get("model_mode", "mock")}, data={"quote": q})
    qsrc = {q["bank_id"]: src(f"{q['bank_name']} quote", f"{q['bank_id']}://quote/{q['quote_id']}", "claimed", q)
            for q in res["quotes"]}
    for r in res["ranking"][::-1]:
        body = {"quote_id": r["quote_id"], "bank_id": r["bank_id"]}
        if r["result"] == "rejected":
            emit(6, "envoy", "reject", f"{r['bank_name']} rejected by {r['rule']}: proposal breaks the mandate",
                 sources=[qsrc[r["bank_id"]], _mandate_src(), _holdings_src()],
                 decision=Decision(result="rejected", rule=r["rule"], reason=r["reason"]),
                 sponsors=["arcee"], data=body)
        elif r["result"] == "not_selected":
            emit(6, "envoy", "mandate_check", f"{r['bank_name']} passes the mandate but is not the best price",
                 sources=[qsrc[r["bank_id"]], _mandate_src()],
                 decision=Decision(result="rejected", rule=None, reason=r["reason"]),
                 sponsors=["arcee"], data={**body, "outcome": "not_selected"})
    best = next(r for r in res["ranking"] if r["result"] == "selected")
    emit(6, "envoy", "mandate_check", f"{best['bank_name']} selected at {best['rate_bps'] / 100:.2f}%",
         sources=[qsrc[best["bank_id"]], _mandate_src()],
         decision=Decision(result="selected", rule="R6", reason=best["reason"]),
         sponsors=["arcee"], data={"quote_id": best["quote_id"], "bank_id": best["bank_id"],
                                   "outcome": "selected", "ranking": res["ranking"]})
    track("envoy_step", {"step": 6, "quotes": len(res["quotes"]), "selected": best["bank_id"]})


def selected_quote() -> dict[str, Any]:
    sel = next(e for e in _find(6, "mandate_check") if (e.get("decision") or {}).get("result") == "selected")
    qid = sel["data"]["quote_id"]
    q = next(e["data"]["quote"] for e in _find(6, "quote") if e["data"]["quote"]["quote_id"] == qid)
    rfq_id = _find(6, "rfq")[0]["data"]["rfq_id"]
    return {**q, "rfq_id": rfq_id}


def approve(approver: str, quote: dict[str, Any], step: int = 7, source: str = "ui") -> dict[str, Any]:
    idc = kya.verify_human(approver)
    pmode = idc.pop("mode", "mock")
    ok = idc["status"] == "passed"
    prior = [e["data"]["approver"] for e in _find(step, "approve")]
    approvals = sorted({*prior, approver}) if ok else prior
    m = mandate.load_mandate()
    needed = [m["principal"], *m["co_signers"]]
    if all(n in approvals for n in needed):
        dec = Decision(result="allow", rule="R3", reason=f"R3 satisfied: ${quote['amount_usd']:,} is over $100,000 and "
                       f"both keys ({', '.join(needed)}) approved with identity checks.")
    else:
        dec = Decision(result="allow" if ok else "deny", rule="R3",
                       reason=f"Key 1 of {len(needed)}: {approver} approved; R3 still needs "
                              f"{', '.join(n for n in needed if n not in approvals)}." if ok
                       else f"Identity check failed for {approver}.")
    name = approver.capitalize()
    emit(step, f"human:{approver}", "approve",
         f"{name} approved {quote['bank_name']} at {quote['rate_bps'] / 100:.2f}% for ${quote['amount_usd']:,} "
         f"(Persona identity check {idc['status']})",
         sources=[src(f"Persona identity check ({name})", f"persona://inquiries/{idc['inquiry_id']}", "verified", idc),
                  src(f"{quote['bank_name']} quote", f"{quote['bank_id']}://quote/{quote['quote_id']}", "claimed", quote)],
         decision=dec, sponsors=["persona"], modes={"persona": pmode},
         data={"approver": approver, "identity_check": idc, "quote_id": quote["quote_id"],
               "amount_usd": quote["amount_usd"], "source": source})
    track("envoy_step", {"step": step, "approver": approver, "approved": ok})
    return {"approved": ok, "identity_check": idc}


def step7() -> None:
    q = selected_quote()
    for who in ("emma", "dev"):
        if not any(e["data"]["approver"] == who for e in _find(7, "approve")):
            approve(who, q, source=_pending.get("source", "ui"))


def approvals_passed() -> list[str]:
    return sorted({e["data"]["approver"] for e in _find(7, "approve")
                   if e["data"]["identity_check"]["status"] == "passed"})


async def step8() -> None:
    q = selected_quote()
    bank = q["bank_id"]
    approvals = approvals_passed()
    source = _pending.get("source", "ui")
    p = escrow_payee()
    # The payee comes only from verified_contacts.json, never from an email-derived object.
    payee = {"name": p["name"], "email": p["email"], "account_last4": p["account_last4"],
             "routing_last4": p.get("routing_last4"), "verified": True, "source_trust": "verified",
             "source_uri": p.get("source_uri")}
    d = mandate.evaluate({"type": "wire", "amount_usd": q["amount_usd"], "payee": payee, "approvals": approvals,
                          "bank_id": bank}, CTX)
    if d.result != "allow":
        raise PermissionError(d.reason)
    ok, gwhy = guild_adapter.authorize(bank, f"{bank}:/execute")
    token = guild_adapter.issue_session_token(bank, "/execute")
    gmode = guild_adapter.mode()
    emit(8, "envoy", "verify",
         f"Guild issued a single-use session token to {q['bank_name']}'s agent; no agent holds bank credentials",
         sources=[Source(label="Guild credential policy", uri="file://data/seed/guild_policy.json", trust="verified",
                         sha256=seed_sha("guild_policy.json")), _mandate_src()],
         decision=Decision(result="allow" if ok else "deny", rule="R3+R4",
                           reason=f"{gwhy} Mandate: {d.reason} Approved by {', '.join(approvals)}."),
         sponsors=["guild"], modes={"guild": gmode},
         data={"bank_id": bank, "endpoint": f"{bank}:/execute", "token_sha256": sha256_hex(token),
               "ttl_seconds": guild_adapter.TOKEN_TTL_S, "single_use": True, "approvals": approvals})
    conf, transport = await bank_execute(bank, q, payee, token, source)
    emit(8, bank, "execute",
         f"{q['bank_name']} booked a ${q['amount_usd']:,} line at {q['rate_bps'] / 100:.2f}% and wired the deposit to "
         f"verified escrow {conf['payee']['name']} (…{conf['payee']['account_last4']})",
         sources=[_contacts_src(), _email_src(_email("em_real_escrow")),
                  src(f"{q['bank_name']} execution confirmation", f"{bank}://execute/{conf['confirmation_id']}",
                      "verified", conf)],
         decision=Decision(result="allow", rule="R4", reason="Executed inside the bank by its own agent, to the "
                           "verified payee only, with a Guild single-use token and two-key approval."),
         sponsors=["guild"], modes={"guild": gmode},
         data={"confirmation_id": conf["confirmation_id"], "card_id": conf["card_id"], "payee": conf["payee"],
               "amount_usd": conf["amount_usd"], "loan": {"rate_bps": q["rate_bps"], "amount_usd": q["amount_usd"],
                                                          "term_months": q.get("term_months")},
               "bank_id": bank, "quote_id": q["quote_id"], "transport": transport, "source": source})
    track("envoy_step", {"step": 8, "executed": True, "bank": bank})


async def bank_execute(bank: str, q: dict[str, Any], payee: dict[str, Any], token: str,
                       source: str) -> tuple[dict[str, Any], str]:
    """Call the bank agent's /execute (HTTP, else in-process). A 403 (R4/R5) is logged, then re-raised."""
    body = {"quote_id": q["quote_id"], "rfq_id": q["rfq_id"], "payee": payee, "amount_usd": q["amount_usd"],
            "guild_token": token, "source": source}
    try:
        return await _http_json("POST", f"{URLS[bank]}/execute", body, timeout=1.8), "http"
    except httpx.HTTPStatusError as e:
        detail = (e.response.json() or {}).get("detail", str(e)) if e.response.status_code == 403 else str(e)
        if e.response.status_code == 403 and str(detail).startswith("R4"):
            payee_reject(bank, payee, str(detail), source)
        raise PermissionError(str(detail)) from e
    except Exception:
        from services.bank_agents import bank as bank_mod

        try:
            return bank_mod.execute(bank, q["quote_id"], q["rfq_id"], payee, q["amount_usd"], token, source), \
                "in_process"
        except PermissionError as pe:
            if str(pe).startswith("R4"):
                payee_reject(bank, payee, str(pe), source)
            raise


def step9() -> None:
    rec = ledger.receipt()
    emit(9, "envoy", "execute", "Receipt signed",
         sources=[Source(label="Envoy audit ledger", uri="file://services/envoy/ledger.jsonl", trust="verified",
                         sha256=rec["final_hash"])],
         decision=Decision(result="allow", rule=None, reason=f"Ed25519 signature over the chain head of "
                           f"{len(rec['events'])} hash-linked events. {DISCLAIMER}"),
         sponsors=["guild"], modes={"guild": guild_adapter.mode()},
         data={"final_hash": rec["final_hash"], "signature": rec["signature"], "public_key": rec["public_key"],
               "event_count": len(rec["events"]), "algorithm": "ed25519",
               "guild_trace": guild_adapter.get_trace()[-20:]})


def _drills() -> dict[str, Any]:
    spec = importlib.util.spec_from_file_location("envoy_drills_run", ROOT / "drills" / "run.py")
    try:
        assert spec and spec.loader
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        return mod.run(write=True)
    except Exception:
        p = ROOT / "drills" / "results.json"
        return json.loads(p.read_text()) if p.exists() else {"total": 0, "succeeded": 0, "blocked": 0,
                                                             "by_category": [], "scenarios": []}


def step10() -> None:
    r = _drills()
    emit(10, "envoy", "drill", f"{r['total']} attack drills · {r['succeeded']} succeeded",
         sources=[Source(label="Drill scenarios", uri="file://drills/scenarios/", trust="verified",
                         sha256=_sha([s["id"] for s in r.get("scenarios", [])]))],
         decision=Decision(result="allow" if r["succeeded"] == 0 else "deny", rule=None,
                           reason=", ".join(f"{c['category']} {c['blocked']}/{c['total']} blocked"
                                            for c in r.get("by_category", []))),
         sponsors=["firedrill"], modes={"firedrill": r.get("mode", "mock")}, data={"results": r})


def step11() -> None:
    gate = load_seed("statsig.json", {}) or {}
    value = int(gate.get("auto_approve_under_usd", 5000))
    evs = ledger.all()
    decided = [e for e in evs if e.get("decision") and e["step"] in (4, 5, 6, 7, 8)]
    funnel = [
        {"stage": "Actions proposed", "count": len(decided)},
        {"stage": "Passed mandate", "count": sum(1 for e in decided if e["decision"]["result"] in ("allow", "selected"))},
        {"stage": "Needed two keys", "count": sum(1 for e in decided if e["kind"] == "approve")},
        {"stage": "Executed", "count": sum(1 for e in evs if e["kind"] == "execute" and e["step"] == 8)},
    ]
    emit(11, "envoy", "mandate_check",
         f"Autonomy gate: agent may auto-approve under ${value:,}; the ${400000:,} deposit still needs two keys",
         sources=[Source(label="Feature gate auto_approve_under_usd", uri="statsig://gates/auto_approve_under_usd",
                         trust="verified", sha256=_sha({"value": value}))],
         decision=Decision(result="allow", rule="R3", reason=f"Gate value ${value:,} is below the R3 co-sign "
                           "threshold, so it can never bypass two-key approval."),
         sponsors=["statsig", "amplitude"],
         data={"gate": "auto_approve_under_usd", "value_usd": value, "funnel": funnel,
               "analytics_events": len(_analytics)})


STEPS = {0: step0, 1: step1, 2: step2, 3: step3, 4: step4, 5: step5, 6: step6, 7: step7, 8: step8, 9: step9,
         10: step10, 11: step11}


async def run_step(n: int) -> dict[str, Any]:
    if not 0 <= n <= MAX_STEP:
        raise ValueError(f"step must be 0..{MAX_STEP}")
    async with _lock:
        # Step 7 may be partly filled by /approve; finish the missing key(s) before moving on.
        if current_step() == 7 and n >= 7:
            step7()
        for i in range(current_step() + 1, n + 1):
            fn = STEPS[i]
            out = fn()
            if asyncio.iscoroutine(out):
                await out
        return {"step": n, "events": _events_by_step().get(n, [])}


def reset() -> None:
    from services.envoy import inbox

    ledger.reset()
    inbox.reset_simulated()
    _pending.update(source="ui", intent=None)
    guild_adapter.reset_trace()
    _analytics.clear()


def state() -> dict[str, Any]:
    sponsors = ["airbyte", "cognee", "superlinked", "persona", "guild", "singlestore", "arcee", "firedrill",
                "statsig", "amplitude"]
    return {"current_step": current_step(), "mode": "mock" if mock_mode() else "live",
            "sponsor_modes": {**{s: mode_of(s) for s in sponsors}, "openai": "real" if openai_enabled() else "mock"},
            "disclaimer": DISCLAIMER}
