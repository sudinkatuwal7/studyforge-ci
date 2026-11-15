"""Query embeddings retain the worker's Gemini model and raw-text input format."""

from types import SimpleNamespace
from unittest.mock import patch

from django.test import SimpleTestCase, override_settings

from apps.knowledge.query_embeddings import (
    PermanentQueryEmbeddingError,
    RetryableQueryEmbeddingError,
    embed_texts,
)


@override_settings(GEMINI_API_KEY="test-key", EMBEDDING_MODEL="gemini-embedding-2", EMBEDDING_DIMENSION=768)
class QueryEmbeddingTests(SimpleTestCase):
    @patch("apps.knowledge.query_embeddings.genai.Client")
    def test_embeds_one_raw_question_with_worker_compatible_settings(self, client_factory):
        vector = [0.25] * 768
        client_factory.return_value.models.embed_content.return_value = SimpleNamespace(
            embeddings=[SimpleNamespace(values=vector)]
        )

        self.assertEqual(embed_texts(["What is a page fault?"]), [vector])

        client_factory.assert_called_once_with(api_key="test-key")
        request = client_factory.return_value.models.embed_content.call_args.kwargs
        self.assertEqual(request["model"], "gemini-embedding-2")
        self.assertEqual(request["config"].output_dimensionality, 768)
        self.assertEqual(len(request["contents"]), 1)
        self.assertEqual(request["contents"][0].parts[0].text, "What is a page fault?")

    @patch("apps.knowledge.query_embeddings.genai.Client")
    def test_invalid_input_or_configuration_never_calls_gemini(self, client_factory):
        for texts in ("question", [], ["one", "two"]):
            with self.subTest(texts=texts), self.assertRaises(PermanentQueryEmbeddingError):
                embed_texts(texts)
        with override_settings(GEMINI_API_KEY=""):
            with self.assertRaises(PermanentQueryEmbeddingError):
                embed_texts(["question"])
        client_factory.assert_not_called()

    @patch("apps.knowledge.query_embeddings.genai.Client")
    def test_provider_failures_keep_retryable_and_permanent_errors(self, client_factory):
        for error, expected in (
            (TimeoutError("timeout"), RetryableQueryEmbeddingError),
            (ValueError("bad request"), PermanentQueryEmbeddingError),
        ):
            with self.subTest(error=type(error).__name__):
                client_factory.return_value.models.embed_content.side_effect = error
                with self.assertRaises(expected):
                    embed_texts(["question"])

    @patch("apps.knowledge.query_embeddings.genai.Client")
    def test_invalid_provider_response_is_permanent(self, client_factory):
        for embeddings in ([], [SimpleNamespace(values=[0.0] * 768)],
                           [SimpleNamespace(values=[1.0] * 767)]):
            with self.subTest(embeddings=embeddings):
                client_factory.return_value.models.embed_content.return_value = SimpleNamespace(
                    embeddings=embeddings
                )
                with self.assertRaises(PermanentQueryEmbeddingError):
                    embed_texts(["question"])
