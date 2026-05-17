"""Reduce prompt-injection risk in untrusted text before it is sent to an LLM."""

from __future__ import annotations

import re
import unicodedata

# Hard cap before regex (avoids huge bodies).
_HARD_INPUT_CAP = 50_000

_ZW = re.compile(r"[\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]")

# Lines that mimic system/assistant/tool headers.
_ROLE_LINE = re.compile(
    r"(?im)^[\s\u00a0]*(?:system|assistant|tool)\s*:\s*",
)

# Common instruction-model delimiters (ChatML, Llama, etc.).
_MODEL_MARKERS = re.compile(
    r"(?is)"
    r"<\|im_start\|>.*?<\|im_end\|>|"
    r"<\|im_start\|>|<\|im_end\|>|<\|im_\w+\|>|"
    r"\[/INST\]|\[INST\]|"
    r"<</SYS>>|<<SYS>>|"
    r"<\|eot_id\|>|<\|start_header_id\|>|<\|end_header_id\|>",
)

# Markdown fenced block labeled system.
_FENCED_SYSTEM = re.compile(r"(?is)```\s*system\b.*?(```|$)")

# High-confidence override phrases (EN + PT). Portuguese letters via \\u escapes (ASCII source file).
_INST = r"(?:instru(?:\u00e7|c)(?:\u00f5|o)es|regras)"
_INJECTION_SNIPPETS: list[re.Pattern[str]] = [
    re.compile(
        r"(?is)\bignore(?:\s+all)?\s+(?:previous|prior|above)\s+"
        r"(?:instructions?|prompts?|rules?|directions?)\b"
    ),
    re.compile(r"(?is)\bdisregard(?:\s+all)?\s+(?:previous|prior|above)\s+(?:instructions?|prompts?|rules?)\b"),
    re.compile(r"(?is)\bforget\s+(?:everything|all)\s+(?:you(?:'ve)?|your|about)\b"),
    re.compile(r"(?is)\bdeveloper\s+message\s*:"),
    re.compile(r"(?is)\bnew\s+system\s+prompt\b"),
    re.compile(r"(?is)\boverride\s+the\s+(?:system|safety)\b"),
    re.compile(r"(?is)\bjailbreak\b|\bDAN\s+mode\b"),
    re.compile(r"(?is)end\s+of\s+(?:system|user)\s+message\b"),
    re.compile(rf"(?is)ignore\s+(?:todas?\s+)?(?:as\s+)?(?:{_INST})\s*(?:anteriores|pr\u00e9vias|previas)?"),
    re.compile(rf"(?is)\bdesconsidere\s+(?:todas?\s+)?(?:as\s+)?(?:{_INST})\b"),
    re.compile(r"(?is)(?:voc\u00ea|voce)\s+agora\s+\u00e9\s+um\s+assistente\b"),
    re.compile(r"(?is)finja(?:\s+que)?\s+(?:ser|voc\u00ea|voce)\b"),
    re.compile(rf"(?is)esque(?:\u00e7a|ca)\s+(?:todas?\s+)?(?:as\s+)?(?:{_INST})\b"),
    re.compile(r"(?is)revel(?:e|ar)\s+(?:a|o|sua)\s+(?:senha|password|token|api[_\s-]?key)\b"),
    re.compile(r"(?is)<\s*script\b|javascript\s*:"),
]


def _strip_controls(s: str) -> str:
    out: list[str] = []
    for ch in s:
        o = ord(ch)
        if ch in "\t\n\r":
            out.append(ch)
        elif o >= 0x20 and o != 0x7F:
            out.append(ch)
        else:
            out.append(" ")
    return "".join(out)


def strip_untrusted_llm_text(text: str, *, max_chars: int = 12_000) -> str:
    """
    Strip invisible/control chars, role delimiters, and common prompt-injection snippets.
    Does not replace model safety policies or output filters; shrinks attack surface on input.
    """
    if not text:
        return ""
    t = text if len(text) <= _HARD_INPUT_CAP else text[:_HARD_INPUT_CAP]
    t = unicodedata.normalize("NFC", t)
    t = _ZW.sub("", t)
    t = _strip_controls(t)
    t = _MODEL_MARKERS.sub(" ", t)
    t = _FENCED_SYSTEM.sub(" ", t)
    t = _ROLE_LINE.sub("[texto redigido] ", t)
    for pat in _INJECTION_SNIPPETS:
        t = pat.sub(" ", t)
    t = re.sub(r"[ \t\f\v]{2,}", " ", t)
    t = re.sub(r"\n{5,}", "\n\n\n\n", t)
    t = t.strip()
    if max_chars > 0 and len(t) > max_chars:
        t = t[:max_chars]
    return t
