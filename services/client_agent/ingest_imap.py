"""Read-only Gmail reader (IMAP, or an Airbyte Gmail connector when USE_AIRBYTE=1). Email is context only.

Never sends, moves, flags or deletes: INBOX is selected readonly and bodies are fetched with BODY.PEEK.
Each new message -> fraud_check.classify -> Cognee observation -> POST envoy /inbox/ingest.
"""
from __future__ import annotations

import asyncio
import email
import email.policy
import html
import imaplib
import json
import re
import threading
from email.message import EmailMessage
from email.utils import parseaddr, parsedate_to_datetime
from typing import Any

import httpx

from services.client_agent import fraud_check
from services.common.config import ROOT, URLS, env, use_real
from services.common.events import now_iso

IMAP_HOST, IMAP_PORT = "imap.gmail.com", 993
RUNTIME = ROOT / "data" / "runtime"
STATE_PATH = RUNTIME / "imap_state.json"
CACHE_PATH = RUNTIME / "imap_cache.json"
SEED_SENDERS = frozenset({"escrow.team.demo@gmail.com", "emma.envoy.demo@gmail.com"})
FIRST_RUN_MAX = 50  # on a fresh state, read only the newest N messages
MAX_BACKOFF_S = 60

_lock = threading.Lock()
_cache: dict[str, dict[str, Any]] = {}
_status: dict[str, Any] = {"source": "imap", "connected": False, "watching": False, "last_poll_at": None,
                           "last_error": None}


# ---------- config / state ----------

def enabled() -> bool:
    return env("LIVE_MODE", "0") == "1" and bool(env("GMAIL_APP_PASSWORD")) and bool(env("GMAIL_USER"))


def poll_seconds() -> float:
    try:
        return max(2.0, float(env("GMAIL_POLL_SECONDS", "5")))
    except ValueError:
        return 5.0


def _load_json(path: Any, default: Any) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return default


def _save_json(path: Any, data: Any) -> None:
    RUNTIME.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
    tmp.replace(path)


def load_state() -> dict[str, Any]:
    return _load_json(STATE_PATH, {"last_uid": 0, "uidvalidity": None})


def cached_emails() -> list[dict[str, Any]]:
    with _lock:
        if not _cache:
            for e in _load_json(CACHE_PATH, []):
                _cache[str(e["uid"])] = e
        return list(_cache.values())


def status() -> dict[str, Any]:
    return {**_status, "count": len(cached_emails()),
            "flagged_count": sum(1 for e in cached_emails() if e.get("flag"))}


# ---------- parsing ----------

def _strip_html(s: str) -> str:
    s = re.sub(r"(?is)<(script|style).*?</\1>", " ", s)
    s = re.sub(r"(?s)<!--.*?-->", " ", s)
    s = re.sub(r"(?s)<br\s*/?>|</p>", "\n", s)
    return html.unescape(re.sub(r"(?s)<[^>]+>", " ", s)).strip()


def parse_message(uid: str, raw: bytes) -> dict[str, Any]:
    """RFC822 bytes -> raw message dict for the classifier."""
    msg = email.message_from_bytes(raw, policy=email.policy.default)
    assert isinstance(msg, EmailMessage)
    name, addr = parseaddr(str(msg.get("From", "")))
    plain = html_part = ""
    attachments: list[str] = []
    for part in msg.walk():
        if part.is_multipart():
            continue
        fn = part.get_filename()
        if fn:
            attachments.append(str(fn))
            continue
        ctype = part.get_content_type()
        try:
            content = part.get_content()
        except Exception:
            content = (part.get_payload(decode=True) or b"").decode("utf-8", "replace")
        if ctype == "text/plain" and not plain:
            plain = str(content)
        elif ctype == "text/html" and not html_part:
            html_part = str(content)
    try:
        date = parsedate_to_datetime(str(msg.get("Date"))).isoformat()
    except Exception:
        date = now_iso()
    addr = addr.lower()
    delivered_from = addr
    # scripts/seed_inbox.py sends every persona from one team demo account (Gmail rewrites From), carrying the
    # persona in Reply-To. Map it back ONLY for those team accounts, so an outside sender can never use this.
    _, reply_to = parseaddr(str(msg.get("Reply-To", "")))
    if reply_to and addr in SEED_SENDERS and str(msg.get("X-Envoy-Demo", "")).startswith("seed"):
        addr = reply_to.lower()
    return {"uid": uid, "from_name": name, "from_addr": addr, "delivered_from": delivered_from,
            "to": str(msg.get("To", "")),
            "subject": str(msg.get("Subject", "")), "date": date, "body": plain or _strip_html(html_part),
            # Raw HTML is scanned for hidden instructions (HTML comments) but not shown as the body.
            "html": html_part, "attachments": attachments}


def classify(raw_msg: dict[str, Any], origin: str) -> dict[str, Any]:
    html_part = raw_msg.pop("html", "") or ""
    hidden_src = {**raw_msg, "body": f"{raw_msg.get('body', '')}\n{html_part}"}
    e = fraud_check.classify(hidden_src)
    e["body"] = raw_msg.get("body", "")
    e["source"] = origin
    return e


# ---------- readers ----------

class ImapReader:
    def __init__(self) -> None:
        self.conn: imaplib.IMAP4_SSL | None = None

    def connect(self) -> None:
        self.close()
        conn = imaplib.IMAP4_SSL(IMAP_HOST, IMAP_PORT, timeout=15)
        conn.login(env("GMAIL_USER"), env("GMAIL_APP_PASSWORD").replace(" ", ""))
        typ, data = conn.select("INBOX", readonly=True)
        if typ != "OK":
            raise imaplib.IMAP4.error(f"select INBOX failed: {data}")
        self.conn = conn

    def close(self) -> None:
        if self.conn is not None:
            try:
                self.conn.logout()
            except Exception:
                pass
        self.conn = None

    def fetch_new(self) -> list[dict[str, Any]]:
        if self.conn is None:
            self.connect()
        assert self.conn is not None
        self.conn.noop()  # refresh the readonly mailbox view
        st = load_state()
        uv = self.conn.untagged_responses.get("UIDVALIDITY", [None])[0]
        uv = uv.decode() if isinstance(uv, bytes) else uv
        if uv and st.get("uidvalidity") and str(uv) != str(st["uidvalidity"]):
            st = {"last_uid": 0, "uidvalidity": uv}
        last = int(st.get("last_uid") or 0)
        typ, data = self.conn.uid("search", None, f"UID {last + 1}:*")
        if typ != "OK":
            raise imaplib.IMAP4.error(f"UID SEARCH failed: {data}")
        uids = sorted(int(u) for u in (data[0] or b"").split() if int(u) > last)
        if last == 0:
            uids = uids[-FIRST_RUN_MAX:]
        out: list[dict[str, Any]] = []
        for u in uids:
            typ, parts = self.conn.uid("fetch", str(u), "(BODY.PEEK[])")
            raw = next((p[1] for p in parts or [] if isinstance(p, tuple)), None)
            if typ == "OK" and raw:
                out.append(parse_message(str(u), raw))
        if uids:
            _save_json(STATE_PATH, {"last_uid": uids[-1], "uidvalidity": uv or st.get("uidvalidity")})
        return out


def airbyte_fetch() -> list[dict[str, Any]] | None:
    """Airbyte Gmail connector (PyAirbyte), same output shape. None on any failure -> IMAP."""
    if not use_real("airbyte"):
        return None
    try:
        import airbyte as ab  # type: ignore

        src = ab.get_source("source-gmail", config=json.loads(env("AIRBYTE_GMAIL_CONFIG") or "{}"),
                            install_if_missing=False)
        src.select_streams(["messages"])
        seen = {e["uid"] for e in cached_emails()}
        out = []
        for rec in src.read().streams["messages"]:
            r = dict(rec)
            uid = f"ab-{r.get('id')}"
            if uid in seen:
                continue
            name, addr = parseaddr(str(r.get("from", "")))
            out.append({"uid": uid, "from_name": name, "from_addr": addr.lower(), "to": str(r.get("to", "")),
                        "subject": str(r.get("subject", "")), "date": str(r.get("date") or now_iso()),
                        "body": str(r.get("body") or r.get("snippet") or ""), "html": str(r.get("html") or ""),
                        "attachments": [str(a) for a in r.get("attachments") or []]})
        return out
    except Exception:
        return None


# ---------- delivery ----------

def remember(e: dict[str, Any]) -> None:
    try:
        from services.client_agent import memory

        uri = f"{e.get('source', 'imap')}://inbox/{e['uid']}"
        memory.remember(fraud_check.observation_text(e), uri, e["trust"], e.get("date") or None)
    except Exception:
        pass


def push(e: dict[str, Any] | None = None, timeout: float = 3.0) -> dict[str, Any] | None:
    # Only a running live reader reports status; otherwise envoy keeps serving the seed inbox.
    body: dict[str, Any] = {"status": status()} if enabled() else {}
    if e is not None:
        body["email"] = e
    try:
        r = httpx.post(f"{URLS['envoy']}/inbox/ingest", json=body, timeout=timeout)
        r.raise_for_status()
        return r.json()
    except Exception:
        return None


def deliver(e: dict[str, Any]) -> dict[str, Any] | None:
    with _lock:
        _cache[e["uid"]] = e
        if not e.get("simulated"):
            _save_json(CACHE_PATH, [x for x in _cache.values() if not x.get("simulated")])
    remember(e)
    return push(e)


def poll_once(reader: ImapReader) -> int:
    msgs = airbyte_fetch()
    origin = "airbyte" if msgs is not None else "imap"
    if msgs is None:
        msgs = reader.fetch_new()
    _status.update(source=origin, connected=True, watching=True, last_poll_at=now_iso(), last_error=None)
    for m in msgs:
        deliver(classify(m, origin))
    resp = push()  # heartbeat
    # Envoy restarted and lost its inbox: re-send what we already read (it de-dupes by uid).
    if resp and int(resp.get("live_count", 0)) < len([e for e in cached_emails() if not e.get("simulated")]):
        for e in cached_emails():
            push(e)
    return len(msgs)


async def run_poller() -> None:
    """Background task: never raises; backs off on auth/network errors and reports them as status."""
    reader = ImapReader()
    fails = 0
    _status.update(watching=True)
    while True:
        try:
            await asyncio.to_thread(poll_once, reader)
            fails = 0
            await asyncio.sleep(poll_seconds())
        except asyncio.CancelledError:
            reader.close()
            raise
        except Exception as ex:
            fails += 1
            reader.close()
            reason = _reason(ex)
            _status.update(connected=False, watching=True, last_poll_at=now_iso(), last_error=reason)
            await asyncio.to_thread(push)
            await asyncio.sleep(min(MAX_BACKOFF_S, poll_seconds() * 2 ** min(fails, 4)))


def _reason(ex: Exception) -> str:
    msg = str(ex) or ex.__class__.__name__
    if isinstance(ex, imaplib.IMAP4.error) and ("AUTHENTICATIONFAILED" in msg or "Invalid credentials" in msg):
        return "Gmail rejected the login: check GMAIL_USER and the 16-char GMAIL_APP_PASSWORD (2FA + app password)."
    if isinstance(ex, (OSError, TimeoutError)):
        return f"Network error reaching {IMAP_HOST}:{IMAP_PORT}: {msg}"
    return f"{ex.__class__.__name__}: {msg}"[:300]


def check_login() -> tuple[bool, str]:
    """For `make warmup`: one read-only login + select, then logout."""
    if not env("GMAIL_USER") or not env("GMAIL_APP_PASSWORD"):
        return False, "GMAIL_USER / GMAIL_APP_PASSWORD not set in .env"
    r = ImapReader()
    try:
        r.connect()
        assert r.conn is not None
        typ, data = r.conn.uid("search", None, "ALL")
        n = len((data[0] or b"").split()) if typ == "OK" else 0
        return True, f"IMAP login OK as {env('GMAIL_USER')} (INBOX readonly, {n} messages)"
    except Exception as ex:
        return False, _reason(ex)
    finally:
        r.close()
