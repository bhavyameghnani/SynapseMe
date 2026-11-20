# Future scope: sponsors not featured in the demo

The demo credits three sponsors: **Cognee** (memory with provenance), **Persona** (Know Your Agent + identity at approval), **Guild AI** (agent control plane, single-use execute tokens, session trace).
Everything below already has an adapter behind a flag, but is not badged or pitched today. Re-enable badges with `ACTIVE_SPONSORS` / `NEXT_PUBLIC_ACTIVE_SPONSORS` (comma-separated).

| Sponsor | Planned job | What runs today instead |
|---|---|---|
| Arcee | Open-weight models run by each bank on its own infrastructure | OpenAI (if key) or deterministic bank personalities |
| SingleStore | Real-time positions, prices and tax lots for the true-cost calculator | Local SQLite with the same schema |
| Superlinked (SIE) | Structured extraction (wire details, rates, deadlines) and source reranking | Regex extraction |
| Airbyte | Managed connectors for inbox, statements and holdings into one context index | Direct read-only Gmail IMAP + seed files |
| Firedrill | Continuous adversarial drills against the gateway | Local runner `drills/run.py` (50 scenarios) |
| Statsig | `auto_approve_under_usd` autonomy gate | Local JSON gate |
| Amplitude | Approval / rejection funnel analytics | Local event log |
| AWS | Hosted deployment | Runs locally |
