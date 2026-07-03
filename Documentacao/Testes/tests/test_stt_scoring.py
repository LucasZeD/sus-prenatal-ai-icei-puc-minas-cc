"""Offline tests for STT scoring helpers."""
from __future__ import annotations

from stt_scoring import (
    compute_wer,
    has_diarization_labels,
    jargon_hits,
    phrase_recall,
    strip_diarization_labels,
)


def test_strip_diarization_labels() -> None:
    raw = "[Profissional] Gestante em pre-natal. [Paciente] Sem queixas."
    cleaned = strip_diarization_labels(raw)
    assert "[Profissional]" not in cleaned
    assert "Gestante" in cleaned


def test_phrase_recall() -> None:
    pr = phrase_recall("Gestante em acompanhamento de pre-natal", "gestante;pre-natal;rotina")
    assert pr.recall_pct >= 66.0
    assert "gestante" in [p.lower() for p in pr.matched] or pr.recall_pct > 0


def test_jargon_hits() -> None:
    jh = jargon_hits("BCF cento e quarenta, altura uterina vinte", ["BCF", "altura uterina"])
    assert jh.hits == 2


def test_wer_identical() -> None:
    ref = "Pressao arterial cento e vinte por oitenta"
    assert compute_wer(ref, ref) == 0.0


def test_has_diarization_labels() -> None:
    assert has_diarization_labels("[Profissional] Ola")
    assert not has_diarization_labels("Ola gestante")
