"""PostgreSQL cosine retrieval tests; Gemini is always mocked."""

from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.exceptions import ImproperlyConfigured
from django.http import Http404
from django.test import TestCase, override_settings

from apps.courses.models import Course
from apps.documents.models import Document
from apps.knowledge.models import Chunk
from apps.knowledge.retrieval import retrieve_chunks


DIMENSION = 768


def _vector(first=0.0, second=0.0):
    return [first, second] + [0.0] * (DIMENSION - 2)


@override_settings(EMBEDDING_MODEL="gemini-embedding-2", EMBEDDING_DIMENSION=DIMENSION)
class RetrievalTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        user_model = get_user_model()
        cls.owner = user_model.objects.create(email="retrieval-owner@example.test")
        cls.other = user_model.objects.create(email="retrieval-other@example.test")
        cls.course = Course.objects.create(owner=cls.owner, name="Retrieval")
        cls.other_course = Course.objects.create(owner=cls.other, name="Other retrieval")
        cls.document = cls.make_document(cls.owner, cls.course, "Ready", Document.Status.READY)
        cls.other_document = cls.make_document(
            cls.other, cls.other_course, "Other ready", Document.Status.READY
        )

    @staticmethod
    def make_document(owner, course, title, status):
        return Document.objects.create(
            owner=owner,
            course=course,
            title=title,
            sha256="a" * 64,
            file=f"documents/{title}.pdf",
            status=status,
        )

    @staticmethod
    def make_chunk(document, content, embedding, *, owner=None):
        return Chunk.objects.create(
            owner=owner or document.owner,
            document=document,
            page_number=1,
            content=content,
            embedding=embedding,
        )

    def retrieve(self, *, document_id=None, top_k=5, question="What happened?"):
        with patch("apps.knowledge.retrieval.embed_texts", return_value=[_vector(1.0)]) as embed:
            results = retrieve_chunks(
                self.owner,
                self.document.pk if document_id is None else document_id,
                question,
                top_k,
            )
        return results, embed

    def test_orders_by_cosine_distance_then_chunk_id_and_limits_results(self):
        nearest = self.make_chunk(self.document, "nearest", _vector(1.0))
        tied = self.make_chunk(self.document, "tied", _vector(1.0))
        middle = self.make_chunk(self.document, "middle", _vector(0.0, 1.0))
        farthest = self.make_chunk(self.document, "farthest", _vector(-1.0))

        results, embed = self.retrieve(top_k=3, question="  What happened?  ")

        embed.assert_called_once_with(["What happened?"])
        self.assertEqual([row["chunk_id"] for row in results], [nearest.pk, tied.pk, middle.pk])
        self.assertEqual([row["score"] for row in results], [1.0, 1.0, 0.0])
        self.assertEqual(results[0]["document_id"], self.document.pk)
        self.assertEqual(results[0]["content"], "nearest")

        all_results, _ = self.retrieve(top_k=4)
        self.assertEqual(all_results[-1]["chunk_id"], farthest.pk)
        self.assertEqual(all_results[-1]["score"], -1.0)

    def test_default_and_maximum_top_k(self):
        for index in range(11):
            self.make_chunk(self.document, f"chunk-{index}", _vector(1.0))

        default_results, _ = self.retrieve()
        maximum_results, _ = self.retrieve(top_k=10)

        self.assertEqual(len(default_results), 5)
        self.assertEqual(len(maximum_results), 10)
        self.assertEqual(
            [row["chunk_id"] for row in maximum_results],
            list(Chunk.objects.filter(document=self.document).order_by("id").values_list("id", flat=True))[:10],
        )

    def test_filters_both_chunk_and_document_owner_and_null_embedding(self):
        included = self.make_chunk(self.document, "included", _vector(0.0, 1.0))
        self.make_chunk(self.document, "mismatched chunk owner", _vector(1.0), owner=self.other)
        self.make_chunk(self.other_document, "other document", _vector(1.0))
        self.make_chunk(self.other_document, "mismatched document owner", _vector(1.0), owner=self.owner)
        self.make_chunk(self.document, "unembedded", None)

        results, _ = self.retrieve()

        self.assertEqual([row["chunk_id"] for row in results], [included.pk])

    def test_empty_eligible_corpus_returns_no_results(self):
        empty_results, embed = self.retrieve()
        self.assertEqual(empty_results, [])
        embed.assert_called_once_with(["What happened?"])

        self.make_chunk(self.document, "no embedding yet", None)
        null_only_results, _ = self.retrieve()
        self.assertEqual(null_only_results, [])

    def test_unowned_or_not_ready_document_is_rejected_before_embedding(self):
        for status in (
            Document.Status.PENDING,
            Document.Status.PROCESSING,
            Document.Status.FAILED,
        ):
            document = self.make_document(self.owner, self.course, status, status)
            self.make_chunk(document, "not ready", _vector(1.0))
            with self.subTest(status=status):
                with patch("apps.knowledge.retrieval.embed_texts") as embed:
                    with self.assertRaises(Http404):
                        retrieve_chunks(self.owner, document.pk, "question")
                embed.assert_not_called()

        for document_id in (self.other_document.pk, self.other_document.pk + 1000):
            with self.subTest(document_id=document_id):
                with patch("apps.knowledge.retrieval.embed_texts") as embed:
                    with self.assertRaises(Http404):
                        retrieve_chunks(self.owner, document_id, "question")
                embed.assert_not_called()

    def test_status_change_after_embedding_is_still_excluded_by_chunk_query(self):
        self.make_chunk(self.document, "was ready", _vector(1.0))

        def mark_processing(_texts):
            Document.objects.filter(pk=self.document.pk).update(status=Document.Status.PROCESSING)
            return [_vector(1.0)]

        with patch("apps.knowledge.retrieval.embed_texts", side_effect=mark_processing):
            results = retrieve_chunks(self.owner, self.document.pk, "question")

        self.assertEqual(results, [])

    def test_invalid_inputs_do_not_embed(self):
        cases = [
            (0, "question", 5),
            (True, "question", 5),
            (self.document.pk, "   ", 5),
            (self.document.pk, "question", 0),
            (self.document.pk, "question", 11),
            (self.document.pk, "question", True),
        ]
        for document_id, question, top_k in cases:
            with self.subTest(document_id=document_id, question=question, top_k=top_k):
                with patch("apps.knowledge.retrieval.embed_texts") as embed:
                    with self.assertRaises(ValueError):
                        retrieve_chunks(self.owner, document_id, question, top_k)
                embed.assert_not_called()

    def test_invalid_question_vectors_do_not_reach_pgvector(self):
        invalid_vectors = (
            _vector(),
            _vector(float("nan")),
            _vector(float("inf")),
            [1.0] * (DIMENSION - 1),
            [True] + [0.0] * (DIMENSION - 1),
        )
        for vector in invalid_vectors:
            with self.subTest(first_value=vector[0], length=len(vector)):
                with patch("apps.knowledge.retrieval.embed_texts", return_value=[vector]):
                    with self.assertRaises(ValueError):
                        retrieve_chunks(self.owner, self.document.pk, "question")

    @override_settings(EMBEDDING_MODEL="gemini-embedding-001")
    def test_incompatible_model_configuration_is_rejected_before_embedding(self):
        with patch("apps.knowledge.retrieval.embed_texts") as embed:
            with self.assertRaises(ImproperlyConfigured):
                retrieve_chunks(self.owner, self.document.pk, "question")
        embed.assert_not_called()
