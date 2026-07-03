"""Smoke: pipeline layout, scripts and path contract."""
from __future__ import annotations

from pathlib import Path

from paths import BENCHMARK_CSV, ROOT

BENCHMARK_DIRS = [
    "benchmarks/01_validate_dataset",
    "benchmarks/02_rag_retrieval",
    "benchmarks/03_llm_end_to_end",
    "benchmarks/04_gateway_pii",
    "benchmarks/05_stt",
    "benchmarks/06_roteiro_gt",
]

SCRIPTS = [
    "scripts/setup.sh",
    "scripts/run_smoke.sh",
    "scripts/run_pipeline.sh",
    "scripts/run_stt_matrix.sh",
]


def test_scripts_exist_and_executable() -> None:
    for rel in SCRIPTS:
        path = ROOT / rel
        assert path.is_file(), rel
        assert path.stat().st_mode & 0o111, f"{rel} not executable"


def test_benchmark_dirs_exist() -> None:
    for rel in BENCHMARK_DIRS:
        assert (ROOT / rel).is_dir(), rel


def test_data_benchmark_csv() -> None:
    assert BENCHMARK_CSV.is_file()


def test_run_pipeline_steps_align_with_benchmarks() -> None:
    pipeline = (ROOT / "scripts/run_pipeline.sh").read_text(encoding="utf-8")
    for marker in (
        "benchmarks/01_validate_dataset",
        "benchmarks/02_rag_retrieval",
        "benchmarks/03_llm_end_to_end",
        "benchmarks/04_gateway_pii",
        "benchmarks/05_stt",
        "benchmarks/06_roteiro_gt",
        "reporting/plot_benchmark_results.py",
        "reporting/assemble_article_report.py",
        "reporting/render_benchmark_pdf.py",
        "[8/8]",
        "SKIP_PDF",
    ):
        assert marker in pipeline, marker
