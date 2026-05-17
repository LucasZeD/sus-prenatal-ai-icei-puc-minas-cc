"""Heuristics to drop low-value PDF chunks (covers, indices, catalog stubs)."""

from __future__ import annotations

import re

# Portuguese literals as escapes to keep source ASCII-safe on all editors.
_ID = "\u00edndice"
_AN = "anota\u00e7\u00f5es"
_OG = "orienta\u00e7\u00f5es gerais"
_FIC = "ficha catalogr\u00e1fica"
_CAT = "cataloga\u00e7\u00e3o na fonte"


def should_skip_rag_chunk(text: str) -> bool:
    """
    Return True if the chunk is unlikely to help clinical retrieval (boilerplate only).
    Conservative: only skips when patterns are strong or the chunk is very short.
    """
    raw = (text or "").strip()
    if not raw:
        return True
    compact = " ".join(raw.split())
    low = compact.lower()
    n = len(compact)
    lines = [ln.strip() for ln in raw.splitlines() if ln.strip()]

    if n < 72:
        if re.fullmatch(rf"[\W\d\s]*({_ID}|{_AN})[\W\d\s]*", low):
            return True
        if low in {_ID, _AN, _OG, "agradecimento"}:
            return True
        if _FIC in low or _CAT in low:
            return True
        if "isbn" in low and "secretaria" in low and n < 420:
            return True

    if 5 <= len(lines) <= 80:
        boiler_lines = sum(1 for ln in lines if re.match(rf"^({_ID}|{_AN})$", ln.lower()))
        if boiler_lines / len(lines) >= 0.55:
            return True

    if low.count(_AN) >= 5 and low.count(_ID) >= 3 and n < 900:
        return True

    return False
