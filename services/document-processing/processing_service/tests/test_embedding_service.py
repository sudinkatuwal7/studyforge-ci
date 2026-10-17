from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import Mock, patch

from django.test import SimpleTestCase, override_settings
from google.genai import types
from google.genai.errors import ClientError, ServerError

from processing_service.embedding_service import embed_texts
from processing_service.errors import PermanentProcessingError, RetryableProcessingError


def _response(values):
    return SimpleNamespace(
        embeddings=[SimpleNamespace(values=vector) for vector in values]
    )


@override_settings(
    GEMINI_API_KEY="test-key",
    EMBEDDING_MODEL="gemini-embedding-2",
    EMBEDDING_DIMENSION=3,
    EMBEDDING_BATCH_SIZE=2,
)
class EmbeddingServiceTests(SimpleTestCase):
    def test_empty_input_returns_without_creating_client(self):
        with patch("processing_service.embedding_service.genai.Client") as client:
            self.assertEqual(embed_texts([]), [])
        client.assert_not_called()

    def test_embeds_each_text_in_order_and_batches_requests(self):
        client = SimpleNamespace(models=SimpleNamespace(embed_content=Mock()))
        client.models.embed_content.side_effect = [
            _response([[1, 0, 0], [2, 0, 0]]),
            _response([[3, 0, 0]]),
        ]
        with patch("processing_service.embedding_service.genai.Client", return_value=client):
            result = embed_texts(["first", "second", "third"])

        self.assertEqual(result, [[1.0, 0.0, 0.0], [2.0, 0.0, 0.0], [3.0, 0.0, 0.0]])
        calls = client.models.embed_content.call_args_list
        self.assertEqual([len(call.kwargs["contents"]) for call in calls], [2, 1])
        self.assertEqual(
            [item.parts[0].text for item in calls[0].kwargs["contents"]],
            ["first", "second"],
        )
        self.assertEqual(
            calls[0].kwargs["model"],
            "gemini-embedding-2",
        )
        self.assertIsInstance(calls[0].kwargs["config"], types.EmbedContentConfig)
        self.assertEqual(calls[0].kwargs["config"].output_dimensionality, 3)

    @override_settings(GEMINI_API_KEY="")
    def test_missing_api_key_fails_permanently(self):
        with self.assertRaisesRegex(PermanentProcessingError, "GEMINI_API_KEY"):
            embed_texts(["chunk"])

    def test_wrong_embedding_count_fails_permanently(self):
        client = SimpleNamespace(
            models=SimpleNamespace(embed_content=Mock(return_value=_response([[1, 2, 3]])))
        )
        with patch("processing_service.embedding_service.genai.Client", return_value=client):
            with self.assertRaisesRegex(PermanentProcessingError, "returned 1 embeddings"):
                embed_texts(["one", "two"])

    def test_wrong_vector_dimension_fails_permanently(self):
        client = SimpleNamespace(
            models=SimpleNamespace(embed_content=Mock(return_value=_response([[1, 2]])))
        )
        with patch("processing_service.embedding_service.genai.Client", return_value=client):
            with self.assertRaisesRegex(PermanentProcessingError, "did not match dimension"):
                embed_texts(["chunk"])

    def test_rate_limit_is_retryable(self):
        client = SimpleNamespace(
            models=SimpleNamespace(
                embed_content=Mock(
                    side_effect=ClientError(
                        429,
                        {"error": {"message": "slow down", "status": "RESOURCE_EXHAUSTED"}},
                    )
                )
            )
        )
        with patch("processing_service.embedding_service.genai.Client", return_value=client):
            with self.assertRaises(RetryableProcessingError):
                embed_texts(["chunk"])

    def test_server_error_is_retryable(self):
        client = SimpleNamespace(
            models=SimpleNamespace(
                embed_content=Mock(
                    side_effect=ServerError(
                        503,
                        {"error": {"message": "unavailable", "status": "UNAVAILABLE"}},
                    )
                )
            )
        )
        with patch("processing_service.embedding_service.genai.Client", return_value=client):
            with self.assertRaises(RetryableProcessingError):
                embed_texts(["chunk"])
