from __future__ import annotations

import json
import unittest
from unittest.mock import AsyncMock, patch

from clinical_ai.escriba_extract import (
    format_current_fields_block,
    parse_and_validate_extract_response,
)


class EscribaExtractFieldsTests(unittest.TestCase):
    def test_parse_valid_subset(self) -> None:
        raw = json.dumps(
            {
                "patch": {
                    "queixa": "dor lombar ha 3 dias",
                    "peso": 72.5,
                    "pa_sistolica": 140,
                    "pa_diastolica": 90,
                    "idade_gestacional": 28,
                },
                "confidence": {"peso": 0.9},
                "sources": {"peso": "utterance"},
            }
        )
        out = parse_and_validate_extract_response(raw)
        self.assertEqual(out["patch"]["queixa"], "dor lombar ha 3 dias")
        self.assertEqual(out["patch"]["peso"], 72.5)
        self.assertEqual(out["patch"]["pa_sistolica"], 140)
        self.assertEqual(out["confidence"]["peso"], 0.9)

    def test_rejects_markdown_fence(self) -> None:
        raw = '```json\n{"patch": {"queixa": "x"}, "confidence": {}, "sources": {}}\n```'
        with self.assertRaises(ValueError) as ctx:
            parse_and_validate_extract_response(raw)
        self.assertEqual(str(ctx.exception), "markdown_not_allowed")

    def test_omits_null_and_unknown_fields(self) -> None:
        raw = json.dumps(
            {
                "patch": {
                    "queixa": "dor",
                    "peso": None,
                    "conduta": "nao permitido",
                },
                "confidence": {},
                "sources": {},
            }
        )
        out = parse_and_validate_extract_response(raw)
        self.assertEqual(out["patch"], {"queixa": "dor"})

    def test_empty_patch_allowed(self) -> None:
        raw = json.dumps({"patch": {}, "confidence": {}, "sources": {}})
        out = parse_and_validate_extract_response(raw)
        self.assertEqual(out["patch"], {})

    def test_format_current_fields_block(self) -> None:
        block = format_current_fields_block({"queixa": "dor", "peso": 70, "conduta": "x"})
        self.assertIn("campos_atuais", block)
        self.assertIn("queixa", block)
        self.assertIn("peso", block)
        self.assertNotIn("conduta", block)

    def test_format_current_fields_empty(self) -> None:
        self.assertEqual(format_current_fields_block(None), "")
        self.assertEqual(format_current_fields_block({}), "")


class EscribaExtractBuilderTests(unittest.IsolatedAsyncioTestCase):
    async def test_builder_includes_current_fields_in_context(self) -> None:
        try:
            from clinical_ai.main import EscribaExtractFieldsBody, _escriba_extract_fields_messages_and_context
        except ModuleNotFoundError:
            self.skipTest("fastapi not installed in this interpreter")
            return

        body = EscribaExtractFieldsBody(
            transcription="gestante com 28 semanas",
            current_fields={"queixa": "dor lombar"},
            top_k=0,
        )
        with patch("clinical_ai.main.pii.sanitize_for_model", side_effect=lambda t: t):
            with patch("clinical_ai.main.pii.sanitize_optional_block", side_effect=lambda v: v):
                messages, meta = await _escriba_extract_fields_messages_and_context(body)

        system = messages[0]["content"]
        self.assertIn("campos_atuais", system)
        self.assertIn("dor lombar", system)
        self.assertEqual(meta["top_k"], 0)


if __name__ == "__main__":
    unittest.main()
