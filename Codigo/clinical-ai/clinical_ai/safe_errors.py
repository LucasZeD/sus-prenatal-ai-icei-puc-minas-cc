"""Safe error messages for the API client (no API keys in URLs, tokens, etc.)."""

from __future__ import annotations

import re


def _strip_internal_error_prefix(msg: str) -> str:
    """Remove internal tags like ``gemini_rate_limit_429:`` from user-visible text."""
    if not msg:
        return msg
    m = re.match(r"^gemini_[a-z0-9_]+:\s*", msg, re.I)
    if m:
        rest = msg[m.end() :].strip()
        return rest if rest else msg
    return msg


def redact_secrets_in_text(s: str) -> str:
    """Strip common secret patterns from free-form text (defense in depth)."""
    if not s:
        return s
    out = s
    # Google Gemini and similar: key in query string
    out = re.sub(r"(?i)([?&])key=[^&\s#'\"<>]+", r"\1key=(redacted)", out)
    out = re.sub(r"(?i)x-goog-api-key:\s*[^\s]+", "x-goog-api-key: (redacted)", out)
    out = re.sub(r"(?i)bearer\s+[a-z0-9\-_.=]{16,}", "Bearer (redacted)", out)
    return out


def public_message_from_exception(exc: BaseException) -> str:
    """
    Text safe to send to the browser / NDJSON ``detail``.
    Never forwards httpx default strings (they embed the request URL with ``key=``).
    """
    try:
        import httpx
    except ImportError:  # pragma: no cover
        httpx = None  # type: ignore[assignment]

    if httpx is not None:
        if isinstance(exc, httpx.HTTPStatusError):
            sc = exc.response.status_code
            if sc == 429:
                return (
                    "Limite de requisicoes da API Gemini (HTTP 429). Aguarde alguns minutos, reduza o ritmo de perguntas "
                    "ou selecione o modelo local (Ollama) no cabecalho da Livia."
                )
            if sc == 401 or sc == 403:
                return (
                    "Credencial ou permissao negada na API Gemini (HTTP %s). Verifique GEMINI_API_KEY no servico clinical-ai."
                    % sc
                )
            if sc >= 500:
                return "Servico Gemini temporariamente indisponivel (HTTP %s). Tente de novo mais tarde ou use Ollama." % sc
            return "Falha ao contatar a API Gemini (HTTP %s). Tente o modelo local (Ollama) ou verifique a configuracao." % sc
        if isinstance(exc, httpx.RequestError):
            return "Falha de rede ao contatar a API Gemini. Verifique a conexao, o clinical-ai e tente novamente."

    raw = _strip_internal_error_prefix(str(exc))
    return redact_secrets_in_text(raw)
