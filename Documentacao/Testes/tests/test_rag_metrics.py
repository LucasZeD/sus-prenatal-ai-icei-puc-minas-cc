"""Unit tests for RAG metric helpers."""
from __future__ import annotations

from rag_metrics import (
    hit_document_at_k,
    mrr,
    phrase_recall_in_chunks,
    rank_first_correct,
)


def test_hit_document_at_k() -> None:
    chunks = [
        {"source_file": "wrong.pdf"},
        {"source_file": "ManualGestacaoAltoRisco_2022.pdf"},
    ]
    assert hit_document_at_k(chunks, "ManualGestacaoAltoRisco_2022.pdf", k=6)


def test_rank_first_correct() -> None:
    chunks = [{"source_file": "a.pdf"}, {"source_file": "target.pdf"}]
    assert rank_first_correct(chunks, "target.pdf", k=6) == 2


def test_mrr() -> None:
    assert mrr(2) == 0.5
    assert mrr(0) == 0.0


def test_phrase_recall_in_chunks_contains_all() -> None:
    out = phrase_recall_in_chunks(
        "contains_all",
        "pre-natal;gestante",
        ["Acompanhamento de pre-natal da gestante"],
    )
    assert out == "100.0"
