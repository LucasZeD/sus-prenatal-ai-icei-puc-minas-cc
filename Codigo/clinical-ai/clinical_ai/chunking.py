"""Split long documents into retrieval-sized pieces."""


def chunk_text(text: str, max_chars: int = 900, overlap: int = 80) -> list[str]:
    text = text.strip()
    if not text:
        return []
    if len(text) <= max_chars:
        return [text]

    paras = [p.strip() for p in text.split("\n\n") if p.strip()]
    if not paras:
        return _hard_split(text, max_chars, overlap)

    chunks: list[str] = []
    buf = ""
    for p in paras:
        candidate = f"{buf}\n\n{p}".strip() if buf else p
        if len(candidate) <= max_chars:
            buf = candidate
            continue
        if buf:
            chunks.append(buf)
        if len(p) <= max_chars:
            buf = p
        else:
            chunks.extend(_hard_split(p, max_chars, overlap))
            buf = ""
    if buf:
        chunks.append(buf)
    return chunks


def _hard_split(text: str, max_chars: int, overlap: int) -> list[str]:
    step = max(1, max_chars - overlap)
    return [text[i : i + max_chars] for i in range(0, len(text), step)]
