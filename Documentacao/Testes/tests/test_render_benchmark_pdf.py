"""Tests for render_benchmark_pdf.py (LaTeX report generation)."""
from __future__ import annotations

import json
import shutil
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
REPORTING = ROOT / "reporting"
sys.path.insert(0, str(REPORTING))
sys.path.insert(0, str(ROOT / "lib"))

import paths  # noqa: E402
import render_benchmark_pdf  # noqa: E402

STAMP = "20990101_120000"


def _write_min_png(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    png_bytes = (
        b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01"
        b"\x00\x00\x00\x01\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\x0cIDATx\x9cc\xf8\x0f\x00"
        b"\x01\x01\x01\x00\x18\xdd\x8d\xb4\x00\x00\x00\x00IEND\xaeB`\x82"
    )
    path.write_bytes(png_bytes)


@pytest.fixture
def tmp_run(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """Minimal artifact tree; returns reports directory."""
    artifacts = tmp_path / "artifacts"
    runs = artifacts / "runs" / STAMP
    fig_dir = artifacts / "figures" / STAMP
    reports_dir = artifacts / "reports"
    reporting_dir = tmp_path / "reporting"

    for d in (
        runs / "validation",
        runs / "rag",
        runs / "llm",
        runs / "gateway",
        fig_dir,
        reports_dir,
        reporting_dir,
    ):
        d.mkdir(parents=True, exist_ok=True)

    meta = {
        "bench_date": STAMP,
        "base_url": "http://127.0.0.1:4010",
        "providers": "ollama,gemini",
        "rag_modes": "on,off",
        "skip_llm": "0",
        "skip_gateway": "0",
        "skip_stt": "1",
        "skip_roteiro": "1",
        "generated_at": "2099-01-01T12:00:00",
    }
    (runs / "run_meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")

    metrics = {
        "stamp": STAMP,
        "composition": {"total": 100, "protocol": 90, "trap": 10},
        "hit6": {
            "global": {"rate_pct": 85.0, "n": 100},
            "by_difficulty": {
                "easy": {"rate_pct": 95.0, "n": 30},
                "medium": {"rate_pct": 80.0, "n": 40},
                "hard": {"rate_pct": 70.0, "n": 30},
            },
        },
        "apr": {
            "ollama": {"rate_pct": 75.0, "eligible": 200},
            "gemini": {"rate_pct": 80.0, "eligible": 200},
        },
        "tfr": {
            "ollama": {"rate_pct": 10.0, "eligible": 20},
            "gemini": {"rate_pct": 5.0, "eligible": 20},
        },
    }
    (reporting_dir / "article_metrics.json").write_text(
        json.dumps(metrics, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    logo_src = ROOT.parent.parent / "Codigo" / "frontend" / "public" / "assets" / "imgs"
    fig_png = fig_dir / "fig01_composicao_conjunto.png"
    if (logo_src / "imagem_logo_transparente.png").is_file():
        shutil.copy2(logo_src / "imagem_logo_transparente.png", fig_png)
        monkeypatch.setattr(render_benchmark_pdf, "LOGO_TRANSPARENT", logo_src / "imagem_logo_transparente.png")
        monkeypatch.setattr(render_benchmark_pdf, "LOGO_ILLUSTRATION", logo_src / "imagem_logo.png")
    else:
        _write_min_png(fig_png)
    manifest = {
        "date": STAMP,
        "figures": {
            "fig01_composicao_conjunto": {
                "png": "fig01_composicao_conjunto.png",
                "pdf": "fig01_composicao_conjunto.pdf",
            },
        },
    }
    (fig_dir / "figures_manifest.json").write_text(json.dumps(manifest), encoding="utf-8")

    (runs / "validation" / "validation_report.txt").write_text(
        "Validacao do conjunto N=100\nComposicao: 90 protocolo + 10 trap\n",
        encoding="utf-8",
    )
    (runs / "rag" / "rag_summary_for_article.md").write_text("# RAG\nHit@6 global 85%\n", encoding="utf-8")
    (runs / "llm" / "summary_article.txt").write_text("APR ollama 75%\n", encoding="utf-8")
    (runs / "gateway" / "gateway_summary.txt").write_text("PII Leak Rate: 0%\n", encoding="utf-8")
    (runs / "llm" / "results.csv").write_text(
        "pass_auto,retrieve_ms,ttft_ms,gen_tokens_per_sec\n"
        "true,100.0,200.0,15.5\n"
        "false,110.0,210.0,14.0\n",
        encoding="utf-8",
    )
    (runs / "gateway" / "gateway_results.csv").write_text("leak\nfalse\nfalse\n", encoding="utf-8")

    monkeypatch.setattr(paths, "ROOT", tmp_path)
    monkeypatch.setattr(paths, "ARTIFACTS", artifacts)
    monkeypatch.setattr(paths, "REPORTING", reporting_dir)
    monkeypatch.setattr(render_benchmark_pdf, "ROOT", tmp_path)
    monkeypatch.setattr(render_benchmark_pdf, "article_metrics_path", paths.article_metrics_path)
    monkeypatch.setattr(render_benchmark_pdf, "stt_metrics_path", paths.stt_metrics_path)
    monkeypatch.setattr(render_benchmark_pdf, "run_meta_path", paths.run_meta_path)
    monkeypatch.setattr(render_benchmark_pdf, "validation_dir", paths.validation_dir)
    monkeypatch.setattr(render_benchmark_pdf, "rag_dir", paths.rag_dir)
    monkeypatch.setattr(render_benchmark_pdf, "llm_dir", paths.llm_dir)
    monkeypatch.setattr(render_benchmark_pdf, "gateway_dir", paths.gateway_dir)
    monkeypatch.setattr(render_benchmark_pdf, "stt_dir", paths.stt_dir)
    monkeypatch.setattr(render_benchmark_pdf, "roteiro_dir", paths.roteiro_dir)
    monkeypatch.setattr(render_benchmark_pdf, "figures_dir", paths.figures_dir)
    monkeypatch.setattr(render_benchmark_pdf, "benchmark_tex_path", paths.benchmark_tex_path)
    monkeypatch.setattr(render_benchmark_pdf, "benchmark_pdf_path", paths.benchmark_pdf_path)
    monkeypatch.setattr(render_benchmark_pdf, "latest_benchmark_pdf_path", paths.latest_benchmark_pdf_path)
    monkeypatch.setattr(render_benchmark_pdf, "benchmark_pdf_assets_dir", paths.benchmark_pdf_assets_dir)

    return reports_dir


def test_render_benchmark_tex_utf8(tmp_run: Path) -> None:
    rc = render_benchmark_pdf.render_report(STAMP, latex_only=True, keep_aux=False)
    assert rc == 0

    tex_path = tmp_run / f"RELATORIO_BENCHMARK_{STAMP}.tex"
    assert tex_path.is_file()

    content = tex_path.read_text(encoding="utf-8")
    assert "\ufffd" not in content
    assert "\\definecolor{BrandNavy}{HTML}{1E3A8A}" in content
    assert "\\toprule" in content
    assert "Gateway de privacidade" in content

    assets = tmp_run / f"{STAMP}_assets"
    assert assets.is_dir()
    assert (assets / "fig01_composicao_conjunto.png").is_file()


def test_render_benchmark_tex_preserves_portuguese_in_verbatim(tmp_run: Path) -> None:
    validation = paths.validation_dir(STAMP) / "validation_report.txt"
    validation.write_text("Composicao: 90 protocolo + 10 trap\n", encoding="utf-8")
    render_benchmark_pdf.render_report(STAMP, latex_only=True, keep_aux=False)
    tex = (tmp_run / f"RELATORIO_BENCHMARK_{STAMP}.tex").read_text(encoding="utf-8")
    assert "protocolo" in tex


@pytest.mark.skipif(not shutil.which("latexmk"), reason="latexmk ausente")
def test_render_benchmark_pdf_compile(tmp_run: Path) -> None:
    rc = render_benchmark_pdf.render_report(STAMP, latex_only=False, keep_aux=True)
    assert rc == 0
    assert (tmp_run / f"RELATORIO_BENCHMARK_{STAMP}.pdf").is_file()
