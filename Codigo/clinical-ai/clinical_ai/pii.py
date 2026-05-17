from __future__ import annotations

import re

from . import prompt_sanitize

# CPF-like (11 digits), CNS (15 digits), email, phone patterns (BR)
_CPF = re.compile(r"\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b|\b\d{11}\b")
_CNS = re.compile(r"\b\d{15}\b")
_EMAIL = re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b")
_PHONE = re.compile(r"\b(?:\+?55\s?)?(?:\(?\d{2}\)?\s?)?\d{4,5}-?\d{4}\b")
# Rough RG / generic long digit runs (avoid over-masking short clinical numbers)
_LONG_DIGITS = re.compile(r"\b\d{8,14}\b")


def sanitize_for_model(text: str, *, max_fragment_chars: int | None = None) -> str:
    if not text or not text.strip():
        return ""
    cap = max_fragment_chars if max_fragment_chars is not None else 12_000
    t = prompt_sanitize.strip_untrusted_llm_text(text, max_chars=cap)
    if not t.strip():
        return ""
    t = _EMAIL.sub("[EMAIL]", t)
    t = _CPF.sub("[CPF]", t)
    t = _CNS.sub("[CNS]", t)
    t = _PHONE.sub("[TELEFONE]", t)
    t = _LONG_DIGITS.sub("[NUM]", t)
    return t.strip()


def sanitize_optional_block(raw: str | dict | None) -> str | None:
    if raw is None:
        return None
    if isinstance(raw, dict):
        import json

        body = json.dumps(raw, ensure_ascii=False, indent=2)
    else:
        body = str(raw)
    out = sanitize_for_model(body, max_fragment_chars=20_000)
    return out if out else None
