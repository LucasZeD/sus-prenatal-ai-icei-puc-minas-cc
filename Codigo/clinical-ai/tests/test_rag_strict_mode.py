from __future__ import annotations

import asyncio
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from clinical_ai import engine
from clinical_ai.corpus import iter_corpus_source_files


class CorpusFilteringTests(unittest.TestCase):
    def test_iter_corpus_source_files_filters_notes_and_superseded_editions(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "README.md").write_text("readme", encoding="utf-8")
            (root / "PreNatal_AltoRisco").mkdir()
            (root / "PreNatal_AltoRisco" / "notas_locais_exemplo.md").write_text("nota", encoding="utf-8")
            (root / "CadernetaGestante_3ed_2016.pdf").write_text("old", encoding="utf-8")
            (root / "CadernetaGestante_8ed_rev_2024.pdf").write_text("new", encoding="utf-8")
            (root / "GuiaPreNatalDoParceiro_ProfissionaisSaude_2018.pdf").write_text("old", encoding="utf-8")
            (root / "GuiaPreNatalDoParceiro_ProfissionaisSaude_2023.pdf").write_text("new", encoding="utf-8")
            (root / "CadernetaGestante").mkdir()
            (root / "CadernetaGestante" / "CadernetaGestante_8ed_rev_2024.pdf").write_text("ficha", encoding="utf-8")

            selected = iter_corpus_source_files(root)
            names = {p.name for p in selected}

            self.assertNotIn("CadernetaGestante_8ed_rev_2024.pdf", names)
            self.assertNotIn("CadernetaGestante_3ed_2016.pdf", names)
            self.assertIn("GuiaPreNatalDoParceiro_ProfissionaisSaude_2023.pdf", names)
            self.assertNotIn("GuiaPreNatalDoParceiro_ProfissionaisSaude_2018.pdf", names)
            self.assertNotIn("README.md", names)
            self.assertNotIn("notas_locais_exemplo.md", names)


class StrictEmbeddingModeTests(unittest.TestCase):
    def test_build_index_raises_when_embeddings_fail_in_strict_mode(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "clinical_note.txt").write_text("gestacao de alto risco " * 20, encoding="utf-8")

            settings = SimpleNamespace(
                rag_corpus_dir=str(root),
                rag_vector_store_path="",
                rag_disable_vector_store=True,
                rag_export_chunks_jsonl="",
                rag_embedding_model="nomic-embed-text",
                rag_chunk_max_chars=900,
                rag_chunk_overlap=120,
                rag_embed_max_chars=8000,
                rag_query_max_chars=2000,
                rag_max_chunks=6,
                rag_max_chars_per_chunk=2400,
                rag_rerank_enabled=True,
                rag_rerank_pool_size=24,
                rag_mmr_lambda=0.72,
                rag_recency_weight=0.35,
                rag_query_expand_enabled=False,
                rag_query_expand_max_tokens=220,
                rag_query_expand_max_out_chars=450,
                rag_require_embedding_index=True,
                ollama_base_url="http://127.0.0.1:11434",
            )

            async def _embed_none(_: str) -> None:
                return None

            with (
                patch("clinical_ai.engine.get_settings", return_value=settings),
                patch("clinical_ai.engine.ollama_client.try_embed", side_effect=_embed_none),
            ):
                with self.assertRaises(RuntimeError):
                    asyncio.run(engine.build_index(force_rebuild=True))


if __name__ == "__main__":
    unittest.main()
