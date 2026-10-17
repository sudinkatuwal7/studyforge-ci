"""Persistence only: quiz generation, answer hiding, and scoring live elsewhere."""

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models


class Quiz(models.Model):
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="quizzes",
    )
    course = models.ForeignKey(
        "courses.Course",
        on_delete=models.CASCADE,
        related_name="quizzes",
    )
    title = models.CharField(max_length=255)
    # The materials the quiz was generated from. Deleting a document drops
    # the link, not the quiz.
    source_documents = models.ManyToManyField(
        "documents.Document",
        related_name="quizzes",
        blank=True,
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def clean(self):
        super().clean()
        if self.course_id and self.owner_id and self.course.owner_id != self.owner_id:
            raise ValidationError({"course": "The quiz owner must own the course."})

    def __str__(self):
        return self.title


class Question(models.Model):
    """One multiple-choice question. Options are an ordered list of strings;
    the correct answer is the index of one of them."""

    MIN_OPTIONS = 2

    quiz = models.ForeignKey(
        Quiz,
        on_delete=models.CASCADE,
        related_name="questions",
    )
    position = models.PositiveSmallIntegerField()
    text = models.TextField()
    options = models.JSONField(default=list)
    correct_option_index = models.PositiveSmallIntegerField()
    explanation = models.TextField(blank=True)

    class Meta:
        ordering = ["position"]
        constraints = [
            models.UniqueConstraint(
                fields=["quiz", "position"],
                name="question_position_unique_per_quiz",
            ),
            models.CheckConstraint(
                condition=models.Q(position__gte=1),
                name="question_position_positive",
            ),
        ]

    def clean(self):
        super().clean()
        options = self.options
        if (
            not isinstance(options, list)
            or len(options) < self.MIN_OPTIONS
            or not all(isinstance(option, str) and option.strip() for option in options)
        ):
            raise ValidationError(
                {"options": f"Provide at least {self.MIN_OPTIONS} non-empty text options."}
            )
        if self.correct_option_index is not None and self.correct_option_index >= len(options):
            raise ValidationError(
                {"correct_option_index": "The correct option index must refer to an option."}
            )

    def __str__(self):
        return f"Question {self.position} of quiz {self.quiz_id}"
