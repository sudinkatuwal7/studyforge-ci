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


class QuizSubmission(models.Model):
    """A student's final, graded answers to a quiz.

    One per quiz: submitting reveals the answers and explanations, so a
    second attempt at the same questions would not measure anything. A
    retake is a newly generated quiz.
    """

    quiz = models.OneToOneField(
        Quiz,
        on_delete=models.CASCADE,
        related_name="submission",
    )
    # Stored so a list of past results needs no join over every answer.
    score = models.PositiveSmallIntegerField()
    total_questions = models.PositiveSmallIntegerField()
    submitted_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.CheckConstraint(
                condition=models.Q(score__lte=models.F("total_questions")),
                name="submission_score_within_total",
            ),
        ]

    @property
    def percentage(self):
        if not self.total_questions:
            return 0
        return round(100 * self.score / self.total_questions)

    def __str__(self):
        return f"Submission for quiz {self.quiz_id}: {self.score}/{self.total_questions}"


class SubmittedAnswer(models.Model):
    """The option a student chose for one question, graded at submission.

    A null selection means the question was left unanswered; it counts as
    incorrect.
    """

    submission = models.ForeignKey(
        QuizSubmission,
        on_delete=models.CASCADE,
        related_name="answers",
    )
    question = models.ForeignKey(
        Question,
        on_delete=models.CASCADE,
        related_name="submitted_answers",
    )
    selected_option_index = models.PositiveSmallIntegerField(null=True, blank=True)
    is_correct = models.BooleanField()

    class Meta:
        ordering = ["question__position"]
        constraints = [
            models.UniqueConstraint(
                fields=["submission", "question"],
                name="submitted_answer_unique_per_question",
            ),
        ]

    def __str__(self):
        return f"Answer to question {self.question_id} in submission {self.submission_id}"
