#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Compara ablações STT a partir de stt_results.csv."""
from __future__ import annotations

import argparse
import csv
import statistics
import sys
from collections import defaultdict
from pathlib import Path


def load_csv(path: Path) -> list[dict[str, str]]:
    with path.open(encoding="utf-8", newline="") as fh:
        return list(csv.DictReader(fh))


def percentile(values: list[float], p: float) -> float:
    if not values:
        return 0.0
    sorted_v = sorted(values)
    k = (len(sorted_v) - 1) * p
    f = int(k)
    c = min(f + 1, len(sorted_v) - 1)
    if f == c:
        return sorted_v[f]
    return sorted_v[f] + (sorted_v[c] - sorted_v[f]) * (k - f)


def aggregate(rows: list[dict[str, str]]) -> dict[str, float | int]:
    wers = [float(r["wer_pct"]) for r in rows if r.get("wer_pct") and r["wer_pct"] != ""]
    recalls = [float(r["phrase_recall_pct"]) for r in rows if r.get("phrase_recall_pct")]
    latencies = [float(r["latency_ms"]) for r in rows if r.get("latency_ms")]
    empty = sum(1 for r in rows if r.get("empty_response") == "true")
    return {
        "n": len(rows),
        "wer_mean": statistics.mean(wers) if wers else -1.0,
        "phrase_recall_mean": statistics.mean(recalls) if recalls else -1.0,
        "latency_p50": percentile(latencies, 0.5),
        "latency_p95": percentile(latencies, 0.95),
        "empty_count": empty,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Tabela comparativa de ablações STT.")
    parser.add_argument("--results-dir", type=Path, required=True)
    parser.add_argument("--results", type=Path, default=None, help="Caminho direto ao CSV")
    args = parser.parse_args()

    csv_path = args.results or (args.results_dir / "stt_results.csv")
    if not csv_path.is_file():
        print(f"Arquivo ausente: {csv_path}", file=sys.stderr)
        return 1

    rows = load_csv(csv_path)
    by_ablation: dict[str, list[dict[str, str]]] = defaultdict(list)
    for r in rows:
        by_ablation[r.get("ablation_id") or "unknown"].append(r)

    print("=== Comparativo STT por ablação ===\n")
    print(
        f"{'ablation_id':<28} {'n':>4} {'WER%':>7} {'phrase%':>8} "
        f"{'lat_p50':>8} {'lat_p95':>8} {'empty':>6}"
    )
    print("-" * 78)

    ranked: list[tuple[str, dict[str, float | int]]] = []
    for ab_id, sub in sorted(by_ablation.items()):
        agg = aggregate(sub)
        ranked.append((ab_id, agg))
        wer_s = f"{agg['wer_mean']:.1f}" if agg["wer_mean"] >= 0 else "n/a"
        pr_s = f"{agg['phrase_recall_mean']:.1f}" if agg["phrase_recall_mean"] >= 0 else "n/a"
        print(
            f"{ab_id:<28} {agg['n']:>4} {wer_s:>7} {pr_s:>8} "
            f"{agg['latency_p50']:>8.0f} {agg['latency_p95']:>8.0f} {agg['empty_count']:>6}"
        )

    if ranked:
        best = min(
            (x for x in ranked if x[1]["wer_mean"] >= 0),
            key=lambda x: (x[1]["wer_mean"], x[1]["latency_p50"]),
            default=None,
        )
        if best:
            print(f"\nMelhor WER (menor): {best[0]} ({best[1]['wer_mean']:.1f}%)")

    by_diff: dict[str, list[dict[str, str]]] = defaultdict(list)
    for r in rows:
        by_diff[r.get("difficulty") or "unknown"].append(r)

    if by_diff:
        print("\n=== WER médio por dificuldade (global) ===\n")
        for diff, sub in sorted(by_diff.items()):
            agg = aggregate(sub)
            wer_s = f"{agg['wer_mean']:.1f}" if agg["wer_mean"] >= 0 else "n/a"
            print(f"  {diff}: WER={wer_s}% (n={agg['n']})")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
