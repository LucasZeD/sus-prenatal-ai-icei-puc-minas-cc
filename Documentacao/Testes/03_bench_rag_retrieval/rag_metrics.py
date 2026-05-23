#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""RAG retrieval metrics for the benchmark."""
from __future__ import annotations

from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "shared"))
from bench_scoring import norm, split_phrases  # noqa: E402


def normalize_source(name: str) -> str:
    base = Path(name).name
    return norm(base)


def hit_document_at_k(chunks: list[dict], expected_pdf: str, k: int = 6) -> bool:
    expected = normalize_source(expected_pdf)
    for c in chunks[:k]:
        src = str(c.get("source_file") or "")
        if normalize_source(src) == expected:
            return True
        meta = c.get("meta") or {}
        if isinstance(meta, dict):
            sp = meta.get("source_path") or ""
            if sp and normalize_source(str(sp)) == expected:
                return True
    return False


def rank_first_correct(chunks: list[dict], expected_pdf: str, k: int = 6) -> int:
    expected = normalize_source(expected_pdf)
    for i, c in enumerate(chunks[:k], start=1):
        src = str(c.get("source_file") or "")
        if normalize_source(src) == expected:
            return i
        meta = c.get("meta") or {}
        if isinstance(meta, dict):
            sp = meta.get("source_path") or ""
            if sp and normalize_source(str(sp)) == expected:
                return i
    return 0


def mrr(rank: int) -> float:
    return 1.0 / rank if rank > 0 else 0.0


def phrase_recall_in_chunks(
    mode: str,
    expected_phrases_pt: str,
    chunk_texts: list[str],
) -> str:
    if mode in ("boolean_exact", "human_judge"):
        return ""
    phrases = split_phrases(expected_phrases_pt)
    if not phrases:
        return ""
    combined = norm(" ".join(chunk_texts))
    if mode == "contains_all":
        found = sum(1 for p in phrases if norm(p) in combined)
        return f"{100.0 * found / len(phrases):.1f}"
    if mode == "contains_any":
        found = sum(1 for p in phrases if norm(p) in combined)
        return "100.0" if found else "0.0"
    return ""


def chunk_sources_list(chunks: list[dict], k: int = 6) -> str:
    parts: list[str] = []
    for c in chunks[:k]:
        src = str(c.get("source_file") or "")
        if not src:
            meta = c.get("meta") or {}
            if isinstance(meta, dict) and meta.get("source_path"):
                src = Path(str(meta["source_path"])).name
        parts.append(src or "?")
    return ";".join(parts)
