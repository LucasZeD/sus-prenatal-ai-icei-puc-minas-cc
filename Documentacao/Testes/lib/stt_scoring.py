#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Metricas de efetividade para benchmark STT (WER, phrase recall, jargao clinico)."""
from __future__ import annotations

import re
from dataclasses import dataclass

from bench_scoring import norm, split_phrases

_DIARIZATION_LABEL = re.compile(r"\[(?:Profissional|Paciente|SPEAKER_\d+)\]\s*", re.IGNORECASE)

DEFAULT_JARGON_TERMS = [
    "gestante",
    "pr\u00e9-natal",
    "prenatal",
    "semanas",
    "press\u00e3o arterial",
    "protein\u00faria",
    "cef\u00e1lico",
    "BCF",
    "batimentos",
    "altura uterina",
    "movimentos fetais",
    "edema",
    "gesta\u00e7\u00e3o",
    "alto risco",
]


def strip_diarization_labels(text: str) -> str:
    """Remove rotulos [Profissional]/[Paciente] antes de metricas de texto."""
    cleaned = _DIARIZATION_LABEL.sub("", text or "")
    return " ".join(cleaned.split())


def compute_wer(reference: str, hypothesis: str) -> float:
    """WER (%) entre referencia e hipotese, com normalizacao NFD."""
    try:
        import jiwer
    except ImportError as exc:
        raise ImportError("jiwer is required for WER metrics: pip install jiwer") from exc

    ref = norm(strip_diarization_labels(reference))
    hyp = norm(strip_diarization_labels(hypothesis))
    if not ref:
        return 0.0 if not hyp else 100.0
    return float(jiwer.wer(ref, hyp) * 100.0)


def compute_cer(reference: str, hypothesis: str) -> float:
    """CER (%) aplicavel a PT."""
    try:
        import jiwer
    except ImportError as exc:
        raise ImportError("jiwer is required for CER metrics: pip install jiwer") from exc

    ref = norm(strip_diarization_labels(reference))
    hyp = norm(strip_diarization_labels(hypothesis))
    if not ref:
        return 0.0 if not hyp else 100.0
    return float(jiwer.cer(ref, hyp) * 100.0)


@dataclass
class PhraseRecallResult:
    recall_pct: float
    matched: list[str]
    missing: list[str]


def phrase_recall(hypothesis: str, expected_phrases_pt: str) -> PhraseRecallResult:
    """Proporcao de frases esperadas presentes na transcricao."""
    phrases = split_phrases(expected_phrases_pt)
    if not phrases:
        return PhraseRecallResult(recall_pct=100.0, matched=[], missing=[])
    nr = norm(strip_diarization_labels(hypothesis))
    matched = [p for p in phrases if norm(p) in nr]
    missing = [p for p in phrases if norm(p) not in nr]
    pct = (len(matched) / len(phrases)) * 100.0
    return PhraseRecallResult(recall_pct=pct, matched=matched, missing=missing)


@dataclass
class JargonHitsResult:
    hits: int
    total: int
    matched_terms: list[str]


def jargon_hits(hypothesis: str, terms: list[str] | None = None) -> JargonHitsResult:
    """Conta quantos termos de jargao obstetrico aparecem na hipotese."""
    vocabulary = terms if terms is not None else DEFAULT_JARGON_TERMS
    if not vocabulary:
        return JargonHitsResult(hits=0, total=0, matched_terms=[])
    nr = norm(strip_diarization_labels(hypothesis))
    matched = [t for t in vocabulary if norm(t) in nr]
    return JargonHitsResult(hits=len(matched), total=len(vocabulary), matched_terms=matched)


def has_diarization_labels(text: str) -> bool:
    return bool(_DIARIZATION_LABEL.search(text or ""))
