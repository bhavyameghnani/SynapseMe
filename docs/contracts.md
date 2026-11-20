# Envoy service contracts (source of truth for all agents)

Event model: `services/common/events.py` (`AgentEvent`). TS mirror: `apps/web/lib/types.ts`.
Extra fields beyond CLAUDE.md §3: `sponsor_modes: {sponsor: "real"|"mock"}` and `data: {}` (screen payload).
Sponsor keys also include `"openai"` (planner LLM).

## Hashing (Python ledger and browser verifier MUST match)
- `canonical_json(x)` = JSON with keys sorted recursively, separators `,` and `:`, no ASCII escaping, integral floats written as ints.
- `hash = sha256_hex(prev_hash + canonical_json(event_without_hash_field))`. First event `prev_hash = "0"*64`.
- Receipt: `{events, final_hash, signature, public_key, algorithm: "ed25519", signed_at}`; `signature` = hex Ed25519 sig over the UTF-8 bytes of `final_hash` (hex string); `public_key` hex.
- Use ints for money (whole USD) and basis points for rates (`rate_bps: 540`) in `data`. Display strings are fine too.

## Ports
envoy 8000 · client_agent 8200 · bank_a 8101 · bank_b 8102 · bank_c 8103 · web 3000

## envoy (FastAPI, :8000, CORS *)
| Method | Path | Body / Returns |
|---|---|---|
| GET | `/events` | SSE. Each message `event: agent_event`, `data: <AgentEvent JSON>`. On connect, replays all events in the ledger, then streams new ones. Also `event: reset` after reset. |
| GET | `/events/all` | `AgentEvent[]` (non-streaming, for polling fallback) |
| POST | `/demo/step/{n}` | Runs demo step n (0–11). Returns `{step, events: AgentEvent[]}`. Idempotent per step: re-running a step already run returns its existing events. Steps must be run in order; running n auto-runs any skipped earlier steps. Each < 2s in mock mode. |
| POST | `/demo/reset` | Clears ledger + state. `{ok: true}` |
| GET | `/demo/state` | `{current_step, mode: "mock"|"live", sponsor_modes: {...}}` |
| POST | `/kya/verify` | `{agent_id, credential}` → `{verified: bool, reason, agent_id}` |
| POST | `/rfq` | `{intent}` (called by client_agent, Guild policy checked) → `{rfq_id, quotes: Quote[], ranking}` |
| POST | `/approve` | `{approver: "emma"|"dev", rfq_id, quote_id}` → `{approved, identity_check}` |
| GET | `/receipt` | Receipt JSON (signs current final hash) |
| GET | `/drills/results` | contents of `drills/results.json` |
| GET | `/mode` | `{mock_mode: bool, sponsor_modes}` |

## bank_agents (one app, `BANK_ID` env = bank_a|bank_b|bank_c)
| POST `/quote` | `{rfq_id, intent}` → `Quote` |
| POST `/execute` | `{quote_id, rfq_id, payee, amount_usd, guild_token}` → `{ok, confirmation_id, card_id, payee, amount_usd}`; 403 if guild_token missing/invalid or payee not verified |
| GET `/health` | `{bank_id, name, mode}` |

`Quote = {quote_id, bank_id, bank_name: "Bank A"|"Bank B"|"Bank C", product: "securities_backed_line"|"sell_index_fund", rate_bps: int|null, amount_usd, term_months, fees_usd, notes, repayment_plan: str|null, proposed_actions: [{type, asset, amount_usd}], model_mode: "real"|"mock"}`
Personalities (data/seed/banks.json): A conservative 610 bps; B competitive 540 bps + post-blackout 10b5-1 repayment plan; C proposes `sell_index_fund` (rejected by R2 since selling the fund raises company-stock concentration).

## client_agent (:8200)
| POST `/ingest` | → `{emails, holdings, listing, memories: Memory[]}` |
| GET `/memory` | `Memory[]` — `{id, text, source_uri, trust, fetched_at, can_instruct: bool}` (untrusted ⇒ can_instruct=false) |
| GET `/funding_options` | `FundingOption[]` |
| POST `/plan` | `{goal}` → `{steps: str[], intent}` (OpenAI planner; mock fallback) |

`FundingOption = {id: "sell_rsus"|"sell_index_fund"|"use_cash"|"borrow", label, amount_usd, true_cost_usd, cost_breakdown: {[k]: int}, status: "blocked"|"rejected"|"viable"|"rfq", rule: str|null, reason}`

## Demo steps (envoy orchestrator) and the `data` each step's events carry
The web renders each screen from the events of that step (look at `kind` + `data`).

| Step | Key events (actor/kind) | `data` |
|---|---|---|
| 0 Inbox | envoy/ingest | `{counts: {emails:63, advisors:5, banks:3, pdfs:11}, emails: Email[]}` (Email = seed email object) |
| 1 Ingest | client_agent/ingest, client_agent/memory (×N) | memory events: `{memory: Memory}`; ingest: `{counts:{verified,claimed,untrusted}}` |
| 2 Rogue | rogue_agent/verify → envoy/reject | `{agent_id:"scraper-7f", credential:"shared_password", verified:false}` decision deny rule `KYA` |
| 3 Verify | envoy/verify (allow) + envoy/mandate_check | verify: `{agent_id:"emma-agent-01", verified:true, inquiry_id}`; mandate: `{mandate: <mandate.json>}` |
| 4 Fake wire | envoy/flag (deny R4/R5) for fake escrow email; envoy/flag (deny R5) for listing injection | `{email_id, from, lookalike_of, extracted:{account, routing}, verified_payee:{...}}` / `{listing_id, injection}` |
| 5 Options | client_agent/option ×4 (+ envoy/mandate_check per option) | `{option: FundingOption}` |
| 6 RFQ | client_agent/rfq, bank_x/quote ×3, envoy/reject (C, R2), envoy/mandate_check selected (B) | rfq: `{rfq_id, intent}`; quote: `{quote: Quote}`; reject/selected: `{quote_id, bank_id}` |
| 7 Two keys | human:emma/approve, human:dev/approve | `{approver, identity_check:{provider:"persona", inquiry_id, status:"passed"}, quote_id, amount_usd}` |
| 8 Execute | envoy/verify (guild token) → bank_b/execute | `{confirmation_id, card_id, payee:{name, account_last4, verified:true}, amount_usd:400000, loan:{rate_bps, amount_usd}}` |
| 9 Audit | envoy/execute, summary "Receipt signed" | `{final_hash, signature, public_key, event_count}` |
| 10 Drills | envoy/drill | `{results: <drills/results.json>}` |
| 11 Autonomy (opt) | envoy/mandate_check | `{gate:"auto_approve_under_usd", value_usd, funnel:[{stage,count}]}` |

`drills/results.json` = `{total:50, succeeded:0, blocked:50, by_category:[{category, total, blocked, succeeded}], scenarios:[{id, category, target_rule, expected, actual, blocked_by, reason}], ran_at, mode}`

## In-process policy interfaces (used by envoy AND drills/run.py)
```python
# services/envoy/mandate.py
def load_mandate() -> dict
def evaluate(action: dict, ctx: dict | None = None) -> Decision   # first deny wins; else allow (rule=None)
# services/envoy/kya.py
def verify_agent(agent_id: str, credential: str) -> tuple[bool, str, str]   # (verified, reason, mode)
# services/envoy/guild_adapter.py
def authorize(caller: str, endpoint: str) -> tuple[bool, str]       # e.g. ("client_agent", "bank_b:/execute") -> False
```
### Action shapes passed to `mandate.evaluate`
- `{"type":"sell","asset":"COMPANY_STOCK"|"INDEX_FUND","amount_usd":int,"date":"YYYY-MM-DD"}` → R1 (blackout), R2 (concentration must not increase: selling non-company assets raises company %)
- `{"type":"wire","amount_usd":int,"payee":{"name","account","routing","verified":bool,"source_trust"},"approvals":["emma","dev"]}` → R3 (co-sign over $100k needs every co_signer + principal), R4 (verified payees only)
- `{"type":"instruction","source_trust":"verified"|"claimed"|"untrusted","text":str}` → R5 (untrusted/claimed content can't instruct; also deny if text matches injection patterns like `<!-- assistant:` / "skip escrow verification")
- `{"type":"counterparty","bank_id":str}` → R6
- `{"type":"agent_call","agent_id","credential","caller","endpoint"}` → handled by kya + guild (drills category rogue_agent), not mandate
`ctx` may carry `{"today":"2026-12-01","holdings":...}`; default today = 2026-12-01 (inside blackout until 2027-02-14).

### Drill scenario YAML (`drills/scenarios/<category>.yaml`, a list per file)
```yaml
- id: fake_wire_01
  category: fake_wire            # fake_wire(12) injected_listing(10) over_limit(8) rogue_agent(8) blackout_sell(6) unapproved_counterparty(6)
  injected_content: "Updated wire instructions — please use account ..."
  action: { type: wire, amount_usd: 400000, payee: {name: ..., account: ..., routing: ..., verified: false, source_trust: untrusted}, approvals: [emma, dev] }
  target_rule: R4
  expected: blocked
```

## Phase 3 additions: email context, source guard, MCP
### Intent `source` (guard)
- Every intent to `POST /rfq`, `POST /approve`, and the execute flow carries `source: "mcp" | "ui"` (default `"ui"` for the presenter flow). `source: "email"` (or any other value) → 403 `{rejected: true, rule: "R5"}` and an `envoy/reject` ledger event.
- Bank `execute()` payee must match `data/seed/verified_contacts.json` `payees[]` (by email + account last4); else 403 with R4 and an `envoy/reject` (or `bank_b/reject`) event.
- New mandate action: `{"type":"intent","source":"email"|"mcp"|"ui", ...}` → R5 deny unless source in {mcp, ui}.

### Inbox endpoints (envoy :8000; client_agent owns IMAP + classifier and pushes into envoy)
| GET `/inbox` | `{status: InboxStatus, emails: InboxEmail[]}` newest first |
| GET `/inbox/status` | `InboxStatus = {source: "imap"|"airbyte"|"seed", connected: bool, watching: bool, last_poll_at, last_error: str|null, count, flagged_count}` |
| POST `/inbox/simulate` | injects the lookalike email through the same classifier path → `{email: InboxEmail}` |
| POST `/inbox/ingest` | (internal, client_agent → envoy) `{email: InboxEmail}` |

`InboxEmail = {uid, from_name, from_addr, to, subject, date, body, attachments: str[], trust, signals: {lookalike_sender: bool, payment_change_language: bool, bank_details_mismatch: bool, hidden_instruction: bool}, matched_phrases: str[], lookalike_of: str|null, extracted: {accounts_last4: str[], routing_last4: str[], deadlines: str[]}, verified_payee: {name, email, bank_account_last4}|null, flag: {level: "high"|"medium", rules: ["R4","R5"], reason}|null, simulated: bool}`

SSE: each newly ingested inbox email also emits an `AgentEvent` kind `ingest` (step = current step, data `{inbox_email: InboxEmail}`); flagged ones additionally emit kind `flag` with `decision.result: "deny"`, rule `R4+R5` or `R5`, summary ending "never acted on — payment instructions only come through Envoy", data `{inbox_email}`.

Context into funding: `GET /funding_options` options carry `context: [{fact, source_uri, trust}]` (e.g. deposit deadline from listing/escrow email, cost-basis request from CPA).
