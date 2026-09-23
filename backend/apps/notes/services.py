from apps.notes.models import StudyGuide


def generate_study_guide(document):
    """Create or replace the study guide for a document.

    Placeholder generation — the real model call lands in SCRUM-70.
    """
    guide, _ = StudyGuide.objects.update_or_create(
        document=document,
        defaults={
            "key_concepts": ["Placeholder concept"],
            "important_points": ["Placeholder point"],
            "summary": "Generation is implemented in SCRUM-70.",
            "model_name": "stub",
        },
    )
    return guide