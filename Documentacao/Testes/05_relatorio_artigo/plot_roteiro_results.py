#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Graficos do benchmark roteiro GT01-GT05 (fig07-fig10)."""
from __future__ import annotations

import argparse
import csv
import json
from datetime import date
from pathlib import Path

import matplotlib.pyplot as plt

REPORT_DIR = Path(__file__).resolve().parent
TESTS_DIR = REPORT_DIR.parent
DEFAULT_CSV = TESTS_DIR / "04_bench_roteiro_ground_truth" / "results"


def save_figure(fig: plt.Figure, out_dir: Path, stem: str, dpi: int = 150) -> dict[str, str]:
    out_dir.mkdir(parents=True, exist_ok=True)
    paths: dict[str, str] = {}
    for ext in ("png", "pdf"):
        path = out_dir / f"{stem}.{ext}"
        fig.savefig(path, dpi=dpi if ext == "png" else None, bbox_inches="tight")
        paths[ext] = str(path.relative_to(REPORT_DIR))
    plt.close(fig)
    return paths


def load_results(path: Path) -> list[dict[str, str]]:
    with path.open(encoding="utf-8", newline="") as fh:
        return list(csv.DictReader(fh))


def plot_pass_por_caso(rows: list[dict[str, str]], out_dir: Path) -> dict[str, str]:
    ids = [r["case_id"] for r in rows]
    vals = [100.0 if r.get("case_pass") == "true" else 0.0 for r in rows]
    colors = ["#59a14f" if v > 0 else "#e15759" for v in vals]
    fig, ax = plt.subplots(figsize=(8, 4))
    bars = ax.bar(ids, vals, color=colors)
    ax.set_ylabel("Pass (%)")
    ax.set_title("Roteiro ground truth: aprovacao por caso (GT01-GT05)")
    ax.set_ylim(0, 110)
    for bar, v in zip(bars, vals):
        ax.text(bar.get_x() + bar.get_width() / 2, bar.get_height() + 2, f"{int(v)}%", ha="center", fontsize=9)
    fig.tight_layout()
    return save_figure(fig, out_dir, "fig07_roteiro_pass_por_caso")


def plot_clinico_rag_llm(rows: list[dict[str, str]], out_dir: Path) -> dict[str, str]:
    clinical = [r for r in rows if r.get("category") == "clinical_rag_llm"]
    if not clinical:
        fig, ax = plt.subplots(figsize=(6, 3))
        ax.text(0.5, 0.5, "Sem casos clinicos", ha="center", va="center")
        ax.axis("off")
        return save_figure(fig, out_dir, "fig08_roteiro_clinico_rag_llm")

    ids = [r["case_id"] for r in clinical]
    rag_vals = [100.0 if r.get("rag_hit@6") == "true" else 0.0 for r in clinical]
    llm_vals = [100.0 if r.get("llm_pass_auto") == "true" else 0.0 for r in clinical]
    x = range(len(ids))
    w = 0.35
    fig, ax = plt.subplots(figsize=(8, 4))
    ax.bar([i - w / 2 for i in x], rag_vals, width=w, label="Hit@6 RAG", color="#4c78a8")
    ax.bar([i + w / 2 for i in x], llm_vals, width=w, label="LLM pass_auto", color="#f58518")
    ax.set_xticks(list(x))
    ax.set_xticklabels(ids)
    ax.set_ylabel("Taxa (%)")
    ax.set_ylim(0, 110)
    ax.set_title("Casos clinicos: recuperacao RAG vs resposta LLM")
    ax.legend()
    fig.tight_layout()
    return save_figure(fig, out_dir, "fig08_roteiro_clinico_rag_llm")


def plot_pii(rows: list[dict[str, str]], out_dir: Path) -> dict[str, str]:
    pii_rows = [r for r in rows if r.get("category") == "pii_sanitize"]
    fig, ax = plt.subplots(figsize=(6, 4))
    if not pii_rows:
        ax.text(0.5, 0.5, "Sem caso PII", ha="center", va="center")
        ax.axis("off")
        return save_figure(fig, out_dir, "fig09_roteiro_pii_mascaramento")

    r = pii_rows[0]
    labels = ["CPF", "Telefone", "E-mail"]
    vals = [
        100.0 if r.get("pii_cpf_masked") == "true" else 0.0,
        100.0 if r.get("pii_phone_masked") == "true" else 0.0,
        100.0 if r.get("pii_email_masked") == "true" else 0.0,
    ]
    leak = r.get("pii_leak") == "true"
    bars = ax.bar(labels, vals, color=["#72b7b2", "#54a24b", "#b279a2"])
    ax.axhline(100, color="#ccc", linestyle="--", linewidth=0.8)
    ax.set_ylim(0, 110)
    ax.set_ylabel("Mascarado (%)")
    ax.set_title("GT04 PII - vazamento detectado: " + ("sim" if leak else "nao"))
    for bar, v in zip(bars, vals):
        ax.text(bar.get_x() + bar.get_width() / 2, bar.get_height() + 2, f"{int(v)}%", ha="center")
    fig.tight_layout()
    return save_figure(fig, out_dir, "fig09_roteiro_pii_mascaramento")


def plot_guardrail(rows: list[dict[str, str]], out_dir: Path) -> dict[str, str]:
    gr = [r for r in rows if r.get("category") == "guardrail_scope"]
    fig, ax = plt.subplots(figsize=(5, 4))
    if not gr:
        ax.text(0.5, 0.5, "Sem caso guardrail", ha="center", va="center")
        ax.axis("off")
        return save_figure(fig, out_dir, "fig10_roteiro_guardrail_escopo")

    r = gr[0]
    labels = ["scope_pass", "sem forbidden", "case_pass"]
    vals = [
        100.0 if r.get("scope_pass") == "true" else 0.0,
        100.0 if r.get("forbidden_hit") != "true" else 0.0,
        100.0 if r.get("case_pass") == "true" else 0.0,
    ]
    bars = ax.bar(labels, vals, color=["#edc948", "#bab0ac", "#59a14f"])
    ax.set_ylim(0, 110)
    ax.set_ylabel("OK (%)")
    ax.set_title("GT05 Guardrail de escopo (jailbreak)")
    for bar, v in zip(bars, vals):
        ax.text(bar.get_x() + bar.get_width() / 2, bar.get_height() + 2, f"{int(v)}%", ha="center")
    fig.tight_layout()
    return save_figure(fig, out_dir, "fig10_roteiro_guardrail_escopo")


def merge_manifest(fig_dir: Path, roteiro_figs: dict[str, dict[str, str]]) -> None:
    manifest_path = fig_dir / "figures_manifest.json"
    base: dict = {"figures": {}}
    if manifest_path.is_file():
        base = json.loads(manifest_path.read_text(encoding="utf-8"))
    if "roteiro" not in base:
        base["roteiro"] = {}
    base["roteiro"].update(roteiro_figs)
    for key, paths in roteiro_figs.items():
        base.setdefault("figures", {})[key] = paths
    manifest_path.write_text(json.dumps(base, ensure_ascii=False, indent=2), encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description="Graficos benchmark roteiro GT01-GT05.")
    parser.add_argument("--date", default=date.today().strftime("%Y%m%d"))
    parser.add_argument("--csv", type=Path, default=None)
    parser.add_argument("--out-dir", type=Path, default=None)
    args = parser.parse_args()

    csv_path = args.csv or (DEFAULT_CSV / args.date / "roteiro_results.csv")
    out_dir = args.out_dir or (REPORT_DIR / "figures" / args.date)

    if not csv_path.is_file():
        print(f"CSV ausente: {csv_path}", file=__import__("sys").stderr)
        return 1

    rows = load_results(csv_path)
    roteiro_figs = {
        "fig07_roteiro_pass_por_caso": plot_pass_por_caso(rows, out_dir),
        "fig08_roteiro_clinico_rag_llm": plot_clinico_rag_llm(rows, out_dir),
        "fig09_roteiro_pii_mascaramento": plot_pii(rows, out_dir),
        "fig10_roteiro_guardrail_escopo": plot_guardrail(rows, out_dir),
    }
    merge_manifest(out_dir, roteiro_figs)
    print(f"Figuras roteiro em: {out_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
