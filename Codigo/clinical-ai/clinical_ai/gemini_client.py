from __future__ import annotations

import json
import logging
from collections.abc import AsyncIterator
from typing import Any

import httpx

from clinical_ai.config import get_settings

log = logging.getLogger(__name__)


def _split_system_user(messages: list[dict[str, Any]]) -> tuple[str, str]:
    system_parts: list[str] = []
    user_parts: list[str] = []
    for m in messages:
        role = str(m.get("role") or "")
        content = str(m.get("content") or "")
        if role == "system":
            system_parts.append(content)
        elif role == "user":
            user_parts.append(content)
        else:
            user_parts.append(f"[{role}]\n{content}")
    return "\n\n".join(system_parts).strip(), "\n\n".join(user_parts).strip()


def _extract_text_from_chunk(data: dict[str, Any]) -> str:
    cands = data.get("candidates")
    if not isinstance(cands, list) or not cands:
        return ""
    c0 = cands[0]
    if not isinstance(c0, dict):
        return ""
    content = c0.get("content")
    if not isinstance(content, dict):
        return ""
    parts = content.get("parts")
    if not isinstance(parts, list):
        return ""
    out: list[str] = []
    for p in parts:
        if isinstance(p, dict) and isinstance(p.get("text"), str):
            out.append(p["text"])
    return "".join(out)


async def chat_completion_stream_gemini(
    messages: list[dict[str, Any]],
    *,
    max_tokens: int,
) -> AsyncIterator[dict[str, Any]]:
    """
    Stream chat via Gemini REST (streamGenerateContent), yielding Ollama-shaped chunks
    so the NDJSON pipeline can reuse stream_message_parts / done handling.

    HTTP 429: **sem retentativas** - repetir o pedido em segundos costuma piorar o limite (RPM/TPM)
    e nao resolve cota esgotada na primeira mensagem.
    """
    s = get_settings()
    key = (s.gemini_api_key or "").strip()
    if not key:
        raise RuntimeError(
            "Defina GEMINI_API_KEY no ambiente do servico clinical-ai para usar a Gemini."
        )

    model = (s.gemini_model or "gemini-2.0-flash").strip().removeprefix("models/")
    system_text, user_text = _split_system_user(messages)
    if not user_text:
        raise RuntimeError("Mensagens sem conteudo de usuario para enviar a Gemini.")

    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:streamGenerateContent"
    request_json: dict[str, Any] = {
        "contents": [{"role": "user", "parts": [{"text": user_text}]}],
        "generationConfig": {
            "maxOutputTokens": max(256, min(max_tokens, 8192)),
            "temperature": 0.35,
        },
    }
    if system_text:
        request_json["systemInstruction"] = {"parts": [{"text": system_text}]}

    timeout = min(float(s.gemini_timeout_s), 300.0)
    params = {"key": key, "alt": "sse"}

    log.info(
        "gemini streamGenerateContent model=%s maxOutputTokens=%s ~chars=%d",
        model,
        request_json["generationConfig"]["maxOutputTokens"],
        len(system_text) + len(user_text),
    )

    prev_full = ""
    n_chunks = 0

    async with httpx.AsyncClient(timeout=timeout) as client:
        async with client.stream("POST", url, params=params, json=request_json) as response:
            sc = response.status_code
            if sc == 429:
                await response.aclose()
                raise RuntimeError(
                    "Limite da API Google Gemini (HTTP 429): cota ou ritmo de uso excedido. "
                    "Isto pode ocorrer na primeira mensagem se o plano/chave tiver poucos pedidos por minuto. "
                    "Aguarde alguns minutos, confira quotas em Google AI Studio, ou use o modelo local (Ollama) no cabecalho da Livia."
                )
            if sc >= 400:
                await response.aclose()
                raise RuntimeError(
                    "A API Gemini recusou o pedido (HTTP %s). Verifique modelo, cota e GEMINI_API_KEY; "
                    "ou use o modelo local (Ollama)." % sc
                )

            buf = ""
            async for chunk in response.aiter_bytes():
                if not chunk:
                    continue
                buf += chunk.decode("utf-8", errors="replace")
                while "\n" in buf:
                    line, buf = buf.split("\n", 1)
                    line = line.strip()
                    if not line or line == "data: [DONE]":
                        continue
                    sse_payload = line[5:].strip() if line.startswith("data:") else line
                    if not sse_payload.startswith("{"):
                        continue
                    try:
                        data = json.loads(sse_payload)
                    except json.JSONDecodeError:
                        log.debug("gemini skip non-json line: %r", line[:160])
                        continue
                    full = _extract_text_from_chunk(data)
                    if not full:
                        continue
                    if full.startswith(prev_full):
                        delta = full[len(prev_full) :]
                    else:
                        delta = full
                    prev_full = full
                    if not delta:
                        continue
                    n_chunks += 1
                    yield {"message": {"content": delta}, "done": False}

            log.info("gemini stream finished text_chunks=%d", n_chunks)
            yield {"message": {"content": ""}, "done": True}


def gemini_configured() -> bool:
    return bool((get_settings().gemini_api_key or "").strip())
