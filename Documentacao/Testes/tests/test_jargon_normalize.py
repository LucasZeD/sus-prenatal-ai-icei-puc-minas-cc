"""Offline tests for obstetric jargon normalization."""
from __future__ import annotations

from obstetric_jargon import (
    ROTEIRO_JARGON_EXPECTED,
    ROTEIRO_JARGON_INPUT,
    normalize_obstetric_jargon,
)


def test_normalize_obstetric_jargon_roteiro_fixture() -> None:
    out = normalize_obstetric_jargon(ROTEIRO_JARGON_INPUT)
    assert out == ROTEIRO_JARGON_EXPECTED
