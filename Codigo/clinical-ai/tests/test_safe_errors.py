from __future__ import annotations

import unittest

from clinical_ai.safe_errors import public_message_from_exception, redact_secrets_in_text


class SafeErrorsTests(unittest.TestCase):
    def test_redact_key_query_param(self) -> None:
        raw = "Client error for url 'https://example.com/v1?key=SECRET123&alt=sse'"
        out = redact_secrets_in_text(raw)
        self.assertNotIn("SECRET123", out)
        self.assertIn("key=(redacted)", out)

    def test_public_message_httpx_http_status_error_no_url(self) -> None:
        try:
            import httpx
        except ImportError:
            self.skipTest("httpx not installed in this interpreter")
        req = httpx.Request("GET", "https://generativelanguage.googleapis.com/x?key=supersecret")
        res = httpx.Response(429, request=req)
        exc = httpx.HTTPStatusError("msg", request=req, response=res)
        msg = public_message_from_exception(exc)
        self.assertNotIn("supersecret", msg)
        self.assertNotIn("key=", msg)
        self.assertIn("429", msg)

    def test_public_message_generic_error_redacts_key(self) -> None:
        exc = RuntimeError("Client error '429 Too Many Requests' for url 'https://generativelanguage.googleapis.com/x?key=SECRET99&alt=sse'")
        msg = public_message_from_exception(exc)
        self.assertNotIn("SECRET99", msg)
        self.assertIn("key=(redacted)", msg)

    def test_public_message_strips_internal_gemini_prefix(self) -> None:
        exc = RuntimeError(
            "gemini_rate_limit_429: Limite da API Google Gemini (HTTP 429). Aguarde ou use Ollama."
        )
        msg = public_message_from_exception(exc)
        self.assertNotIn("gemini_rate_limit_429", msg)
        self.assertIn("Limite da API Google Gemini", msg)


if __name__ == "__main__":
    unittest.main()
