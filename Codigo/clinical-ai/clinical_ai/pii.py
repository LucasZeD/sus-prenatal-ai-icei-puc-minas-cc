from __future__ import annotations

from . import prompt_sanitize
from .pii_br import detect_regex_spans
from .pii_merge import apply_masks, merge_spans
from .pii_ner_client import detect_ner_name_spans


def sanitize_for_model(text: str, *, max_fragment_chars: int | None = None) -> str:
    if not text or not text.strip():
        return ""
    cap = max_fragment_chars if max_fragment_chars is not None else 12_000
    t = prompt_sanitize.strip_untrusted_llm_text(text, max_chars=cap)
    if not t.strip():
        return ""
    regex_spans = detect_regex_spans(t)
    ner_spans = detect_ner_name_spans(t, max_chars=cap)
    merged = merge_spans(t, [*regex_spans, *ner_spans])
    return apply_masks(t, merged).strip()


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
