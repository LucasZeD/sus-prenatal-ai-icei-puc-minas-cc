from __future__ import annotations

import json
import logging
import re
import unicodedata
from collections import defaultdict
from pathlib import Path
from typing import Any

log = logging.getLogger(__name__)

_SUPPORTED_PATTERNS: tuple[str, ...] = ("**/*.jsonl", "**/*.md", "**/*.txt", "**/*.pdf", "**/*.docx")
_DEMO_MARKERS: tuple[str, ...] = ("_exemplo", "exemplo.", "sample", "fixture", "benchmark")
# Subpastas com fichas/registros clinicos — fora do corpus de protocolo do RAG.
_RAG_SKIP_DIR_NAMES: frozenset[str] = frozenset({"cadernetagestante"})
_YEAR_RE = re.compile(r"(19|20)\d{2}")
_EDITION_RE = re.compile(r"\d{1,2}ed")


def _normalized_stem(path: Path) -> str:
    raw = unicodedata.normalize("NFKD", path.stem).encode("ascii", "ignore").decode("ascii")
    return re.sub(r"[^a-z0-9]+", "", raw.lower())


def _extract_year(path: Path) -> int:
    years = [int(m.group(0)) for m in _YEAR_RE.finditer(path.stem)]
    return max(years) if years else 0


def _family_key(path: Path) -> str:
    stem = _normalized_stem(path)
    if "cadernetagestante" in stem:
        return "caderneta_gestante"
    if "manualgestacaoaltorisco" in stem or "gestacaoaltorisco" in stem:
        return "gestacao_alto_risco"
    if "guiaprenataldoparceiro" in stem:
        return "guia_prenatal_parceiro"

    tmp = _YEAR_RE.sub("", stem)
    tmp = _EDITION_RE.sub("", tmp)
    for token in ("rev", "revisao", "atualizada"):
        tmp = tmp.replace(token, "")
    return tmp or stem


def _path_is_denylisted(path: Path, *, corpus_dir: Path) -> bool:
    if path.name.lower() == "readme.md":
        return True

    rel_parts = [part.lower() for part in path.relative_to(corpus_dir).parts]
    if any(part.startswith("notas_locais") for part in rel_parts):
        return True
    if any(part in _RAG_SKIP_DIR_NAMES for part in rel_parts):
        return True

    # Demo notes and local fixtures should never be indexed as clinical corpus.
    if path.suffix.lower() in {".md", ".txt"}:
        low_name = path.name.lower()
        if any(marker in low_name for marker in _DEMO_MARKERS):
            return True

    return False


def find_corpus_file(corpus_dir: Path, filename: str) -> Path | None:
    """First file match by basename under corpus_dir (any depth)."""
    if not corpus_dir.is_dir():
        return None
    name = filename.strip()
    if not name:
        return None
    for path in corpus_dir.rglob(name):
        if path.is_file():
            return path
    return None


def document_rag_indexed(corpus_dir: Path, filename: str) -> bool:
    """True if filename is selected for RAG (after denylist and edition dedup)."""
    path = find_corpus_file(corpus_dir, filename)
    if path is None:
        return False
    selected = {p.resolve() for p in iter_corpus_source_files(corpus_dir)}
    return path.resolve() in selected


def iter_corpus_source_files(corpus_dir: Path) -> list[Path]:
    if not corpus_dir.is_dir():
        return []

    candidates: list[Path] = []
    for pattern in _SUPPORTED_PATTERNS:
        for path in sorted(corpus_dir.glob(pattern)):
            if not path.is_file():
                continue
            if _path_is_denylisted(path, corpus_dir=corpus_dir):
                log.info("RAG corpus skip (denylist): %s", path.relative_to(corpus_dir).as_posix())
                continue
            candidates.append(path)

    by_family: dict[str, list[Path]] = defaultdict(list)
    for path in candidates:
        by_family[_family_key(path)].append(path)

    kept: list[Path] = []
    for _, group_paths in by_family.items():
        if len(group_paths) == 1:
            kept.append(group_paths[0])
            continue

        years = [_extract_year(p) for p in group_paths]
        if max(years) <= 0:
            kept.extend(group_paths)
            continue

        winner = max(
            group_paths,
            key=lambda p: (
                _extract_year(p),
                1 if "rev" in p.stem.lower() else 0,
                1 if "manual" in p.stem.lower() else 0,
                p.stat().st_mtime_ns,
            ),
        )
        kept.append(winner)
        for path in group_paths:
            if path == winner:
                continue
            log.info(
                "RAG corpus skip (superseded): %s kept=%s",
                path.relative_to(corpus_dir).as_posix(),
                winner.relative_to(corpus_dir).as_posix(),
            )

    return sorted(kept)


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
    for path in iter_corpus_source_files(corpus_dir):
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
