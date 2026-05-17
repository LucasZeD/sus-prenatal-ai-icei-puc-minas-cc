from __future__ import annotations

import json
import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field, field_validator

from clinical_ai import engine, gemini_client, ollama_client, pii
from clinical_ai.config import get_settings
from clinical_ai.prompts import SYSTEM_DIRECT_QUESTION
from clinical_ai.reply_sanitize import sanitize_assistant_visible_reply
from clinical_ai.safe_errors import public_message_from_exception

logging.basicConfig(level=logging.INFO)
log = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    del app
    get_settings.cache_clear()
    try:
        stats = await engine.build_index()
        log.info("clinical-ai index ready: %s", stats)
    except Exception as exc:  # noqa: BLE001
        log.exception("Index build failed at startup (service still up): %s", exc)
    yield


app = FastAPI(title="Clinical AI", version="0.1.0", lifespan=lifespan)


@app.get("/health")
async def health() -> dict[str, Any]:
    s = get_settings()
    ollama = await ollama_client.ollama_health()
    st = engine.index_stats()
    return {
        "status": "ok",
        "ollama": ollama,
        "index": st,
        "ollama_model": s.ollama_model,
        "rag_embedding_model": s.rag_embedding_model,
        "gemini_configured": gemini_client.gemini_configured(),
        "gemini_model": s.gemini_model if gemini_client.gemini_configured() else None,
    }


class RagQueryBody(BaseModel):
    query: str = Field(..., min_length=1, max_length=4000)
    top_k: int | None = Field(default=None, ge=1, le=32)
    expand_query: bool | None = Field(
        default=None,
        description="If set, force LLM query expansion on/off; null uses env RAG_QUERY_EXPAND_ENABLED.",
    )


@app.post("/rag/test/query")
async def rag_test_query(body: RagQueryBody) -> dict[str, Any]:
    q = pii.sanitize_for_model(body.query.strip(), max_fragment_chars=4000)
    if not q:
        raise HTTPException(status_code=400, detail="Query empty after sanitization.")
    outcome = await engine.retrieve(q, k=body.top_k, expand_query=body.expand_query)
    return {
        "query": q,
        "retrieval_query_raw": outcome.retrieval_query_raw,
        "retrieval_query_effective": outcome.retrieval_query_effective,
        "retrieval_expansion": outcome.retrieval_expansion,
        "n_chunks": len(outcome.chunks),
        "chunks": outcome.chunks,
        "rag_timing_ms": outcome.timing_ms,
    }


@app.post("/rag/test/rebuild")
async def rag_test_rebuild(
    force: bool = Query(False, description="Ignora cache SQLite e re-incorpora embeddings"),
) -> dict[str, Any]:
    stats = await engine.build_index(force_rebuild=force)
    return {"ok": True, "stats": stats}


class SanitizeBody(BaseModel):
    input: str = Field(..., min_length=0, max_length=100_000)


@app.post("/mcp/sanitize")
async def mcp_sanitize(body: SanitizeBody) -> dict[str, Any]:
    raw = body.input or ""
    out = pii.sanitize_for_model(raw)
    return {"output": out, "sanitized": out}


@app.post("/sanitize")
async def sanitize_root(body: SanitizeBody) -> dict[str, Any]:
    """Same as /mcp/sanitize; root path for privacyMcpGateway (MCP_SERVER_URL base URL)."""
    return await mcp_sanitize(body)


class DirectQuestionBody(BaseModel):
    question: str = Field(..., min_length=1, max_length=8192)
    gestacao_context: str | dict | None = None
    consulta_escriba_context: str | None = Field(default=None, max_length=20_000)
    top_k: int | None = Field(default=None, ge=1, le=32)
    rag_expand_query: bool | None = Field(
        default=None,
        description="Force LLM expansion before retrieve; null uses env RAG_QUERY_EXPAND_ENABLED.",
    )
    think: bool | None = Field(
        default=None,
        description="Extended reasoning (Ollama think); null uses OLLAMA_THINK from clinical-ai env.",
    )
    llm_provider: str = Field(
        default="ollama",
        description="ollama=modelo local (Ollama); gemini=nuvem; auto=tenta Ollama e cai para Gemini se falhar.",
    )

    @field_validator("llm_provider", mode="before")
    @classmethod
    def _coerce_llm_provider(cls, v: object) -> str:
        if v is None or (isinstance(v, str) and not v.strip()):
            return "ollama"
        s = str(v).strip().lower()
        return s if s in ("ollama", "gemini", "auto") else "ollama"

    @field_validator("gestacao_context", mode="before")
    @classmethod
    def _limit_gestacao_context(cls, v: object) -> object:
        if isinstance(v, str) and len(v) > 20_000:
            return v[:20_000]
        if isinstance(v, dict):
            raw = json.dumps(v, ensure_ascii=False)
            if len(raw) > 25_000:
                raise ValueError("gestacao_context excede o tamanho maximo permitido.")
        return v


def _xml_escape_user_text(s: str) -> str:
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


async def _direct_question_messages_and_context(
    body: DirectQuestionBody,
) -> tuple[list[dict[str, str]], dict[str, Any]]:
    q_raw = body.question.strip()
    q_sanitized = pii.sanitize_for_model(q_raw)
    if not q_sanitized:
        raise HTTPException(status_code=400, detail="Question empty after sanitization.")

    gest = pii.sanitize_optional_block(body.gestacao_context)
    esc = pii.sanitize_optional_block(body.consulta_escriba_context)

    rag_outcome = await engine.retrieve(q_sanitized, k=body.top_k, expand_query=body.rag_expand_query)
    rag_chunks = rag_outcome.chunks
    rag_block = engine.format_context_block(rag_chunks)

    context_parts: list[str] = []
    if gest:
        context_parts.append("### Dados da gestacao (desidentificados)\n\n" + gest)
    if esc:
        context_parts.append("### Notas da consulta / escriba (desidentificados)\n\n" + esc)
    if rag_block:
        context_parts.append(rag_block)

    context_block = "\n\n".join(context_parts).strip()
    if not context_block:
        raise HTTPException(
            status_code=400,
            detail="No context: empty RAG index and no optional blocks. Set RAG_CORPUS_DIR or send gestacao_context.",
        )

    s = get_settings()
    think_eff = body.think if body.think is not None else s.ollama_think

    system_body = f"{SYSTEM_DIRECT_QUESTION}\n\nCONTEXT:\n{context_block}"
    if think_eff:
        system_body += (
            "\n\n[Raciocinio estendido ativo] Seja breve no pensamento interno; "
            "priorize emitir a resposta final visivel ao usuario em portugues sem esgotar o orcamento antes do texto principal."
        )

    user_payload = (
        "<pergunta_do_profissional_saude>\n"
        f"{_xml_escape_user_text(q_sanitized)}\n"
        "</pergunta_do_profissional_saude>"
    )
    messages: list[dict[str, str]] = [
        {"role": "system", "content": system_body},
        {"role": "user", "content": user_payload},
    ]
    # Qwen3.5 "think" shares one num_predict budget between internal reasoning and user-visible text.
    base_pred = max(1, int(s.mcp_chat_max_tokens))
    if think_eff:
        uncapped = max(
            base_pred + max(0, int(s.mcp_chat_think_extra_tokens)),
            max(512, int(s.mcp_chat_think_num_predict_floor)),
        )
        ceiling = max(base_pred + 256, int(s.mcp_chat_think_max_predict))
        num_predict = min(ceiling, uncapped)
    else:
        num_predict = base_pred
    stream_note_pt = (
        f"Think=ON: num_predict={num_predict} (min(teto MCP_CHAT_THINK_MAX_PREDICT, max(base+extra,piso))). "
        "Se `content` vier vazio, suba MCP_CHAT_THINK_MAX_PREDICT / MCP_CHAT_MAX_TOKENS ou desligue Think."
        if think_eff
        else (
            "Think=OFF: a resposta costuma ir direto para `content`. "
            "Com Think=ON, os primeiros chunks podem trazer so `thinking` ate abrir a resposta visivel."
        )
    )
    meta = {
        "sanitized_blocks": {
            "question": q_sanitized,
            "gestacao_context": gest,
            "consulta_escriba_context": esc,
        },
        "rag_chunks": rag_chunks,
        "rag_timing_ms": rag_outcome.timing_ms,
        "rag_retrieval_query_raw": rag_outcome.retrieval_query_raw,
        "rag_retrieval_query_effective": rag_outcome.retrieval_query_effective,
        "rag_retrieval_expansion": rag_outcome.retrieval_expansion,
        "think_enabled": think_eff,
        "n_rag_chunks": len(rag_chunks),
        "context_chars": len(context_block),
        "ollama_model": s.ollama_model,
        "num_predict": num_predict,
        "stream_note_pt": stream_note_pt,
        "llm_provider_requested": body.llm_provider,
        "gemini_configured": gemini_client.gemini_configured(),
    }
    return messages, meta


async def _yield_visible_from_raw_stream(
    raw_stream: AsyncIterator[dict[str, Any]],
) -> AsyncIterator[bytes]:
    raw_content_buf = ""
    emitted_sanitized = ""
    async for raw in raw_stream:
        thinking, content = ollama_client.stream_message_parts(raw)
        content_out: str | None = None
        content_replace = False
        if isinstance(content, str) and content:
            raw_content_buf += content
            san, _ = sanitize_assistant_visible_reply(raw_content_buf)
            if san.startswith(emitted_sanitized):
                delta = san[len(emitted_sanitized) :]
                emitted_sanitized = san
                if delta:
                    content_out = delta
            else:
                emitted_sanitized = san
                content_out = san
                content_replace = True
        out: dict[str, Any] = {
            "type": "ollama",
            "done": bool(raw.get("done")),
            "thinking": thinking,
            "metrics": ollama_client.ollama_response_metrics(raw),
        }
        if content_out is not None:
            out["content"] = content_out
            if content_replace:
                out["content_replace"] = True
        elif content is not None and not isinstance(content, str):
            out["content"] = content
        yield (json.dumps(out, ensure_ascii=False) + "\n").encode("utf-8")


@app.post("/mcp/test/direct-question")
async def mcp_test_direct_question(body: DirectQuestionBody) -> dict[str, Any]:
    messages, meta = await _direct_question_messages_and_context(body)
    data = await ollama_client.chat_completion(messages, max_tokens=int(meta["num_predict"]), think=body.think)
    msg = data.get("message") or {}
    reply_raw = str(msg.get("content") or "")
    reply, _ = sanitize_assistant_visible_reply(reply_raw)
    reply = reply.strip()
    thinking_trace = str(msg.get("thinking") or "").strip() or None

    return {
        "sanitized_blocks": meta["sanitized_blocks"],
        "rag_chunks": meta["rag_chunks"],
        "rag_timing_ms": meta["rag_timing_ms"],
        "think_enabled": meta["think_enabled"],
        "model_reply": reply,
        "thinking_trace": thinking_trace,
        "ollama_metrics": {
            k: data.get(k) for k in ("model", "total_duration", "eval_count", "prompt_eval_count") if k in data
        },
    }


@app.post("/mcp/test/direct-question-stream")
async def mcp_test_direct_question_stream(body: DirectQuestionBody) -> StreamingResponse:
    messages, meta = await _direct_question_messages_and_context(body)
    provider = body.llm_provider if body.llm_provider in ("ollama", "gemini", "auto") else "ollama"

    async def gen_bytes() -> AsyncIterator[bytes]:
        first = {"type": "pipeline", **meta}
        yield (json.dumps(first, ensure_ascii=False) + "\n").encode("utf-8")

        async def stream_ollama() -> AsyncIterator[dict[str, Any]]:
            async for raw in ollama_client.chat_completion_stream(
                messages,
                think=body.think,
                max_tokens=int(meta["num_predict"]),
            ):
                yield raw

        async def stream_gemini() -> AsyncIterator[dict[str, Any]]:
            async for raw in gemini_client.chat_completion_stream_gemini(
                messages,
                max_tokens=int(meta["num_predict"]),
            ):
                yield raw

        async def emit_raw_stream(raw_iter: AsyncIterator[dict[str, Any]]) -> AsyncIterator[bytes]:
            async for line in _yield_visible_from_raw_stream(raw_iter):
                yield line

        try:
            if provider == "gemini":
                if not gemini_client.gemini_configured():
                    err = {
                        "type": "error",
                        "detail": "Gemini nao configurado: defina GEMINI_API_KEY no servico clinical-ai.",
                    }
                    yield (json.dumps(err, ensure_ascii=False) + "\n").encode("utf-8")
                    return
                async for b in emit_raw_stream(stream_gemini()):
                    yield b
            elif provider == "auto":
                try:
                    async for b in emit_raw_stream(stream_ollama()):
                        yield b
                except Exception as ollama_exc:  # noqa: BLE001
                    log.warning("direct-question-stream Ollama failed; trying Gemini: %s", ollama_exc)
                    if not gemini_client.gemini_configured():
                        ollama_msg = public_message_from_exception(ollama_exc)
                        err = {
                            "type": "error",
                            "detail": f"Modelo local indisponivel ({ollama_msg}). Gemini nao configurado; defina GEMINI_API_KEY no clinical-ai.",
                        }
                        yield (json.dumps(err, ensure_ascii=False) + "\n").encode("utf-8")
                        return
                    prefix = {
                        "type": "ollama",
                        "done": False,
                        "thinking": None,
                        "metrics": {},
                        "content": "*Resposta via Gemini (modelo local indisponivel).*\n\n",
                    }
                    yield (json.dumps(prefix, ensure_ascii=False) + "\n").encode("utf-8")
                    async for b in emit_raw_stream(stream_gemini()):
                        yield b
            else:
                async for b in emit_raw_stream(stream_ollama()):
                    yield b
        except Exception as exc:  # noqa: BLE001
            log.exception("direct-question-stream LLM failed")
            err = {"type": "error", "detail": public_message_from_exception(exc)}
            yield (json.dumps(err, ensure_ascii=False) + "\n").encode("utf-8")
            return
        yield (json.dumps({"type": "done"}, ensure_ascii=False) + "\n").encode("utf-8")

    return StreamingResponse(
        gen_bytes(),
        media_type="application/x-ndjson; charset=utf-8",
        headers={"Cache-Control": "no-store"},
    )
