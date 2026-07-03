from __future__ import annotations

import os
import re
from threading import Lock
from typing import Any

from fastapi import FastAPI
from pydantic import BaseModel, Field

try:
    from transformers import pipeline as hf_pipeline
except Exception:  # noqa: BLE001
    hf_pipeline = None


MODEL_NAME = os.getenv("PII_NER_MODEL", "OpenMed/OpenMed-PII-Portuguese-SnowflakeMed-Large-568M-v1")
MIN_SCORE = float(os.getenv("PII_NER_MIN_SCORE", "0.75"))
MAX_CHARS = int(os.getenv("PII_NER_MAX_CHARS", "12000"))
ALLOW_FALLBACK = os.getenv("PII_NER_ALLOW_FALLBACK", "true").strip().lower() in {"1", "true", "yes"}
DEVICE = os.getenv("PII_NER_DEVICE", "cpu").strip().lower()
_NAME_FALLBACK = re.compile(r"\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})\b")
_NAME_PREFIXES = {"Paciente", "Registro", "Contato", "Nome", "No", "A", "O"}

app = FastAPI(title="PII NER Sidecar", version="0.1.0")
_ner = None
_ner_error: str = ""
_load_lock = Lock()


class DetectBody(BaseModel):
    input: str = Field(..., min_length=0, max_length=100_000)
    min_score: float | None = Field(default=None, ge=0.0, le=1.0)
    labels: list[str] | None = None


def _ensure_model() -> None:
    global _ner, _ner_error
    if _ner is not None or _ner_error:
        return
    with _load_lock:
        if _ner is not None or _ner_error:
            return
        if hf_pipeline is None:
            _ner_error = "transformers_not_available"
            return
        try:
            device = 0 if DEVICE == "cuda" else -1
            _ner = hf_pipeline(
                "ner",
                model=MODEL_NAME,
                aggregation_strategy="simple",
                device=device,
            )
        except Exception as exc:  # noqa: BLE001
            _ner_error = str(exc)


def _normalize_label(raw: str) -> str:
    return str(raw or "").upper().replace("B-", "").replace("I-", "")


def _trim_name_prefix(name: str) -> str:
    parts = name.split()
    if len(parts) >= 3 and parts[0] in _NAME_PREFIXES:
        return " ".join(parts[1:])
    return name


def _detect_with_fallback(text: str, min_score: float, allowed: set[str] | None) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for match in _NAME_FALLBACK.finditer(text):
        label = "FIRSTNAME"
        if allowed and label not in allowed:
            continue
        clean = _trim_name_prefix(match.group(1))
        start = text.find(clean, match.start(1), match.end(1))
        if start < 0:
            start = match.start(1)
            clean = match.group(1)
        out.append(
            {
                "label": label,
                "start": start,
                "end": start + len(clean),
                "score": max(0.9, min_score),
                "text": clean,
            }
        )
    return out


def _detect_entities(text: str, min_score: float, labels: list[str] | None) -> list[dict[str, Any]]:
    allowed = {_normalize_label(l) for l in labels} if labels else None
    _ensure_model()
    if _ner is None:
        if not ALLOW_FALLBACK:
            return []
        return _detect_with_fallback(text, min_score, allowed)
    rows = _ner(text[:MAX_CHARS])
    out: list[dict[str, Any]] = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        label = _normalize_label(str(row.get("entity_group") or row.get("entity") or ""))
        score = float(row.get("score") or 0.0)
        start = int(row.get("start") or 0)
        end = int(row.get("end") or 0)
        if score < min_score or end <= start or not label:
            continue
        if allowed and label not in allowed:
            continue
        out.append(
            {
                "label": label,
                "start": start,
                "end": end,
                "score": score,
                "text": text[start:end],
            }
        )
    return out


@app.get("/health")
def health() -> dict[str, Any]:
    _ensure_model()
    return {
        "status": "ok",
        "model": MODEL_NAME,
        "device": DEVICE,
        "model_loaded": _ner is not None,
        "model_error": _ner_error or None,
        "fallback_enabled": ALLOW_FALLBACK,
        "pipeline": "transformers" if _ner is not None else "fallback",
    }


@app.post("/detect")
def detect(body: DetectBody) -> dict[str, Any]:
    text = (body.input or "")[:MAX_CHARS]
    if not text.strip():
        return {"entities": []}
    score = body.min_score if body.min_score is not None else MIN_SCORE
    entities = _detect_entities(text, score, body.labels)
    return {"entities": entities}
