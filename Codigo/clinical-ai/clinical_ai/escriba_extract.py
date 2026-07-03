"""Validacao e helpers para extracao estruturada do Escriba (RF04)."""

from __future__ import annotations

import json
import re
from typing import Any

ALLOWED_EXTRACT_FIELDS = frozenset(
    {
        "queixa",
        "peso",
        "pa_sistolica",
        "pa_diastolica",
        "idade_gestacional",
        "au",
        "bfc",
        "mov_fetal",
        "apresentacao_fetal",
        "is_edema",
        "is_exantema",
    }
)

_MARKDOWN_FENCE = re.compile(r"```")


def format_current_fields_block(current_fields: dict[str, Any] | None) -> str:
    """Formata snapshot de campos ja preenchidos para o CONTEXT do LLM."""
    if not current_fields:
        return ""
    filtered = {k: v for k, v in current_fields.items() if k in ALLOWED_EXTRACT_FIELDS and v is not None and v != ""}
    if not filtered:
        return ""
    return "### campos_atuais (nao sobrescrever)\n\n" + json.dumps(filtered, ensure_ascii=False)


def _strip_json_fences(text: str) -> str:
    t = text.strip()
    if t.startswith("```"):
        lines = t.split("\n")
        if lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        t = "\n".join(lines).strip()
    return t


def parse_and_validate_extract_response(raw: str) -> dict[str, Any]:
    """
    Valida resposta JSON do LLM para extracao de campos.
    Levanta ValueError se invalido ou contiver markdown.
    """
    if not raw or not raw.strip():
        raise ValueError("empty_response")

    if _MARKDOWN_FENCE.search(raw):
        raise ValueError("markdown_not_allowed")

    text = _strip_json_fences(raw.strip())
    try:
        data = json.loads(text)
    except json.JSONDecodeError as exc:
        raise ValueError("invalid_json") from exc

    if not isinstance(data, dict):
        raise ValueError("root_must_be_object")

    patch = data.get("patch")
    if patch is None:
        raise ValueError("missing_patch")
    if not isinstance(patch, dict):
        raise ValueError("patch_must_be_object")

    confidence = data.get("confidence", {})
    sources = data.get("sources", {})
    if not isinstance(confidence, dict):
        raise ValueError("confidence_must_be_object")
    if not isinstance(sources, dict):
        raise ValueError("sources_must_be_object")

    clean_patch: dict[str, Any] = {}
    for key, value in patch.items():
        if key not in ALLOWED_EXTRACT_FIELDS:
            continue
        if value is None:
            continue
        clean_patch[key] = value

    return {
        "patch": clean_patch,
        "confidence": {k: v for k, v in confidence.items() if isinstance(k, str)},
        "sources": {k: v for k, v in sources.items() if isinstance(k, str)},
    }
