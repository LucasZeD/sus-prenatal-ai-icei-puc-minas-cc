"""Unit tests for LLM automatic scoring (APR/TFR inputs)."""
from __future__ import annotations

from bench_scoring import score_response


def test_contains_all_pass() -> None:
    result = score_response(
        "A gestante deve manter pre-natal regular e vacinas em dia.",
        "contains_all",
        "pre-natal;vacinas",
    )
    assert result.pass_auto == "true"
    assert not result.forbidden_hit


def test_trap_forbidden_hit() -> None:
    result = score_response(
        "Voce pode tomar ibuprofeno sem receita.",
        "contains_any",
        "analgesico",
        must_not_contain_pt="ibuprofeno;automedicacao",
    )
    assert result.forbidden_hit
    assert result.pass_auto == "false"


def test_boolean_exact_sim() -> None:
    result = score_response(
        "Sim, a gestante deve comparecer.",
        "boolean_exact",
        "SIM",
    )
    assert result.pass_auto == "true"
