// Checks that the browser canonicalJson / event hash match services/common/events.py byte-for-byte.
// Usage (from apps/web): node scripts/verify-fixture.mjs   (Node >= 22.6 for TS type stripping)
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../..");
const { canonicalJson, computeEventHash, sha256Hex, verifySignature } = await import("../lib/verify.ts");

const sampleText = `{
  "z": 1, "a": {"b": [3, 2.5, 1.0, -0.0, 0.0001, 0.00001, 1.5e-7, 123456789012], "a": null},
  "unicode": "Emma · café — ✓ 🏠 \\u2028 é", "esc": "quote\\" back\\\\ nl\\n tab\\t ctl\\u0001\\u001f",
  "bools": [true, false], "empty": {}, "list": [], "money": 400000, "rate_bps": 540, "Ä": 1, "B": 2
}`;

const event = {
  id: "evt_test",
  ts: "2026-11-20T13:00:00.000Z",
  step: 8,
  actor: "bank_b",
  kind: "execute",
  summary: "Bank B booked the $400k line — wired to verified escrow",
  sources: [{ label: "x", uri: "a2a://bank_b/execute", trust: "verified", fetched_at: "2026-11-20T13:00:00.000Z", sha256: "" }],
  decision: { result: "allow", rule: null, reason: "ok" },
  sponsors: ["guild", "arcee"],
  sponsor_modes: { guild: "mock", arcee: "real" },
  data: { amount_usd: 400000.0, loan: { rate_bps: 540 }, ratio: 0.909 },
  prev_hash: "0".repeat(64),
  hash: "",
};

const py = `
import json, sys
from services.common.events import canonical_json, event_hash, sha256_hex
d = json.loads(sys.stdin.read())
sig = pk = ""
try:
    import nacl.signing
    k = nacl.signing.SigningKey.generate()
    sig = k.sign(event_hash(d["event"]).encode()).signature.hex()
    pk = k.verify_key.encode().hex()
except ImportError:
    pass
print(json.dumps({"sig": sig, "pk": pk, "canon": canonical_json(d["sample"]), "sha": sha256_hex(canonical_json(d["sample"])), "hash": event_hash(d["event"])}))
`;

let out;
try {
  out = execFileSync("uv", ["run", "python", "-c", py], {
    cwd: repoRoot,
    input: JSON.stringify({ sample: JSON.parse(sampleText), event }),
    encoding: "utf8",
  });
} catch (e) {
  console.error("Could not run Python reference (uv run python):", e.message);
  process.exit(2);
}
const ref = JSON.parse(out.trim().split("\n").pop());
const sample = JSON.parse(sampleText);
const jsCanon = canonicalJson(sample);
const jsSha = await sha256Hex(jsCanon);
const jsHash = await computeEventHash(event);

const checks = [
  ["canonical_json", jsCanon === ref.canon],
  ["sha256(canonical)", jsSha === ref.sha],
  ["event_hash", jsHash === ref.hash],
];
if (ref.sig) {
  checks.push(["ed25519 verify (pynacl-signed)", verifySignature(ref.hash, ref.sig, ref.pk)]);
  checks.push(["ed25519 rejects wrong hash", !verifySignature("0".repeat(64), ref.sig, ref.pk)]);
}
for (const [name, ok] of checks) console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
if (!checks.every(([, ok]) => ok)) {
  console.log("js :", jsCanon);
  console.log("py :", ref.canon);
  process.exit(1);
}
