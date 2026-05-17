"""Strip leaked chain-of-thought from visible assistant content (e.g. Thinking Process, Wait check loops)."""

from __future__ import annotations

import re

_SYSTEM_LEAK_HINT = re.compile(
    r"(?is)thinking\s*process\b|analyze\s+the\s+request|racioc[i\u00ed]nio\s*interno\b|"
    r"analise\s+(?:o\s+)?pedido\s*:|^\d+\.\s*\*\*[Aa]nal\b|\*\*Analyze\b",
)


def _cut_before_first_wait_check_loop(text: str) -> str:
    """Cut at the first typical English self-check loop (Qwen-style models)."""
    patterns = (
        r"(?im)^[\s*`]*\*?\s*Wait,\s*I\s+need\s+to\s+check\b",
        r"(?im)^[\s*`]*\*?\s*Wait,\s*check\b",
    )
    for pat in patterns:
        m = re.search(pat, text)
        # Baixo limiar: este corte so roda apos deteccao de vazamento (Thinking Process / Analyze).
        if m and m.start() > 20:
            return text[: m.start()].rstrip()
    return text


def sanitize_assistant_visible_reply(reply: str) -> tuple[str, bool]:
    """
    Remove leaked reasoning from visible content until a useful heading or before loops.
    Returns (text, True) if the string was modified.
    """
    raw = reply or ""
    preview = raw.lstrip()[:20000]

    if not _SYSTEM_LEAK_HINT.search(preview[:4000]):
        return raw, False

    m_head = re.search(r"(?m)^#{1,3}\s+\S+", raw)
    if m_head:
        out = _cut_before_first_wait_check_loop(raw[m_head.start() :].lstrip())
        return out, True

    stripped = re.sub(
        r"(?is)^[\s*`#>*-]{0,12}thinking\s*process\s*[:\.]?\s*",
        "",
        raw.lstrip(),
        count=1,
    )
    out = _cut_before_first_wait_check_loop(stripped).strip()
    out = re.sub(
        r"(?is)^\s*\d+\.\s*\*\*Analyze\s+the\s+Request:\*\*\s*",
        "",
        out,
        count=1,
    ).strip()
    if out != raw.strip():
        return out, True
    return raw, False
