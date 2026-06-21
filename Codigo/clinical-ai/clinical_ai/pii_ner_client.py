from __future__ import annotations

import logging
import re
from typing import Any

import httpx

from .config import get_settings
from .pii_types import PiiSpan

log = logging.getLogger(__name__)

_NAME_LABELS = {"FIRSTNAME", "LASTNAME", "MIDDLENAME", "PREFIX"}
_NAME_FALLBACK = re.compile(r"\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})\b")
_NAME_PREFIXES = {"Paciente", "Registro", "Contato", "Nome", "No", "A", "O"}


class NerUnavailableError(RuntimeError):
    pass


def _trim_name_prefix(name: str) -> str:
    parts = name.split()
    if len(parts) >= 3 and parts[0] in _NAME_PREFIXES:
        return " ".join(parts[1:])
    return name


def _fallback_name_spans(text: str) -> list[PiiSpan]:
    spans: list[PiiSpan] = []
    for match in _NAME_FALLBACK.finditer(text):
        clean = _trim_name_prefix(match.group(1))
        start = text.find(clean, match.start(1), match.end(1))
        if start < 0:
            start = match.start(1)
            clean = match.group(1)
        spans.append(
            PiiSpan(
                start=start,
                end=start + len(clean),
                kind="FULL_NAME",
                placeholder="[NOME]",
                source="ner_fallback",
                priority=15,
                score=0.85,
            )
        )
    return spans


def detect_ner_name_spans(text: str, *, max_chars: int) -> list[PiiSpan]:
    s = get_settings()
    url = (s.pii_ner_url or "").strip()
    if not text or not url:
        if s.pii_ner_required and not url:
            raise NerUnavailableError("pii_ner_url_missing")
        return _fallback_name_spans(text)

    payload = {
        "input": text[: max(1, min(max_chars, s.pii_ner_max_chars))],
        "min_score": s.pii_ner_min_score,
        "labels": sorted(_NAME_LABELS),
    }
    try:
        res = httpx.post(
            f"{url.rstrip('/')}/detect",
            json=payload,
            timeout=s.pii_ner_timeout_s,
        )
        res.raise_for_status()
    except httpx.HTTPError as exc:
        if s.pii_ner_required:
            raise NerUnavailableError(f"pii_ner_http_error: {exc}") from exc
        log.warning("PII NER unavailable, fallback regex-only: %s", exc)
        return _fallback_name_spans(text)

    data = res.json() if res.content else {}
    entities = data.get("entities") if isinstance(data, dict) else None
    if not isinstance(entities, list):
        if s.pii_ner_required:
            raise NerUnavailableError("pii_ner_invalid_payload")
        return _fallback_name_spans(text)

    spans: list[PiiSpan] = []
    for item in entities:
        if not isinstance(item, dict):
            continue
        label = str(item.get("label") or "").upper().replace("B-", "").replace("I-", "")
        if label not in _NAME_LABELS:
            continue
        try:
            start = int(item.get("start"))
            end = int(item.get("end"))
            score = float(item.get("score") or 0.0)
        except (TypeError, ValueError):
            continue
        if score < s.pii_ner_min_score:
            continue
        spans.append(
            PiiSpan(
                start=start,
                end=end,
                kind="FULL_NAME",
                placeholder="[NOME]",
                source="ner",
                priority=20,
                score=score,
            )
        )
    return spans


def get_ner_status() -> dict[str, Any]:
    s = get_settings()
    url = (s.pii_ner_url or "").strip()
    if not url:
        return {"mode": "regex_only", "ner_url": "", "ner_reachable": False, "required": s.pii_ner_required}
    try:
        res = httpx.get(f"{url.rstrip('/')}/health", timeout=min(2.0, s.pii_ner_timeout_s))
        ok = res.status_code < 400
    except httpx.HTTPError:
        ok = False
    return {"mode": "hybrid" if ok else "regex_only", "ner_url": url, "ner_reachable": ok, "required": s.pii_ner_required}
