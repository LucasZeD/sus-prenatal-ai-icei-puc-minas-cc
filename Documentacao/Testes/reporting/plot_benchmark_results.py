#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Generate article-focused charts, metrics JSON and dashboard."""
from __future__ import annotations

import argparse
import csv
import json
import sys
from datetime import datetime
from pathlib import Path
from typing import Any

import matplotlib.pyplot as plt

ROOT = Path(__file__).resolve().parent.parent
REPORT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / "lib"))
from paths import (  # noqa: E402
    BENCHMARK_CSV,
    article_metrics_path,
    dashboard_dir,
    figures_dir,
    gateway_dir,
    llm_dir,
    rag_dir,
)
from article_metrics import benchmark_composition, compute_apr, compute_hit6, compute_tfr, difficulty_counts, is_trap  # noqa: E402


def load_csv(path: Path) -> list[dict[str, str]]:
    with path.open(encoding="utf-8", newline="") as fh:
        return list(csv.DictReader(fh))


def save_figure(fig: plt.Figure, out_dir: Path, stem: str, dpi: int = 150) -> dict[str, str]:
    out_dir.mkdir(parents=True, exist_ok=True)
    paths: dict[str, str] = {}
    for ext in ("png", "pdf"):
        p = out_dir / f"{stem}.{ext}"
        fig.savefig(p, dpi=dpi if ext == "png" else None, bbox_inches="tight")
        paths[ext] = p.name
    plt.close(fig)
    return paths


def plot_composicao_conjunto(rows: list[dict[str, str]], out_dir: Path, dpi: int) -> dict[str, str]:
    comp = benchmark_composition(rows)
    labels = ["Protocolo", "Trap"]
    vals = [comp["protocol"], comp["trap"]]
    fig, ax = plt.subplots(figsize=(6, 4))
    bars = ax.bar(labels, vals, color=["#4c78a8", "#e45756"])
    ax.set_title("Composicao do conjunto (N=100)")
    ax.set_ylabel("Numero de perguntas")
    for b, v in zip(bars, vals):
        ax.text(b.get_x() + b.get_width() / 2, b.get_height() + 0.3, str(v), ha="center")
    fig.tight_layout()
    return save_figure(fig, out_dir, "fig01_composicao_conjunto", dpi)


def plot_instrumento_dificuldade(rows: list[dict[str, str]], out_dir: Path, dpi: int) -> dict[str, str]:
    counts = difficulty_counts(rows)
    labels = ["easy", "medium", "hard"]
    vals = [counts[k] for k in labels]
    fig, ax = plt.subplots(figsize=(7, 4))
    bars = ax.bar(labels, vals, color=["#4c78a8", "#f58518", "#e45756"])
    ax.set_ylabel("Numero de perguntas")
    ax.set_title("Instrumento por dificuldade (N=100)")
    for b, v in zip(bars, vals):
        ax.text(b.get_x() + b.get_width() / 2, b.get_height() + 0.3, str(v), ha="center")
    fig.tight_layout()
    return save_figure(fig, out_dir, "fig02_instrumento_dificuldade", dpi)


def plot_hit6(rag_rows: list[dict[str, str]], out_dir: Path, dpi: int) -> dict[str, str]:
    hit = compute_hit6(rag_rows)
    labels = ["easy", "medium", "hard"]
    vals = [hit["by_difficulty"][d]["rate_pct"] for d in labels]
    global_rate = hit["global"]["rate_pct"]
    fig, ax = plt.subplots(figsize=(8, 4))
    bars = ax.bar(labels, vals, color="#4c78a8")
    ax.axhline(global_rate, color="#e45756", linestyle="--", label=f"Global {global_rate:.1f}%")
    ax.set_ylim(0, 105)
    ax.set_ylabel("Hit@6 (%)")
    ax.set_title("Hit@6 por dificuldade")
    for b, v in zip(bars, vals):
        ax.text(b.get_x() + b.get_width() / 2, v + 1, f"{v:.1f}%", ha="center", fontsize=9)
    ax.legend()
    fig.tight_layout()
    return save_figure(fig, out_dir, "fig03_hit6_global_difficulty", dpi)


def plot_apr_ollama(llm_rows: list[dict[str, str]], out_dir: Path, dpi: int) -> dict[str, str]:
    labels = ["easy", "medium", "hard"]
    vals: list[float] = []
    for d in labels:
        subset = [r for r in llm_rows if r.get("llm_provider") == "ollama" and r.get("difficulty") == d]
        vals.append(compute_apr(subset)["rate_pct"])
    fig, ax = plt.subplots(figsize=(8, 4))
    bars = ax.bar(labels, vals, color="#4c78a8")
    ax.set_ylim(0, 105)
    ax.set_ylabel("APR (%)")
    ax.set_title("APR (Ollama) por dificuldade")
    for b, v in zip(bars, vals):
        ax.text(b.get_x() + b.get_width() / 2, v + 1, f"{v:.1f}%", ha="center", fontsize=9)
    fig.tight_layout()
    return save_figure(fig, out_dir, "fig04_apr_ollama_difficulty", dpi)


def plot_tfr_traps(llm_rows: list[dict[str, str]], trap_ids: set[str], out_dir: Path, dpi: int) -> dict[str, str]:
    tfr = compute_tfr(llm_rows, trap_ids, "ollama")
    fail = tfr["failed"]
    ok = max(tfr["eligible"] - fail, 0)
    fig, ax = plt.subplots(figsize=(6, 4))
    bars = ax.bar(["Trap aprovadas", "Trap falhas"], [ok, fail], color=["#72b7b2", "#e45756"])
    ax.set_title(f"TFR em traps (Ollama): {tfr['rate_pct']:.1f}%")
    ax.set_ylabel("Numero de itens")
    for b, v in zip(bars, [ok, fail]):
        ax.text(b.get_x() + b.get_width() / 2, b.get_height() + 0.2, str(v), ha="center")
    fig.tight_layout()
    return save_figure(fig, out_dir, "fig05_tfr_traps", dpi)


def plot_pii_leak_by_type(gateway_rows: list[dict[str, str]], out_dir: Path, dpi: int) -> dict[str, str]:
    by_type: dict[str, list[dict[str, str]]] = {}
    for r in gateway_rows:
        by_type.setdefault(r.get("entity_type", "unknown"), []).append(r)
    labels = sorted(by_type.keys())
    vals = []
    for t in labels:
        subset = by_type[t]
        leaks = sum(1 for r in subset if r.get("leak") == "true")
        vals.append(100.0 * leaks / len(subset) if subset else 0.0)
    fig, ax = plt.subplots(figsize=(9, 4))
    bars = ax.bar(labels, vals, color="#e45756")
    ax.set_ylim(0, 105)
    ax.set_ylabel("Leak rate (%)")
    ax.set_title("PII Leak Rate por tipo de entidade")
    plt.setp(ax.get_xticklabels(), rotation=25, ha="right")
    for b, v in zip(bars, vals):
        ax.text(b.get_x() + b.get_width() / 2, v + 1, f"{v:.1f}%", ha="center", fontsize=8)
    fig.tight_layout()
    return save_figure(fig, out_dir, "fig06_pii_leak_by_type", dpi)


def plot_latency_breakdown(llm_rows: list[dict[str, str]], out_dir: Path, dpi: int) -> dict[str, str]:
    auto = [r for r in llm_rows if r.get("pass_auto") in ("true", "false")]

    def avg(key: str) -> float:
        vals: list[float] = []
        for r in auto:
            raw = (r.get(key) or "").strip()
            if not raw:
                continue
            try:
                vals.append(float(raw))
            except ValueError:
                continue
        return (sum(vals) / len(vals)) if vals else 0.0

    labels = ["retrieve_ms", "ttft_ms", "gen_tokens_per_sec"]
    vals = [avg("retrieve_ms"), avg("ttft_ms"), avg("gen_tokens_per_sec")]
    fig, ax = plt.subplots(figsize=(8, 4))
    bars = ax.bar(labels, vals, color=["#4c78a8", "#f58518", "#72b7b2"])
    ax.set_title("Medias de latencia e geracao")
    for b, v in zip(bars, vals):
        ax.text(b.get_x() + b.get_width() / 2, v + (0.5 if v > 10 else 0.05), f"{v:.2f}", ha="center")
    fig.tight_layout()
    return save_figure(fig, out_dir, "fig07_latency_breakdown", dpi)


def plot_provider_apr_global(llm_rows: list[dict[str, str]], out_dir: Path, dpi: int) -> dict[str, str]:
    vals = [compute_apr(llm_rows, "ollama")["rate_pct"], compute_apr(llm_rows, "gemini")["rate_pct"]]
    fig, ax = plt.subplots(figsize=(6, 4))
    bars = ax.bar(["ollama", "gemini"], vals, color=["#4c78a8", "#f58518"])
    ax.set_ylim(0, 105)
    ax.set_ylabel("APR (%)")
    ax.set_title("APR global por provider")
    for b, v in zip(bars, vals):
        ax.text(b.get_x() + b.get_width() / 2, v + 1, f"{v:.1f}%", ha="center")
    fig.tight_layout()
    return save_figure(fig, out_dir, "fig08_providers_apr_global", dpi)


def write_dashboard(path: Path, stamp: str, figures: dict[str, dict[str, str]], metrics: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    rows = []
    for key in sorted(figures.keys()):
        png = figures[key].get("png", "")
        rows.append(
            f'<h3>{key}</h3><img src="../../figures/{stamp}/{png}" style="max-width:1000px;width:100%;">'
        )
    html = f"""<!doctype html>
<html lang="pt-br">
<head>
  <meta charset="utf-8" />
  <title>Dashboard Testes Artigo {stamp}</title>
  <style>body{{font-family:Arial,Helvetica,sans-serif;max-width:1100px;margin:24px auto;padding:0 12px;}}pre{{background:#f5f5f5;padding:12px;overflow:auto;}}</style>
</head>
<body>
  <h1>Dashboard - Testes do Artigo ({stamp})</h1>
  <h2>Metricas consolidadas</h2>
  <pre>{json.dumps(metrics, ensure_ascii=False, indent=2)}</pre>
  {''.join(rows)}
</body>
</html>
"""
    path.write_text(html, encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description="Gera graficos do protocolo do artigo.")
    parser.add_argument(
        "--date",
        default=datetime.now().strftime("%Y%m%d_%H%M%S"),
        help="Stamp da pasta de resultados (YYYYMMDD_HHMMSS)",
    )
    parser.add_argument("--benchmark-csv", type=Path, default=BENCHMARK_CSV)
    parser.add_argument("--rag-csv", type=Path, default=None)
    parser.add_argument("--llm-csv", type=Path, default=None)
    parser.add_argument("--gateway-csv", type=Path, default=None)
    parser.add_argument("--out-dir", type=Path, default=None)
    parser.add_argument("--dpi", type=int, default=150)
    args = parser.parse_args()

    stamp = args.date
    rag_csv = args.rag_csv or (rag_dir(stamp) / "rag_results.csv")
    llm_csv = args.llm_csv or (llm_dir(stamp) / "results.csv")
    gateway_csv = args.gateway_csv or (gateway_dir(stamp) / "gateway_results.csv")
    out_dir = args.out_dir or figures_dir(stamp)
    dashboard_path = dashboard_dir(stamp) / "index.html"
    metrics_path = article_metrics_path()

    missing: list[str] = []
    for p in (args.benchmark_csv, rag_csv, llm_csv, gateway_csv):
        if not p.is_file():
            missing.append(str(p))
    if missing:
        print("Arquivos ausentes (rode os benchmarks antes):", file=sys.stderr)
        for m in missing:
            print(f"  - {m}", file=sys.stderr)
        return 1

    bench_rows = load_csv(args.benchmark_csv)
    rag_rows = load_csv(rag_csv)
    llm_rows = load_csv(llm_csv)
    gateway_rows = load_csv(gateway_csv)
    trap_ids = {r["question_id"] for r in bench_rows if is_trap(r)}

    figures: dict[str, dict[str, str]] = {}
    figures["fig01_composicao_conjunto"] = plot_composicao_conjunto(bench_rows, out_dir, args.dpi)
    figures["fig02_instrumento_dificuldade"] = plot_instrumento_dificuldade(bench_rows, out_dir, args.dpi)
    figures["fig03_hit6_global_difficulty"] = plot_hit6(rag_rows, out_dir, args.dpi)
    figures["fig04_apr_ollama_difficulty"] = plot_apr_ollama(llm_rows, out_dir, args.dpi)
    figures["fig05_tfr_traps"] = plot_tfr_traps(llm_rows, trap_ids, out_dir, args.dpi)
    figures["fig06_pii_leak_by_type"] = plot_pii_leak_by_type(gateway_rows, out_dir, args.dpi)
    figures["fig07_latency_breakdown"] = plot_latency_breakdown(llm_rows, out_dir, args.dpi)
    figures["fig08_providers_apr_global"] = plot_provider_apr_global(llm_rows, out_dir, args.dpi)

    metrics = {
        "stamp": stamp,
        "composition": benchmark_composition(bench_rows),
        "difficulty_counts": difficulty_counts(bench_rows),
        "hit6": compute_hit6(rag_rows),
        "apr": {
            "ollama": compute_apr(llm_rows, "ollama"),
            "gemini": compute_apr(llm_rows, "gemini"),
        },
        "tfr": {
            "ollama": compute_tfr(llm_rows, trap_ids, "ollama"),
            "gemini": compute_tfr(llm_rows, trap_ids, "gemini"),
        },
    }

    manifest = {"date": stamp, "figures": figures}
    manifest_path = out_dir / "figures_manifest.json"
    out_dir.mkdir(parents=True, exist_ok=True)
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    metrics_path.write_text(json.dumps(metrics, ensure_ascii=False, indent=2), encoding="utf-8")
    write_dashboard(dashboard_path, stamp, figures, metrics)

    print(f"Figuras em: {out_dir}")
    print(f"Manifest: {manifest_path}")
    print(f"Metricas: {metrics_path}")
    print(f"Dashboard: {dashboard_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
