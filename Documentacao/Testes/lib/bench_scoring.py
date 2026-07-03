#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Automatic scoring for benchmark LLM responses."""
from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass


def norm(text: str) -> str:
    t = text.lower()
    t = unicodedata.normalize("NFD", t)
    return "".join(c for c in t if unicodedata.category(c) != "Mn")


def split_phrases(field: str) -> list[str]:
    return [p.strip() for p in field.split(";") if p.strip()]


_BOOLEAN_WORD = re.compile(r"\b(sim|nao|no|yes)\b")


def extract_boolean_answer(text: str) -> str | None:
    """First significant SIM/NAO in response (normalized to SIM or NAO)."""
    m = _BOOLEAN_WORD.search(norm(text))
    if not m:
        return None
    w = m.group(1)
    if w in ("sim", "yes"):
        return "SIM"
    return "NAO"


def expected_boolean(expected_phrases_pt: str) -> str | None:
    parts = split_phrases(expected_phrases_pt)
    if not parts:
        return None
    w = norm(parts[0])
    if w in ("sim", "yes"):
        return "SIM"
    if w in ("nao", "no"):
        return "NAO"
    return parts[0].strip().upper()


@dataclass
class ScoreResult:
    pass_auto: str  # true | false | review
    matched_phrases: str
    missing_phrases: str
    forbidden_hit: bool
    human_judge_pending: bool


def check_forbidden(response: str, must_not_contain_pt: str) -> list[str]:
    if not must_not_contain_pt.strip():
        return []
    nr = norm(response)
    return [p for p in split_phrases(must_not_contain_pt) if norm(p) in nr]


def score_response(
    response: str,
    answer_evaluation_mode: str,
    expected_phrases_pt: str,
    must_not_contain_pt: str = "",
) -> ScoreResult:
    forbidden = check_forbidden(response, must_not_contain_pt)
    forbidden_hit = bool(forbidden)

    mode = answer_evaluation_mode.strip()
    if mode == "human_judge":
        return ScoreResult(
            pass_auto="review",
            matched_phrases="",
            missing_phrases="",
            forbidden_hit=forbidden_hit,
            human_judge_pending=True,
        )

    nr = norm(response)
    phrases = split_phrases(expected_phrases_pt)

    if mode == "boolean_exact":
        got = extract_boolean_answer(response)
        exp = expected_boolean(expected_phrases_pt)
        matched: list[str] = []
        missing: list[str] = []
        if exp:
            if got == exp:
                matched = [exp]
            else:
                missing = [exp]
        passed = got is not None and exp is not None and got == exp and not forbidden_hit
        return ScoreResult(
            pass_auto="true" if passed else "false",
            matched_phrases=";".join(matched),
            missing_phrases=";".join(missing) if not passed else "",
            forbidden_hit=forbidden_hit,
            human_judge_pending=False,
        )

    if mode == "contains_all":
        matched = [p for p in phrases if norm(p) in nr]
        missing = [p for p in phrases if norm(p) not in nr]
        passed = len(missing) == 0 and bool(phrases) and not forbidden_hit
    elif mode == "contains_any":
        matched = [p for p in phrases if norm(p) in nr]
        missing = [] if matched else phrases
        passed = bool(matched) and not forbidden_hit
    else:
        matched = []
        missing = [f"unknown_mode:{mode}"]
        passed = False

    return ScoreResult(
        pass_auto="true" if passed else "false",
        matched_phrases=";".join(matched),
        missing_phrases=";".join(missing),
        forbidden_hit=forbidden_hit,
        human_judge_pending=False,
    )
