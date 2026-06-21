from __future__ import annotations

import re

from .pii_types import PiiSpan

_EMAIL = re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b")
_CPF = re.compile(r"\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b|\b\d{11}\b")
_CNS = re.compile(r"\b\d{15}\b|\b\d{3}[\s.]?\d{4}[\s.]?\d{4}[\s.]?\d{4}\b")
_RG = re.compile(r"\b\d{1,2}\.?\d{3}\.?\d{3}-?[0-9Xx]\b")
_PHONE_BR = re.compile(
    r"\b(?:\+?55[\s.-]?)?(?:\(?\d{2}\)?[\s.-]?)?(?:9?\d{4}[\s.-]?\d{4}|0800[\s.-]?\d{3}[\s.-]?\d{3})\b"
)
_LONG_DIGITS = re.compile(r"\b\d{8,20}\b")
_LONG_SEPARATED = re.compile(r"\b[\d\s.\-/]{10,}\b")


def _append_matches(out: list[PiiSpan], text: str, pattern: re.Pattern[str], kind: str, placeholder: str) -> None:
    for match in pattern.finditer(text):
        out.append(
            PiiSpan(
                start=match.start(),
                end=match.end(),
                kind=kind,
                placeholder=placeholder,
                source="regex",
                priority=100,
            )
        )


def detect_regex_spans(text: str) -> list[PiiSpan]:
    spans: list[PiiSpan] = []
    _append_matches(spans, text, _EMAIL, "EMAIL", "[EMAIL]")
    _append_matches(spans, text, _CPF, "CPF", "[CPF]")
    _append_matches(spans, text, _CNS, "CNS", "[CNS]")
    _append_matches(spans, text, _PHONE_BR, "PHONE", "[TELEFONE]")
    _append_matches(spans, text, _RG, "LONG_NUMERIC_CHAIN", "[NUM]")
    _append_matches(spans, text, _LONG_DIGITS, "LONG_NUMERIC_CHAIN", "[NUM]")

    for match in _LONG_SEPARATED.finditer(text):
        chunk = match.group(0)
        digits = re.sub(r"\D", "", chunk)
        if len(digits) < 10:
            continue
        spans.append(
            PiiSpan(
                start=match.start(),
                end=match.end(),
                kind="LONG_NUMERIC_CHAIN",
                placeholder="[NUM]",
                source="regex",
                priority=90,
            )
        )
    return spans
