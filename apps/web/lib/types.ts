// TS mirror of services/common/events.py and docs/contracts.md.

export const SPONSOR_KEYS = [
  "airbyte",
  "cognee",
  "superlinked",
  "persona",
  "guild",
  "singlestore",
  "arcee",
  "firedrill",
  "statsig",
  "amplitude",
  "aws",
  "openai",
] as const;
export type SponsorKey = (typeof SPONSOR_KEYS)[number];
export type SponsorMode = "real" | "mock";

export type Actor =
  | "client_agent"
  | "envoy"
  | "bank_a"
  | "bank_b"
  | "bank_c"
  | "human:emma"
  | "human:dev"
  | "rogue_agent";

export type Kind =
  | "ingest"
  | "memory"
  | "verify"
  | "mandate_check"
  | "flag"
  | "option"
  | "rfq"
  | "quote"
  | "reject"
  | "approve"
  | "execute"
  | "drill";

export type Trust = "verified" | "claimed" | "untrusted";

export type Source = {
  label: string;
  uri: string;
  trust: Trust;
  fetched_at: string;
  sha256: string;
};

export type Decision = {
  result: "allow" | "deny" | "selected" | "rejected";
  rule?: string | null;
  reason: string;
};

export type AgentEvent = {
  id: string;
  ts: string;
  step: number;
  actor: Actor;
  kind: Kind;
  summary: string;
  sources: Source[];
  decision?: Decision | null;
  sponsors: SponsorKey[];
  sponsor_modes: Record<string, string>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: Record<string, any>;
  prev_hash: string;
  hash: string;
};

export type Email = {
  id: string;
  from?: string;
  from_name?: string;
  to?: string | string[];
  subject: string;
  date?: string;
  body?: string;
  snippet?: string;
  category?: string;
  from_email?: string;
  from_domain?: string;
  received_at?: string;
  trust?: string;
  attachments?: (string | { name?: string; type?: string; size_kb?: number })[];
  is_attack?: boolean;
  [k: string]: unknown;
};

export type Memory = {
  id: string;
  text: string;
  source_uri: string;
  trust: Trust;
  fetched_at: string;
  can_instruct: boolean;
};

export type ContextFact = { fact: string; source_uri: string; trust: Trust };

export type FundingOption = {
  id: "sell_rsus" | "sell_index_fund" | "use_cash" | "borrow" | string;
  label: string;
  amount_usd: number;
  true_cost_usd: number;
  cost_breakdown: Record<string, number>;
  status: "blocked" | "rejected" | "viable" | "rfq";
  rule: string | null;
  reason: string;
  context?: ContextFact[];
};

export type Quote = {
  quote_id: string;
  bank_id: "bank_a" | "bank_b" | "bank_c" | string;
  bank_name: string;
  product: "securities_backed_line" | "sell_index_fund" | string;
  rate_bps: number | null;
  amount_usd: number;
  term_months: number;
  fees_usd: number;
  notes: string;
  repayment_plan: string | null;
  proposed_actions: { type: string; asset: string; amount_usd: number }[];
  model_mode: SponsorMode | string;
};

export type Receipt = {
  events: AgentEvent[];
  final_hash: string;
  signature: string;
  public_key: string;
  algorithm: "ed25519" | string;
  signed_at: string;
};

export type DrillCategory = { category: string; total: number; blocked: number; succeeded: number };
export type DrillScenario = {
  id: string;
  category: string;
  target_rule: string;
  expected: string;
  actual: string;
  blocked_by: string | null;
  reason: string;
  description?: string;
};
export type DrillResults = {
  total: number;
  succeeded: number;
  blocked: number;
  by_category: DrillCategory[];
  scenarios: DrillScenario[];
  ran_at: string;
  mode: string;
};

export type DemoState = {
  current_step: number;
  mode: "mock" | "live";
  sponsor_modes: Record<string, string>;
};

export type ModeInfo = { mock_mode: boolean; sponsor_modes: Record<string, string> };

// ---- Phase 3: email as context (docs/contracts.md "Phase 3 additions") ----
export type IntentSource = "mcp" | "ui" | "email" | string;

export type InboxSignals = {
  lookalike_sender: boolean;
  payment_change_language: boolean;
  bank_details_mismatch: boolean;
  hidden_instruction: boolean;
};

export type InboxEmail = {
  uid: string;
  from_name: string;
  from_addr: string;
  to: string | string[];
  subject: string;
  date: string;
  body: string;
  attachments: string[];
  trust: Trust;
  signals: InboxSignals;
  matched_phrases: string[];
  lookalike_of: string | null;
  extracted: { accounts_last4: string[]; routing_last4: string[]; deadlines: string[] };
  verified_payee: { name: string; email: string; bank_account_last4: string } | null;
  flag: { level: "high" | "medium"; rules: string[]; reason: string } | null;
  simulated: boolean;
};

export type InboxStatus = {
  source: "imap" | "airbyte" | "seed" | string;
  connected: boolean;
  watching: boolean;
  last_poll_at: string | null;
  last_error: string | null;
  count: number;
  flagged_count: number;
};
