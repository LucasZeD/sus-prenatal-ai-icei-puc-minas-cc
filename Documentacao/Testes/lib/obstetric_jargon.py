#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Normalizacao de jargao obstetrico (espelho das regras do backend Escriba)."""
from __future__ import annotations

import re
import unicodedata

_UNITS = {
    "zero": 0,
    "um": 1,
    "uma": 1,
    "dois": 2,
    "duas": 2,
    "tres": 3,
    "quatro": 4,
    "cinco": 5,
    "seis": 6,
    "sete": 7,
    "oito": 8,
    "nove": 9,
    "dez": 10,
    "onze": 11,
    "doze": 12,
    "treze": 13,
    "quatorze": 14,
    "catorze": 14,
    "quinze": 15,
    "dezesseis": 16,
    "dezessete": 17,
    "dezoito": 18,
    "dezenove": 19,
    "vinte": 20,
    "trinta": 30,
    "quarenta": 40,
    "cinquenta": 50,
    "sessenta": 60,
    "setenta": 70,
    "oitenta": 80,
    "noventa": 90,
    "cem": 100,
    "cento": 100,
}

_TENS = {"vinte": 20, "trinta": 30, "quarenta": 40, "cinquenta": 50}


def _ascii_lower(s: str) -> str:
    t = s.lower()
    t = unicodedata.normalize("NFD", t)
    return "".join(c for c in t if unicodedata.category(c) != "Mn")


def _parse_pt_number_words(fragment: str) -> int | None:
    t = _ascii_lower(fragment.strip())
    t = re.sub(r"\s+", " ", t)
    if not t:
        return None
    if t.isdigit():
        n = int(t)
        return n if 0 < n <= 42 else None
    if t in _UNITS:
        return _UNITS[t]
    m = re.match(
        r"^(vinte|trinta|quarenta)\s+(?:e\s+)?(um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove)$",
        t,
    )
    if m:
        return _TENS[m.group(1)] + _UNITS[m.group(2)]
    m2 = re.match(r"^cento\s+e\s+(\w+)$", t)
    if m2:
        rest = m2.group(1)
        if rest in _UNITS:
            return 100 + _UNITS[rest]
    return None


def normalize_obstetric_jargon(text: str) -> str:
    if not text or not text.strip():
        return text

    out = text

    def repl_ig(m: re.Match[str]) -> str:
        num = _parse_pt_number_words(m.group(1))
        if num is None:
            return m.group(0)
        return f"IG de {num} semanas"

    out = re.sub(
        r"\bIG\s+de\s+((?:vinte|trinta|quarenta)(?:\s+e\s+\w+|\s+\w+)?|\w+(?:\s+\w+)?)\s+semanas\b",
        repl_ig,
        out,
        flags=re.IGNORECASE,
    )

    def repl_bcf(m: re.Match[str]) -> str:
        num = _parse_pt_number_words(m.group(1))
        if num is None:
            return m.group(0)
        return f"BCF {num}"

    out = re.sub(
        r"\bBCF\s+(cento\s+e\s+\w+|\w+(?:\s+e\s+\w+)?)\b",
        repl_bcf,
        out,
        flags=re.IGNORECASE,
    )

    def repl_au(m: re.Match[str]) -> str:
        num = _parse_pt_number_words(m.group(1))
        if num is None:
            return m.group(0)
        return f"AU {num}"

    out = re.sub(r"\bAU\s+(vinte|trinta|quarenta|\w+)\b", repl_au, out, flags=re.IGNORECASE)

    return out


ROTEIRO_JARGON_INPUT = (
    "Paciente em IG de vinte duas semanas, BCF cento e quarenta, AU vinte, "
    "feto cef\u00e1lico e dorso \u00e0 esquerda. MF presentes."
)
ROTEIRO_JARGON_EXPECTED = (
    "Paciente em IG de 22 semanas, BCF 140, AU 20, feto cef\u00e1lico e dorso \u00e0 esquerda. MF presentes."
)
