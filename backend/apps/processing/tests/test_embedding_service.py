"""Unit tests for the Gemini embedding service. The provider client is mocked."""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import Mock, patch

from django.test import SimpleTestCase, override_settings
from google.genai import types
from google.genai.errors import ClientError, ServerError

from apps.documents.result_callbacks import InvalidCallback, _validate_chunks
from apps.processing.embedding_service import embed_texts
from apps.processing.exceptions import PermanentProcessingError, RetryableProcessingError

DIMENSION = 768


def _vector(marker: float) -> list[float]:
    values = [0.0] * DIMENSION
    values[0] = marker
    if marker == 0.0:
        values[1] = 1.0
    return values


def _embedding(marker: float):
    return SimpleNamespace(values=_vector(marker))


def _response(markers: list[float]):
    return SimpleNamespace(embeddings=[_embedding(marker) for marker in markers])


def _texts(count: int) -> list[str]:
    return [f"chunk-{index}" for index in range(count)]


@override_settings(
    GEMINI_API_KEY="test-key",
    EMBEDDING_MODEL="gemini-embedding-2",
    EMBEDDING_DIMENSION=768,
    EMBEDDING_BATCH_SIZE=16,
)
class EmbedTextsTests(SimpleTestCase):
    def test_empty_input_returns_empty_without_calling_gemini(self):
        with patch("apps.processing.embedding_service._make_client") as make_client:
            self.assertEqual(embed_texts([]), [])
        make_client.assert_not_called()

    def test_single_batch_preserves_order_and_dimension(self):
        client = self._client_returning_indexed_embeddings()
        with patch("apps.processing.embedding_service._make_client", return_value=client):
            result = embed_texts(_texts(3))

        self.assertEqual(client.models.embed_content.call_count, 1)
        self.assertEqual(len(result), 3)
        self.assertEqual([vector[0] for vector in result], [0.0, 1.0, 2.0])
        self.assertTrue(all(len(vector) == DIMENSION for vector in result))
        contents = client.models.embed_content.call_args.kwargs["contents"]
        self.assertEqual([content.parts[0].text for content in contents], _texts(3))

    def test_multiple_batches_use_configured_batch_size(self):
        client = self._client_returning_indexed_embeddings()
        with patch("apps.processing.embedding_service._make_client", return_value=client):
            result = embed_texts(_texts(35))

        calls = client.models.embed_content.call_args_list
        self.assertEqual(len(calls), 3)
        self.assertEqual([len(call.kwargs["contents"]) for call in calls], [16, 16, 3])
        self.assertEqual(len(result), 35)
        self.assertEqual([vector[0] for vector in result], [float(index) for index in range(35)])

    def test_provider_call_uses_configured_model(self):
        client = self._client_returning_indexed_embeddings()
        with patch("apps.processing.embedding_service._make_client", return_value=client):
            embed_texts(["chunk-0"])

        self.assertEqual(
            client.models.embed_content.call_args.kwargs["model"],
            "gemini-embedding-2",
        )

    def test_provider_call_requests_configured_output_dimension(self):
        client = self._client_returning_indexed_embeddings()
        with patch("apps.processing.embedding_service._make_client", return_value=client):
            embed_texts(["chunk-0"])

        config = client.models.embed_content.call_args.kwargs["config"]
        self.assertIsInstance(config, types.EmbedContentConfig)
        self.assertEqual(config.output_dimensionality, 768)

    def test_each_text_is_its_own_content(self):
        client = self._client_returning_indexed_embeddings()
        with patch("apps.processing.embedding_service._make_client", return_value=client):
            embed_texts(_texts(3))

        contents = client.models.embed_content.call_args.kwargs["contents"]
        self.assertEqual(len(contents), 3)
        self.assertTrue(all(isinstance(content, types.Content) for content in contents))
        self.assertTrue(all(len(content.parts) == 1 for content in contents))

    @override_settings(GEMINI_API_KEY="")
    def test_missing_api_key_is_permanent_and_does_not_call_provider(self):
        with patch("apps.processing.embedding_service._make_client") as make_client:
            with self.assertRaises(PermanentProcessingError):
                embed_texts(["chunk-0"])
        make_client.assert_not_called()

    def test_wrong_response_count_is_permanent(self):
        client = SimpleNamespace(
            models=SimpleNamespace(
                embed_content=Mock(return_value=_response([0.0, 1.0]))
            )
        )
        with patch("apps.processing.embedding_service._make_client", return_value=client):
            with self.assertRaises(PermanentProcessingError):
                embed_texts(_texts(3))

    def test_wrong_vector_dimension_is_permanent(self):
        short = SimpleNamespace(embeddings=[SimpleNamespace(values=[1.0, 2.0])])
        client = SimpleNamespace(models=SimpleNamespace(embed_content=Mock(return_value=short)))
        with patch("apps.processing.embedding_service._make_client", return_value=client):
            with self.assertRaises(PermanentProcessingError):
                embed_texts(["chunk-0"])

    def test_nonfinite_or_zero_provider_vectors_are_permanent_errors(self):
        for marker in (0.0, float("nan"), float("inf"), float("-inf")):
            with self.subTest(marker=marker):
                vector = [marker] + [0.0] * (DIMENSION - 1)
                response = SimpleNamespace(embeddings=[SimpleNamespace(values=vector)])
                client = SimpleNamespace(
                    models=SimpleNamespace(embed_content=Mock(return_value=response))
                )
                with patch("apps.processing.embedding_service._make_client", return_value=client):
                    with self.assertRaises(PermanentProcessingError):
                        embed_texts(["chunk-0"])

    def test_callback_rejects_all_zero_embedding(self):
        with self.assertRaises(InvalidCallback):
            _validate_chunks(
                [{"page_number": 1, "content": "text", "embedding": [0.0] * DIMENSION}],
                1,
            )

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
        with patch("apps.processing.embedding_service._make_client", return_value=client):
            with self.assertRaises(RetryableProcessingError):
                embed_texts(["chunk-0"])

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
        with patch("apps.processing.embedding_service._make_client", return_value=client):
            with self.assertRaises(RetryableProcessingError):
                embed_texts(["chunk-0"])

    def _client_returning_indexed_embeddings(self):
        def embed_content(*, model, contents, config):
            del model, config
            markers = []
            for content in contents:
                markers.append(float(content.parts[0].text.split("-", 1)[1]))
            return _response(markers)

        return SimpleNamespace(models=SimpleNamespace(embed_content=Mock(side_effect=embed_content)))
