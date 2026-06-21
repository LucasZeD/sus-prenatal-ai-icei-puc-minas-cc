#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Compare APR/TFR across rag_mode and llm_provider from results.csv."""
from __future__ import annotations

import argparse
import csv
import sys
from pathlib import Path

TESTS_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(TESTS_DIR / "shared"))
from article_metrics import compute_apr, compute_tfr, is_trap  # noqa: E402

BENCH_CSV = TESTS_DIR / "dataset" / "prenatal_sus_benchmark.csv"
RAG_CSV = TESTS_DIR / "03_bench_rag_retrieval" / "results"


def load_csv(path: Path) -> list[dict[str, str]]:
    with path.open(encoding="utf-8", newline="") as fh:
        return list(csv.DictReader(fh))


def main() -> int:
    parser = argparse.ArgumentParser(description="Tabela APR/TFR por provider e rag_mode.")
    parser.add_argument("--results", type=Path, required=True)
    parser.add_argument("--rag-results", type=Path, default=None)
    args = parser.parse_args()

    if not args.results.is_file():
        print(f"Arquivo ausente: {args.results}", file=sys.stderr)
        return 1

    rows = load_csv(args.results)
    bench = load_csv(BENCH_CSV)
    trap_ids = {r["question_id"] for r in bench if is_trap(r)}

    rag_by_q: dict[str, dict[str, str]] = {}
    if args.rag_results and args.rag_results.is_file():
        rag_by_q = {r["question_id"]: r for r in load_csv(args.rag_results)}

    groups: dict[tuple[str, str], list[dict[str, str]]] = {}
    for r in rows:
        rag_mode = r.get("rag_mode") or "on"
        key = (r.get("llm_provider", ""), rag_mode)
        groups.setdefault(key, []).append(r)

    print("=== Comparativo APR / TFR ===\n")
    print(f"{'provider':<10} {'rag':<5} {'APR%':>7} {'apr_n':>8} {'TFR%':>7} {'tfr_n':>8} {'delta_apr':>10}")
    print("-" * 62)

    baseline: dict[str, float] = {}
    for (prov, rag_mode), sub in sorted(groups.items()):
        apr = compute_apr(sub, None)
        tfr = compute_tfr(sub, trap_ids, None)
        delta = ""
        if rag_mode == "on":
            baseline[prov] = apr["rate_pct"]
        elif prov in baseline:
            d = apr["rate_pct"] - baseline[prov]
            delta = f"{d:+.1f}pp"
        print(
            f"{prov:<10} {rag_mode:<5} {apr['rate_pct']:>6.1f}% "
            f"{apr['approved']:>3}/{apr['eligible']:<4} "
            f"{tfr['rate_pct']:>6.1f}% {tfr['failed']:>3}/{tfr['eligible']:<4} {delta:>10}"
        )

    if rag_by_q:
        print("\n=== APR do Ollama (rag=on) vs Hit@6 ===\n")
        oll_on = [
            r
            for r in rows
            if r.get("llm_provider") == "ollama"
            and (r.get("rag_mode") or "on") == "on"
            and r.get("apr_eligible") == "true"
        ]
        for label, pred in (
            ("Hit@6=True", lambda q: rag_by_q.get(q, {}).get("hit_document@6") == "true"),
            ("Hit@6=False", lambda q: rag_by_q.get(q, {}).get("hit_document@6") != "true"),
        ):
            sub = [r for r in oll_on if pred(r["question_id"])]
            if not sub:
                continue
            apr = compute_apr(sub, None)
            print(f"  {label}: APR={apr['rate_pct']:.1f}% (n={apr['eligible']})")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
