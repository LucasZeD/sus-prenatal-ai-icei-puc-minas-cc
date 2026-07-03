#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Central path contract for the benchmark suite."""
from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LIB = ROOT / "lib"
DATA = ROOT / "data"
ARTIFACTS = ROOT / "artifacts"
REPORTING = ROOT / "reporting"
CORPUS_EXTRACTED = ROOT / "corpus_extracted"
CLINICAL_AI_ROOT = ROOT.parent.parent / "Codigo" / "clinical-ai"
DEFAULT_ENV_FILE = ROOT.parent.parent / "Codigo" / ".env"

BENCHMARK_CSV = DATA / "prenatal_sus_benchmark.csv"
ROTEIRO_CSV = DATA / "roteiro_ground_truth.csv"
PII_CORPUS = DATA / "pii_gateway_corpus_50.jsonl"
STT_DATA = DATA / "stt"


def run_dir(stamp: str) -> Path:
    return ARTIFACTS / "runs" / stamp


def validation_dir(stamp: str) -> Path:
    return run_dir(stamp) / "validation"


def rag_dir(stamp: str) -> Path:
    return run_dir(stamp) / "rag"


def llm_dir(stamp: str) -> Path:
    return run_dir(stamp) / "llm"


def gateway_dir(stamp: str) -> Path:
    return run_dir(stamp) / "gateway"


def stt_dir(stamp: str) -> Path:
    return run_dir(stamp) / "stt"


def roteiro_dir(stamp: str) -> Path:
    return run_dir(stamp) / "roteiro"


def figures_dir(stamp: str) -> Path:
    return ARTIFACTS / "figures" / stamp


def dashboard_dir(stamp: str) -> Path:
    return ARTIFACTS / "dashboard" / stamp


def report_path(stamp: str) -> Path:
    return ARTIFACTS / "reports" / f"ARTIGO_RESULTADOS_{stamp}.md"


def latest_report_path() -> Path:
    return ARTIFACTS / "reports" / "ARTIGO_RESULTADOS_latest.md"


def article_metrics_path() -> Path:
    return REPORTING / "article_metrics.json"


def stt_metrics_path() -> Path:
    return REPORTING / "stt_metrics.json"


def benchmark_pdf_path(stamp: str) -> Path:
    return ARTIFACTS / "reports" / f"RELATORIO_BENCHMARK_{stamp}.pdf"


def benchmark_tex_path(stamp: str) -> Path:
    return ARTIFACTS / "reports" / f"RELATORIO_BENCHMARK_{stamp}.tex"


def latest_benchmark_pdf_path() -> Path:
    return ARTIFACTS / "reports" / "RELATORIO_BENCHMARK_latest.pdf"


def benchmark_pdf_assets_dir(stamp: str) -> Path:
    return ARTIFACTS / "reports" / f"{stamp}_assets"


def run_meta_path(stamp: str) -> Path:
    return run_dir(stamp) / "run_meta.json"


LOGO_TRANSPARENT = (
    ROOT.parent.parent / "Codigo" / "frontend" / "public" / "assets" / "imgs" / "imagem_logo_transparente.png"
)
LOGO_ILLUSTRATION = ROOT.parent.parent / "Codigo" / "frontend" / "public" / "assets" / "imgs" / "imagem_logo.png"
