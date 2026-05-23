#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Run prenatal_sus_benchmark.csv against clinical-ai direct-question-stream.

Requires: pip install httpx

Example:
  python3 run_benchmark.py --base-url http://127.0.0.1:4010 --limit 2
"""
from __future__ import annotations

import argparse
import csv
import json
import sys
import time
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import date
from pathlib import Path
from typing import Any, Iterator

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "shared"))
from bench_scoring import score_response  # noqa: E402

TESTS_DIR = Path(__file__).resolve().parent.parent
BENCH_DIR = Path(__file__).resolve().parent
DEFAULT_BENCHMARK = TESTS_DIR / "dataset" / "prenatal_sus_benchmark.csv"
DEFAULT_ENV_FILE = TESTS_DIR.parent.parent / "Codigo" / ".env"

BENCHMARK_HEADER = [
    "question_id",
    "topic_pt",
    "source_document",
    "difficulty",
    "question_pt",
    "answer_evaluation_mode",
    "expected_phrases_pt",
    "gold_answer_short_pt",
    "must_not_contain_pt",
    "notes_scoring_pt",
]

RESULTS_HEADER = [
    "question_id",
    "difficulty",
    "llm_provider",
    "pass_auto",
    "matched_phrases",
    "missing_phrases",
    "forbidden_hit",
    "response_preview_chars",
    "notes",
]


@dataclass
class StreamOutcome:
    response_text: str = ""
    latency_ms: float = 0.0
    rag_ms: float | None = None
    chunks_retrieved: str = ""
    n_rag_chunks: int = 0
    rag_chunks: list[dict[str, Any]] = field(default_factory=list)
    error: str | None = None
    ollama_total_duration_ns: int | None = None


@dataclass
class RunRow:
    question_id: str
    difficulty: str
    llm_provider: str
    pass_auto: str
    matched_phrases: str
    missing_phrases: str
    forbidden_hit: str
    response_preview_chars: str
    notes: str
    question_pt: str = ""
    response_text: str = ""
    rag_chunks: list[dict[str, Any]] = field(default_factory=list)


def load_benchmark(path: Path) -> list[dict[str, str]]:
    with path.open(encoding="utf-8", newline="") as fh:
        reader = csv.DictReader(fh)
        if list(reader.fieldnames or []) != BENCHMARK_HEADER:
            raise ValueError(f"Benchmark header mismatch: {reader.fieldnames}")
        fh.seek(0)
        reader = csv.DictReader(fh)
        return list(reader)


def format_chunks(chunks: list[dict[str, Any]]) -> str:
    parts: list[str] = []
    for c in chunks:
        cid = str(c.get("id", ""))
        title = str(c.get("title", "") or c.get("source_file", ""))
        parts.append(f"{cid}:{title}" if cid else title)
    return ";".join(parts)


def parse_ndjson_stream(lines: Iterator[str]) -> StreamOutcome:
    out = StreamOutcome()
    content_buf = ""
    for line in lines:
        line = line.strip()
        if not line:
            continue
        try:
            row = json.loads(line)
        except json.JSONDecodeError:
            continue
        typ = row.get("type")
        if typ == "pipeline":
            chunks = row.get("rag_chunks") or []
            if isinstance(chunks, list):
                out.rag_chunks = [c for c in chunks if isinstance(c, dict)]
                out.n_rag_chunks = len(out.rag_chunks)
                out.chunks_retrieved = format_chunks(out.rag_chunks)
            timing = row.get("rag_timing_ms") or {}
            if isinstance(timing, dict):
                rt = timing.get("retrieve_total_ms")
                if rt is not None:
                    out.rag_ms = float(rt)
        elif typ == "ollama":
            content = row.get("content")
            if isinstance(content, str):
                if row.get("content_replace"):
                    content_buf = content
                else:
                    content_buf += content
            metrics = row.get("metrics") or {}
            if isinstance(metrics, dict):
                td = metrics.get("total_duration")
                if td is not None:
                    try:
                        out.ollama_total_duration_ns = int(td)
                    except (TypeError, ValueError):
                        pass
        elif typ == "error":
            detail = row.get("detail") or row.get("message") or str(row)
            out.error = str(detail)
        elif typ == "done":
            break
    out.response_text = content_buf.strip()
    return out


def stream_direct_question(
    client: httpx.Client,
    base_url: str,
    question: str,
    provider: str,
    timeout: float,
) -> StreamOutcome:
    url = f"{base_url.rstrip('/')}/mcp/test/direct-question-stream"
    body = {
        "question": question,
        "top_k": 6,
        "rag_expand_query": True,
        "think": False,
        "llm_provider": provider,
    }
    t0 = time.perf_counter()
    buffer = ""
    parsed_lines: list[str] = []
    try:
        with client.stream(
            "POST",
            url,
            json=body,
            timeout=timeout,
            headers={"Accept": "application/x-ndjson"},
        ) as resp:
            resp.raise_for_status()
            for chunk in resp.iter_text():
                buffer += chunk
                while "\n" in buffer:
                    line, buffer = buffer.split("\n", 1)
                    parsed_lines.append(line)
            if buffer.strip():
                parsed_lines.append(buffer)
    except httpx.HTTPError as exc:
        out = StreamOutcome()
        out.error = str(exc)
        out.latency_ms = round((time.perf_counter() - t0) * 1000.0, 1)
        return out

    outcome = parse_ndjson_stream(parsed_lines)
    outcome.latency_ms = round((time.perf_counter() - t0) * 1000.0, 1)
    return outcome


def build_notes(
    outcome: StreamOutcome,
    score_notes: str = "",
    human_judge: bool = False,
) -> str:
    parts: dict[str, Any] = {
        "latency_ms": outcome.latency_ms,
    }
    if outcome.rag_ms is not None:
        parts["rag_ms"] = outcome.rag_ms
    if outcome.chunks_retrieved:
        parts["chunks_retrieved"] = outcome.chunks_retrieved
    parts["response_len"] = len(outcome.response_text)
    if outcome.n_rag_chunks:
        parts["n_rag_chunks"] = outcome.n_rag_chunks
    if outcome.ollama_total_duration_ns is not None:
        parts["ollama_total_duration_ns"] = outcome.ollama_total_duration_ns
    if outcome.error:
        parts["error"] = outcome.error
    if human_judge:
        parts["human_judge_pending"] = True
    if score_notes:
        parts["extra"] = score_notes
    return json.dumps(parts, ensure_ascii=False)


def check_health(client: httpx.Client, base_url: str) -> dict[str, Any]:
    r = client.get(f"{base_url.rstrip('/')}/health", timeout=30.0)
    r.raise_for_status()
    return r.json()


def load_env_file(path: Path) -> dict[str, str]:
    """Load KEY=VALUE pairs from Codigo/.env (no python-dotenv dependency)."""
    if not path.is_file():
        return {}
    out: dict[str, str] = {}
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
            value = value[1:-1]
        out[key] = value
    return out


def _mask_secret(value: str) -> str:
    v = (value or "").strip()
    if len(v) <= 8:
        return "(definida)" if v else "(ausente)"
    return f"***{v[-4:]}"


def validate_llm_env(
    providers: list[str],
    env: dict[str, str],
    health: dict[str, Any],
    *,
    strict: bool,
) -> tuple[list[str], list[str]]:
    """Cross-check .env with clinical-ai /health before benchmark runs."""
    errors: list[str] = []
    warnings: list[str] = []

    if "gemini" in providers:
        key = (env.get("GEMINI_API_KEY") or "").strip()
        model = (env.get("GEMINI_MODEL") or "gemini-2.0-flash").strip()
        if not key:
            errors.append(
                f"GEMINI_API_KEY ausente em {DEFAULT_ENV_FILE.name}; "
                "defina a chave em Codigo/.env"
            )
        if not model:
            errors.append("GEMINI_MODEL ausente em Codigo/.env")
        if key and not health.get("gemini_configured"):
            warnings.append(
                "clinical-ai /health: gemini_configured=false - o container pode estar "
                "sem GEMINI_API_KEY. Recarregue: cd Codigo && docker compose up -d clinical_ai"
            )
        svc_model = health.get("gemini_model")
        if key and svc_model and svc_model != model:
            msg = (
                f"GEMINI_MODEL no .env ({model}) != gemini_model no serviço ({svc_model}). "
                "Reinicie clinical_ai após alterar Codigo/.env."
            )
            (errors if strict else warnings).append(msg)

    if "ollama" in providers:
        env_model = (env.get("OLLAMA_MODEL") or "").strip()
        svc_model = (health.get("ollama_model") or "").strip()
        ollama = health.get("ollama")
        if isinstance(ollama, dict) and ollama.get("ok") is False:
            warnings.append(f"Ollama indisponível no clinical-ai: {ollama}")
        if env_model and svc_model and env_model != svc_model:
            warnings.append(
                f"OLLAMA_MODEL no .env ({env_model}) != ollama_model no serviço ({svc_model})"
            )

    return errors, warnings


def load_existing_keys(path: Path) -> set[tuple[str, str]]:
    if not path.is_file():
        return set()
    keys: set[tuple[str, str]] = set()
    with path.open(encoding="utf-8", newline="") as fh:
        reader = csv.DictReader(fh)
        for row in reader:
            keys.add((row["question_id"], row["llm_provider"]))
    return keys


def append_result_csv(path: Path, row: RunRow, write_header: bool) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    mode = "w" if write_header else "a"
    with path.open(mode, encoding="utf-8", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=RESULTS_HEADER)
        if write_header:
            writer.writeheader()
        writer.writerow(
            {
                "question_id": row.question_id,
                "difficulty": row.difficulty,
                "llm_provider": row.llm_provider,
                "pass_auto": row.pass_auto,
                "matched_phrases": row.matched_phrases,
                "missing_phrases": row.missing_phrases,
                "forbidden_hit": "true" if row.forbidden_hit == "true" else "false",
                "response_preview_chars": row.response_preview_chars,
                "notes": row.notes,
            }
        )


def append_jsonl(path: Path, record: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as fh:
        fh.write(json.dumps(record, ensure_ascii=False) + "\n")


def execute_one(
    bench_row: dict[str, str],
    provider: str,
    client: httpx.Client,
    base_url: str,
    timeout: float,
    preview_chars: int,
) -> RunRow:
    qid = bench_row["question_id"]
    outcome = stream_direct_question(
        client, base_url, bench_row["question_pt"], provider, timeout
    )

    if outcome.error and not outcome.response_text:
        return RunRow(
            question_id=qid,
            difficulty=bench_row["difficulty"],
            llm_provider=provider,
            pass_auto="false",
            matched_phrases="",
            missing_phrases="",
            forbidden_hit="false",
            response_preview_chars="",
            notes=build_notes(outcome),
            question_pt=bench_row["question_pt"],
            response_text="",
            rag_chunks=outcome.rag_chunks,
        )

    scored = score_response(
        outcome.response_text,
        bench_row["answer_evaluation_mode"],
        bench_row["expected_phrases_pt"],
        bench_row.get("must_not_contain_pt", ""),
    )
    if outcome.error:
        pass_auto = "false"
    elif scored.human_judge_pending:
        pass_auto = "review"
    else:
        pass_auto = scored.pass_auto

    preview = outcome.response_text[:preview_chars].replace("\n", " ")

    return RunRow(
        question_id=qid,
        difficulty=bench_row["difficulty"],
        llm_provider=provider,
        pass_auto=pass_auto,
        matched_phrases=scored.matched_phrases,
        missing_phrases=scored.missing_phrases,
        forbidden_hit="true" if scored.forbidden_hit else "false",
        response_preview_chars=preview,
        notes=build_notes(outcome, human_judge=scored.human_judge_pending),
        question_pt=bench_row["question_pt"],
        response_text=outcome.response_text,
        rag_chunks=outcome.rag_chunks,
    )


def print_summary(all_rows: list[RunRow], summary_path: Path) -> None:
    lines: list[str] = []
    lines.append("=== Benchmark results summary ===\n")

    auto_rows = [r for r in all_rows if r.pass_auto in ("true", "false")]

    def rate(subset: list[RunRow], provider: str) -> tuple[float, int]:
        rs = [r for r in subset if r.llm_provider == provider]
        if not rs:
            return 0.0, 0
        ok = sum(1 for r in rs if r.pass_auto == "true")
        return 100.0 * ok / len(rs), len(rs)

    lines.append("Taxa de acerto por difficulty e provider (% pass_auto=true):\n")
    header = f"{'difficulty':<10} {'ollama':>12} {'n_ollama':>10} {'gemini':>12} {'n_gemini':>10}"
    lines.append(header)
    lines.append("-" * len(header))
    for diff in ("easy", "medium", "hard", "ALL"):
        subset = auto_rows if diff == "ALL" else [r for r in auto_rows if r.difficulty == diff]
        ro, no = rate(subset, "ollama")
        rg, ng = rate(subset, "gemini")
        lines.append(f"{diff:<10} {ro:>11.1f}% {no:>10} {rg:>11.1f}% {ng:>10}")

    lines.append("\nTaxa global por provider:\n")
    for prov in ("ollama", "gemini"):
        r, n = rate(auto_rows, prov)
        lines.append(f"  {prov}: {r:.1f}% (n={n})")

    review_n = sum(1 for r in all_rows if r.pass_auto == "review")
    lines.append(f"\nhuman_judge (review): {review_n} execuções\n")

    # Worst 10 question_ids
    by_q: dict[str, list[RunRow]] = defaultdict(list)
    for r in all_rows:
        by_q[r.question_id].append(r)

    def fail_score(qid: str, rs: list[RunRow]) -> tuple[int, int, str]:
        auto = [x for x in rs if x.pass_auto in ("true", "false")]
        fails = sum(1 for x in auto if x.pass_auto == "false")
        miss = sum(len(x.missing_phrases.split(";")) for x in auto if x.missing_phrases)
        diff = rs[0].difficulty if rs else ""
        return fails, miss, diff

    ranked = sorted(
        by_q.items(),
        key=lambda kv: (-fail_score(kv[0], kv[1])[0], -fail_score(kv[0], kv[1])[1]),
    )[:10]

    lines.append("\n10 piores question_id (mais falhas entre providers):\n")
    for qid, rs in ranked:
        fails, miss, diff = fail_score(qid, rs)
        qtext = (rs[0].question_pt[:80] + "...") if rs and len(rs[0].question_pt) > 80 else (rs[0].question_pt if rs else "")
        auto = [x for x in rs if x.pass_auto in ("true", "false")]
        rate_q = (
            100.0 * sum(1 for x in auto if x.pass_auto == "true") / len(auto) if auto else 0.0
        )
        lines.append(f"  {qid} ({diff}) falhas={fails} taxa={rate_q:.0f}% | {qtext}")

    text = "\n".join(lines) + "\n"
    summary_path.write_text(text, encoding="utf-8")
    print(text)


def main() -> int:
    parser = argparse.ArgumentParser(description="Run SUS prenatal benchmark against clinical-ai.")
    parser.add_argument("--benchmark", type=Path, default=DEFAULT_BENCHMARK)
    parser.add_argument("--base-url", default="http://127.0.0.1:4010")
    parser.add_argument("--providers", default="ollama,gemini")
    parser.add_argument("--limit", type=int, default=0, help="Max questions (0=all)")
    parser.add_argument("--question-ids", default="", help="Comma-separated Q001,Q002,...")
    parser.add_argument("--timeout", type=float, default=300.0)
    parser.add_argument("--preview-chars", type=int, default=200)
    parser.add_argument(
        "--out-dir",
        type=Path,
        default=None,
        help="Pasta de saída (default: results/YYYYMMDD neste diretório)",
    )
    parser.add_argument("--resume", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument(
        "--env-file",
        type=Path,
        default=DEFAULT_ENV_FILE,
        help="Codigo/.env com GEMINI_API_KEY, GEMINI_MODEL, OLLAMA_MODEL (default: ../../Codigo/.env)",
    )
    parser.add_argument(
        "--strict-env",
        action="store_true",
        help="Encerra se GEMINI_MODEL/OLLAMA_MODEL do .env divergir do /health do clinical-ai",
    )
    parser.add_argument(
        "--sleep-secs",
        type=float,
        default=0.0,
        help="Pausa entre chamadas HTTP (ex.: 20-30 para evitar HTTP 429 no Gemini)",
    )
    args = parser.parse_args()

    providers = [p.strip().lower() for p in args.providers.split(",") if p.strip()]
    for p in providers:
        if p not in ("ollama", "gemini"):
            print(f"Invalid provider: {p}", file=sys.stderr)
            return 2

    bench_rows = load_benchmark(args.benchmark)
    if args.question_ids.strip():
        wanted = {x.strip() for x in args.question_ids.split(",") if x.strip()}
        bench_rows = [r for r in bench_rows if r["question_id"] in wanted]
    if args.limit > 0:
        bench_rows = bench_rows[: args.limit]

    stamp = date.today().strftime("%Y%m%d")
    out_dir = args.out_dir or (BENCH_DIR / "results" / stamp)
    results_csv = out_dir / "results.csv"
    jsonl_path = out_dir / "results_full.jsonl"
    summary_path = out_dir / "summary.txt"

    existing = load_existing_keys(results_csv) if args.resume else set()
    write_header = not results_csv.is_file() or not args.resume

    if args.dry_run:
        for row in bench_rows:
            for prov in providers:
                key = (row["question_id"], prov)
                skip = " [skip resume]" if key in existing else ""
                print(f"{row['question_id']} {prov}{skip}: {row['question_pt'][:60]}?")
        return 0

    env = load_env_file(args.env_file)
    if not args.env_file.is_file():
        print(f"WARNING: .env não encontrado: {args.env_file}", file=sys.stderr)

    try:
        with httpx.Client() as client:
            health = check_health(client, args.base_url)
            print(
                f"Health: status={health.get('status')} "
                f"ollama_model={health.get('ollama_model')} "
                f"gemini_configured={health.get('gemini_configured')} "
                f"gemini_model={health.get('gemini_model')}"
            )
            env_errors, env_warnings = validate_llm_env(
                providers, env, health, strict=args.strict_env
            )
            for w in env_warnings:
                print(f"WARNING: {w}", file=sys.stderr)
            for e in env_errors:
                print(f"ERROR: {e}", file=sys.stderr)
            if env_errors:
                return 2
            if "gemini" in providers:
                g_model = (env.get("GEMINI_MODEL") or "gemini-2.0-flash").strip()
                print(
                    f"Gemini (.env): model={g_model} "
                    f"key={_mask_secret(env.get('GEMINI_API_KEY', ''))}"
                )
            if "ollama" in providers and env.get("OLLAMA_MODEL"):
                print(f"Ollama (.env): model={env.get('OLLAMA_MODEL', '').strip()}")

            if health.get("status") != "ok":
                print("clinical-ai health not ok", file=sys.stderr)
                return 1
            idx = health.get("index") or {}
            n_chunks = 0
            if isinstance(idx, dict):
                n_chunks = int(idx.get("n_chunks") or idx.get("chunks") or 0)
            if n_chunks == 0:
                print("WARNING: RAG index has 0 chunks. Rebuild with POST /rag/test/rebuild?force=true", file=sys.stderr)

            collected: list[RunRow] = []
            if args.resume and results_csv.is_file():
                with results_csv.open(encoding="utf-8", newline="") as fh:
                    collected = [
                        RunRow(
                            question_id=r["question_id"],
                            difficulty=r["difficulty"],
                            llm_provider=r["llm_provider"],
                            pass_auto=r["pass_auto"],
                            matched_phrases=r["matched_phrases"],
                            missing_phrases=r["missing_phrases"],
                            forbidden_hit=r["forbidden_hit"],
                            response_preview_chars=r["response_preview_chars"],
                            notes=r["notes"],
                        )
                        for r in csv.DictReader(fh)
                    ]

            total = len(bench_rows) * len(providers)
            done = 0
            for brow in bench_rows:
                for prov in providers:
                    key = (brow["question_id"], prov)
                    if key in existing:
                        continue
                    done += 1
                    print(f"[{done}/{total}] {brow['question_id']} ({prov}) ?", flush=True)
                    run_row = execute_one(
                        brow, prov, client, args.base_url, args.timeout, args.preview_chars
                    )
                    append_result_csv(results_csv, run_row, write_header)
                    write_header = False
                    existing.add(key)
                    collected.append(run_row)
                    append_jsonl(
                        jsonl_path,
                        {
                            "question_id": run_row.question_id,
                            "llm_provider": run_row.llm_provider,
                            "difficulty": run_row.difficulty,
                            "pass_auto": run_row.pass_auto,
                            "response_text": run_row.response_text,
                            "rag_chunks": run_row.rag_chunks,
                            "notes": json.loads(run_row.notes) if run_row.notes.startswith("{") else run_row.notes,
                        },
                    )
                    status = run_row.pass_auto
                    print(f"  -> pass_auto={status} preview={run_row.response_preview_chars[:60]!r}?")
                    if args.sleep_secs > 0:
                        time.sleep(args.sleep_secs)

    except httpx.HTTPError as exc:
        print(f"HTTP error: {exc}", file=sys.stderr)
        return 1

    if collected:
        print_summary(collected, summary_path)
    print(f"\nWrote {results_csv}")
    if jsonl_path.is_file():
        print(f"Wrote {jsonl_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
