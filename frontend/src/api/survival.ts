import { request } from "./client";
import { QuizRequestError } from "./quizzes";
import type { QuizLength } from "../types/quiz";
import type { SurvivalAnswerResult, SurvivalSession } from "../types/survival";

/**
 * A QuizRequestError that also carries the `session` the backend returns with
 * 409 SURVIVAL_SESSION_ENDED and QUESTION_NOT_CURRENT, so the UI can show the
 * real state instead of guessing. Start errors reuse the quiz-generation codes.
 */
export class SurvivalRequestError extends QuizRequestError {
  session: SurvivalSession | null;

  constructor(status: number, code = "", documentIds: number[] = [], session: SurvivalSession | null = null) {
    super(status, code, documentIds);
    this.name = "SurvivalRequestError";
    this.session = session;
  }
}

function isSession(value: unknown): value is SurvivalSession {
  if (!value || typeof value !== "object") return false;
  const session = value as Record<string, unknown>;
  return Number.isSafeInteger(session.id) && typeof session.status === "string"
    && typeof session.lives === "number" && typeof session.score === "number";
}

async function readJson<T>(response: Response): Promise<T> {
  if (response.ok) return (await response.json()) as T;

  let code = "";
  let documentIds: number[] = [];
  let session: SurvivalSession | null = null;
  try {
    const body = (await response.json()) as { code?: unknown; document_ids?: unknown; session?: unknown };
    if (typeof body.code === "string") code = body.code;
    if (Array.isArray(body.document_ids)) documentIds = body.document_ids.filter((id): id is number => typeof id === "number");
    if (isSession(body.session)) session = body.session;
  } catch {
    // A proxy error or server crash returns HTML: callers fall back to a status-based message.
  }
  throw new SurvivalRequestError(response.status, code, documentIds, session);
}

const jsonPost = (body: unknown, signal?: AbortSignal): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
  signal,
});

// POST /courses/{id}/survival-sessions/. Generates a new quiz (slow, calls the
// LLM) and is not idempotent, so callers must never retry it automatically.
export async function startSurvival(
  courseId: number,
  documentIds: number[],
  numQuestions: QuizLength,
  accessToken: string,
  signal?: AbortSignal,
): Promise<SurvivalSession> {
  return readJson<SurvivalSession>(
    await request(
      `/courses/${courseId}/survival-sessions/`,
      jsonPost({ document_ids: documentIds, num_questions: numQuestions }, signal),
      accessToken,
    ),
  );
}

// GET /survival-sessions/{id}/. Used to resume after a reload.
export async function getSurvivalSession(sessionId: number, accessToken: string, signal?: AbortSignal): Promise<SurvivalSession> {
  return readJson<SurvivalSession>(await request(`/survival-sessions/${sessionId}/`, { signal, cache: "no-store" }, accessToken));
}

// POST /survival-sessions/{id}/answers/. A repeat of the same answer is
// rejected with 409 QUESTION_NOT_CURRENT, so a retry can never cost two lives.
export async function answerSurvival(
  sessionId: number,
  questionId: number,
  selectedOptionIndex: number,
  accessToken: string,
  signal?: AbortSignal,
): Promise<SurvivalAnswerResult> {
  return readJson<SurvivalAnswerResult>(
    await request(
      `/survival-sessions/${sessionId}/answers/`,
      jsonPost({ question_id: questionId, selected_option_index: selectedOptionIndex }, signal),
      accessToken,
    ),
  );
}
