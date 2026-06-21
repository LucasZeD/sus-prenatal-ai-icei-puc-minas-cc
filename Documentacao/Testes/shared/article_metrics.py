#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Shared metrics used by the article-oriented benchmark suite."""
from __future__ import annotations

from collections import Counter
from typing import Any


def extract_tag(notes: str) -> str:
    if "tag=" in notes:
        return notes.split("tag=", 1)[1].split()[0].strip("|; ")
    if notes.startswith("tag="):
        return notes[4:].split()[0]
    return ""


def is_trap(benchmark_row: dict[str, str]) -> bool:
    return extract_tag(benchmark_row.get("notes_scoring_pt", "")) == "trap"


def benchmark_composition(benchmark_rows: list[dict[str, str]]) -> dict[str, int]:
    trap_n = sum(1 for r in benchmark_rows if is_trap(r))
    return {"total": len(benchmark_rows), "trap": trap_n, "protocol": len(benchmark_rows) - trap_n}


def _provider_rows(rows: list[dict[str, str]], provider: str | None) -> list[dict[str, str]]:
    if not provider:
        return list(rows)
    return [r for r in rows if r.get("llm_provider", "").strip().lower() == provider.strip().lower()]


def compute_apr(rows: list[dict[str, str]], provider: str | None = None) -> dict[str, Any]:
    sub = _provider_rows(rows, provider)
    eligible = [r for r in sub if r.get("pass_auto") in ("true", "false")]
    approved = sum(1 for r in eligible if r.get("pass_auto") == "true")
    rate = (100.0 * approved / len(eligible)) if eligible else 0.0
    return {
        "approved": approved,
        "eligible": len(eligible),
        "review": sum(1 for r in sub if r.get("pass_auto") == "review"),
        "rate_pct": rate,
    }


def compute_tfr(
    rows: list[dict[str, str]],
    trap_ids: set[str],
    provider: str | None = None,
) -> dict[str, Any]:
    sub = _provider_rows(rows, provider)
    traps = [r for r in sub if r.get("question_id", "") in trap_ids and r.get("pass_auto") in ("true", "false")]
    fails = sum(
        1
        for r in traps
        if r.get("pass_auto") != "true" or r.get("forbidden_hit", "false") == "true"
    )
    rate = (100.0 * fails / len(traps)) if traps else 0.0
    return {"failed": fails, "eligible": len(traps), "rate_pct": rate}


def compute_hit6(rag_rows: list[dict[str, str]]) -> dict[str, Any]:
    def _rate(rows: list[dict[str, str]]) -> tuple[float, int]:
        if not rows:
            return 0.0, 0
        ok = sum(1 for r in rows if r.get("hit_document@6") == "true")
        return 100.0 * ok / len(rows), len(rows)

    out: dict[str, Any] = {}
    total_rate, total_n = _rate(rag_rows)
    out["global"] = {"rate_pct": total_rate, "n": total_n}

    by_diff: dict[str, dict[str, Any]] = {}
    for diff in ("easy", "medium", "hard"):
        subset = [r for r in rag_rows if r.get("difficulty") == diff]
        rate, n = _rate(subset)
        by_diff[diff] = {"rate_pct": rate, "n": n}
    out["by_difficulty"] = by_diff
    return out


def difficulty_counts(benchmark_rows: list[dict[str, str]]) -> dict[str, int]:
    c = Counter(r.get("difficulty", "") for r in benchmark_rows)
    return {k: c.get(k, 0) for k in ("easy", "medium", "hard")}


def markdown_table(headers: list[str], rows: list[list[str]]) -> str:
    line1 = "| " + " | ".join(headers) + " |"
    line2 = "| " + " | ".join(["---"] * len(headers)) + " |"
    body = ["| " + " | ".join(r) + " |" for r in rows]
    return "\n".join([line1, line2, *body])


def latex_booktabs(headers: list[str], rows: list[list[str]]) -> str:
    cols = " ".join(["l"] + ["c"] * (len(headers) - 1))
    out: list[str] = []
    out.append("\\begin{tabular}{" + cols + "}")
    out.append("  \\toprule")
    out.append("  " + " & ".join(headers) + " \\\\")
    out.append("  \\midrule")
    for row in rows:
        out.append("  " + " & ".join(row) + " \\\\")
    out.append("  \\bottomrule")
    out.append("\\end{tabular}")
    return "\n".join(out)
