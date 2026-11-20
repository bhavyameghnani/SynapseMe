SHELL := /bin/bash
UV := uv run --env-file .env
.PHONY: install envoy banks bank_a bank_b bank_c agent web demo drills test lint seed warmup seed-inbox mcp mcp-config seed-cognee

install:
	uv sync
	cd apps/web && npm install

seed:
	$(UV) python -m services.market.seed

envoy:
	$(UV) uvicorn services.envoy.app:app --port 8000 --reload

bank_a:
	BANK_ID=bank_a $(UV) uvicorn services.bank_agents.bank:app --port 8101
bank_b:
	BANK_ID=bank_b $(UV) uvicorn services.bank_agents.bank:app --port 8102
bank_c:
	BANK_ID=bank_c $(UV) uvicorn services.bank_agents.bank:app --port 8103
banks:
	$(MAKE) -j3 bank_a bank_b bank_c

agent:
	$(UV) uvicorn services.client_agent.app:app --port 8200 --reload

web:
	cd apps/web && npm run dev

demo:
	MOCK_MODE=1 $(MAKE) seed
	MOCK_MODE=1 $(MAKE) -j6 bank_a bank_b bank_c envoy agent web

drills:
	$(UV) python drills/run.py

test:
	uv run pytest -q

lint:
	uv run ruff check services drills scripts tests

warmup:
	$(UV) python scripts/warmup.py

# Seeds Emma's demo Gmail (context only, no quotes). Preview: make seed-inbox ARGS=--dry-run
seed-inbox:
	$(UV) python scripts/seed_inbox.py $(ARGS)

mcp:
	$(UV) python -m services.mcp.server

mcp-config:
	@uv run python scripts/mcp_config.py

seed-cognee:
	$(UV) python scripts/seed_cognee.py $(ARGS)

# Pushes synthetic Envoy sessions to Amplitude (needs AMPLITUDE_API_KEY). Preview: make seed-amplitude ARGS=--dry-run
seed-amplitude:
	$(UV) python scripts/seed_amplitude.py $(ARGS)
