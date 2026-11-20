// Browser-side receipt verifier. canonicalJson mirrors services/common/events.py byte-for-byte:
// json.dumps(_normalize(x), sort_keys=True, separators=(",", ":"), ensure_ascii=False)
import nacl from "tweetnacl";
import type { AgentEvent, Receipt } from "./types";

export const GENESIS_HASH = "0".repeat(64);

// Python's float repr switches to exponent form when the decimal exponent is < -4 (or >= 16).
function pyNumber(n: number): string {
  if (!Number.isFinite(n)) return n > 0 ? "Infinity" : n < 0 ? "-Infinity" : "NaN";
  if (Number.isInteger(n)) {
    // Integral floats become ints in Python; JS prints them the same way below 1e21.
    return Math.abs(n) < 1e21 ? n.toFixed(0) : BigInt(n).toString();
  }
  const exp = n.toExponential(); // shortest round-trip digits, like Python repr
  const [mant, e] = exp.split("e");
  const ei = parseInt(e, 10);
  if (ei < -4 || ei >= 16) {
    const sign = ei < 0 ? "-" : "+";
    const abs = Math.abs(ei).toString().padStart(2, "0");
    return `${mant}e${sign}${abs}`;
  }
  return String(n);
}

function pyString(s: string): string {
  // JSON.stringify escapes exactly the same set as Python with ensure_ascii=False for well-formed strings.
  return JSON.stringify(s);
}

export function canonicalJson(x: unknown): string {
  if (x === null || x === undefined) return "null";
  if (typeof x === "boolean") return x ? "true" : "false";
  if (typeof x === "number") return pyNumber(x);
  if (typeof x === "string") return pyString(x);
  if (Array.isArray(x)) return "[" + x.map((v) => canonicalJson(v)).join(",") + "]";
  if (typeof x === "object") {
    const obj = x as Record<string, unknown>;
    const keys = Object.keys(obj)
      .filter((k) => obj[k] !== undefined)
      .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    return "{" + keys.map((k) => pyString(k) + ":" + canonicalJson(obj[k])).join(",") + "}";
  }
  return "null";
}

// ---- sha256: WebCrypto when available (secure contexts), pure-JS fallback otherwise (e.g. LAN IP on a projector)
const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98,
  0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
  0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8,
  0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819,
  0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
  0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7,
  0xc67178f2,
]);

function sha256Js(data: Uint8Array): Uint8Array {
  const h = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);
  const bitLen = data.length * 8;
  const padLen = ((data.length + 9 + 63) >> 6) << 6;
  const buf = new Uint8Array(padLen);
  buf.set(data);
  buf[data.length] = 0x80;
  const dv = new DataView(buf.buffer);
  dv.setUint32(padLen - 8, Math.floor(bitLen / 0x100000000));
  dv.setUint32(padLen - 4, bitLen >>> 0);
  const w = new Uint32Array(64);
  for (let off = 0; off < padLen; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = dv.getUint32(off + i * 4);
    for (let i = 16; i < 64; i++) {
      const a = w[i - 15], b = w[i - 2];
      const s0 = ((a >>> 7) | (a << 25)) ^ ((a >>> 18) | (a << 14)) ^ (a >>> 3);
      const s1 = ((b >>> 17) | (b << 15)) ^ ((b >>> 19) | (b << 13)) ^ (b >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }
    let [A, B, C, D, E, F, G, H] = [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7]];
    for (let i = 0; i < 64; i++) {
      const S1 = ((E >>> 6) | (E << 26)) ^ ((E >>> 11) | (E << 21)) ^ ((E >>> 25) | (E << 7));
      const ch = (E & F) ^ (~E & G);
      const t1 = (H + S1 + ch + K[i] + w[i]) >>> 0;
      const S0 = ((A >>> 2) | (A << 30)) ^ ((A >>> 13) | (A << 19)) ^ ((A >>> 22) | (A << 10));
      const maj = (A & B) ^ (A & C) ^ (B & C);
      const t2 = (S0 + maj) >>> 0;
      H = G; G = F; F = E; E = (D + t1) >>> 0; D = C; C = B; B = A; A = (t1 + t2) >>> 0;
    }
    h[0] = (h[0] + A) >>> 0; h[1] = (h[1] + B) >>> 0; h[2] = (h[2] + C) >>> 0; h[3] = (h[3] + D) >>> 0;
    h[4] = (h[4] + E) >>> 0; h[5] = (h[5] + F) >>> 0; h[6] = (h[6] + G) >>> 0; h[7] = (h[7] + H) >>> 0;
  }
  const out = new Uint8Array(32);
  const odv = new DataView(out.buffer);
  for (let i = 0; i < 8; i++) odv.setUint32(i * 4, h[i]);
  return out;
}

export function toHex(b: Uint8Array): string {
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

export function fromHex(s: string): Uint8Array {
  const clean = s.trim();
  if (clean.length % 2 !== 0 || /[^0-9a-fA-F]/.test(clean)) throw new Error("bad hex");
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export async function sha256Hex(s: string): Promise<string> {
  const bytes = new TextEncoder().encode(s);
  const subtle = typeof globalThis.crypto !== "undefined" ? globalThis.crypto.subtle : undefined;
  if (subtle) {
    try {
      return toHex(new Uint8Array(await subtle.digest("SHA-256", bytes)));
    } catch {
      /* fall through to JS */
    }
  }
  return toHex(sha256Js(bytes));
}

export function eventBody(ev: AgentEvent): Record<string, unknown> {
  const { hash: _omit, ...body } = ev as AgentEvent & Record<string, unknown>;
  void _omit;
  return body;
}

export async function computeEventHash(ev: AgentEvent): Promise<string> {
  return sha256Hex(ev.prev_hash + canonicalJson(eventBody(ev)));
}

export type EventCheck = {
  id: string;
  index: number;
  summary: string;
  hashOk: boolean; // stored hash == recomputed hash
  linkOk: boolean; // prev_hash == previous event's hash (or genesis)
  expected: string;
  stored: string;
};

export type ReceiptCheck = {
  events: EventCheck[];
  chainOk: boolean;
  finalHashOk: boolean;
  signatureOk: boolean;
  valid: boolean;
  firstBadIndex: number | null;
};

export function verifySignature(finalHash: string, signatureHex: string, publicKeyHex: string): boolean {
  try {
    const msg = new TextEncoder().encode(finalHash);
    return nacl.sign.detached.verify(msg, fromHex(signatureHex), fromHex(publicKeyHex));
  } catch {
    return false;
  }
}

export async function verifyReceipt(r: Receipt): Promise<ReceiptCheck> {
  const checks: EventCheck[] = [];
  let prev = GENESIS_HASH;
  for (let i = 0; i < r.events.length; i++) {
    const ev = r.events[i];
    const expected = await computeEventHash(ev);
    checks.push({
      id: ev.id,
      index: i,
      summary: ev.summary,
      hashOk: expected === ev.hash,
      linkOk: ev.prev_hash === prev,
      expected,
      stored: ev.hash,
    });
    prev = ev.hash;
  }
  const chainOk = checks.every((c) => c.hashOk && c.linkOk);
  const last = r.events[r.events.length - 1];
  const finalHashOk = !!last && last.hash === r.final_hash;
  const signatureOk = verifySignature(r.final_hash, r.signature, r.public_key);
  const bad = checks.find((c) => !c.hashOk || !c.linkOk);
  return {
    events: checks,
    chainOk,
    finalHashOk,
    signatureOk,
    valid: chainOk && finalHashOk && signatureOk,
    firstBadIndex: bad ? bad.index : null,
  };
}
