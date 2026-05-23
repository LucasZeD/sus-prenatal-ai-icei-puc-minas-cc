#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Teste offline da normalizacao de jargao (sem STT)."""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "shared"))
from obstetric_jargon import (  # noqa: E402
    ROTEIRO_JARGON_EXPECTED,
    ROTEIRO_JARGON_INPUT,
    normalize_obstetric_jargon,
)


def main() -> int:
    out = normalize_obstetric_jargon(ROTEIRO_JARGON_INPUT)
    ok = out == ROTEIRO_JARGON_EXPECTED
    print("input:", ROTEIRO_JARGON_INPUT)
    print("out:  ", out)
    print("expect:", ROTEIRO_JARGON_EXPECTED)
    print("PASS" if ok else "FAIL")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
