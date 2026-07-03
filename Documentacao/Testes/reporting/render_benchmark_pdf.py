#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Render benchmark PDF report (LaTeX) with Pre-Natal Digital branding."""
from __future__ import annotations

import argparse
import csv
import json
import re
import shutil
import statistics
import subprocess
import sys
from datetime import datetime
from pathlib import Path
from typing import Any

from jinja2 import Environment, FileSystemLoader, select_autoescape

ROOT = Path(__file__).resolve().parent.parent
TEMPLATES_DIR = Path(__file__).resolve().parent / "templates"
sys.path.insert(0, str(ROOT / "lib"))
from article_metrics import latex_booktabs  # noqa: E402
from paths import (  # noqa: E402
    LOGO_ILLUSTRATION,
    LOGO_TRANSPARENT,
    article_metrics_path,
    benchmark_pdf_assets_dir,
    benchmark_pdf_path,
    benchmark_tex_path,
    figures_dir,
    gateway_dir,
    latest_benchmark_pdf_path,
    llm_dir,
    rag_dir,
    run_meta_path,
    roteiro_dir,
    stt_dir,
    stt_metrics_path,
    validation_dir,
)

NA = "n/a"
LATEX_SPECIAL = re.compile(r"([\\&%$#_{}~^])")
AUX_SUFFIXES = (".aux", ".log", ".fls", ".fdb_latexmk", ".out", ".toc", ".synctex.gz")


def escape_latex(text: str) -> str:
    if not text:
        return ""
    return LATEX_SPECIAL.sub(r"\\\1", text)


def truncate_lines(text: str, max_lines: int = 40) -> str:
    lines = text.strip().splitlines()
    if len(lines) <= max_lines:
        return text.strip()
    truncated = lines[:max_lines]
    truncated.append(f"... ({len(lines) - max_lines} linhas omitidas)")
    return "\n".join(truncated)


def load_json(path: Path) -> dict[str, Any]:
    if not path.is_file():
        return {}
    return json.loads(path.read_text(encoding="utf-8"))


def load_csv(path: Path) -> list[dict[str, str]]:
    if not path.is_file():
        return []
    with path.open(encoding="utf-8", newline="") as fh:
        return list(csv.DictReader(fh))


def read_text_or_empty(path: Path) -> str:
    if not path.is_file():
        return ""
    return path.read_text(encoding="utf-8").strip()


def compute_pii_leak_rate(gateway_rows: list[dict[str, str]]) -> dict[str, Any]:
    if not gateway_rows:
        return {"available": False}
    leaks = sum(1 for r in gateway_rows if r.get("leak") == "true")
    total = len(gateway_rows)
    rate = (100.0 * leaks / total) if total else 0.0
    return {"available": True, "leaks": leaks, "total": total, "rate_pct": rate}


def compute_latency_averages(llm_rows: list[dict[str, str]]) -> dict[str, float]:
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

    return {
        "retrieve_ms": avg("retrieve_ms"),
        "ttft_ms": avg("ttft_ms"),
        "gen_tokens_per_sec": avg("gen_tokens_per_sec"),
    }


def compute_stt_summary(stt_dir_path: Path, stt_metrics: dict[str, Any]) -> dict[str, Any]:
    summary_csv = stt_dir_path / "stt_summary_by_preset.csv"
    if not stt_metrics and not summary_csv.is_file():
        return {"available": False}

    out: dict[str, Any] = {"available": True}
    if stt_metrics:
        by_corpus = stt_metrics.get("by_corpus") or {}
        wers = [v.get("wer_mean_pct", 0) for v in by_corpus.values() if isinstance(v, dict)]
        out["wer_mean_pct"] = round(statistics.mean(wers), 2) if wers else None
        out["by_corpus"] = by_corpus

    if summary_csv.is_file():
        rows = load_csv(summary_csv)
        best: dict[str, str] | None = None
        best_wer = float("inf")
        phrase_vals: list[float] = []
        for r in rows:
            raw_wer = (r.get("wer_mean_pct") or r.get("wer_pct") or "").strip()
            if raw_wer:
                try:
                    wer = float(raw_wer)
                    if wer < best_wer:
                        best_wer = wer
                        best = r
                except ValueError:
                    pass
            raw_pr = (r.get("phrase_recall_mean_pct") or r.get("phrase_recall_pct") or "").strip()
            if raw_pr:
                try:
                    phrase_vals.append(float(raw_pr))
                except ValueError:
                    pass
        preset_raw = (best or {}).get("preset_id") or (best or {}).get("preset") or NA
        out["best_preset"] = escape_latex(str(preset_raw))
        out["best_wer_pct"] = round(best_wer, 2) if best and best_wer < float("inf") else None
        out["phrase_recall_mean_pct"] = round(statistics.mean(phrase_vals), 2) if phrase_vals else None
    return out


def compute_roteiro_scores(roteiro_rows: list[dict[str, str]]) -> dict[str, Any]:
    if not roteiro_rows:
        return {"available": False}
    scores: list[str] = []
    for r in roteiro_rows:
        case_id = r.get("case_id", "?")
        passed = r.get("case_pass") == "true"
        scores.append(f"{case_id}: {'OK' if passed else 'FALHA'}")
    passed_n = sum(1 for r in roteiro_rows if r.get("case_pass") == "true")
    return {
        "available": True,
        "scores": scores,
        "passed": passed_n,
        "total": len(roteiro_rows),
    }


def fmt_pct(value: float | None, fallback: str = NA) -> str:
    if value is None:
        return fallback
    return f"{value:.1f}\\%"


def build_executive_summary_table(
    metrics: dict[str, Any],
    pii: dict[str, Any],
    latency: dict[str, float],
    stt: dict[str, Any],
    roteiro: dict[str, Any],
    skip_gateway: bool,
    skip_stt: bool,
    skip_roteiro: bool,
) -> str:
    comp = metrics.get("composition") or {}
    hit6 = metrics.get("hit6") or {}
    hit_global = hit6.get("global") or {}
    by_diff = hit6.get("by_difficulty") or {}
    apr = metrics.get("apr") or {}
    tfr = metrics.get("tfr") or {}

    rows: list[list[str]] = [
        [
            "Composicao (total / protocolo / trap)",
            f"{comp.get('total', NA)} / {comp.get('protocol', NA)} / {comp.get('trap', NA)}",
        ],
        ["Hit@6 global", fmt_pct(hit_global.get("rate_pct"))],
        [
            "Hit@6 por dificuldade",
            " / ".join(
                f"{d}: {fmt_pct((by_diff.get(d) or {}).get('rate_pct'))}"
                for d in ("easy", "medium", "hard")
            ),
        ],
    ]
    for provider in ("ollama", "gemini"):
        a = (apr.get(provider) or {}).get("rate_pct")
        t = (tfr.get(provider) or {}).get("rate_pct")
        rows.append([f"APR {provider}", fmt_pct(a)])
        rows.append([f"TFR {provider}", fmt_pct(t)])

    if skip_gateway:
        rows.append(["PII leak rate", "Nao executado"])
    elif pii.get("available"):
        rows.append(["PII leak rate", fmt_pct(pii.get("rate_pct"))])
    else:
        rows.append(["PII leak rate", NA])

    if latency:
        rows.append(["Latencia retrieve\\_ms (media)", f"{latency.get('retrieve_ms', 0):.2f}"])
        rows.append(["Latencia ttft\\_ms (media)", f"{latency.get('ttft_ms', 0):.2f}"])
        rows.append(["Geracao tokens/s (media)", f"{latency.get('gen_tokens_per_sec', 0):.2f}"])

    if skip_stt:
        rows.append(["STT WER / phrase recall / preset", "Nao executado"])
    elif stt.get("available"):
        wer = stt.get("wer_mean_pct")
        pr = stt.get("phrase_recall_mean_pct")
        preset = stt.get("best_preset", NA)
        rows.append(
            [
                "STT WER / phrase recall / preset",
                f"{wer if wer is not None else NA}\\% / {pr if pr is not None else NA}\\% / {preset}",
            ]
        )
    else:
        rows.append(["STT WER / phrase recall / preset", NA])

    if skip_roteiro:
        rows.append(["Roteiro GT01-GT05", "Nao executado"])
    elif roteiro.get("available"):
        rows.append(["Roteiro GT01-GT05", f"{roteiro.get('passed', 0)}/{roteiro.get('total', 0)} aprovados"])
    else:
        rows.append(["Roteiro GT01-GT05", NA])

    return latex_booktabs(["Metrica", "Valor"], rows)


def build_hit6_table(metrics: dict[str, Any]) -> str:
    hit6 = metrics.get("hit6") or {}
    global_h = hit6.get("global") or {}
    by_diff = hit6.get("by_difficulty") or {}
    rows = [
        ["Global", fmt_pct(global_h.get("rate_pct")), str(global_h.get("n", NA))],
    ]
    for diff in ("easy", "medium", "hard"):
        d = by_diff.get(diff) or {}
        rows.append([diff.capitalize(), fmt_pct(d.get("rate_pct")), str(d.get("n", NA))])
    return latex_booktabs(["Dificuldade", "Hit@6", "N"], rows)


def build_apr_tfr_table(metrics: dict[str, Any]) -> str:
    apr = metrics.get("apr") or {}
    tfr = metrics.get("tfr") or {}
    rows: list[list[str]] = []
    for provider in ("ollama", "gemini"):
        a = apr.get(provider) or {}
        t = tfr.get(provider) or {}
        rows.append(
            [
                provider,
                fmt_pct(a.get("rate_pct")),
                fmt_pct(t.get("rate_pct")),
                str(a.get("eligible", NA)),
            ]
        )
    return latex_booktabs(["Provider", "APR", "TFR", "N elegivel"], rows)


def build_latency_table(latency: dict[str, float]) -> str:
    rows = [
        ["retrieve\\_ms", f"{latency.get('retrieve_ms', 0):.2f}"],
        ["ttft\\_ms", f"{latency.get('ttft_ms', 0):.2f}"],
        ["gen\\_tokens\\_per\\_sec", f"{latency.get('gen_tokens_per_sec', 0):.2f}"],
    ]
    return latex_booktabs(["Metrica", "Media"], rows)


def format_run_datetime(stamp: str, run_meta: dict[str, Any]) -> str:
    if run_meta.get("generated_at"):
        try:
            dt = datetime.fromisoformat(str(run_meta["generated_at"]))
            return dt.strftime("%d/%m/%Y %H:%M")
        except ValueError:
            pass
    try:
        dt = datetime.strptime(stamp, "%Y%m%d_%H%M%S")
        return dt.strftime("%d/%m/%Y %H:%M")
    except ValueError:
        return stamp


def copy_figure_assets(
    stamp: str,
    fig_dir: Path,
    manifest: dict[str, Any],
    stt_manifest: dict[str, Any] | None,
) -> dict[str, str]:
    """Copy PNG figures and logos to assets dir; return key -> filename mapping."""
    assets_dir = benchmark_pdf_assets_dir(stamp)
    assets_dir.mkdir(parents=True, exist_ok=True)
    copied: dict[str, str] = {}

    def latex_graphic(filename: str) -> str:
        return "{" + f"{assets_dir.name}/{filename}" + "}"

    for src, dest_name in (
        (LOGO_TRANSPARENT, "logo_transparente.png"),
        (LOGO_ILLUSTRATION, "logo_illustration.png"),
    ):
        if src.is_file():
            shutil.copy2(src, assets_dir / dest_name)
            copied[dest_name.replace(".png", "")] = latex_graphic(dest_name)

    all_figs: dict[str, Any] = {}
    all_figs.update(manifest.get("figures") or {})
    if stt_manifest:
        all_figs.update(stt_manifest.get("figures") or {})

    for key, entry in all_figs.items():
        if not isinstance(entry, dict):
            continue
        png_name = entry.get("png")
        if not png_name:
            continue
        src = fig_dir / Path(str(png_name)).name
        if not src.is_file():
            src = fig_dir / str(png_name)
        if src.is_file():
            dest = assets_dir / src.name
            shutil.copy2(src, dest)
            copied[key] = latex_graphic(dest.name)

    return copied


def compile_pdf(tex_path: Path, outdir: Path, keep_aux: bool) -> None:
    latexmk = shutil.which("latexmk")
    if not latexmk:
        print(
            "Erro: latexmk nao encontrado.\n"
            "Instale o LaTeX:\n"
            "  sudo apt install texlive-latex-base texlive-latex-extra texlive-fonts-recommended latexmk\n"
            "Ou pule a compilacao com SKIP_PDF=1 no pipeline.",
            file=sys.stderr,
        )
        raise SystemExit(1)

    cmd = [
        latexmk,
        "-pdf",
        "-interaction=nonstopmode",
        f"-outdir={outdir}",
        str(tex_path.name),
    ]
    result = subprocess.run(cmd, cwd=outdir, capture_output=True, text=True)
    if result.returncode != 0:
        print(result.stdout, file=sys.stderr)
        print(result.stderr, file=sys.stderr)
        print(f"Erro: latexmk falhou (exit {result.returncode}).", file=sys.stderr)
        raise SystemExit(result.returncode)

    if not keep_aux:
        stem = tex_path.stem
        for suffix in AUX_SUFFIXES:
            aux = outdir / f"{stem}{suffix}"
            if aux.is_file():
                aux.unlink(missing_ok=True)


def render_report(stamp: str, latex_only: bool, keep_aux: bool) -> int:
    run_meta = load_json(run_meta_path(stamp))
    skip_gateway = str(run_meta.get("skip_gateway", "0")) == "1"
    skip_stt = str(run_meta.get("skip_stt", "1")) == "1"
    skip_roteiro = str(run_meta.get("skip_roteiro", "1")) == "1"

    metrics = load_json(article_metrics_path())
    if not metrics:
        metrics = {"stamp": stamp}

    fig_dir = figures_dir(stamp)
    manifest = load_json(fig_dir / "figures_manifest.json")
    stt_manifest = load_json(fig_dir / "stt_figures_manifest.json")
    stt_metrics = load_json(stt_metrics_path())

    gateway_rows = load_csv(gateway_dir(stamp) / "gateway_results.csv")
    llm_rows = load_csv(llm_dir(stamp) / "results.csv")
    roteiro_rows = load_csv(roteiro_dir(stamp) / "roteiro_results.csv")

    pii = compute_pii_leak_rate(gateway_rows)
    latency = compute_latency_averages(llm_rows)
    stt_summary = compute_stt_summary(stt_dir(stamp), stt_metrics)
    roteiro_summary = compute_roteiro_scores(roteiro_rows)

    figure_files = copy_figure_assets(stamp, fig_dir, manifest, stt_manifest or None)

    validation_text = truncate_lines(read_text_or_empty(validation_dir(stamp) / "validation_report.txt"))
    rag_text = read_text_or_empty(rag_dir(stamp) / "rag_summary_for_article.md")
    llm_text = truncate_lines(read_text_or_empty(llm_dir(stamp) / "summary_article.txt"))
    gateway_text = truncate_lines(read_text_or_empty(gateway_dir(stamp) / "gateway_summary.txt"))

    run_config_lines = [
        f"BENCH\\_DATE: {escape_latex(stamp)}",
        f"BASE\\_URL: {escape_latex(str(run_meta.get('base_url', NA)))}",
        f"PROVIDERS: {escape_latex(str(run_meta.get('providers', NA)))}",
        f"RAG\\_MODES: {escape_latex(str(run_meta.get('rag_modes', NA)))}",
        f"SKIP\\_LLM={run_meta.get('skip_llm', '0')} SKIP\\_GATEWAY={run_meta.get('skip_gateway', '0')} "
        f"SKIP\\_STT={run_meta.get('skip_stt', '1')} SKIP\\_ROTEIRO={run_meta.get('skip_roteiro', '1')}",
    ]

    env = Environment(
        loader=FileSystemLoader(str(TEMPLATES_DIR)),
        autoescape=select_autoescape(default_for_string=False),
        block_start_string="<%",
        block_end_string="%>",
        variable_start_string="<<",
        variable_end_string=">>",
        comment_start_string="<#",
        comment_end_string="#>",
    )
    env.filters["latex"] = escape_latex
    template = env.get_template("benchmark_report.tex.j2")

    context = {
        "stamp": stamp,
        "stamp_tex": escape_latex(stamp),
        "run_datetime": format_run_datetime(stamp, run_meta),
        "run_config": "\n".join(run_config_lines),
        "executive_summary_table": build_executive_summary_table(
            metrics, pii, latency, stt_summary, roteiro_summary, skip_gateway, skip_stt, skip_roteiro
        ),
        "hit6_table": build_hit6_table(metrics),
        "apr_tfr_table": build_apr_tfr_table(metrics),
        "latency_table": build_latency_table(latency),
        "validation_text": escape_latex(validation_text),
        "rag_text": escape_latex(rag_text),
        "llm_text": escape_latex(llm_text),
        "gateway_text": escape_latex(gateway_text),
        "skip_gateway": skip_gateway,
        "skip_stt": skip_stt,
        "skip_roteiro": skip_roteiro,
        "figure_files": figure_files,
        "assets_dir_name": f"{stamp}_assets",
        "roteiro_scores": roteiro_summary.get("scores") or [],
        "stt_summary": stt_summary,
    }

    tex_content = template.render(**context)
    reports_dir = benchmark_tex_path(stamp).parent
    reports_dir.mkdir(parents=True, exist_ok=True)
    tex_path = benchmark_tex_path(stamp)
    tex_path.write_text(tex_content, encoding="utf-8")
    print(f"Wrote {tex_path}")

    if latex_only:
        return 0

    compile_pdf(tex_path, reports_dir, keep_aux)

    pdf_path = benchmark_pdf_path(stamp)
    if not pdf_path.is_file():
        print(f"Erro: PDF nao gerado em {pdf_path}", file=sys.stderr)
        return 1

    shutil.copy2(pdf_path, latest_benchmark_pdf_path())
    print(f"Wrote {pdf_path}")
    print(f"Wrote {latest_benchmark_pdf_path()}")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Gera relatorio PDF LaTeX do benchmark.")
    parser.add_argument(
        "--date",
        default=datetime.now().strftime("%Y%m%d_%H%M%S"),
        help="Stamp da pasta de resultados (YYYYMMDD_HHMMSS)",
    )
    parser.add_argument("--latex-only", action="store_true", help="Gera .tex e assets, nao compila")
    parser.add_argument("--skip-compile", action="store_true", help="Alias de --latex-only")
    parser.add_argument("--keep-aux", action="store_true", help="Preserva arquivos auxiliares LaTeX")
    args = parser.parse_args()

    return render_report(args.date, args.latex_only or args.skip_compile, args.keep_aux)


if __name__ == "__main__":
    raise SystemExit(main())
