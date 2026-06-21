#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Assemble ARTIGO_RESULTADOS.md from benchmark artifacts and figures."""
from __future__ import annotations

import argparse
import json
from datetime import datetime
from pathlib import Path

REPORT_DIR = Path(__file__).resolve().parent
TESTS_DIR = REPORT_DIR.parent
OUT = REPORT_DIR / "ARTIGO_RESULTADOS.md"


def read_or_placeholder(path: Path, label: str) -> str:
    if path.is_file():
        return path.read_text(encoding="utf-8").strip()
    return f"*(Artefato ausente: execute {label} - `{path.relative_to(TESTS_DIR)}`)*"


def load_manifest(fig_dir: Path) -> dict | None:
    p = fig_dir / "figures_manifest.json"
    if not p.is_file():
        return None
    return json.loads(p.read_text(encoding="utf-8"))


def load_metrics(path: Path) -> dict:
    if not path.is_file():
        return {}
    return json.loads(path.read_text(encoding="utf-8"))


def fig_md(manifest: dict | None, key: str, caption: str) -> str:
    if not manifest:
        return f"*(Figura ausente: rode plot_benchmark_results.py - {caption})*\n"
    figs = manifest.get("figures") or {}
    entry = figs.get(key)
    if not entry or "png" not in entry:
        return f"*(Figura `{key}` ausente no manifest.)*\n"
    rel = entry["png"].replace("\\", "/")
    return f"![{caption}]({rel})\n\n"


def as_latex_hit6(metrics: dict) -> str:
    by = ((metrics.get("hit6") or {}).get("by_difficulty") or {})
    rows = [
        "% snippet simplificado para colar no LaTeX",
        "easy: {:.1f}% (n={})".format((by.get("easy") or {}).get("rate_pct", 0.0), (by.get("easy") or {}).get("n", 0)),
        "medium: {:.1f}% (n={})".format((by.get("medium") or {}).get("rate_pct", 0.0), (by.get("medium") or {}).get("n", 0)),
        "hard: {:.1f}% (n={})".format((by.get("hard") or {}).get("rate_pct", 0.0), (by.get("hard") or {}).get("n", 0)),
    ]
    return "\n".join(rows)


def as_latex_apr_tfr(metrics: dict) -> str:
    apr = metrics.get("apr") or {}
    tfr = metrics.get("tfr") or {}
    rows = ["% snippet simplificado para colar no LaTeX"]
    for p in ("ollama", "gemini"):
        a = (apr.get(p) or {}).get("rate_pct", 0.0)
        t = (tfr.get(p) or {}).get("rate_pct", 0.0)
        rows.append(f"{p}: APR={a:.1f}% | TFR={t:.1f}%")
    return "\n".join(rows)


def main() -> int:
    parser = argparse.ArgumentParser(description="Monta ARTIGO_RESULTADOS.md")
    parser.add_argument(
        "--date",
        default=datetime.now().strftime("%Y%m%d_%H%M%S"),
        help="Stamp da pasta de resultados (YYYYMMDD_HHMMSS)",
    )
    args = parser.parse_args()
    stamp = args.date

    validation_path = TESTS_DIR / "01_validacao_dataset" / "reports" / "validation_report.txt"
    rag_path = TESTS_DIR / "03_bench_rag_retrieval" / "results" / stamp / "rag_summary_for_article.md"
    llm_summary_path = TESTS_DIR / "02_bench_modelos_llm" / "results" / stamp / "summary_article.txt"
    gateway_summary_path = TESTS_DIR / "06_gateway_privacidade" / "results" / stamp / "gateway_summary.txt"
    fig_dir = REPORT_DIR / "figures" / stamp
    metrics_path = REPORT_DIR / "article_metrics.json"

    validation = read_or_placeholder(validation_path, "validacao dataset")
    rag_md = read_or_placeholder(rag_path, "benchmark RAG")
    llm_md = read_or_placeholder(llm_summary_path, "benchmark LLM")
    gateway_md = read_or_placeholder(gateway_summary_path, "benchmark gateway")
    manifest = load_manifest(fig_dir)
    metrics = load_metrics(metrics_path)

    sections = [
        "# Testes e Resultados - protocolo do artigo\n\n",
        f"Data dos resultados: `{stamp}`.\n\n",
        "---\n\n",
        "## A) Conjunto de validacao\n\n",
        "Conjunto consolidado com N=100 (90 protocolo + 10 trap), conforme o texto do artigo.\n\n",
        fig_md(manifest, "fig01_composicao_conjunto", "Composicao do conjunto"),
        fig_md(manifest, "fig02_instrumento_dificuldade", "Distribuicao por dificuldade"),
        "```\n" + validation + "\n```\n\n",
        "---\n\n",
        "## B) Recuperacao semantica (RAG)\n\n",
        fig_md(manifest, "fig03_hit6_global_difficulty", "Hit@6 por dificuldade"),
        rag_md + "\n\n",
        "Tabela/trecho para LaTeX (Hit@6):\n\n```\n" + as_latex_hit6(metrics) + "\n```\n\n",
        "---\n\n",
        "## C) Geracao de resposta (APR/TFR)\n\n",
        fig_md(manifest, "fig04_apr_ollama_difficulty", "APR Ollama por dificuldade"),
        fig_md(manifest, "fig05_tfr_traps", "TFR em perguntas trap"),
        fig_md(manifest, "fig08_providers_apr_global", "APR global por provider"),
        "```\n" + llm_md + "\n```\n\n",
        "Tabela/trecho para LaTeX (APR/TFR):\n\n```\n" + as_latex_apr_tfr(metrics) + "\n```\n\n",
        "---\n\n",
        "## D) Gateway de privacidade\n\n",
        fig_md(manifest, "fig06_pii_leak_by_type", "PII Leak Rate por tipo"),
        "```\n" + gateway_md + "\n```\n\n",
        "---\n\n",
        "## E) Efetividade computacional e latencia\n\n",
        fig_md(manifest, "fig07_latency_breakdown", "Latencia media e geracao"),
        "As metricas de latencia estao consolidadas em `article_metrics.json` e no resumo do benchmark LLM.\n\n",
        "---\n\n",
        "## F) Limites do ciclo\n\n",
        "Os resultados sao automatizados e nao substituem validacao clinica em campo. Itens `human_judge` exigem revisao manual.\n",
    ]

    OUT.write_text("".join(sections), encoding="utf-8")
    print(f"Wrote {OUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
