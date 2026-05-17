"""SQLite persistence for RAG chunks + embeddings (skip re-embedding on each process start)."""

from __future__ import annotations

import hashlib
import json
import logging
import sqlite3
import struct
import time
from pathlib import Path
from typing import Any

log = logging.getLogger(__name__)

SCHEMA_VERSION = "2"

_CORPUS_PATTERNS: tuple[str, ...] = ("*.jsonl", "*.md", "*.txt", "*.pdf", "*.docx")


def corpus_fingerprint(corpus_dir: Path) -> str:
    """Stable hash of files under corpus_dir (relative path + mtime_ns + size)."""
    base = corpus_dir.resolve()
    if not base.is_dir():
        return ""

    h = hashlib.sha256()
    paths: set[Path] = set()
    for pattern in _CORPUS_PATTERNS:
        for path in base.rglob(pattern):
            if not path.is_file():
                continue
            if ".git" in path.parts:
                continue
            if path.name.lower() == "readme.md":
                continue
            paths.add(path)

    for path in sorted(paths, key=lambda p: p.relative_to(base).as_posix()):
        try:
            st = path.stat()
        except OSError:
            continue
        rel = path.relative_to(base).as_posix()
        h.update(rel.encode("utf-8"))
        h.update(b"\x00")
        h.update(str(st.st_mtime_ns).encode("ascii"))
        h.update(b"\x00")
        h.update(str(st.st_size).encode("ascii"))
        h.update(b"\n")

    return h.hexdigest()


def pack_embedding(vec: list[float]) -> bytes:
    dim = len(vec)
    header = struct.pack("!I", dim)
    return header + struct.pack(f"{dim}f", *vec)


def unpack_embedding(blob: bytes) -> list[float] | None:
    if len(blob) < 4:
        return None
    dim = struct.unpack("!I", blob[:4])[0]
    need = 4 + dim * 4
    if len(blob) != need:
        log.warning("RAG store: embedding blob size mismatch dim=%s len=%s", dim, len(blob))
        return None
    return list(struct.unpack(f"{dim}f", blob[4:]))


def _connect(db_path: Path) -> sqlite3.Connection:
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(db_path), timeout=60)
    conn.execute("PRAGMA journal_mode=WAL;")
    conn.execute("PRAGMA synchronous=NORMAL;")
    return conn


def _init_schema(conn: sqlite3.Cursor) -> None:
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS rag_meta (
            key TEXT PRIMARY KEY NOT NULL,
            value TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS rag_chunks (
            sequence INTEGER PRIMARY KEY NOT NULL,
            chunk_id TEXT NOT NULL UNIQUE,
            title TEXT NOT NULL,
            text TEXT NOT NULL,
            meta_json TEXT NOT NULL,
            embedding_blob BLOB,
            ordinal_date INTEGER NOT NULL DEFAULT 0
        );
        """
    )


def persist_index(
    db_path: Path,
    *,
    corpus_fingerprint_value: str,
    embedding_model: str,
    chunk_max_chars: int,
    chunk_overlap: int,
    index_mode: str,
    n_source_documents: int,
    chunks: list[dict[str, Any]],
    vectors: list[list[float]],
    ordinal_dates: list[int],
    timings_ms: dict[str, float] | None = None,
) -> float:
    """Write full index (replaces prior). embeddings 1:1 with chunks when index_mode==embedding."""
    t0 = time.perf_counter()
    db_path.parent.mkdir(parents=True, exist_ok=True)
    with _connect(db_path) as cx:
        cur = cx.cursor()
        _init_schema(cur)
        cur.execute("DELETE FROM rag_chunks")
        cur.execute("DELETE FROM rag_meta")

        inserts: list[tuple[Any, ...]] = []
        for seq, row in enumerate(chunks):
            meta_json = json.dumps(row.get("meta") or {}, ensure_ascii=False)
            blob: bytes | None = None
            if index_mode == "embedding" and seq < len(vectors):
                blob = pack_embedding(vectors[seq])
            ordinal_date = int(ordinal_dates[seq]) if seq < len(ordinal_dates) else 0
            cid = str(row.get("id", f"chunk-{seq}"))
            inserts.append(
                (
                    seq,
                    cid,
                    str(row.get("title", cid)),
                    str(row.get("text", "")),
                    meta_json,
                    blob,
                    ordinal_date,
                )
            )

        cur.executemany(
            """
            INSERT INTO rag_chunks(sequence, chunk_id, title, text, meta_json, embedding_blob, ordinal_date)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            inserts,
        )

        meta_pairs = [
            ("schema_version", SCHEMA_VERSION),
            ("corpus_fingerprint", corpus_fingerprint_value),
            ("embedding_model", embedding_model),
            ("rag_chunk_max_chars", str(chunk_max_chars)),
            ("rag_chunk_overlap", str(chunk_overlap)),
            ("index_mode", index_mode),
            ("n_chunks", str(len(chunks))),
            ("n_source_documents", str(int(n_source_documents))),
            ("persisted_unix", str(int(time.time()))),
        ]
        if timings_ms:
            meta_pairs.append(("persist_build_json", json.dumps(timings_ms, ensure_ascii=False)))
        cur.executemany(
            "INSERT INTO rag_meta(key, value) VALUES (?, ?)",
            meta_pairs,
        )
        cx.commit()

    return (time.perf_counter() - t0) * 1000.0


def load_index_match(
    db_path: Path,
    *,
    expect_fingerprint: str,
    embedding_model: str,
    chunk_max_chars: int,
    chunk_overlap: int,
) -> tuple[list[dict[str, Any]], list[list[float]], str, dict[str, Any], list[int]] | None:
    """
    Carrega desde SQLite quando fingerprint e parametros combinam com o esperado.

    Devolve (chunks, vectors, index_mode, store_meta_snapshot, ordinal_dates) ou None.
    """
    if expect_fingerprint.strip() == "" or not db_path.is_file():
        return None

    try:
        with _connect(db_path) as cx:
            cur = cx.cursor()
            _init_schema(cur)
            kv = dict(cur.execute("SELECT key, value FROM rag_meta").fetchall())

        if kv.get("schema_version") != SCHEMA_VERSION:
            return None
        if kv.get("corpus_fingerprint") != expect_fingerprint:
            return None
        if kv.get("embedding_model") != embedding_model:
            return None
        if int(kv.get("rag_chunk_max_chars", -1)) != chunk_max_chars:
            return None
        if int(kv.get("rag_chunk_overlap", -1)) != chunk_overlap:
            return None

        index_mode = str(kv.get("index_mode", "lexical"))
        n_expect = int(kv.get("n_chunks", 0))

        with _connect(db_path) as cx:
            rows = cx.execute(
                "SELECT chunk_id, title, text, meta_json, embedding_blob, ordinal_date FROM rag_chunks ORDER BY sequence"
            ).fetchall()

        if n_expect and len(rows) != n_expect:
            log.warning("RAG store: n_chunks mismatch expect=%s got=%s", n_expect, len(rows))
            return None

        chunks: list[dict[str, Any]] = []
        vectors: list[list[float]] = []
        ordinal_dates: list[int] = []

        for chunk_id, title, text, meta_json, emb_blob, ordinal_date in rows:
            meta: dict[str, Any] = {}
            try:
                meta = json.loads(meta_json or "{}")
                if not isinstance(meta, dict):
                    meta = {}
            except json.JSONDecodeError:
                meta = {}
            chunks.append({"id": chunk_id, "title": title, "text": text, "meta": meta})
            ordinal_dates.append(int(ordinal_date))

            if index_mode == "embedding" and emb_blob is not None:
                vec = unpack_embedding(bytes(emb_blob))
                if vec is None:
                    log.warning("RAG store: bad embedding for %s; reload from corpus.", chunk_id)
                    return None
                vectors.append(vec)
            elif index_mode == "embedding":
                log.warning("RAG store: missing embedding_blob for embedding mode.")
                return None

        snapshot = {
            "store_path": str(db_path),
            "loaded_from_sqlite": True,
            **kv,
        }
        pb = kv.get("persist_build_json")
        if isinstance(pb, str) and pb.strip():
            try:
                snapshot["last_persist_build_ms"] = json.loads(pb)
            except json.JSONDecodeError:
                pass

        return chunks, vectors if index_mode == "embedding" else [], index_mode, snapshot, ordinal_dates
    except sqlite3.Error as exc:
        log.warning("RAG store load failed: %s", exc)
        return None
