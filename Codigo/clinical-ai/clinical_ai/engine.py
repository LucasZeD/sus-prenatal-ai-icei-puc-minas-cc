from __future__ import annotations

import asyncio
import json
import logging
import re
import time
from dataclasses import dataclass
from datetime import date, datetime
from pathlib import Path
from typing import Any

from clinical_ai.boilerplate import should_skip_rag_chunk
from clinical_ai.chunking import chunk_text
from clinical_ai.config import get_settings
from clinical_ai.corpus import gather_documents
from clinical_ai import ollama_client
from clinical_ai.rerank import rerank_candidate_indices
from clinical_ai import vector_store

log = logging.getLogger(__name__)

_PACKAGE_ROOT = Path(__file__).resolve().parent.parent

_chunks: list[dict[str, Any]] = []
_vectors: list[list[float]] = []
_index_mode: str = "lexical"
_chunk_ordinal_dates: list[int] = []
_date_span: int = 1
_ingest_snapshot: dict[str, Any] = {}
_last_build_timings_ms: dict[str, Any] = {}
_index_lock = asyncio.Lock()


@dataclass(frozen=True)
class RagRetrieveOutcome:
    chunks: list[dict[str, Any]]
    timing_ms: dict[str, Any]
    retrieval_query_raw: str = ""
    retrieval_query_effective: str = ""
    retrieval_expansion: str | None = None


def _default_corpus_dir() -> Path:
    return _PACKAGE_ROOT / "corpus" / "CartilhasSUS"


def resolve_corpus_dir_for_settings() -> Path:
    s = get_settings()
    raw = s.rag_corpus_dir.strip()
    return Path(raw).resolve() if raw else _default_corpus_dir().resolve()


def _resolve_vector_store_path() -> Path:
    s = get_settings()
    raw = s.rag_vector_store_path.strip()
    if raw:
        p = Path(raw)
        return p.resolve() if p.is_absolute() else (_PACKAGE_ROOT / p).resolve()
    return (_PACKAGE_ROOT / "data" / "rag_store.sqlite").resolve()


def _resolve_export_jsonl_path() -> Path | None:
    s = get_settings()
    raw = s.rag_export_chunks_jsonl.strip()
    if not raw:
        return None
    p = Path(raw)
    return p.resolve() if p.is_absolute() else (_PACKAGE_ROOT / p).resolve()


def _export_chunks_jsonl_sync(path: Path, chunks: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        for row in chunks:
            rec = {
                "id": row.get("id"),
                "title": row.get("title"),
                "text": row.get("text"),
                "meta": row.get("meta") or {},
            }
            f.write(json.dumps(rec, ensure_ascii=False) + "\n")


def _tokenize(q: str) -> set[str]:
    return {t.lower() for t in re.findall(r"\w+", q, re.UNICODE) if len(t) > 2}


def _lexical_score(query: str, chunk_text_value: str) -> float:
    qt = _tokenize(query)
    if not qt:
        return 0.0
    ct = _tokenize(chunk_text_value)
    return len(qt & ct) / max(len(qt), 1)


def _lexical_overlap_chunks(i: int, j: int) -> float:
    ta = _tokenize(_chunks[i]["text"])
    tb = _tokenize(_chunks[j]["text"])
    if not ta or not tb:
        return 0.0
    u = ta | tb
    return len(ta & tb) / len(u) if u else 0.0


def _embedding_redundancy_sim(i: int, j: int) -> float:
    sim = ollama_client.cosine_sim(_vectors[i], _vectors[j])
    return max(0.0, float(sim))


def _parse_meta_date(meta: dict[str, Any]) -> int | None:
    for key in ("effective_date", "updated_at", "document_date", "published_at"):
        v = meta.get(key)
        if not isinstance(v, str):
            continue
        s = v.strip()
        if not s:
            continue
        try:
            if "T" in s:
                return datetime.fromisoformat(s.replace("Z", "+00:00")).date().toordinal()
            return date.fromisoformat(s[:10]).toordinal()
        except (ValueError, TypeError):
            continue
    mtime = meta.get("file_mtime_ns")
    if isinstance(mtime, (int, float)) and mtime > 0:
        return int(float(mtime) // (86400 * 1e9))
    return None


def _chunk_ordinal_for_row(meta: dict[str, Any]) -> int:
    d = _parse_meta_date(meta)
    if d is not None:
        return d
    return date.min.toordinal()


def prepare_retrieval_query(query: str) -> str:
    s = get_settings()
    q = (query or "").strip()
    if not q:
        return q
    if len(q) > s.rag_query_max_chars:
        return q[: s.rag_query_max_chars]
    return q


async def _resolve_effective_retrieval_query(
    query: str, *, expand_query: bool | None
) -> tuple[str, str, str | None, float]:
    """
    Returns (raw_prepared, effective_for_embedding, expansion_text_or_none, expand_ms).
    When expansion is off or fails, effective == raw.
    """
    s = get_settings()
    raw = prepare_retrieval_query(query)
    use_llm = (expand_query if expand_query is not None else s.rag_query_expand_enabled) and bool(raw.strip())
    if not use_llm:
        return raw, raw, None, 0.0
    t0 = time.perf_counter()
    try:
        exp_raw = await ollama_client.expand_for_rag_retrieval(raw)
    except Exception as exc:  # noqa: BLE001
        log.warning("RAG query expansion (LLM) failed; using prepared query only: %s", exc)
        return raw, raw, None, round((time.perf_counter() - t0) * 1000.0, 3)
    expand_ms = round((time.perf_counter() - t0) * 1000.0, 3)
    exp = (exp_raw or "").strip()
    cap = max(0, int(s.rag_query_expand_max_out_chars))
    if cap and len(exp) > cap:
        exp = exp[:cap].rstrip()
    if not exp:
        return raw, raw, None, expand_ms
    merged = f"{raw}\n\n{exp}"
    eff = prepare_retrieval_query(merged)
    return raw, eff, exp, expand_ms


def _finalize_chunk_ordinals(flat: list[dict[str, Any]]) -> list[int]:
    return [_chunk_ordinal_for_row(c.get("meta") or {}) for c in flat]


async def build_index(force_rebuild: bool = False) -> dict[str, Any]:
    """Ingest corpus, embed (optional cache hit on SQLite), populate in-memory index."""
    global _chunks, _vectors, _index_mode, _chunk_ordinal_dates, _date_span, _ingest_snapshot, _last_build_timings_ms

    async with _index_lock:
        t_build0 = time.perf_counter()
        s = get_settings()
        corpus = resolve_corpus_dir_for_settings()
        fp = vector_store.corpus_fingerprint(corpus)
        store_path = _resolve_vector_store_path()

        timings: dict[str, float] = {}

        if not force_rebuild and not s.rag_disable_vector_store and fp:
            t0 = time.perf_counter()
            loaded = await asyncio.to_thread(
                vector_store.load_index_match,
                store_path,
                expect_fingerprint=fp,
                embedding_model=s.rag_embedding_model,
                chunk_max_chars=s.rag_chunk_max_chars,
                chunk_overlap=s.rag_chunk_overlap,
            )
            timings["sqlite_load_ms"] = round((time.perf_counter() - t0) * 1000.0, 3)
            if loaded is not None:
                ch, vecs, mode, snap, ords = loaded
                _chunks = ch
                _vectors = vecs
                _index_mode = mode
                _chunk_ordinal_dates = ords
                mn = min(_chunk_ordinal_dates) if _chunk_ordinal_dates else date.min.toordinal()
                mx = max(_chunk_ordinal_dates) if _chunk_ordinal_dates else mn
                _date_span = max(mx - mn, 1)
                n_docs = 0
                try:
                    n_docs = int(snap.get("n_source_documents", 0))
                except (TypeError, ValueError):
                    n_docs = 0
                _ingest_snapshot = {
                    "n_source_documents": n_docs,
                    "n_chunks": len(_chunks),
                    "corpus_dir": str(corpus),
                    "corpus_fingerprint": fp,
                    "vector_store_path": str(store_path),
                    "loaded_from_vector_store": True,
                }
                _last_build_timings_ms = {
                    **timings,
                    "build_total_ms": round((time.perf_counter() - t_build0) * 1000.0, 3),
                    "cache_hit": True,
                }
                log.info(
                    "RAG: loaded %s chunks from SQLite (mode=%s fingerprint_prefix=%s)",
                    len(_chunks),
                    _index_mode,
                    fp[:12],
                )
                return {
                    "n_chunks": len(_chunks),
                    "index_mode": _index_mode,
                    "corpus_dir": str(corpus),
                    "embedding_model": s.rag_embedding_model,
                    "vector_store_path": str(store_path),
                    "corpus_fingerprint": fp,
                    "timings_ms": _last_build_timings_ms,
                    **_ingest_snapshot,
                }

        t0 = time.perf_counter()
        docs = gather_documents(corpus)
        timings["gather_documents_ms"] = round((time.perf_counter() - t0) * 1000.0, 3)

        flat: list[dict[str, Any]] = []
        t0 = time.perf_counter()
        for doc in docs:
            pieces = chunk_text(doc["text"], max_chars=s.rag_chunk_max_chars, overlap=s.rag_chunk_overlap)
            if not pieces:
                continue
            for i, piece in enumerate(pieces):
                if should_skip_rag_chunk(piece):
                    continue
                cid = doc["id"] if len(pieces) == 1 else f"{doc['id']}#p{i}"
                flat.append(
                    {
                        "id": cid,
                        "title": doc["title"],
                        "text": piece,
                        "meta": doc.get("meta") or {},
                    }
                )
        timings["chunk_text_ms"] = round((time.perf_counter() - t0) * 1000.0, 3)

        ordinal_dates = _finalize_chunk_ordinals(flat)

        vectors: list[list[float] | None] = []
        t0 = time.perf_counter()
        for row in flat:
            tslice = row["text"][: s.rag_embed_max_chars]
            vectors.append(await ollama_client.try_embed(tslice))
        timings["embed_all_ms"] = round((time.perf_counter() - t0) * 1000.0, 3)

        if vectors and all(v is not None for v in vectors):
            _index_mode = "embedding"
            _vectors = [v for v in vectors if v is not None]
            log.info("RAG: %d chunks, mode=embedding model=%s", len(flat), s.rag_embedding_model)
        else:
            _index_mode = "lexical"
            _vectors = []
            log.warning(
                "RAG: %d chunks, mode=lexical; run `ollama pull %s` for embeddings",
                len(flat),
                s.rag_embedding_model,
            )

        _chunks = flat
        _chunk_ordinal_dates = ordinal_dates
        mn = min(_chunk_ordinal_dates) if _chunk_ordinal_dates else date.min.toordinal()
        mx = max(_chunk_ordinal_dates) if _chunk_ordinal_dates else mn
        _date_span = max(mx - mn, 1)

        _ingest_snapshot = {
            "n_source_documents": len(docs),
            "n_chunks": len(_chunks),
            "corpus_dir": str(corpus),
            "corpus_fingerprint": fp,
            "vector_store_path": str(store_path),
            "loaded_from_vector_store": False,
        }

        persist_ms = 0.0
        if not s.rag_disable_vector_store and fp and _chunks:
            t0 = time.perf_counter()
            persist_ms = await asyncio.to_thread(
                vector_store.persist_index,
                store_path,
                corpus_fingerprint_value=fp,
                embedding_model=s.rag_embedding_model,
                chunk_max_chars=s.rag_chunk_max_chars,
                chunk_overlap=s.rag_chunk_overlap,
                index_mode=_index_mode,
                n_source_documents=len(docs),
                chunks=_chunks,
                vectors=_vectors,
                ordinal_dates=_chunk_ordinal_dates,
                timings_ms=timings,
            )
            timings["sqlite_persist_ms"] = round(float(persist_ms), 3)

        export_path = _resolve_export_jsonl_path()
        if export_path is not None and _chunks:
            t_ex0 = time.perf_counter()
            await asyncio.to_thread(_export_chunks_jsonl_sync, export_path, _chunks)
            timings["export_chunks_jsonl_ms"] = round((time.perf_counter() - t_ex0) * 1000.0, 3)

        _last_build_timings_ms = {
            **timings,
            "build_total_ms": round((time.perf_counter() - t_build0) * 1000.0, 3),
            "cache_hit": False,
        }

        return {
            "n_chunks": len(_chunks),
            "index_mode": _index_mode,
            "corpus_dir": str(corpus),
            "embedding_model": s.rag_embedding_model,
            "vector_store_path": str(store_path),
            "corpus_fingerprint": fp,
            "timings_ms": _last_build_timings_ms,
            **_ingest_snapshot,
        }


def _source_label(meta: dict[str, Any]) -> str | None:
    raw = meta.get("source_path")
    if not raw:
        return None
    try:
        return Path(str(raw)).name
    except (OSError, TypeError, ValueError):
        return None


def format_bibliographic_citation(meta: dict[str, Any], source_filename: str | None) -> str:
    """Short citation: filename (document_title, author, year); omits missing pieces.

    Optional meta keys: document_title, author, publication_year or year.
    """
    fname = (source_filename or "").strip() or "documento_local"
    doc_title = ""
    dt = meta.get("document_title")
    if isinstance(dt, str) and dt.strip():
        doc_title = dt.strip()
    author = ""
    auth = meta.get("author")
    if isinstance(auth, str) and auth.strip():
        author = auth.strip()
    year = ""
    yr = meta.get("publication_year", meta.get("year"))
    if isinstance(yr, int):
        year = str(yr)
    elif isinstance(yr, str) and yr.strip():
        year = yr.strip()

    inner: list[str] = []
    if doc_title:
        inner.append(doc_title)
    if author:
        inner.append(author)
    if year:
        inner.append(year)
    if not inner:
        return fname
    return f"{fname} ({', '.join(inner)})"


def _source_citation(row: dict[str, Any], meta: dict[str, Any]) -> str:
    doc_id = str(row.get("id", "")).strip()
    base = (_source_label(meta) or "").strip() or "corpus"
    coll_raw = meta.get("collection")
    coll = coll_raw.strip() if isinstance(coll_raw, str) else ""
    bits: list[str] = []
    if doc_id:
        bits.append(doc_id)
    bits.append(base)
    if coll:
        bits.append(coll)
    return " | ".join(bits)


def _recency_multiplier(chunk_index: int) -> float:
    s = get_settings()
    if s.rag_recency_weight <= 0 or not _chunk_ordinal_dates:
        return 1.0
    ord_i = _chunk_ordinal_dates[chunk_index]
    mn = min(_chunk_ordinal_dates)
    norm = (ord_i - mn) / float(_date_span)
    return 1.0 + s.rag_recency_weight * norm


async def retrieve(query: str, k: int | None = None, *, expand_query: bool | None = None) -> RagRetrieveOutcome:
    if not _chunks:
        await build_index()
    if not _chunks:
        raw_q = prepare_retrieval_query(query)
        return RagRetrieveOutcome(
            chunks=[],
            timing_ms={
                "retrieve_total_ms": 0.0,
                "index_mode": _index_mode,
                "note": "empty_index",
                "query_expand_ms": 0.0,
                "rerank": "mmr" if get_settings().rag_rerank_enabled else "disabled",
            },
            retrieval_query_raw=raw_q,
            retrieval_query_effective=raw_q,
            retrieval_expansion=None,
        )

    s = get_settings()
    raw_q, eff_q, expansion, expand_ms = await _resolve_effective_retrieval_query(query, expand_query=expand_query)
    query_for_scores = eff_q
    k_eff = max(1, k if k is not None else s.rag_max_chunks)

    t_all0 = time.perf_counter()
    t_emb0 = time.perf_counter()
    indexed_scores: list[tuple[int, float]] = []
    if _index_mode == "embedding" and _vectors:
        qv = await ollama_client.try_embed(query_for_scores[: s.rag_embed_max_chars])
        embed_query_ms = round((time.perf_counter() - t_emb0) * 1000.0, 3)
        if qv is not None:
            for i, vec in enumerate(_vectors):
                base = ollama_client.cosine_sim(qv, vec)
                indexed_scores.append((i, base * _recency_multiplier(i)))
        else:
            for i, row in enumerate(_chunks):
                indexed_scores.append((i, _lexical_score(query_for_scores, row["text"]) * _recency_multiplier(i)))
    else:
        embed_query_ms = 0.0
        for i, row in enumerate(_chunks):
            indexed_scores.append((i, _lexical_score(query_for_scores, row["text"]) * _recency_multiplier(i)))

    t_score0 = time.perf_counter()
    indexed_scores.sort(key=lambda x: x[1], reverse=True)
    pool_n = max(k_eff, min(s.rag_rerank_pool_size, len(indexed_scores)))
    pool = indexed_scores[:pool_n]
    score_sort_pool_ms = round((time.perf_counter() - t_score0) * 1000.0, 3)

    if _index_mode == "embedding" and _vectors and pool:
        pair_sim = _embedding_redundancy_sim
    else:

        def pair_sim(a: int, b: int) -> float:
            return _lexical_overlap_chunks(a, b)

    t_rr0 = time.perf_counter()
    chosen_scored = rerank_candidate_indices(
        pool,
        pair_similarity=pair_sim,
        out_k=k_eff,
        rerank_enabled=s.rag_rerank_enabled,
        mmr_lambda=s.rag_mmr_lambda,
    )
    rerank_mmr_ms = round((time.perf_counter() - t_rr0) * 1000.0, 3)
    rel = {idx: sc for idx, sc in indexed_scores}

    t_as0 = time.perf_counter()
    out: list[dict[str, Any]] = []
    for rank, (i, marginal) in enumerate(chosen_scored, start=1):
        row = _chunks[i]
        s_rel = rel[i]
        text = str(row.get("text", ""))[: s.rag_max_chars_per_chunk]
        meta = row.get("meta") or {}
        src_name = _source_label(meta)
        cite_line = format_bibliographic_citation(meta, src_name)
        out.append(
            {
                "id": row.get("id", "unknown"),
                "title": row.get("title", ""),
                "text": text,
                "score": round(float(s_rel), 4),
                "retrieval_rank": rank,
                "mmr_marginal": round(float(marginal), 4),
                "meta": meta,
                "source_file": src_name,
                "source_citation": _source_citation(row, meta),
                "citation_line": cite_line,
                "doc_ordinal": _chunk_ordinal_dates[i] if i < len(_chunk_ordinal_dates) else None,
            }
        )
    assemble_ms = round((time.perf_counter() - t_as0) * 1000.0, 3)
    retrieve_total_ms = round((time.perf_counter() - t_all0) * 1000.0, 3)

    timing_ms = {
        "retrieve_total_ms": retrieve_total_ms,
        "query_expand_ms": expand_ms,
        "embed_query_ms": embed_query_ms,
        "score_sort_pool_ms": score_sort_pool_ms,
        "rerank_mmr_ms": rerank_mmr_ms,
        "assemble_output_ms": assemble_ms,
        "index_mode": _index_mode,
        "rerank": "mmr" if s.rag_rerank_enabled else "head_only",
        "mmr_lambda": s.rag_mmr_lambda,
        "rerank_pool_size": s.rag_rerank_pool_size,
        "n_index_chunks": len(_chunks),
        "n_pool": len(pool),
        "top_k": k_eff,
        "embedding_model": s.rag_embedding_model,
        "query_expansion_used": bool(expansion),
    }

    return RagRetrieveOutcome(
        chunks=out,
        timing_ms=timing_ms,
        retrieval_query_raw=raw_q,
        retrieval_query_effective=eff_q,
        retrieval_expansion=expansion,
    )


def format_context_block(chunks: list[dict[str, Any]]) -> str:
    if not chunks:
        return ""
    s = get_settings()
    mmr_note = (
        f"Recuperacao: ate **{s.rag_max_chunks}** excertos (MMR lambda={s.rag_mmr_lambda}); ordem 1 = mais prioritario.\n"
        if s.rag_rerank_enabled
        else f"Recuperacao: ate **{s.rag_max_chunks}** excertos por relevancia.\n"
    )
    header = (
        "### Contexto recuperado (base documental local)\n"
        + mmr_note
        + "Use apenas estes trechos para afirmacoes; cite [n]. Se nao houver cobertura, diga explicitamente.\n\n---\n\n"
    )
    parts: list[str] = []
    for i, c in enumerate(chunks):
        n = i + 1
        meta_raw = c.get("meta") or {}
        meta = meta_raw if isinstance(meta_raw, dict) else {}
        src = c.get("source_file") or _source_label(meta)
        cite_line = str(c.get("citation_line") or "").strip()
        if not cite_line:
            cite_line = format_bibliographic_citation(meta, str(src) if src else None)
        parts.append(f"### [{n}] **{cite_line}**\n\n{c.get('text', '')}\n")
    return header + "\n---\n\n".join(parts)


def index_stats() -> dict[str, Any]:
    s = get_settings()
    corpus = resolve_corpus_dir_for_settings()
    return {
        "n_chunks": len(_chunks),
        "index_mode": _index_mode,
        "embedding_model": s.rag_embedding_model,
        "rag_corpus_dir": s.rag_corpus_dir,
        "effective_corpus_dir": str(corpus),
        "vector_store_path": str(_resolve_vector_store_path()),
        "disable_vector_store": s.rag_disable_vector_store,
        "last_build_timings_ms": _last_build_timings_ms,
        **_ingest_snapshot,
    }
