from __future__ import annotations

from .pii_types import PiiSpan


def merge_spans(text: str, spans: list[PiiSpan]) -> list[PiiSpan]:
    ordered = [s for s in sorted(spans, key=lambda x: (x.start, -(x.end - x.start), -x.priority)) if s.valid_for(text)]
    merged: list[PiiSpan] = []
    for span in ordered:
        if not merged:
            merged.append(span)
            continue
        last = merged[-1]
        if span.start >= last.end:
            merged.append(span)
            continue
        if span.priority > last.priority or (span.priority == last.priority and (span.end - span.start) > (last.end - last.start)):
            merged[-1] = span
    return merged


def apply_masks(text: str, spans: list[PiiSpan]) -> str:
    out = text
    for span in sorted(spans, key=lambda x: x.start, reverse=True):
        out = out[: span.start] + span.placeholder + out[span.end :]
    return out
