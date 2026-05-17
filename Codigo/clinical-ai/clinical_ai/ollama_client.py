from __future__ import annotations

import json
import logging
from collections.abc import AsyncIterator
from typing import Any

import httpx

from clinical_ai.config import get_settings

log = logging.getLogger(__name__)

_OLLAMA_METRIC_KEYS: tuple[str, ...] = (
    "model",
    "created_at",
    "total_duration",
    "load_duration",
    "prompt_eval_count",
    "prompt_eval_duration",
    "eval_count",
    "eval_duration",
)


def ollama_response_metrics(payload: dict[str, Any]) -> dict[str, Any]:
    """Subset of Ollama JSON fields exposed as metrics (stream line or final response)."""
    return {k: payload[k] for k in _OLLAMA_METRIC_KEYS if k in payload and payload[k] is not None}


def _effective_think(think: bool | None) -> bool:
    s = get_settings()
    return s.ollama_think if think is None else think


def stream_message_parts(raw: dict[str, Any]) -> tuple[str | None, str | None]:
    """Extrai thinking/content de uma linha JSON do stream POST /api/chat (Ollama)."""
    msg = raw.get("message")
    if not isinstance(msg, dict):
        msg = {}
    thinking = msg.get("thinking")
    if thinking is None and "thinking" in raw:
        thinking = raw.get("thinking")
    content = msg.get("content")
    if content is None:
        content = raw.get("content")
    return (
        thinking if isinstance(thinking, str) or thinking is None else str(thinking),
        content if isinstance(content, str) or content is None else str(content),
    )


def _message_chars(messages: list[dict[str, Any]]) -> int:
    return sum(len(str(m.get("content", ""))) for m in messages)


async def embed_text(prompt: str) -> list[float]:
    s = get_settings()
    url = f"{s.ollama_base_url.rstrip('/')}/api/embeddings"
    payload = {"model": s.rag_embedding_model, "prompt": prompt[: s.rag_embed_max_chars]}
    async with httpx.AsyncClient(timeout=min(s.ollama_timeout_s, 120.0)) as client:
        r = await client.post(url, json=payload)
        r.raise_for_status()
        data = r.json()
    emb = data.get("embedding")
    if not isinstance(emb, list):
        raise ValueError("Ollama returned no embedding list")
    return [float(x) for x in emb]


async def try_embed(prompt: str) -> list[float] | None:
    try:
        return await embed_text(prompt)
    except Exception as exc:  # noqa: BLE001
        log.debug("Embedding failed: %s", exc)
        return None


def cosine_sim(a: list[float], b: list[float]) -> float:
    if len(a) != len(b) or not a:
        return 0.0
    dot = sum(x * y for x, y in zip(a, b, strict=True))
    na = sum(x * x for x in a) ** 0.5
    nb = sum(y * y for y in b) ** 0.5
    if na == 0 or nb == 0:
        return 0.0
    return dot / (na * nb)


async def chat_completion(
    messages: list[dict[str, Any]],
    *,
    max_tokens: int | None = None,
    think: bool | None = None,
) -> dict[str, Any]:
    s = get_settings()
    eff = _effective_think(think)
    payload: dict[str, Any] = {
        "model": s.ollama_model,
        "messages": messages,
        "stream": False,
        "think": eff,
    }
    if max_tokens is not None:
        payload["options"] = {"num_predict": max_tokens}

    url = f"{s.ollama_base_url.rstrip('/')}/api/chat"
    log.info(
        "ollama POST /api/chat (non-stream) model=%s think=%s messages=%d ~chars=%d",
        s.ollama_model,
        eff,
        len(messages),
        _message_chars(messages),
    )
    async with httpx.AsyncClient(timeout=s.ollama_timeout_s) as client:
        r = await client.post(url, json=payload)
        r.raise_for_status()
        try:
            return r.json()
        except json.JSONDecodeError as e:
            raise RuntimeError(f"ollama_invalid_json: {e}") from e


async def chat_completion_stream(
    messages: list[dict[str, Any]],
    *,
    think: bool | None = None,
    max_tokens: int | None = None,
) -> AsyncIterator[dict[str, Any]]:
    s = get_settings()
    eff = _effective_think(think)
    payload: dict[str, Any] = {
        "model": s.ollama_model,
        "messages": messages,
        "stream": True,
        "think": eff,
    }
    if max_tokens is not None:
        payload["options"] = {"num_predict": max_tokens}
    url = f"{s.ollama_base_url.rstrip('/')}/api/chat"
    log.info(
        "ollama POST /api/chat (stream) model=%s think=%s messages=%d ~chars=%d",
        s.ollama_model,
        eff,
        len(messages),
        _message_chars(messages),
    )
    n = 0
    async with httpx.AsyncClient(timeout=s.ollama_timeout_s) as client:
        async with client.stream("POST", url, json=payload) as response:
            response.raise_for_status()
            async for line in response.aiter_lines():
                line = (line or "").strip()
                if not line:
                    continue
                try:
                    raw = json.loads(line)
                except json.JSONDecodeError:
                    log.debug("ollama stream skip non-json: %r", line[:200])
                    continue
                n += 1
                if n == 1:
                    msg0 = raw.get("message")
                    log.info(
                        "ollama stream chunk#1 keys=%s msg_keys=%s",
                        list(raw.keys()),
                        list(msg0.keys()) if isinstance(msg0, dict) else None,
                    )
                yield raw
    log.info("ollama stream finished chunks=%d", n)


async def expand_for_rag_retrieval(user_question: str) -> str:
    """
    Calls the chat model (not the embedding model) to extract search-oriented keywords / short phrases.
    Failures should be handled by the caller (retrieve falls back to the original query).
    """
    s = get_settings()
    q = (user_question or "").strip()
    if not q:
        return ""
    messages: list[dict[str, Any]] = [
        {
            "role": "system",
            "content": (
                "Extrai apenas termos e expressoes uteis para busca em manuais e protocolos de saude da mulher, "
                "pre-natal e SUS (Brasil). Nao responda a pergunta clinica do usuario; nao diagnosticar nem prescrever. "
                "Sem markdown. Portugues do Brasil. Responda em no maximo 2 frases curtas ou lista separada por virgulas."
            ),
        },
        {
            "role": "user",
            "content": f"Pergunta do profissional:\n\n{q[:3800]}\n\nTermos e conceitos para busca nos documentos:",
        },
    ]
    data = await chat_completion(messages, max_tokens=max(64, min(512, int(s.rag_query_expand_max_tokens))), think=False)
    msg = data.get("message") or {}
    raw = msg.get("content")
    if not isinstance(raw, str):
        return ""
    return raw.strip()


async def ollama_health() -> dict[str, Any]:
    s = get_settings()
    url = f"{s.ollama_base_url.rstrip('/')}/api/tags"
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            r = await client.get(url)
            r.raise_for_status()
            return {"ok": True, "status": r.status_code}
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "error": str(exc)}
