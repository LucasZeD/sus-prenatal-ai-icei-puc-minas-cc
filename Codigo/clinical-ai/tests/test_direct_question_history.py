from __future__ import annotations

import unittest
from unittest.mock import AsyncMock, patch


def _import_main():
    from clinical_ai.main import (
        ConversationTurn,
        DirectQuestionBody,
        _conversation_history_to_messages,
        _direct_question_messages_and_context,
    )

    return ConversationTurn, DirectQuestionBody, _conversation_history_to_messages, _direct_question_messages_and_context


class ConversationHistoryMessagesTests(unittest.TestCase):
    def setUp(self) -> None:
        try:
            (
                self.ConversationTurn,
                _,
                self._conversation_history_to_messages,
                _,
            ) = _import_main()
        except ModuleNotFoundError as exc:
            self.skipTest(f"clinical_ai deps missing: {exc}")

    def test_empty_history(self) -> None:
        self.assertEqual(self._conversation_history_to_messages(None), [])
        self.assertEqual(self._conversation_history_to_messages([]), [])

    def test_user_turn_wrapped_in_xml(self) -> None:
        with patch("clinical_ai.main.pii.sanitize_for_model", side_effect=lambda t, **_: t):
            msgs = self._conversation_history_to_messages(
                [self.ConversationTurn(role="user", content="Qual dose de ferro?")]
            )
        self.assertEqual(len(msgs), 1)
        self.assertEqual(msgs[0]["role"], "user")
        self.assertIn("<pergunta_do_profissional_saude>", msgs[0]["content"])
        self.assertIn("Qual dose de ferro?", msgs[0]["content"])

    def test_assistant_turn_passthrough(self) -> None:
        with patch("clinical_ai.main.pii.sanitize_for_model", side_effect=lambda t, **_: t):
            msgs = self._conversation_history_to_messages(
                [self.ConversationTurn(role="assistant", content="Resposta anterior curta.")]
            )
        self.assertEqual(msgs, [{"role": "assistant", "content": "Resposta anterior curta."}])

    def test_multi_turn_order_preserved(self) -> None:
        turns = [
            self.ConversationTurn(role="user", content="Primeira pergunta"),
            self.ConversationTurn(role="assistant", content="Primeira resposta"),
            self.ConversationTurn(role="user", content="Segunda pergunta"),
        ]
        with patch("clinical_ai.main.pii.sanitize_for_model", side_effect=lambda t, **_: t):
            msgs = self._conversation_history_to_messages(turns)
        self.assertEqual(len(msgs), 3)
        self.assertEqual(msgs[0]["role"], "user")
        self.assertEqual(msgs[1]["role"], "assistant")
        self.assertEqual(msgs[2]["role"], "user")


class DirectQuestionBuilderHistoryTests(unittest.IsolatedAsyncioTestCase):
    async def test_builder_includes_history_before_current_question(self) -> None:
        try:
            ConversationTurn, DirectQuestionBody, _, _direct_question_messages_and_context = _import_main()
        except ModuleNotFoundError as exc:
            self.skipTest(f"clinical_ai deps missing: {exc}")
            return

        body = DirectQuestionBody(
            question="E agora?",
            conversation_history=[
                ConversationTurn(role="user", content="Pergunta anterior"),
                ConversationTurn(role="assistant", content="Resposta anterior"),
            ],
            use_rag=False,
        )
        rag_outcome = type(
            "RagOutcome",
            (),
            {
                "chunks": [],
                "timing_ms": {},
                "retrieval_query_raw": None,
                "retrieval_query_effective": None,
                "retrieval_expansion": None,
            },
        )()
        with patch("clinical_ai.main.pii.sanitize_for_model", side_effect=lambda t, **_: t):
            with patch("clinical_ai.main.pii.sanitize_optional_block", return_value=None):
                with patch("clinical_ai.main.engine.retrieve", new_callable=AsyncMock, return_value=rag_outcome):
                    with patch("clinical_ai.main.engine.format_context_block", return_value=""):
                        messages, meta = await _direct_question_messages_and_context(body)

        self.assertEqual(messages[0]["role"], "system")
        self.assertEqual(messages[1]["role"], "user")
        self.assertIn("Pergunta anterior", messages[1]["content"])
        self.assertEqual(messages[2]["role"], "assistant")
        self.assertIn("Resposta anterior", messages[2]["content"])
        self.assertEqual(messages[3]["role"], "user")
        self.assertIn("E agora?", messages[3]["content"])
        self.assertEqual(meta["n_conversation_turns"], 2)


if __name__ == "__main__":
    unittest.main()
