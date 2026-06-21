from __future__ import annotations

import unittest
from unittest.mock import patch

from clinical_ai import pii
from clinical_ai.pii_types import PiiSpan


class PiiHybridTests(unittest.TestCase):
    def test_masks_structured_entities_with_regex(self) -> None:
        text = "CPF 123.456.789-00 CNS 898001160444777 email teste@dominio.com telefone +55 (31) 99876-1234"
        out = pii.sanitize_for_model(text)
        self.assertIn("[CPF]", out)
        self.assertIn("[CNS]", out)
        self.assertIn("[EMAIL]", out)
        self.assertIn("[TELEFONE]", out)

    def test_masks_long_numeric_chain(self) -> None:
        text = "Protocolo longo 98765432101234567890 para auditoria."
        out = pii.sanitize_for_model(text)
        self.assertIn("[NUM]", out)
        self.assertNotIn("98765432101234567890", out)

    def test_masks_full_name_from_ner(self) -> None:
        text = "Paciente Ana Paula Souza informou sintomas."
        ner = [
            PiiSpan(
                start=text.index("Ana"),
                end=text.index("Souza") + len("Souza"),
                kind="FULL_NAME",
                placeholder="[NOME]",
                source="ner",
                priority=20,
                score=0.99,
            )
        ]
        with patch("clinical_ai.pii.detect_ner_name_spans", return_value=ner):
            out = pii.sanitize_for_model(text)
        self.assertIn("[NOME]", out)
        self.assertNotIn("Ana Paula Souza", out)


if __name__ == "__main__":
    unittest.main()
