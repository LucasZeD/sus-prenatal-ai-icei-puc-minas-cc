#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Agrega stt_results.csv de uma matriz comparativa em CSVs unificados."""
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
    s = sorted(values)
    k = (len(s) - 1) * p
    f = int(k)
    c = min(f + 1, len(s) - 1)
    if f == c:
        return s[f]
    return s[f] + (s[c] - s[f]) * (k - f)


def aggregate(rows: list[dict[str, str]]) -> dict[str, str | int | float]:
    wers = [float(r["wer_pct"]) for r in rows if r.get("wer_pct") and r["wer_pct"] != ""]
    recalls = [float(r["phrase_recall_pct"]) for r in rows if r.get("phrase_recall_pct")]
    latencies = [float(r["latency_ms"]) for r in rows if r.get("latency_ms")]
    empty = sum(1 for r in rows if r.get("empty_response") == "true")
    return {
        "n": len(rows),
        "wer_mean_pct": f"{statistics.mean(wers):.2f}" if wers else "",
        "phrase_recall_mean_pct": f"{statistics.mean(recalls):.1f}" if recalls else "",
        "latency_mean_ms": f"{statistics.mean(latencies):.0f}" if latencies else "",
        "latency_p50_ms": f"{percentile(latencies, 0.5):.0f}" if latencies else "",
        "latency_p95_ms": f"{percentile(latencies, 0.95):.0f}" if latencies else "",
        "empty_count": empty,
    }


def find_result_csvs(root: Path) -> list[Path]:
    return sorted(root.rglob("stt_results.csv"))


def main() -> int:
    parser = argparse.ArgumentParser(description="Merge STT benchmark CSVs.")
    parser.add_argument("--results-root", type=Path, required=True)
    args = parser.parse_args()

    if not args.results_root.is_dir():
        print(f"Pasta ausente: {args.results_root}", file=sys.stderr)
        return 1

    csv_paths = find_result_csvs(args.results_root)
    if not csv_paths:
        print(f"Nenhum stt_results.csv em {args.results_root}", file=sys.stderr)
        return 1

    all_rows: list[dict[str, str]] = []
    for path in csv_paths:
        rel = path.parent.relative_to(args.results_root)
        parts = rel.parts
        corpus = parts[0] if len(parts) >= 1 else ""
        preset = parts[1] if len(parts) >= 2 else ""
        for row in load_csv(path):
            row = dict(row)
            if not row.get("corpus"):
                row["corpus"] = corpus
            if not row.get("preset_id"):
                row["preset_id"] = preset
            all_rows.append(row)

    if not all_rows:
        print("Nenhuma linha agregada.", file=sys.stderr)
        return 1

    fieldnames = list(all_rows[0].keys())
    for row in all_rows[1:]:
        for k in row:
            if k not in fieldnames:
                fieldnames.append(k)

    all_path = args.results_root / "stt_results_all.csv"
    with all_path.open("w", encoding="utf-8", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=fieldnames, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(all_rows)

    groups: dict[tuple[str, str, str], list[dict[str, str]]] = defaultdict(list)
    for row in all_rows:
        key = (
            row.get("corpus") or "",
            row.get("preset_id") or "",
            row.get("ablation_id") or "",
        )
        groups[key].append(row)

    summary_path = args.results_root / "stt_summary_by_preset.csv"
    summary_fields = [
        "corpus",
        "preset_id",
        "ablation_id",
        "whisper_model",
        "n",
        "wer_mean_pct",
        "phrase_recall_mean_pct",
        "latency_mean_ms",
        "latency_p50_ms",
        "latency_p95_ms",
        "empty_count",
    ]
    summary_rows: list[dict[str, str]] = []
    for (corpus, preset, ablation), sub in sorted(groups.items()):
        agg = aggregate(sub)
        model = sub[0].get("whisper_model") or "" if sub else ""
        summary_rows.append(
            {
                "corpus": corpus,
                "preset_id": preset,
                "ablation_id": ablation,
                "whisper_model": model,
                **{k: str(v) for k, v in agg.items()},
            }
        )

    with summary_path.open("w", encoding="utf-8", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=summary_fields, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(summary_rows)

    print(f"Agregado: {all_path} ({len(all_rows)} linhas)")
    print(f"Resumo: {summary_path} ({len(summary_rows)} grupos)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
