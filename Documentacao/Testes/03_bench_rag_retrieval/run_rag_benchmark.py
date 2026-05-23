#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""RAG retrieval-only benchmark via POST /rag/test/query (top_k=6, expand_query=true)."""
from __future__ import annotations

import argparse
import csv
import sys
import time
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import Any

import httpx

from rag_metrics import (
    chunk_sources_list,
    hit_document_at_k,
    mrr,
    phrase_recall_in_chunks,
    rank_first_correct,
)

TESTS_DIR = Path(__file__).resolve().parent.parent
DEFAULT_BENCHMARK = TESTS_DIR / "dataset" / "prenatal_sus_benchmark.csv"
BENCH_DIR = Path(__file__).resolve().parent

RAG_RESULTS_HEADER = [
    "question_id",
    "difficulty",
    "source_document_expected",
    "hit_document@6",
    "rank_first_correct",
    "mrr",
    "phrase_recall_in_chunks",
    "retrieve_total_ms",
    "index_mode",
    "chunk_sources",
    "error",
]


@dataclass
class RagRow:
    question_id: str
    difficulty: str
    source_document_expected: str
    hit_document_at_6: str
    rank_first_correct: int
    mrr: float
    phrase_recall_in_chunks: str
    retrieve_total_ms: str
    index_mode: str
    chunk_sources: str
    error: str


def load_benchmark(path: Path) -> list[dict[str, str]]:
    with path.open(encoding="utf-8", newline="") as fh:
        return list(csv.DictReader(fh))


def load_existing_ids(path: Path) -> set[str]:
    if not path.is_file():
        return set()
    with path.open(encoding="utf-8", newline="") as fh:
        return {r["question_id"] for r in csv.DictReader(fh)}


def query_rag(client: httpx.Client, base_url: str, question: str, timeout: float) -> dict[str, Any]:
    url = f"{base_url.rstrip('/')}/rag/test/query"
    body = {"query": question, "top_k": 6, "expand_query": True}
    r = client.post(url, json=body, timeout=timeout)
    r.raise_for_status()
    return r.json()


def evaluate_row(brow: dict[str, str], data: dict[str, Any]) -> RagRow:
    chunks = data.get("chunks") or []
    if not isinstance(chunks, list):
        chunks = []
    timing = data.get("rag_timing_ms") or {}
    if not isinstance(timing, dict):
        timing = {}
    texts = [str(c.get("text", "")) for c in chunks if isinstance(c, dict)]
    expected = brow["source_document"]
    rank = rank_first_correct(chunks, expected, k=6)
    return RagRow(
        question_id=brow["question_id"],
        difficulty=brow["difficulty"],
        source_document_expected=expected,
        hit_document_at_6="true" if hit_document_at_k(chunks, expected, k=6) else "false",
        rank_first_correct=rank,
        mrr=round(mrr(rank), 4),
        phrase_recall_in_chunks=phrase_recall_in_chunks(
            brow["answer_evaluation_mode"],
            brow["expected_phrases_pt"],
            texts,
        ),
        retrieve_total_ms=str(timing.get("retrieve_total_ms", "")),
        index_mode=str(timing.get("index_mode", "")),
        chunk_sources=chunk_sources_list(chunks, k=6),
        error="",
    )


def append_csv(path: Path, row: RagRow, write_header: bool) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    mode = "w" if write_header else "a"
    with path.open(mode, encoding="utf-8", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=RAG_RESULTS_HEADER)
        if write_header:
            w.writeheader()
        w.writerow(
            {
                "question_id": row.question_id,
                "difficulty": row.difficulty,
                "source_document_expected": row.source_document_expected,
                "hit_document@6": row.hit_document_at_6,
                "rank_first_correct": row.rank_first_correct,
                "mrr": row.mrr,
                "phrase_recall_in_chunks": row.phrase_recall_in_chunks,
                "retrieve_total_ms": row.retrieve_total_ms,
                "index_mode": row.index_mode,
                "chunk_sources": row.chunk_sources,
                "error": row.error,
            }
        )


def load_all_rows(path: Path) -> list[RagRow]:
    if not path.is_file():
        return []
    out: list[RagRow] = []
    with path.open(encoding="utf-8", newline="") as fh:
        for r in csv.DictReader(fh):
            out.append(
                RagRow(
                    question_id=r["question_id"],
                    difficulty=r["difficulty"],
                    source_document_expected=r["source_document_expected"],
                    hit_document_at_6=r["hit_document@6"],
                    rank_first_correct=int(r["rank_first_correct"] or 0),
                    mrr=float(r["mrr"] or 0),
                    phrase_recall_in_chunks=r.get("phrase_recall_in_chunks", ""),
                    retrieve_total_ms=r.get("retrieve_total_ms", ""),
                    index_mode=r.get("index_mode", ""),
                    chunk_sources=r.get("chunk_sources", ""),
                    error=r.get("error", ""),
                )
            )
    return out


def write_summaries(rows: list[RagRow], summary_path: Path, article_path: Path) -> None:
    def hit_rate(subset: list[RagRow]) -> tuple[float, int]:
        if not subset:
            return 0.0, 0
        ok = sum(1 for r in subset if r.hit_document_at_6 == "true")
        return 100.0 * ok / len(subset), len(subset)

    def avg_mrr(subset: list[RagRow]) -> float:
        if not subset:
            return 0.0
        return sum(r.mrr for r in subset) / len(subset)

    def avg_phrase(subset: list[RagRow]) -> float:
        vals = []
        for r in subset:
            if r.phrase_recall_in_chunks:
                try:
                    vals.append(float(r.phrase_recall_in_chunks))
                except ValueError:
                    pass
        return sum(vals) / len(vals) if vals else 0.0

    lines: list[str] = []
    lines.append("=== Resumo benchmark RAG (retrieval only) ===\n")
    lines.append("Configuração: top_k=6, expand_query=true\n")

    hr, n = hit_rate(rows)
    lines.append(f"Hit@6 global: {hr:.1f}% (n={n})")
    lines.append(f"MRR médio global: {avg_mrr(rows):.4f}")
    lines.append(f"phrase_recall médio (contains_*): {avg_phrase(rows):.1f}%\n")

    lines.append("Hit@6 por difficulty:\n")
    for diff in ("easy", "medium", "hard"):
        sub = [r for r in rows if r.difficulty == diff]
        h, nn = hit_rate(sub)
        lines.append(f"  {diff}: {h:.1f}% (n={nn}), MRR={avg_mrr(sub):.4f}")

    misses = [r for r in rows if r.hit_document_at_6 != "true"]
    ranked = sorted(misses, key=lambda r: (r.mrr, r.question_id))[:10]
    lines.append("\n10 piores QIDs (miss Hit@6, menor MRR primeiro):\n")
    for r in ranked:
        lines.append(
            f"  {r.question_id} ({r.difficulty}) rank={r.rank_first_correct} "
            f"mrr={r.mrr} sources={r.chunk_sources[:80]}"
        )

    summary_text = "\n".join(lines) + "\n"
    summary_path.write_text(summary_text, encoding="utf-8")
    print(summary_text)

    hr_all, n_all = hit_rate(rows)
    art: list[str] = []
    art.append("# Métricas RAG para o artigo\n")
    art.append("## Hit@6 e MRR\n")
    art.append("| Métrica | Valor |")
    art.append("|---------|-------|")
    art.append(f"| Hit@6 (global) | {hr_all:.1f}% (n={n_all}) |")
    art.append(f"| MRR médio (global) | {avg_mrr(rows):.4f} |")
    art.append(f"| phrase_recall médio | {avg_phrase(rows):.1f}% |")
    art.append("\n### Por dificuldade\n")
    art.append("| Dificuldade | Hit@6 | n | MRR médio |")
    art.append("|-------------|-------|---|-----------|")
    for diff in ("easy", "medium", "hard"):
        sub = [r for r in rows if r.difficulty == diff]
        h, nn = hit_rate(sub)
        art.append(f"| {diff} | {h:.1f}% | {nn} | {avg_mrr(sub):.4f} |")
    art.append(
        "\n*Converter para LaTeX: use `booktabs` "
        "(`\\toprule`, `\\midrule`, `\\bottomrule`).*\n"
    )
    article_path.write_text("\n".join(art) + "\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description="Bench RAG retrieval (clinical-ai /rag/test/query).")
    parser.add_argument("--benchmark", type=Path, default=DEFAULT_BENCHMARK)
    parser.add_argument("--base-url", default="http://127.0.0.1:4010")
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--question-ids", default="")
    parser.add_argument("--timeout", type=float, default=120.0)
    parser.add_argument("--resume", action="store_true")
    parser.add_argument("--out-dir", type=Path, default=None, help="Output dir (default: results/YYYYMMDD)")
    args = parser.parse_args()

    stamp = date.today().strftime("%Y%m%d")
    out_dir = args.out_dir or (BENCH_DIR / "results" / stamp)
    results_csv = out_dir / "rag_results.csv"
    summary_path = out_dir / "rag_summary.txt"
    article_path = out_dir / "rag_summary_for_article.md"

    bench_rows = load_benchmark(args.benchmark)
    if args.question_ids.strip():
        wanted = {x.strip() for x in args.question_ids.split(",") if x.strip()}
        bench_rows = [r for r in bench_rows if r["question_id"] in wanted]
    if args.limit > 0:
        bench_rows = bench_rows[: args.limit]

    existing = load_existing_ids(results_csv) if args.resume else set()
    write_header = not results_csv.is_file() or not args.resume
    collected = load_all_rows(results_csv) if args.resume else []

    try:
        with httpx.Client() as client:
            health = client.get(f"{args.base_url.rstrip('/')}/health", timeout=30.0)
            health.raise_for_status()
            h = health.json()
            print(f"Health: {h.get('status')} index_chunks={((h.get('index') or {}).get('n_chunks'))}")

            total = len(bench_rows)
            done = 0
            for brow in bench_rows:
                qid = brow["question_id"]
                if qid in existing:
                    continue
                done += 1
                print(f"[{done}/{total}] {qid} ?", flush=True)
                try:
                    data = query_rag(client, args.base_url, brow["question_pt"], args.timeout)
                    row = evaluate_row(brow, data)
                except Exception as exc:
                    row = RagRow(
                        question_id=qid,
                        difficulty=brow["difficulty"],
                        source_document_expected=brow["source_document"],
                        hit_document_at_6="false",
                        rank_first_correct=0,
                        mrr=0.0,
                        phrase_recall_in_chunks="",
                        retrieve_total_ms="",
                        index_mode="",
                        chunk_sources="",
                        error=str(exc),
                    )
                append_csv(results_csv, row, write_header)
                write_header = False
                existing.add(qid)
                collected.append(row)
                print(
                    f"  -> hit@6={row.hit_document_at_6} rank={row.rank_first_correct} "
                    f"mrr={row.mrr}"
                )
                time.sleep(0.05)
    except httpx.HTTPError as exc:
        print(f"HTTP error: {exc}", file=sys.stderr)
        return 1

    if collected:
        write_summaries(collected, summary_path, article_path)
    print(f"\nWrote {results_csv}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
