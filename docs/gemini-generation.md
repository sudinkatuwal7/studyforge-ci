# Gemini text generation

Notes and study guides, quizzes, and Pandu's grounded answers support `gemini`,
`openai`, and `fake` providers. Unset backend selectors still default to `fake`.
Gemini uses the existing `google-genai` dependency and `GEMINI_API_KEY`; it does
not require an OpenAI key. Embedding configuration is independent.

Export these variables into the API and any worker process that generates text:

```sh
export GEMINI_API_KEY='<your-key>'
export NOTES_LLM_BACKEND=gemini
export QUIZ_LLM_BACKEND=gemini
export RAG_LLM_BACKEND=gemini
export NOTES_LLM_MODEL=gemini-flash-latest
export QUIZ_LLM_MODEL=gemini-flash-latest
export RAG_LLM_MODEL=gemini-flash-latest
```

Restart those processes after changing configuration. Django does not load
`backend/.env` automatically. If your launch command loads it, update that file
instead. Model variables override the default `gemini-flash-latest` alias; use
a model available to your Google project. When switching providers, update the
model variables too.

The native Gemini transport requests JSON and rejects missing, blocked, and
truncated responses. SDK/HTTP errors return sanitized messages. Requests have
30-second timeouts (60 seconds for notes) and at most two SDK attempts. Notes
retain their batching, merging, and invalid-output retry. Quizzes retain their
question-count and option validation. Pandu retains bounded evidence, strict
JSON parsing, exact source/citation validation, and one citation repair attempt.

Implementation follows the [Google Gen AI SDK documentation](https://googleapis.github.io/python-genai/)
for system instructions and JSON response schemas.

## Offline verification

From the repository root, run the focused provider/validation tests without
loading development settings, credentials, or databases:

```sh
PYTHONPATH=backend backend/venv/bin/python - <<'PY'
from django.conf import settings
settings.configure(SECRET_KEY='offline-tests', DATABASES={}, INSTALLED_APPS=[])
import django, unittest
django.setup()
names = [
    'tests.test_gemini',
    'apps.knowledge.tests.test_llm',
    'apps.notes.tests.test_llm_validation',
    'apps.quizzes.tests.test_llm_validation',
]
result = unittest.TextTestRunner(verbosity=1).run(
    unittest.defaultTestLoader.loadTestsFromNames(names)
)
raise SystemExit(not result.wasSuccessful())
PY
```

Verified 2026-10-31: 43 tests passed. New Gemini tests use real SDK response
objects and mocked SDK calls. No live provider or database integration was
performed; model availability and the local key's validity remain unverified.
