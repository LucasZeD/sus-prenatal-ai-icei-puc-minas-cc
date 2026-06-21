from __future__ import annotations

import unittest

from app.main import _detect_with_fallback


class DetectFallbackTests(unittest.TestCase):
    def test_detects_compound_name(self) -> None:
        text = "Paciente Ana Paula Souza informou dados."
        entities = _detect_with_fallback(text, min_score=0.75, allowed=None)
        self.assertTrue(any(e.get("text") == "Ana Paula Souza" for e in entities))


if __name__ == "__main__":
    unittest.main()
