from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any

log = logging.getLogger(__name__)


def _read_jsonl(path: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    with path.open(encoding="utf-8") as f:
        for line_no, line in enumerate(f, 1):
            line = line.strip()
            if not line:
                continue
            try:
                obj = json.loads(line)
            except json.JSONDecodeError as e:
                log.warning("Skip %s line %s: %s", path.name, line_no, e)
                continue
            if not isinstance(obj, dict):
                continue
            tid = str(obj.get("id", f"{path.name}-{line_no}"))
            title = str(obj.get("title", tid))
            text = str(obj.get("text", ""))
            if not text:
                continue
            rows.append(
                {
                    "id": tid,
                    "title": title,
                    "text": text,
                    "meta": {"source_path": str(path), **(obj.get("meta") or {})},
                }
            )
    return rows


def _read_plain(path: Path) -> dict[str, Any]:
    text = path.read_text(encoding="utf-8")
    mtime_ns = path.stat().st_mtime_ns
    return {
        "id": path.stem,
        "title": path.stem.replace("_", " "),
        "text": text,
        "meta": {
            "source_path": str(path),
            "kind": path.suffix.lower(),
            "file_mtime_ns": mtime_ns,
        },
    }


def _read_pdf(path: Path) -> dict[str, Any] | None:
    try:
        from pypdf import PdfReader
    except ImportError:
        log.warning("Install pypdf to index PDFs (pip install pypdf): %s", path)
        return None
    try:
        reader = PdfReader(str(path))
        pages: list[str] = []
        for p in reader.pages:
            t = p.extract_text()
            if t:
                pages.append(t)
        text = "\n\n".join(pages).strip()
    except Exception as exc:  # noqa: BLE001
        log.warning("PDF read failed %s: %s", path, exc)
        return None
    if not text:
        log.warning("PDF empty or unreadable: %s", path)
        return None
    mtime_ns = path.stat().st_mtime_ns
    return {
        "id": path.stem,
        "title": path.stem.replace("_", " "),
        "text": text,
        "meta": {"source_path": str(path), "kind": ".pdf", "file_mtime_ns": mtime_ns},
    }


def _read_docx(path: Path) -> dict[str, Any] | None:
    try:
        from docx import Document
    except ImportError:
        log.warning("Install python-docx to index DOCX (pip install python-docx): %s", path)
        return None
    try:
        document = Document(str(path))
        paras = [para.text.strip() for para in document.paragraphs if para.text and para.text.strip()]
        text = "\n\n".join(paras).strip()
    except Exception as exc:  # noqa: BLE001
        log.warning("DOCX read failed %s: %s", path, exc)
        return None
    if not text:
        log.warning("DOCX empty: %s", path)
        return None
    mtime_ns = path.stat().st_mtime_ns
    return {
        "id": path.stem,
        "title": path.stem.replace("_", " "),
        "text": text,
        "meta": {"source_path": str(path), "kind": ".docx", "file_mtime_ns": mtime_ns},
    }


def gather_documents(corpus_dir: Path) -> list[dict[str, Any]]:
    if not corpus_dir.is_dir():
        log.warning("RAG corpus dir missing or not a directory: %s", corpus_dir)
        return []

    out: list[dict[str, Any]] = []
    for pattern in ("**/*.jsonl", "**/*.md", "**/*.txt", "**/*.pdf", "**/*.docx"):
        for path in sorted(corpus_dir.glob(pattern)):
            if not path.is_file():
                continue
            if path.name.lower() == "readme.md":
                continue
            suf = path.suffix.lower()
            try:
                if suf == ".jsonl":
                    out.extend(_read_jsonl(path))
                elif suf in (".md", ".txt"):
                    out.append(_read_plain(path))
                elif suf == ".pdf":
                    doc = _read_pdf(path)
                    if doc:
                        out.append(doc)
                elif suf == ".docx":
                    doc = _read_docx(path)
                    if doc:
                        out.append(doc)
            except OSError as e:
                log.warning("Skip %s: %s", path, e)
    return out
