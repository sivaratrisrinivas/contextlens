#!/usr/bin/env python3
"""GS-T8: cache hit rate and cost saved per session.

Extends PaperReadingAPITester from backend_test.py. Drives the real FastAPI
lookup, rhetorical, and assumptions routes with an in-memory DB so a clean
checkout does not need MongoDB, an Emergent key, or a live Gemini call.

LLM HTTP is stubbed. Input tokens are the real prompts built in server.py.
Output tokens are the stub completion. Dollar figures use Gemini 3 Flash
Preview list prices. This is estimated LLM spend, not a billed invoice.

From the repo root:

    python bench/gs_t8_cache_hit_cost.py
"""

from __future__ import annotations

import ctypes
import hashlib
import json
import os
import platform
import re
import subprocess
import sys
import tempfile
import uuid
from datetime import date, datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"
DATASET_PATH = Path(__file__).resolve().parent / "gs_t8_session.json"
RESULTS_PATH = Path(__file__).resolve().parent / "gs_t8_cache_hit_cost_results.json"

MODEL_NAME = "gemini-3-flash-preview"
PRICING_URL = "https://ai.google.dev/gemini-api/docs/pricing"
PRICING_AS_OF = "2026-08-24"
INPUT_USD_PER_MILLION = 0.50
OUTPUT_USD_PER_MILLION = 3.00

STUB_COMPLETION = (
    "In this passage the term is used in its technical sense. "
    "It names a defined quantity or mechanism in the surrounding argument, "
    "not a casual synonym."
)


class LlmRecorder:
    def __init__(self):
        self.calls: list[dict] = []

    def record(self, system_message: str, user_text: str) -> None:
        self.calls.append(
            {
                "system": system_message,
                "user": user_text,
                "completion": STUB_COMPLETION,
            }
        )


LLM_RECORDER = LlmRecorder()


def ensure_deps() -> None:
    try:
        import fastapi  # noqa: F401
        import motor  # noqa: F401
        import tiktoken  # noqa: F401
    except ImportError:
        req_path = BACKEND / "requirements.txt"
        lines = [
            ln
            for ln in req_path.read_text().splitlines()
            if ln.strip()
            and not ln.strip().startswith("#")
            and "emergentintegrations" not in ln
        ]
        handle, tmp_name = tempfile.mkstemp(prefix="gs-t8-req-", suffix=".txt")
        os.close(handle)
        tmp = Path(tmp_name)
        tmp.write_text("\n".join(lines) + "\n")
        try:
            subprocess.check_call(
                [sys.executable, "-m", "pip", "install", "-r", str(tmp)]
            )
        finally:
            tmp.unlink(missing_ok=True)


def install_emergent_stub() -> None:
    import types

    pkg = types.ModuleType("emergentintegrations")
    llm = types.ModuleType("emergentintegrations.llm")
    chat = types.ModuleType("emergentintegrations.llm.chat")

    class LlmChat:
        def __init__(self, api_key=None, session_id=None, system_message=""):
            self.system_message = system_message or ""

        def with_model(self, *args, **kwargs):
            return self

        async def send_message(self, msg):
            text = getattr(msg, "text", str(msg))
            LLM_RECORDER.record(self.system_message, text)
            return STUB_COMPLETION

    class UserMessage:
        def __init__(self, text=""):
            self.text = text

    chat.LlmChat = LlmChat
    chat.UserMessage = UserMessage
    sys.modules["emergentintegrations"] = pkg
    sys.modules["emergentintegrations.llm"] = llm
    sys.modules["emergentintegrations.llm.chat"] = chat


class FakeInsertOneResult:
    def __init__(self, inserted_id):
        self.inserted_id = inserted_id


class FakeDeleteResult:
    def __init__(self, n):
        self.deleted_count = n


class FakeCursor:
    def __init__(self, docs):
        self._docs = list(docs)

    def sort(self, key, direction=-1):
        reverse = direction == -1
        self._docs.sort(key=lambda d: d.get(key, ""), reverse=reverse)
        return self

    async def to_list(self, n):
        return [dict(d) for d in self._docs[:n]]


class FakeCollection:
    def __init__(self):
        self._docs = []

    def _matches(self, doc, filt):
        if not filt:
            return True
        return all(doc.get(k) == v for k, v in filt.items())

    def _project(self, doc, proj):
        out = dict(doc)
        if proj and proj.get("_id") == 0:
            out.pop("_id", None)
        return out

    async def find_one(self, filt=None, proj=None):
        for d in self._docs:
            if self._matches(d, filt):
                return self._project(d, proj)
        return None

    async def insert_one(self, doc):
        stored = dict(doc)
        stored.setdefault("_id", str(uuid.uuid4()))
        self._docs.append(stored)
        return FakeInsertOneResult(stored["_id"])

    def find(self, filt=None, proj=None):
        matched = [
            self._project(d, proj) for d in self._docs if self._matches(d, filt)
        ]
        return FakeCursor(matched)

    async def delete_one(self, filt=None):
        for i, d in enumerate(self._docs):
            if self._matches(d, filt):
                self._docs.pop(i)
                return FakeDeleteResult(1)
        return FakeDeleteResult(0)

    async def delete_many(self, filt=None):
        keep = [d for d in self._docs if not self._matches(d, filt)]
        n = len(self._docs) - len(keep)
        self._docs = keep
        return FakeDeleteResult(n)

    async def create_index(self, *args, **kwargs):
        return "ok"


class FakeDB:
    def __init__(self):
        self.word_cache = FakeCollection()
        self.rhetorical_cache = FakeCollection()
        self.assumptions_cache = FakeCollection()
        self.papers = FakeCollection()
        self.bookmarks = FakeCollection()


def hardware_info() -> dict:
    cpu = platform.processor() or ""
    try:
        for line in Path("/proc/cpuinfo").read_text().splitlines():
            if line.lower().startswith("model name"):
                cpu = line.split(":", 1)[1].strip()
                break
    except OSError:
        pass
    return {
        "platform": platform.platform(),
        "python": platform.python_version(),
        "cpu": cpu or "unknown",
        "cpu_count": os.cpu_count(),
        "machine": platform.machine(),
    }


def tokenize_paragraphs(text: str) -> list[dict]:
    """Match frontend/src/components/PaperReader.jsx tokenizeParagraphs."""
    normalized = text.replace("\r\n", "\n").replace("\r", "\n")
    raw_paragraphs = re.split(r"\n\s*\n", normalized)
    all_tokens = []
    global_idx = 0
    token_re = re.compile(r"(\S+)(\s*)")
    for para in raw_paragraphs:
        para = para.strip()
        if not para:
            continue
        for match in token_re.finditer(para):
            raw = match.group(1)
            clean = re.sub(r"[^a-zA-Z0-9'-]", "", raw).lower()
            all_tokens.append(
                {
                    "text": raw,
                    "space": match.group(2),
                    "globalIndex": global_idx,
                    "clean": clean,
                    "fingerprint": None,
                    "context": None,
                    "sentence": None,
                }
            )
            global_idx += 1
    for i, tok in enumerate(all_tokens):
        if tok["clean"]:
            tok["context"] = extract_context(i, all_tokens)
            tok["fingerprint"] = frontend_fingerprint(tok["clean"], tok["context"])
            tok["sentence"] = extract_sentence(i, all_tokens)
    return all_tokens


def extract_context(idx: int, tokens: list[dict]) -> str:
    s = max(0, idx - 20)
    e = min(len(tokens), idx + 20)
    return " ".join(t["text"] for t in tokens[s:e])


def extract_sentence(idx: int, tokens: list[dict]) -> str:
    start = idx
    while start > 0:
        prev = tokens[start - 1]["text"]
        if re.search(r'[.!?]["\']?\s*$', prev):
            break
        start -= 1
    end = idx
    while end < len(tokens) - 1:
        curr = tokens[end]["text"]
        if re.search(r'[.!?]["\']?\s*$', curr):
            end += 1
            break
        end += 1
    return " ".join(t["text"] for t in tokens[start:end])


def frontend_fingerprint(word: str, context: str) -> str:
    """djb2 as in PaperReader.jsx makeFingerprint, JS |0 and >>>0."""
    raw = f"{word.lower().strip()}|{context.strip()}"
    h = 5381
    for ch in raw:
        h = ctypes.c_int32((h << 5) + h + ord(ch)).value
    unsigned = h & 0xFFFFFFFF
    chars = "0123456789abcdefghijklmnopqrstuvwxyz"
    if unsigned == 0:
        return "0"
    out = []
    n = unsigned
    while n:
        n, r = divmod(n, 36)
        out.append(chars[r])
    return "".join(reversed(out))


def backend_fingerprint(word: str, context: str) -> str:
    raw = f"{word.lower().strip()}|{context.strip()}"
    return hashlib.sha256(raw.encode()).hexdigest()


def api_word(token: dict) -> str:
    return re.sub(r"[^a-zA-Z0-9'-]", "", token["text"])


def find_token(tokens: list[dict], word: str, occurrence: int) -> dict:
    hits = [t for t in tokens if t["clean"] == word.lower()]
    if occurrence >= len(hits):
        raise KeyError(f"no occurrence {occurrence} of {word!r}")
    return hits[occurrence]


def count_tokens(text: str, enc) -> int:
    return len(enc.encode(text or ""))


def usd_cost(input_tokens: int, output_tokens: int) -> float:
    return (
        input_tokens / 1_000_000 * INPUT_USD_PER_MILLION
        + output_tokens / 1_000_000 * OUTPUT_USD_PER_MILLION
    )


def print_table(rows: list[dict], extra_failures: list) -> None:
    cols = [
        "session",
        "lookups",
        "hits",
        "misses",
        "hit_rate",
        "llm_usd",
        "cost_saved_usd",
    ]
    widths = {c: len(c) for c in cols}
    rendered = []
    for row in rows:
        rec = {
            "session": row["id"],
            "lookups": str(row["lookups"]),
            "hits": str(row["hits"]),
            "misses": str(row["misses"]),
            "hit_rate": f"{row['hit_rate']:.4f}",
            "llm_usd": f"{row['llm_usd']:.8f}",
            "cost_saved_usd": f"{row['cost_saved_usd']:.8f}",
        }
        rendered.append(rec)
        for c in cols:
            widths[c] = max(widths[c], len(rec[c]))

    def fmt(rec):
        return "| " + " | ".join(rec[c].ljust(widths[c]) for c in cols) + " |"

    header = {c: c for c in cols}
    rule = {c: "-" * widths[c] for c in cols}
    print(fmt(header))
    print(fmt(rule))
    for rec in rendered:
        print(fmt(rec))
    if extra_failures:
        print("")
        print("Failures")
        for f in extra_failures:
            print(f"- {f['id']}: {f['detail']}")


def lookup_key(kind: str, payload: dict) -> str:
    if kind == "define":
        return "define:" + backend_fingerprint(payload["word"], payload["context"])
    if kind == "intent":
        return "intent:" + backend_fingerprint(
            f"rhetorical:{payload['word']}", payload["sentence"]
        )
    if kind == "challenge":
        return "challenge:" + backend_fingerprint("assumptions", payload["sentence"])
    raise ValueError(kind)


def main() -> int:
    ensure_deps()
    os.environ.setdefault("MONGO_URL", "mongodb://127.0.0.1:27017")
    os.environ.setdefault("DB_NAME", "gs_t8_measure")
    os.environ.setdefault("EMERGENT_LLM_KEY", "stub")
    os.environ.setdefault("CORS_ORIGINS", "*")

    install_emergent_stub()
    sys.path.insert(0, str(BACKEND))
    sys.path.insert(0, str(ROOT))

    import logging

    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("httpcore").setLevel(logging.WARNING)
    logging.getLogger("server").setLevel(logging.WARNING)

    import tiktoken
    from fastapi.testclient import TestClient

    import server as server_mod
    from backend_test import PaperReadingAPITester

    class _NullMongo:
        def close(self):
            return None

    server_mod.db = FakeDB()
    server_mod.client = _NullMongo()

    class LocalTester(PaperReadingAPITester):
        def __init__(self, client: TestClient):
            super().__init__(base_url="/api")
            self.http = client

        def run_test(self, name, method, endpoint, expected_status, data=None, files=None):
            url = f"/api/{endpoint}"
            self.tests_run += 1
            try:
                if method == "GET":
                    response = self.http.get(url)
                elif method == "POST":
                    if files:
                        response = self.http.post(url, data=data, files=files)
                    elif (
                        isinstance(data, dict)
                        and "title" in data
                        and "content" in data
                        and "word" not in data
                        and "sentence" not in data
                    ):
                        response = self.http.post(url, data=data)
                    elif data is not None:
                        response = self.http.post(url, json=data)
                    else:
                        response = self.http.post(url)
                elif method == "DELETE":
                    response = self.http.delete(url)
                else:
                    raise ValueError(method)
            except Exception as exc:
                print(f"FAIL {name}: {exc}")
                return False, {}

            if response.status_code != expected_status:
                print(
                    f"FAIL {name}: expected {expected_status}, "
                    f"got {response.status_code} {response.text}"
                )
                return False, {}
            self.tests_passed += 1
            try:
                return True, response.json()
            except Exception:
                return True, {}

    enc = tiktoken.get_encoding("cl100k_base")
    dataset = json.loads(DATASET_PATH.read_text())
    tokens = tokenize_paragraphs(dataset["content"])
    failures: list[dict] = []

    prefetch_matches = 0
    prefetch_checked = 0
    for tok in tokens:
        if not tok["clean"]:
            continue
        prefetch_checked += 1
        backend_fp = backend_fingerprint(tok["clean"], tok["context"])
        if tok["fingerprint"] == backend_fp:
            prefetch_matches += 1
    prefetch_rate = prefetch_matches / prefetch_checked if prefetch_checked else 0.0
    if prefetch_rate != 1.0:
        failures.append(
            {
                "id": "frontend_prefetch_fingerprint_mismatch",
                "detail": (
                    f"{prefetch_matches}/{prefetch_checked} frontend djb2 keys matched "
                    "backend SHA-256 fingerprints. Batch GET paper-cache cannot populate "
                    "the click Map for returning readers. Repeat POSTs still hit the "
                    "backend cache, so LLM cost is still avoided."
                ),
            }
        )

    miss_cost_by_key: dict[str, float] = {}

    with TestClient(server_mod.app) as http:
        tester = LocalTester(http)
        ok, paper = tester.run_test(
            "create fixture paper",
            "POST",
            "papers",
            200,
            data={"title": dataset["title"], "content": dataset["content"]},
        )
        if not ok or not paper.get("id"):
            failures.append(
                {
                    "id": "paper_create_failed",
                    "detail": "POST /api/papers did not return an id",
                }
            )
            RESULTS_PATH.write_text(json.dumps({"gate": "GS-T8", "status": "failed", "failures": failures}, indent=2) + "\n")
            print_table([], failures)
            return 1

        paper_id = paper["id"]
        session_rows = []
        click_log = []

        for session in dataset["sessions"]:
            hits = 0
            misses = 0
            llm_usd = 0.0
            saved_usd = 0.0
            input_tokens_total = 0
            output_tokens_total = 0
            session_failures: list[dict] = []

            for click in session["clicks"]:
                try:
                    tok = find_token(tokens, click["word"], click["occurrence"])
                except KeyError as exc:
                    session_failures.append({"id": "missing_token", "detail": str(exc)})
                    continue

                kind = click["kind"]
                if kind == "define":
                    payload = {
                        "word": api_word(tok),
                        "context": tok["context"],
                        "paper_id": paper_id,
                    }
                    endpoint = "lookup"
                elif kind == "intent":
                    payload = {
                        "word": api_word(tok),
                        "sentence": tok["sentence"],
                        "context": tok["context"],
                        "paper_id": paper_id,
                    }
                    endpoint = "rhetorical"
                elif kind == "challenge":
                    payload = {
                        "sentence": tok["sentence"],
                        "context": tok["context"],
                        "paper_id": paper_id,
                    }
                    endpoint = "assumptions"
                else:
                    session_failures.append({"id": "unknown_kind", "detail": kind})
                    continue

                calls_before = len(LLM_RECORDER.calls)
                ok, body = tester.run_test(
                    f"{session['id']} {kind} {click['word']}",
                    "POST",
                    endpoint,
                    200,
                    data=payload,
                )
                if not ok:
                    session_failures.append(
                        {
                            "id": "lookup_http_failed",
                            "detail": f"{session['id']} {kind} {click['word']}",
                        }
                    )
                    continue

                key = lookup_key(kind, payload)
                cached_flag = bool(body.get("cached"))
                new_calls = LLM_RECORDER.calls[calls_before:]

                if cached_flag:
                    if new_calls:
                        session_failures.append(
                            {
                                "id": "cached_true_but_llm_called",
                                "detail": f"{session['id']} {kind} {click['word']}",
                            }
                        )
                    hits += 1
                    if key not in miss_cost_by_key:
                        session_failures.append(
                            {"id": "hit_without_prior_miss", "detail": key}
                        )
                    else:
                        saved_usd += miss_cost_by_key[key]
                    classified = "hit"
                else:
                    if not new_calls:
                        session_failures.append(
                            {
                                "id": "cached_false_but_no_llm_call",
                                "detail": f"{session['id']} {kind} {click['word']}",
                            }
                        )
                    misses += 1
                    in_tok = 0
                    out_tok = 0
                    for call in new_calls:
                        in_tok += count_tokens(call["system"], enc) + count_tokens(
                            call["user"], enc
                        )
                        out_tok += count_tokens(call["completion"], enc)
                    cost = usd_cost(in_tok, out_tok)
                    miss_cost_by_key[key] = cost
                    llm_usd += cost
                    input_tokens_total += in_tok
                    output_tokens_total += out_tok
                    classified = "miss"

                click_log.append(
                    {
                        "session": session["id"],
                        "kind": kind,
                        "word": click["word"],
                        "cached_flag": cached_flag,
                        "classified": classified,
                    }
                )

            lookups = hits + misses
            hit_rate = hits / lookups if lookups else 0.0
            session_rows.append(
                {
                    "id": session["id"],
                    "lookups": lookups,
                    "hits": hits,
                    "misses": misses,
                    "hit_rate": hit_rate,
                    "llm_usd": llm_usd,
                    "cost_saved_usd": saved_usd,
                    "input_tokens": input_tokens_total,
                    "output_tokens": output_tokens_total,
                    "failures": session_failures,
                }
            )
            failures.extend(session_failures)

    total_lookups = sum(s["lookups"] for s in session_rows)
    total_hits = sum(s["hits"] for s in session_rows)
    total_misses = sum(s["misses"] for s in session_rows)
    overall_hit_rate = total_hits / total_lookups if total_lookups else 0.0
    n_sessions = len(session_rows)
    cost_saved_per_session = (
        sum(s["cost_saved_usd"] for s in session_rows) / n_sessions if n_sessions else 0.0
    )

    results = {
        "gate": "GS-T8",
        "status": "ok",
        "date": date.today().isoformat(),
        "measured_at": datetime.now(timezone.utc).isoformat(),
        "model": MODEL_NAME,
        "llm_mode": "stubbed",
        "pricing": {
            "source": PRICING_URL,
            "as_of": PRICING_AS_OF,
            "input_usd_per_million": INPUT_USD_PER_MILLION,
            "output_usd_per_million": OUTPUT_USD_PER_MILLION,
            "tokenizer": "tiktoken cl100k_base",
            "tokenizer_note": (
                "Gemini tokenizer is not in this checkout. "
                "Token counts are an approximation."
            ),
        },
        "dataset": {
            "name": dataset["name"],
            "path": str(DATASET_PATH.relative_to(ROOT)),
            "papers": 1,
            "word_tokens": len(tokens),
            "clean_word_tokens": sum(1 for t in tokens if t["clean"]),
            "scripted_lookups": total_lookups,
            "sessions": n_sessions,
            "notes": dataset.get("notes"),
        },
        "hardware": hardware_info(),
        "sessions": [
            {
                **{k: v for k, v in s.items() if k != "failures"},
                "failure_count": len(s["failures"]),
            }
            for s in session_rows
        ],
        "summary": {
            "cache_hit_rate": overall_hit_rate,
            "cost_saved_per_session_usd": cost_saved_per_session,
            "lookups": total_lookups,
            "hits": total_hits,
            "misses": total_misses,
            "llm_calls": len(LLM_RECORDER.calls),
            "total_llm_usd": sum(s["llm_usd"] for s in session_rows),
            "total_cost_saved_usd": sum(s["cost_saved_usd"] for s in session_rows),
        },
        "frontend_prefetch": {
            "keys_checked": prefetch_checked,
            "sha256_djb2_matches": prefetch_matches,
            "match_rate": prefetch_rate,
        },
        "failures": failures,
        "click_log": click_log,
    }

    RESULTS_PATH.write_text(json.dumps(results, indent=2) + "\n")
    print(f"Wrote {RESULTS_PATH.relative_to(ROOT)}")
    print("")
    print_table(session_rows, failures)
    print("")
    print(f"cache_hit_rate (all scripted lookups): {overall_hit_rate:.4f}")
    print(
        f"cost_saved_per_session_usd (mean of {n_sessions} sessions): "
        f"{cost_saved_per_session:.8f}"
    )
    blocking = [f for f in failures if f["id"] != "frontend_prefetch_fingerprint_mismatch"]
    return 1 if blocking else 0


if __name__ == "__main__":
    raise SystemExit(main())
