#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Gera graficos PNG/PDF dos tres blocos de benchmark para o artigo."""
from __future__ import annotations

import argparse
import csv
import json
from collections import Counter
from datetime import date
from pathlib import Path

import matplotlib.pyplot as plt

TESTS_DIR = Path(__file__).resolve().parent.parent
REPORT_DIR = Path(__file__).resolve().parent
DEFAULT_BENCHMARK = TESTS_DIR / "dataset" / "prenatal_sus_benchmark.csv"

DIFFICULTIES = ("easy", "medium", "hard")
DIFF_LABELS = {
    "easy": "Facil",
    "medium": "Media",
    "hard": "Dificil",
}
MODE_LABELS = {
    "contains_all": "contains_all",
    "contains_any": "contains_any",
    "boolean_exact": "boolean_exact",
    "human_judge": "human_judge",
}


def save_figure(fig: plt.Figure, out_dir: Path, stem: str, dpi: int = 150) -> dict[str, str]:
    out_dir.mkdir(parents=True, exist_ok=True)
    paths: dict[str, str] = {}
    for ext in ("png", "pdf"):
        path = out_dir / f"{stem}.{ext}"
        fig.savefig(path, dpi=dpi if ext == "png" else None, bbox_inches="tight")
        paths[ext] = str(path.relative_to(REPORT_DIR))
    plt.close(fig)
    return paths


def load_benchmark(path: Path) -> list[dict[str, str]]:
    with path.open(encoding="utf-8", newline="") as fh:
        return list(csv.DictReader(fh))


def load_rag(path: Path) -> list[dict[str, str]]:
    with path.open(encoding="utf-8", newline="") as fh:
        return list(csv.DictReader(fh))


def load_llm(path: Path) -> list[dict[str, str]]:
    with path.open(encoding="utf-8", newline="") as fh:
        return list(csv.DictReader(fh))


def plot_instrumento_dificuldade(rows: list[dict[str, str]], out_dir: Path) -> dict[str, str]:
    counts = Counter(r["difficulty"] for r in rows)
    labels = [DIFF_LABELS.get(d, d) for d in DIFFICULTIES]
    values = [counts.get(d, 0) for d in DIFFICULTIES]
    fig, ax = plt.subplots(figsize=(7, 4))
    bars = ax.bar(labels, values, color=["#4c78a8", "#f58518", "#e45756"])
    ax.set_ylabel("Numero de perguntas")
    ax.set_title("Instrumento: distribuicao por dificuldade (n=110)")
    ax.set_ylim(0, max(values) * 1.15 if values else 1)
    for bar, v in zip(bars, values):
        ax.text(bar.get_x() + bar.get_width() / 2, bar.get_height() + 0.5, str(v), ha="center", fontsize=10)
    fig.tight_layout()
    return save_figure(fig, out_dir, "fig01_instrumento_dificuldade")


def plot_instrumento_modos(rows: list[dict[str, str]], out_dir: Path) -> dict[str, str]:
    counts = Counter(r["answer_evaluation_mode"] for r in rows)
    order = ["contains_all", "contains_any", "boolean_exact", "human_judge"]
    labels = [MODE_LABELS.get(m, m) for m in order if counts.get(m, 0)]
    values = [counts[m] for m in order if counts.get(m, 0)]
    fig, ax = plt.subplots(figsize=(8, 4))
    bars = ax.bar(labels, values, color="#72b7b2")
    ax.set_ylabel("Numero de perguntas")
    ax.set_title("Instrumento: modos de avaliacao automatica")
    plt.setp(ax.get_xticklabels(), rotation=15, ha="right")
    for bar, v in zip(bars, values):
        ax.text(bar.get_x() + bar.get_width() / 2, bar.get_height() + 0.5, str(v), ha="center", fontsize=9)
    fig.tight_layout()
    return save_figure(fig, out_dir, "fig02_instrumento_modos")


def plot_rag_metrics(rag_rows: list[dict[str, str]], out_dir: Path) -> tuple[dict[str, str], dict[str, str]]:
    hit_by_diff: dict[str, list[float]] = {d: [] for d in DIFFICULTIES}
    mrr_by_diff: dict[str, list[float]] = {d: [] for d in DIFFICULTIES}
    for r in rag_rows:
        d = r["difficulty"]
        if d not in hit_by_diff:
            continue
        hit_by_diff[d].append(1.0 if r.get("hit_document@6") == "true" else 0.0)
        try:
            mrr_by_diff[d].append(float(r.get("mrr") or 0))
        except ValueError:
            mrr_by_diff[d].append(0.0)

    labels = [DIFF_LABELS[d] for d in DIFFICULTIES]
    hit_pct = [
        100.0 * sum(hit_by_diff[d]) / len(hit_by_diff[d]) if hit_by_diff[d] else 0.0 for d in DIFFICULTIES
    ]
    mrr_avg = [sum(mrr_by_diff[d]) / len(mrr_by_diff[d]) if mrr_by_diff[d] else 0.0 for d in DIFFICULTIES]

    fig, ax1 = plt.subplots(figsize=(8, 4))
    x = range(len(labels))
    w = 0.35
    bars = ax1.bar([i - w / 2 for i in x], hit_pct, width=w, label="Hit@6 (%)", color="#4c78a8")
    ax1.set_ylabel("Hit@6 (%)")
    ax1.set_ylim(0, 105)
    ax1.set_xticks(list(x))
    ax1.set_xticklabels(labels)
    ax1.set_title("RAG (retrieval only): Hit@6 e MRR por dificuldade")
    for bar, v in zip(bars, hit_pct):
        ax1.text(bar.get_x() + bar.get_width() / 2, bar.get_height() + 1, f"{v:.1f}%", ha="center", fontsize=9)

    ax2 = ax1.twinx()
    line = ax2.plot(list(x), mrr_avg, color="#e45756", marker="o", linewidth=2, label="MRR medio")
    ax2.set_ylabel("MRR medio")
    ax2.set_ylim(0, 1.05)
    for i, v in enumerate(mrr_avg):
        ax2.text(i, v + 0.03, f"{v:.3f}", ha="center", color="#e45756", fontsize=9)

    lines1, labels1 = ax1.get_legend_handles_labels()
    lines2, labels2 = ax2.get_legend_handles_labels()
    ax1.legend(lines1 + lines2, labels1 + labels2, loc="upper right")
    fig.tight_layout()
    paths_hit = save_figure(fig, out_dir, "fig03_rag_hit_at_6")

    fig2, ax = plt.subplots(figsize=(7, 4))
    bars2 = ax.bar(labels, mrr_avg, color="#e45756")
    ax.set_ylabel("MRR medio")
    ax.set_title("RAG: MRR medio por dificuldade")
    ax.set_ylim(0, 1.05)
    for bar, v in zip(bars2, mrr_avg):
        ax.text(bar.get_x() + bar.get_width() / 2, bar.get_height() + 0.02, f"{v:.3f}", ha="center", fontsize=9)
    fig2.tight_layout()
    paths_mrr = save_figure(fig2, out_dir, "fig04_rag_mrr")
    return paths_hit, paths_mrr


def llm_pass_rates(llm_rows: list[dict[str, str]]) -> tuple[dict[str, dict[str, float]], dict[str, float]]:
    by_diff_prov: dict[str, dict[str, float]] = {d: {} for d in DIFFICULTIES + ("ALL",)}
    global_prov: dict[str, float] = {}

    for prov in ("ollama", "gemini"):
        sub = [r for r in llm_rows if r["llm_provider"] == prov]
        auto = [r for r in sub if r["pass_auto"] in ("true", "false")]
        if auto:
            global_prov[prov] = 100.0 * sum(1 for r in auto if r["pass_auto"] == "true") / len(auto)
        else:
            global_prov[prov] = 0.0
        for diff in DIFFICULTIES:
            rs = [r for r in sub if r["difficulty"] == diff and r["pass_auto"] in ("true", "false")]
            if rs:
                by_diff_prov[diff][prov] = 100.0 * sum(1 for r in rs if r["pass_auto"] == "true") / len(rs)
            else:
                by_diff_prov[diff][prov] = 0.0
        all_auto = [r for r in sub if r["pass_auto"] in ("true", "false")]
        if all_auto:
            by_diff_prov["ALL"][prov] = 100.0 * sum(1 for r in all_auto if r["pass_auto"] == "true") / len(all_auto)

    return by_diff_prov, global_prov


def plot_llm_pass_provider(llm_rows: list[dict[str, str]], out_dir: Path) -> dict[str, str]:
    by_diff_prov, _ = llm_pass_rates(llm_rows)
    labels = [DIFF_LABELS[d] for d in DIFFICULTIES]
    x = range(len(labels))
    w = 0.35
    ollama_vals = [by_diff_prov[d].get("ollama", 0.0) for d in DIFFICULTIES]
    gemini_vals = [by_diff_prov[d].get("gemini", 0.0) for d in DIFFICULTIES]

    fig, ax = plt.subplots(figsize=(8, 4))
    ax.bar([i - w / 2 for i in x], ollama_vals, width=w, label="Ollama", color="#4c78a8")
    ax.bar([i + w / 2 for i in x], gemini_vals, width=w, label="Gemini", color="#f58518")
    ax.set_ylabel("% pass_auto=true")
    ax.set_ylim(0, 105)
    ax.set_xticks(list(x))
    ax.set_xticklabels(labels)
    ax.set_title("Modelos (end-to-end): acerto por dificuldade e provider")
    ax.legend()
    review_n = sum(1 for r in llm_rows if r["pass_auto"] == "review")
    ax.text(0.02, 0.98, f"Itens human_judge (review): {review_n}", transform=ax.transAxes, va="top", fontsize=8)
    fig.tight_layout()
    return save_figure(fig, out_dir, "fig05_llm_pass_provider")


def plot_llm_pass_global(llm_rows: list[dict[str, str]], out_dir: Path) -> dict[str, str]:
    _, global_prov = llm_pass_rates(llm_rows)
    providers = ["ollama", "gemini"]
    values = [global_prov.get(p, 0.0) for p in providers]
    fig, ax = plt.subplots(figsize=(5, 4))
    bars = ax.bar(providers, values, color=["#4c78a8", "#f58518"])
    ax.set_ylabel("% pass_auto=true (global)")
    ax.set_ylim(0, 105)
    ax.set_title("Modelos: taxa global de acerto automatico")
    for bar, v in zip(bars, values):
        ax.text(bar.get_x() + bar.get_width() / 2, bar.get_height() + 1, f"{v:.1f}%", ha="center", fontsize=10)
    review_n = sum(1 for r in llm_rows if r["pass_auto"] == "review")
    ax.text(0.02, 0.98, f"Exclui {review_n} itens em review (human_judge)", transform=ax.transAxes, va="top", fontsize=8)
    fig.tight_layout()
    return save_figure(fig, out_dir, "fig06_llm_pass_global")


def main() -> int:
    parser = argparse.ArgumentParser(description="Gera graficos dos benchmarks para o artigo.")
    parser.add_argument("--date", default=date.today().strftime("%Y%m%d"), help="YYYYMMDD (pastas results)")
    parser.add_argument("--benchmark-csv", type=Path, default=None)
    parser.add_argument("--rag-csv", type=Path, default=None)
    parser.add_argument("--llm-csv", type=Path, default=None)
    parser.add_argument("--out-dir", type=Path, default=None)
    parser.add_argument("--dpi", type=int, default=150)
    args = parser.parse_args()

    stamp = args.date
    benchmark_csv = args.benchmark_csv or DEFAULT_BENCHMARK
    rag_csv = args.rag_csv or (TESTS_DIR / "03_bench_rag_retrieval" / "results" / stamp / "rag_results.csv")
    llm_csv = args.llm_csv or (TESTS_DIR / "02_bench_modelos_llm" / "results" / stamp / "results.csv")
    out_dir = args.out_dir or (REPORT_DIR / "figures" / stamp)

    missing: list[str] = []
    if not benchmark_csv.is_file():
        missing.append(str(benchmark_csv))
    if not rag_csv.is_file():
        missing.append(str(rag_csv))
    if not llm_csv.is_file():
        missing.append(str(llm_csv))
    if missing:
        print("Arquivos ausentes (rode os benchmarks antes):", file=__import__("sys").stderr)
        for m in missing:
            print(f"  - {m}", file=__import__("sys").stderr)
        return 1

    bench_rows = load_benchmark(benchmark_csv)
    rag_rows = load_rag(rag_csv)
    llm_rows = load_llm(llm_csv)

    manifest: dict[str, object] = {"date": stamp, "figures": {}}

    manifest["figures"]["fig01_instrumento_dificuldade"] = plot_instrumento_dificuldade(bench_rows, out_dir)
    manifest["figures"]["fig02_instrumento_modos"] = plot_instrumento_modos(bench_rows, out_dir)
    hit_paths, mrr_paths = plot_rag_metrics(rag_rows, out_dir)
    manifest["figures"]["fig03_rag_hit_at_6"] = hit_paths
    manifest["figures"]["fig04_rag_mrr"] = mrr_paths
    manifest["figures"]["fig05_llm_pass_provider"] = plot_llm_pass_provider(llm_rows, out_dir)
    manifest["figures"]["fig06_llm_pass_global"] = plot_llm_pass_global(llm_rows, out_dir)

    manifest_path = out_dir / "figures_manifest.json"
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Figuras em: {out_dir}")
    print(f"Manifest: {manifest_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
