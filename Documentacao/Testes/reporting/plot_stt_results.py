#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Gera figuras STT, stt_metrics.json e STT_RELATORIO.md."""
from __future__ import annotations

import argparse
import csv
import json
import statistics
import sys
from collections import defaultdict
from datetime import datetime
from pathlib import Path
from typing import Any

import matplotlib.pyplot as plt

ROOT = Path(__file__).resolve().parent.parent
REPORT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / "lib"))
from paths import figures_dir, roteiro_dir, stt_metrics_path  # noqa: E402


def load_csv(path: Path) -> list[dict[str, str]]:
    with path.open(encoding="utf-8", newline="") as fh:
        return list(csv.DictReader(fh))


def save_figure(fig: plt.Figure, out_dir: Path, stem: str, dpi: int = 150) -> dict[str, str]:
    out_dir.mkdir(parents=True, exist_ok=True)
    paths: dict[str, str] = {}
    for ext in ("png", "pdf"):
        p = out_dir / f"{stem}.{ext}"
        fig.savefig(p, dpi=dpi if ext == "png" else None, bbox_inches="tight")
        paths[ext] = str(p)
    plt.close(fig)
    return paths


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


def agg_wer(rows: list[dict[str, str]]) -> float:
    wers = [float(r["wer_pct"]) for r in rows if r.get("wer_pct") and r["wer_pct"] != ""]
    return statistics.mean(wers) if wers else 0.0


def agg_latency_p50(rows: list[dict[str, str]]) -> float:
    lat = [float(r["latency_ms"]) for r in rows if r.get("latency_ms")]
    return percentile(lat, 0.5) if lat else 0.0


def plot_wer_by_model(rows: list[dict[str, str]], out_dir: Path, dpi: int) -> dict[str, str]:
    model_presets = {
        "medium": "model_medium",
        "large-v3": "model_large_v3",
        "large-v3-turbo": "model_large_v3_turbo",
    }
    corpora = sorted({r.get("corpus") or "" for r in rows if r.get("corpus")})
    corpora = [c for c in corpora if c]

    fig, ax = plt.subplots(figsize=(10, 5))
    x_labels = list(model_presets.keys())
    width = 0.25
    for i, corpus in enumerate(corpora):
        vals = []
        for model, preset in model_presets.items():
            sub = [
                r
                for r in rows
                if r.get("corpus") == corpus
                and (r.get("preset_id") == preset or r.get("whisper_model") == model)
                and r.get("ablation_id") == "preprocess_on"
            ]
            if not sub:
                sub = [r for r in rows if r.get("corpus") == corpus and r.get("preset_id") == preset]
            vals.append(agg_wer(sub))
        xs = [j + i * width for j in range(len(x_labels))]
        ax.bar(xs, vals, width=width, label=corpus)

    ax.set_xticks([j + width for j in range(len(x_labels))])
    ax.set_xticklabels(x_labels)
    ax.set_ylabel("WER medio (%)")
    ax.set_title("WER por modelo Whisper (preprocess_on)")
    ax.legend()
    fig.tight_layout()
    return save_figure(fig, out_dir, "fig_stt01_wer_by_model", dpi)


def plot_latency_by_model(rows: list[dict[str, str]], out_dir: Path, dpi: int) -> dict[str, str]:
    presets = ["model_medium", "model_large_v3", "model_large_v3_turbo"]
    labels = ["medium", "large-v3", "turbo"]
    p50 = []
    p95 = []
    for preset in presets:
        sub = [r for r in rows if r.get("preset_id") == preset]
        lat = [float(r["latency_ms"]) for r in sub if r.get("latency_ms")]
        p50.append(percentile(lat, 0.5) if lat else 0)
        p95.append(percentile(lat, 0.95) if lat else 0)

    fig, ax = plt.subplots(figsize=(8, 4))
    x = range(len(labels))
    ax.bar([i - 0.15 for i in x], p50, width=0.3, label="p50")
    ax.bar([i + 0.15 for i in x], p95, width=0.3, label="p95")
    ax.set_xticks(list(x))
    ax.set_xticklabels(labels)
    ax.set_ylabel("Latencia (ms)")
    ax.set_title("Latencia por modelo")
    ax.legend()
    fig.tight_layout()
    return save_figure(fig, out_dir, "fig_stt02_latency_by_model", dpi)


def plot_wer_by_difficulty(rows: list[dict[str, str]], out_dir: Path, dpi: int) -> dict[str, str]:
    diffs = ["easy", "medium", "hard"]
    vals = []
    for d in diffs:
        sub = [r for r in rows if r.get("difficulty") == d]
        vals.append(agg_wer(sub))

    fig, ax = plt.subplots(figsize=(7, 4))
    bars = ax.bar(diffs, vals, color=["#4c78a8", "#f58518", "#e45756"])
    ax.set_ylabel("WER medio (%)")
    ax.set_title("WER por dificuldade (todos corpora)")
    for b, v in zip(bars, vals):
        ax.text(b.get_x() + b.get_width() / 2, v + 0.5, f"{v:.1f}", ha="center", fontsize=9)
    fig.tight_layout()
    return save_figure(fig, out_dir, "fig_stt03_wer_by_difficulty", dpi)


def plot_hyperparam_ablation(rows: list[dict[str, str]], out_dir: Path, dpi: int) -> dict[str, str]:
    baseline = agg_wer([r for r in rows if r.get("preset_id") == "model_large_v3"])
    hp_presets = [
        ("hp_beam_5", "beam=5"),
        ("hp_vad_off", "vad off"),
        ("hp_int8_float16", "int8"),
        ("hp_initial_prompt", "prompt"),
        ("hp_noise_reduce", "noise"),
        ("hp_condition_off", "cond off"),
    ]
    labels = ["baseline"] + [x[1] for x in hp_presets]
    vals = [baseline]
    for preset, _ in hp_presets:
        vals.append(agg_wer([r for r in rows if r.get("preset_id") == preset]))

    fig, ax = plt.subplots(figsize=(10, 4))
    bars = ax.bar(labels, vals, color="#4c78a8")
    ax.set_ylabel("WER medio (%)")
    ax.set_title("Ablacoes large-v3 (Bloco B)")
    ax.tick_params(axis="x", rotation=25)
    for b, v in zip(bars, vals):
        ax.text(b.get_x() + b.get_width() / 2, v + 0.3, f"{v:.1f}", ha="center", fontsize=8)
    fig.tight_layout()
    return save_figure(fig, out_dir, "fig_stt04_hyperparam_large_v3", dpi)


def plot_preprocess_ablation(rows: list[dict[str, str]], out_dir: Path, dpi: int) -> dict[str, str]:
    on = agg_wer([r for r in rows if r.get("ablation_id") == "preprocess_on"])
    off = agg_wer([r for r in rows if r.get("ablation_id") == "preprocess_off"])
    fig, ax = plt.subplots(figsize=(5, 4))
    bars = ax.bar(["preprocess on", "preprocess off"], [on, off], color=["#4c78a8", "#e45756"])
    ax.set_ylabel("WER medio (%)")
    ax.set_title("Efeito do preprocessamento")
    for b, v in zip(bars, [on, off]):
        ax.text(b.get_x() + b.get_width() / 2, v + 0.3, f"{v:.1f}", ha="center")
    fig.tight_layout()
    return save_figure(fig, out_dir, "fig_stt05_preprocess_ablation", dpi)


def plot_pareto(rows: list[dict[str, str]], out_dir: Path, dpi: int) -> dict[str, str]:
    by_preset: dict[str, list[dict[str, str]]] = defaultdict(list)
    for r in rows:
        pid = r.get("preset_id") or "unknown"
        by_preset[pid].append(r)

    fig, ax = plt.subplots(figsize=(8, 5))
    for pid, sub in sorted(by_preset.items()):
        if not pid.startswith(("model_", "hp_")):
            continue
        ax.scatter(agg_latency_p50(sub), agg_wer(sub), label=pid, s=60)
    ax.set_xlabel("Latencia p50 (ms)")
    ax.set_ylabel("WER medio (%)")
    ax.set_title("Trade-off WER x latencia por preset")
    ax.legend(fontsize=7, loc="best")
    fig.tight_layout()
    return save_figure(fig, out_dir, "fig_stt06_pareto_wer_latency", dpi)


def build_metrics(rows: list[dict[str, str]], stamp: str) -> dict[str, Any]:
    by_corpus: dict[str, Any] = {}
    for corpus in sorted({r.get("corpus") or "" for r in rows}):
        if not corpus:
            continue
        sub = [r for r in rows if r.get("corpus") == corpus]
        by_corpus[corpus] = {
            "n": len(sub),
            "wer_mean_pct": round(agg_wer(sub), 2),
            "latency_p50_ms": round(agg_latency_p50(sub), 0),
        }
    return {"stamp": stamp, "n_rows": len(rows), "by_corpus": by_corpus}


def write_report(
    results_root: Path,
    stamp: str,
    figures: dict[str, dict[str, str]],
    metrics: dict[str, Any],
    summary_path: Path | None,
) -> None:
    lines = [
        "# Relatorio STT comparativo",
        "",
        f"Stamp: `{stamp}`",
        "",
        "## Fundamentacao",
        "",
        "- **TTS:** jargao pre-natal controlado (proxy de consultorio).",
        "- **Medical:** voz humana clinica PT-BR (HF Julia's Data).",
        "- **CORAA:** fala espontanea PT-BR real ([CORAA v1.1](https://github.com/nilc-nlp/CORAA)).",
        "- **Bloco A:** compara modelos com baseline comum.",
        "- **Bloco B:** uma variavel de hiperparametro por preset em large-v3.",
        "- **Bloco C:** preprocess on/off por requisicao.",
        "",
        "## Metricas agregadas",
        "",
        "```json",
        json.dumps(metrics, ensure_ascii=False, indent=2),
        "```",
        "",
        "## Figuras",
        "",
    ]
    for key, paths in sorted(figures.items()):
        png = paths.get("png", "")
        if png:
            lines.append(f"### {key}")
            lines.append(f"![{key}]({png})")
            lines.append("")

    if summary_path and summary_path.is_file():
        lines.append("## Resumo por preset")
        lines.append("")
        lines.append("```")
        lines.append(summary_path.read_text(encoding="utf-8")[:4000])
        lines.append("```")

    report_path = results_root / "STT_RELATORIO.md"
    report_path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description="Gera figuras e metricas STT.")
    parser.add_argument("--results-root", type=Path, required=True)
    parser.add_argument("--date", default=datetime.now().strftime("%Y%m%d_%H%M%S"))
    parser.add_argument("--out-dir", type=Path, default=None)
    parser.add_argument("--dpi", type=int, default=150)
    args = parser.parse_args()

    all_csv = args.results_root / "stt_results_all.csv"
    if not all_csv.is_file():
        print(f"CSV ausente: {all_csv}. Rode merge_stt_results.py primeiro.", file=sys.stderr)
        return 1

    rows = load_csv(all_csv)
    if not rows:
        print("CSV vazio.", file=sys.stderr)
        return 1

    stamp = args.date
    fig_dir = args.out_dir or figures_dir(stamp)
    fig_dir.mkdir(parents=True, exist_ok=True)

    figures: dict[str, dict[str, str]] = {}
    figures["fig_stt01_wer_by_model"] = plot_wer_by_model(rows, fig_dir, args.dpi)
    figures["fig_stt02_latency_by_model"] = plot_latency_by_model(rows, fig_dir, args.dpi)
    figures["fig_stt03_wer_by_difficulty"] = plot_wer_by_difficulty(rows, fig_dir, args.dpi)
    figures["fig_stt04_hyperparam_large_v3"] = plot_hyperparam_ablation(rows, fig_dir, args.dpi)
    figures["fig_stt05_preprocess_ablation"] = plot_preprocess_ablation(rows, fig_dir, args.dpi)
    figures["fig_stt06_pareto_wer_latency"] = plot_pareto(rows, fig_dir, args.dpi)

    metrics = build_metrics(rows, stamp)
    metrics_path = stt_metrics_path()
    metrics_path.write_text(json.dumps(metrics, ensure_ascii=False, indent=2), encoding="utf-8")

    manifest = {"date": stamp, "figures": {k: {ek: str(Path(ev).name) for ek, ev in v.items()} for k, v in figures.items()}}
    (fig_dir / "stt_figures_manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    summary_path = args.results_root / "stt_summary_by_preset.csv"
    write_report(args.results_root, stamp, figures, metrics, summary_path)

    print(f"Figuras STT: {fig_dir}")
    print(f"Metricas: {metrics_path}")
    print(f"Relatorio: {args.results_root / 'STT_RELATORIO.md'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
