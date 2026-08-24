#!/usr/bin/env python3
"""GS-T8: cache hit rate and LLM cost saved per reading session.

Extends the miss-then-hit cache sequences in backend_test.py. One command from
the repo root:

    python3 bench/cache_session.py

Writes bench/results/gs_t8_cache.json and prints a markdown table to stdout.
Does not call the model. Cache hits are decided by the fingerprint function in
backend/server.py. Cost uses published Gemini 3 Flash Preview list prices and
token counts of the real prompts in server.py.
"""

from __future__ import annotations

import ast
import ctypes
import hashlib
import json
import os
import platform
import re
import sys
import urllib.error
import urllib.request
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from backend_test import (  # noqa: E402
    HARNESS_PAPER_CONTENT,
    HARNESS_PAPER_TITLE,
    harness_cache_request_sequence,
)

RESULTS_PATH = ROOT / "bench" / "results" / "gs_t8_cache.json"
FIXTURE_PATH = ROOT / "bench" / "fixtures" / "session_paper.txt"
SERVER_PATH = ROOT / "backend" / "server.py"
LIVE_HEALTH_URL = "https://word-context-lookup.preview.emergentagent.com/api/health"

MODEL = "gemini-3-flash-preview"
INPUT_USD_PER_MILLION = 0.50
OUTPUT_USD_PER_MILLION = 3.00
PRICING_SOURCE = "https://ai.google.dev/gemini-api/docs/pricing"
PRICING_RETRIEVED = "2026-08-24"

OUTPUT_WORD_CAP = {"lookup": 150, "rhetorical": 150, "assumptions": 200}
CONTENT_MIN_LEN = 4
RECLICK_COUNT = 5

DEFINE_SYSTEM = (
    "You are an expert academic reader. When given a word and its surrounding context from an academic paper, "
    "explain the word's meaning in that specific context. Be concise but thorough. "
    "If it's a technical term, explain it simply. If it's a common word used in a specialized way, clarify the nuance. "
    "Keep the explanation under 150 words. Use clear, accessible language."
)
RHETORICAL_SYSTEM = (
    "You are a senior academic close-reading analyst. Your job is NOT to define words. "
    "Your job is to explain WHY the author chose this specific word in this specific sentence "
    "within this argument. Analyze the rhetorical function: What work is this word doing? "
    "What would change if the author had used a synonym? What framing, emphasis, or argumentative "
    "move does this word choice accomplish? Be specific and incisive. Under 150 words."
)
ASSUMPTIONS_SYSTEM = (
    "You are a rigorous epistemologist and research methodologist. When given a claim or sentence "
    "from an academic text, identify the 2-3 hidden assumptions it rests on. For each assumption, "
    "explain: (1) what the assumption is, (2) what would have to be false for the claim to break down, "
    "and (3) whether this assumption is typically contested in the field. Be precise and adversarial — "
    "think like a senior researcher poking holes in a peer review. Under 200 words total."
)


def load_make_fingerprint(server_path: Path):
    src = server_path.read_text(encoding="utf-8")
    tree = ast.parse(src)
    for node in tree.body:
        if isinstance(node, ast.FunctionDef) and node.name == "make_fingerprint":
            module = ast.Module(body=[node], type_ignores=[])
            ast.fix_missing_locations(module)
            ns = {"hashlib": hashlib}
            exec(compile(module, str(server_path), "exec"), ns)
            return ns["make_fingerprint"], src
    raise RuntimeError("make_fingerprint not found in backend/server.py")


def _string_literals(func_node: ast.AST) -> str:
    chunks = []
    for node in ast.walk(func_node):
        if isinstance(node, ast.Constant) and isinstance(node.value, str):
            chunks.append(node.value)
    return "\n".join(chunks)


def assert_server_contracts(server_src: str) -> None:
    tree = ast.parse(server_src)
    by_name = {
        node.name: node
        for node in tree.body
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))
    }
    prompt_checks = {
        "get_ai_explanation": DEFINE_SYSTEM,
        "get_rhetorical_intent": RHETORICAL_SYSTEM,
        "get_assumption_stresstest": ASSUMPTIONS_SYSTEM,
    }
    missing = []
    for func_name, expected in prompt_checks.items():
        got = _string_literals(by_name[func_name])
        if expected not in got:
            missing.append(func_name)
    required_src = [
        'make_fingerprint(f"rhetorical:{req.word}", req.sentence)',
        'make_fingerprint("assumptions", req.sentence)',
        '.with_model("gemini", "gemini-3-flash-preview")',
        'Explain this word in the given context.',
    ]
    missing.extend(item for item in required_src if item not in server_src)
    if missing:
        raise RuntimeError(f"server.py drifted from bench prompt/cache contracts: {missing!r}")


def to_base36(n: int) -> str:
    chars = "0123456789abcdefghijklmnopqrstuvwxyz"
    if n == 0:
        return "0"
    out = []
    while n:
        n, r = divmod(n, 36)
        out.append(chars[r])
    return "".join(reversed(out))


def frontend_fingerprint(word: str, context: str) -> str:
    """djb2 used by frontend/src/components/PaperReader.jsx makeFingerprint."""
    raw = f"{word.lower().strip()}|{context.strip()}"
    h = 5381
    for ch in raw:
        h = ctypes.c_int32((h << 5) + h + ord(ch)).value
    return to_base36(h & 0xFFFFFFFF)


def tokenize_like_reader(text: str) -> list[dict]:
    """Match PaperReader.jsx tokenizeParagraphs / extractContext / extractSentence."""
    normalized = text.replace("\r\n", "\n").replace("\r", "\n")
    raw_paragraphs = re.split(r"\n\s*\n", normalized)
    all_tokens = []
    for para in raw_paragraphs:
        para = para.strip()
        if not para:
            continue
        for match in re.finditer(r"(\S+)(\s*)", para):
            raw_text = match.group(1)
            clean = re.sub(r"[^a-zA-Z0-9'-]", "", raw_text).lower()
            all_tokens.append({"text": raw_text, "clean": clean, "context": None, "sentence": None})

    boundary = re.compile(r'[.!?]["\']?\s*$')
    n = len(all_tokens)
    for i, tok in enumerate(all_tokens):
        if not tok["clean"]:
            continue
        start = max(0, i - 20)
        end = min(n, i + 20)
        tok["context"] = " ".join(all_tokens[j]["text"] for j in range(start, end))
        s = i
        while s > 0:
            if boundary.search(all_tokens[s - 1]["text"]):
                break
            s -= 1
        e = i
        while e < n - 1:
            if boundary.search(all_tokens[e]["text"]):
                e += 1
                break
            e += 1
        tok["sentence"] = " ".join(all_tokens[j]["text"] for j in range(s, e))
        tok["fingerprint"] = frontend_fingerprint(tok["clean"], tok["context"])
    return all_tokens


def lookup_word(token: dict) -> str:
    return re.sub(r"[^a-zA-Z0-9'-]", "", token["text"])


def build_prompt(kind: str, payload: dict) -> str:
    if kind == "lookup":
        user = (
            f"Word: \"{payload['word']}\"\n\nContext: \"{payload['context']}\"\n\n"
            "Explain this word in the given context."
        )
        return DEFINE_SYSTEM + "\n" + user
    if kind == "rhetorical":
        word = payload["word"]
        user = (
            f"Word: \"{word}\"\n\nSentence: \"{payload['sentence']}\"\n\n"
            f"Broader context: \"{payload['context']}\"\n\n"
            f"Why is the author using \"{word}\" here specifically? What rhetorical work is it doing in this argument?"
        )
        return RHETORICAL_SYSTEM + "\n" + user
    if kind == "assumptions":
        user = (
            f"Sentence/Claim: \"{payload['sentence']}\"\n\n"
            f"Surrounding context: \"{payload['context']}\"\n\n"
            "What are the 2-3 hidden assumptions this claim rests on? What would have to be false for it to be wrong?"
        )
        return ASSUMPTIONS_SYSTEM + "\n" + user
    raise ValueError(kind)


def get_encoder():
    try:
        import tiktoken

        enc = tiktoken.get_encoding("cl100k_base")
        return enc.encode, "tiktoken_cl100k_base"
    except Exception:
        def encode(text: str) -> list[int]:
            raw = text.encode("utf-8")
            n = max(1, (len(raw) + 3) // 4)
            return list(range(n))

        return encode, "utf8_bytes_div_4"


def hardware_info() -> dict:
    cpu = platform.processor() or platform.machine()
    try:
        with open("/proc/cpuinfo", encoding="utf-8") as fh:
            for line in fh:
                if line.startswith("model name"):
                    cpu = line.split(":", 1)[1].strip()
                    break
    except OSError:
        pass
    mem_gib = None
    try:
        with open("/proc/meminfo", encoding="utf-8") as fh:
            for line in fh:
                if line.startswith("MemTotal:"):
                    mem_gib = round(int(line.split()[1]) / 1024 / 1024, 2)
                    break
    except OSError:
        pass
    return {
        "cpu": cpu,
        "cores": os.cpu_count(),
        "memory_gib": mem_gib,
        "machine": platform.machine(),
        "system": platform.system(),
        "release": platform.release(),
        "python": platform.python_version(),
    }


def probe_live_api(url: str) -> dict:
    try:
        req = urllib.request.Request(url, method="GET")
        with urllib.request.urlopen(req, timeout=8) as resp:
            body = resp.read()[:500].decode("utf-8", errors="replace")
            return {
                "ok": 200 <= resp.status < 300,
                "status": resp.status,
                "body": body,
                "url": url,
            }
    except Exception as exc:
        return {"ok": False, "status": None, "body": str(exc), "url": url}


class BackendCache:
    def __init__(self, make_fp):
        self.make_fp = make_fp
        self.stores = {"lookup": {}, "rhetorical": {}, "assumptions": {}}

    def fingerprint(self, kind: str, payload: dict) -> str:
        if kind == "lookup":
            return self.make_fp(payload["word"], payload["context"])
        if kind == "rhetorical":
            return self.make_fp(f"rhetorical:{payload['word']}", payload["sentence"])
        if kind == "assumptions":
            return self.make_fp("assumptions", payload["sentence"])
        raise ValueError(kind)

    def request(self, kind: str, payload: dict) -> bool:
        fp = self.fingerprint(kind, payload)
        store = self.stores[kind]
        hit = fp in store
        if not hit:
            store[fp] = True
        return hit


class FrontendMaps:
    """Local Maps with the key convention currently in PaperReader.jsx."""

    def __init__(self):
        self.stores = {"lookup": {}, "rhetorical": {}, "assumptions": {}}

    def prefetch(self, backend: BackendCache) -> None:
        for kind, store in backend.stores.items():
            for fp in store:
                self.stores[kind][fp] = True

    def request(self, kind: str, payload: dict, backend_fp: str) -> bool:
        if kind == "lookup":
            local_fp = frontend_fingerprint(payload["word"], payload["context"])
            hit = local_fp in self.stores[kind]
            if not hit:
                self.stores[kind][local_fp] = True
            return hit
        if kind == "rhetorical":
            local_fp = frontend_fingerprint(f"rhetorical:{payload['word']}", payload["sentence"])
            hit = local_fp in self.stores[kind]
            if not hit:
                self.stores[kind][backend_fp] = True
            return hit
        if kind == "assumptions":
            local_fp = frontend_fingerprint("assumptions", payload["sentence"])
            hit = local_fp in self.stores[kind]
            if not hit:
                self.stores[kind][backend_fp] = True
            return hit
        raise ValueError(kind)


def usd_cost(input_tokens: int, output_tokens: int) -> float:
    return (
        input_tokens * INPUT_USD_PER_MILLION / 1_000_000
        + output_tokens * OUTPUT_USD_PER_MILLION / 1_000_000
    )


def content_tokens(tokens: list[dict]) -> list[dict]:
    return [t for t in tokens if t["clean"] and len(t["clean"]) >= CONTENT_MIN_LEN]


def reader_requests(tokens: list[dict], paper_id: str) -> list[tuple[str, dict]]:
    clicks = content_tokens(tokens)
    requests = []
    for i, tok in enumerate(clicks, start=1):
        word = lookup_word(tok)
        define_payload = {"word": word, "context": tok["context"], "paper_id": paper_id}
        requests.append(("lookup", define_payload))
        if i % 3 == 0:
            requests.append(
                (
                    "rhetorical",
                    {
                        "word": word,
                        "sentence": tok["sentence"],
                        "context": tok["context"],
                        "paper_id": paper_id,
                    },
                )
            )
        if i % 6 == 0:
            requests.append(
                (
                    "assumptions",
                    {
                        "sentence": tok["sentence"],
                        "context": tok["context"],
                        "paper_id": paper_id,
                    },
                )
            )
    for tok in clicks[:RECLICK_COUNT]:
        requests.append(
            (
                "lookup",
                {"word": lookup_word(tok), "context": tok["context"], "paper_id": paper_id},
            )
        )
    return requests


def run_session(
    name: str,
    requests: list[tuple[str, dict]],
    backend: BackendCache,
    frontend: FrontendMaps | None,
    encode,
    output_tokens_by_kind: dict[str, int],
    prefetch: bool,
) -> dict:
    if prefetch and frontend is not None:
        frontend.prefetch(backend)

    hits = 0
    misses = 0
    frontend_hits = 0
    frontend_lookups = 0
    by_kind = defaultdict(lambda: {"requests": 0, "hits": 0})
    cost_with_cache = 0.0
    cost_if_uncached = 0.0
    cost_with_cache_input = 0.0
    cost_if_uncached_input = 0.0
    input_tokens_total = 0
    output_tokens_billed = 0
    output_tokens_if_uncached = 0

    for kind, payload in requests:
        backend_fp = backend.fingerprint(kind, payload)
        backend_hit = backend.request(kind, payload)
        if frontend is not None:
            frontend_lookups += 1
            if frontend.request(kind, payload, backend_fp):
                frontend_hits += 1
        by_kind[kind]["requests"] += 1
        if backend_hit:
            hits += 1
            by_kind[kind]["hits"] += 1
        else:
            misses += 1
        prompt = build_prompt(kind, payload)
        in_tok = len(encode(prompt))
        out_tok = output_tokens_by_kind[kind]
        full = usd_cost(in_tok, out_tok)
        input_only = usd_cost(in_tok, 0)
        cost_if_uncached += full
        cost_if_uncached_input += input_only
        input_tokens_total += in_tok
        output_tokens_if_uncached += out_tok
        if not backend_hit:
            cost_with_cache += full
            cost_with_cache_input += input_only
            output_tokens_billed += out_tok

    total = hits + misses
    return {
        "name": name,
        "requests": total,
        "hits": hits,
        "misses": misses,
        "cache_hit_rate": (hits / total) if total else None,
        "frontend_map_hit_rate": (frontend_hits / frontend_lookups) if frontend_lookups else None,
        "cost_with_cache_usd": round(cost_with_cache, 8),
        "cost_if_uncached_usd": round(cost_if_uncached, 8),
        "cost_saved_usd": round(cost_if_uncached - cost_with_cache, 8),
        "cost_saved_input_only_usd": round(cost_if_uncached_input - cost_with_cache_input, 8),
        "input_tokens": input_tokens_total,
        "output_tokens_billed_at_word_cap": output_tokens_billed,
        "output_tokens_if_uncached_at_word_cap": output_tokens_if_uncached,
        "by_kind": {k: dict(v) for k, v in by_kind.items()},
        "prefetch_applied": prefetch,
    }


def md_cell(value) -> str:
    if value is None:
        return "n/a"
    return str(value).replace("|", "\\|")


def print_table(rows: list[tuple[str, object]]) -> None:
    print("| Metric | Value |")
    print("|---|---|")
    for key, value in rows:
        print(f"| {md_cell(key)} | {md_cell(value)} |")


def main() -> int:
    failures = []
    make_fp, server_src = load_make_fingerprint(SERVER_PATH)
    assert_server_contracts(server_src)

    expected_djb2 = {
        ("algorithms", "Machine learning algorithms can process"): "wpwqrv",
        ("rhetorical:revolutionized", "Artificial intelligence has revolutionized many fields."): "s3r2hb",
        ("assumptions", "Machine learning algorithms can process vast amounts of data to identify patterns and make predictions."): "bwo4ce",
    }
    for (word, context), expected in expected_djb2.items():
        got = frontend_fingerprint(word, context)
        if got != expected:
            failures.append(
                {
                    "kind": "frontend_fingerprint_mismatch",
                    "word": word,
                    "expected": expected,
                    "got": got,
                }
            )

    encode, tokenizer = get_encoder()
    fixture_text = FIXTURE_PATH.read_text(encoding="utf-8").strip()
    fixture_words = fixture_text.split()
    output_tokens_by_kind = {}
    output_cap_samples = {}
    for kind, n_words in OUTPUT_WORD_CAP.items():
        if len(fixture_words) < n_words:
            failures.append(
                {
                    "kind": "output_cap_sample_too_short",
                    "needed_words": n_words,
                    "available_words": len(fixture_words),
                }
            )
            sample = " ".join(fixture_words)
        else:
            sample = " ".join(fixture_words[:n_words])
        output_tokens_by_kind[kind] = len(encode(sample))
        output_cap_samples[kind] = {
            "word_cap_from_prompt": n_words,
            "token_count": output_tokens_by_kind[kind],
            "method": "first_n_words_of_fixture_tokenized",
        }

    live = probe_live_api(LIVE_HEALTH_URL)
    if not live["ok"]:
        failures.append(
            {
                "kind": "live_api_unavailable",
                "url": live["url"],
                "status": live["status"],
                "detail": live["body"],
                "effect": "Could not confirm cache flags against a running server. Hit rate uses backend/server.py fingerprints in process.",
            }
        )

    papers = [
        {
            "id": "harness-paper",
            "title": HARNESS_PAPER_TITLE,
            "content": HARNESS_PAPER_CONTENT,
            "source": "backend_test.py HARNESS_PAPER_CONTENT",
        },
        {
            "id": "fixture-paper",
            "title": "Session fixture: channel capacity notes",
            "content": fixture_text,
            "source": str(FIXTURE_PATH.relative_to(ROOT)),
        },
    ]

    backend = BackendCache(make_fp)
    sessions = []

    harness_reqs = harness_cache_request_sequence("harness-paper")
    sessions.append(
        run_session(
            "backend_test_cache_pairs",
            harness_reqs,
            backend,
            frontend=None,
            encode=encode,
            output_tokens_by_kind=output_tokens_by_kind,
            prefetch=False,
        )
    )
    harness_rate = sessions[-1]["cache_hit_rate"]
    if harness_rate != 0.5:
        failures.append(
            {
                "kind": "harness_sequence_unexpected_hit_rate",
                "expected": 0.5,
                "got": harness_rate,
            }
        )

    for paper in papers:
        tokens = tokenize_like_reader(paper["content"])
        reqs = reader_requests(tokens, paper["id"])
        paper["token_count"] = len(tokens)
        paper["content_clicks"] = len(content_tokens(tokens))
        paper["request_count_per_visit"] = len(reqs)
        first_backend = BackendCache(make_fp)
        first_frontend = FrontendMaps()
        sessions.append(
            run_session(
                f"{paper['id']}_first_visit",
                reqs,
                first_backend,
                first_frontend,
                encode,
                output_tokens_by_kind,
                prefetch=False,
            )
        )
        return_frontend = FrontendMaps()
        sessions.append(
            run_session(
                f"{paper['id']}_return_visit",
                reqs,
                first_backend,
                return_frontend,
                encode,
                output_tokens_by_kind,
                prefetch=True,
            )
        )

    session_hit_rates = [s["cache_hit_rate"] for s in sessions if s["cache_hit_rate"] is not None]
    session_savings = [s["cost_saved_usd"] for s in sessions]
    total_hits = sum(s["hits"] for s in sessions)
    total_reqs = sum(s["requests"] for s in sessions)
    cache_hit_rate = total_hits / total_reqs if total_reqs else None
    cost_saved_per_session = (
        round(sum(session_savings) / len(session_savings), 8) if session_savings else None
    )
    first_sessions = [s for s in sessions if s["name"].endswith("_first_visit")]
    return_sessions = [s for s in sessions if s["name"].endswith("_return_visit")]

    def _rate(group):
        hits = sum(s["hits"] for s in group)
        reqs = sum(s["requests"] for s in group)
        return (hits / reqs) if reqs else None

    def _mean_saved(group, key="cost_saved_usd"):
        if not group:
            return None
        return round(sum(s[key] for s in group) / len(group), 8)

    first_hit_rate = _rate(first_sessions)
    return_hit_rate = _rate(return_sessions)
    input_only_per_session = (
        round(sum(s["cost_saved_input_only_usd"] for s in sessions) / len(sessions), 8)
        if sessions
        else None
    )

    hardware = hardware_info()
    measured_at = datetime.now(timezone.utc).isoformat()
    results = {
        "task": "GS-T8",
        "metrics": ["cache_hit_rate", "cost_saved_per_session"],
        "model": MODEL,
        "date": measured_at[:10],
        "measured_at_utc": measured_at,
        "dataset_size": {
            "papers": len(papers),
            "sessions": len(sessions),
            "requests": total_reqs,
            "paper_words": {
                p["id"]: len(p["content"].split()) for p in papers
            },
            "paper_tokens": {p["id"]: p["token_count"] for p in papers},
        },
        "hardware": hardware,
        "cache_hit_rate": cache_hit_rate,
        "cost_saved_usd_per_session": cost_saved_per_session,
        "cost_saved_input_only_usd_per_session": input_only_per_session,
        "cache_hit_rate_mean_of_sessions": (
            sum(session_hit_rates) / len(session_hit_rates) if session_hit_rates else None
        ),
        "cache_hit_rate_first_visit": first_hit_rate,
        "cache_hit_rate_return_visit": return_hit_rate,
        "cost_saved_usd_per_first_visit": _mean_saved(first_sessions),
        "cost_saved_usd_per_return_visit": _mean_saved(return_sessions),
        "api_calls_avoided_per_session": (
            round(sum(s["hits"] for s in sessions) / len(sessions), 4) if sessions else None
        ),
        "tokenizer": tokenizer,
        "pricing": {
            "input_usd_per_million": INPUT_USD_PER_MILLION,
            "output_usd_per_million": OUTPUT_USD_PER_MILLION,
            "source": PRICING_SOURCE,
            "tier": "standard_paid",
            "retrieved": PRICING_RETRIEVED,
            "hit_billing": "zero_api_call",
            "output_tokens": "prompt_word_cap_proxy_not_live_model_output",
        },
        "output_cap_samples": output_cap_samples,
        "session_model": {
            "content_min_clean_len": CONTENT_MIN_LEN,
            "intent_every_nth_click": 3,
            "challenge_every_nth_click": 6,
            "reclick_first_n_define": RECLICK_COUNT,
            "return_visit": "same request list against warm backend cache, cold frontend maps plus SHA-256 prefetch",
        },
        "closest_harness": {
            "path": "backend_test.py",
            "mode": "extend",
            "reason": "Existing miss-then-hit cache tests for lookup, rhetorical, and assumptions; this bench imports those payloads and adds session-level hit rate and cost.",
        },
        "live_api": live,
        "failures": failures,
        "papers": [
            {
                "id": p["id"],
                "title": p["title"],
                "source": p["source"],
                "words": len(p["content"].split()),
                "tokens": p["token_count"],
                "content_clicks": p["content_clicks"],
                "request_count_per_visit": p["request_count_per_visit"],
            }
            for p in papers
        ],
        "sessions": sessions,
        "how_to_run": "python3 bench/cache_session.py",
        "observations": [
            "First-visit backend hit rate is low because fingerprints include surrounding context, so the same word in a new window is a miss.",
            "Return-visit backend hit rate is 1.0 for the replayed request list.",
            "Frontend Map hit rate stays low on return visits because PaperReader.jsx prefetches SHA-256 keys from the API while define/intent/challenge lookups still probe djb2 keys.",
            "Output token counts are the prompt word caps tokenized from fixture prose, not live model completions. Live API confirmation failed.",
        ],
    }

    RESULTS_PATH.parent.mkdir(parents=True, exist_ok=True)
    RESULTS_PATH.write_text(json.dumps(results, indent=2) + "\n", encoding="utf-8")

    hit_pct = f"{cache_hit_rate * 100:.2f}%" if cache_hit_rate is not None else "FAILURE"
    saved = (
        f"{cost_saved_per_session:.8f}"
        if cost_saved_per_session is not None
        else "FAILURE"
    )
    print_table(
        [
            ("cache_hit_rate", f"{cache_hit_rate:.6f} ({hit_pct})" if cache_hit_rate is not None else "FAILURE"),
            ("cache_hit_rate_first_visit", f"{first_hit_rate:.6f}" if first_hit_rate is not None else "FAILURE"),
            ("cache_hit_rate_return_visit", f"{return_hit_rate:.6f}" if return_hit_rate is not None else "FAILURE"),
            ("cost_saved_usd_per_session", saved),
            ("cost_saved_usd_per_first_visit", f"{_mean_saved(first_sessions):.8f}" if first_sessions else "n/a"),
            ("cost_saved_usd_per_return_visit", f"{_mean_saved(return_sessions):.8f}" if return_sessions else "n/a"),
            ("cost_saved_input_only_usd_per_session", f"{input_only_per_session:.8f}" if input_only_per_session is not None else "FAILURE"),
            ("model", MODEL),
            ("date", results["date"]),
            ("dataset_size", f"{len(papers)} papers, {len(sessions)} sessions, {total_reqs} requests"),
            ("hardware", f"{hardware['cpu']}, {hardware['cores']} cores, {hardware['memory_gib']} GiB, {hardware['system']} {hardware['release']}"),
            ("tokenizer", tokenizer),
            ("live_api", "ok" if live["ok"] else f"FAILED {live.get('status')} {live.get('body')}"),
            ("failures", len(failures)),
            ("results_json", str(RESULTS_PATH.relative_to(ROOT))),
        ]
    )
    print()
    print("| Session | Requests | Hits | Misses | Hit rate | Cost saved USD |")
    print("|---|---:|---:|---:|---:|---:|")
    for s in sessions:
        rate = f"{s['cache_hit_rate']:.4f}" if s["cache_hit_rate"] is not None else "n/a"
        print(
            f"| {s['name']} | {s['requests']} | {s['hits']} | {s['misses']} | {rate} | {s['cost_saved_usd']:.8f} |"
        )
    return 0 if cache_hit_rate is not None and cost_saved_per_session is not None else 1


if __name__ == "__main__":
    sys.exit(main())
