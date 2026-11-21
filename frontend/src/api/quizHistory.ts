import { request } from "./client";
import { readJson } from "./quizzes";
import type { QuizHistoryItem, QuizProgress } from "../types/quizHistory";

// GET /quiz-history/[?course=id]. Newest first. A course that is not the
// student's is a 404 (QuizRequestError), not an empty list.
export async function listQuizHistory(
  accessToken: string,
  courseId?: number | null,
  signal?: AbortSignal,
): Promise<QuizHistoryItem[]> {
  const query = courseId == null ? "" : `?course=${encodeURIComponent(courseId)}`;
  return readJson<QuizHistoryItem[]>(await request(`/quiz-history/${query}`, { signal, cache: "no-store" }, accessToken));
}

export async function getQuizProgress(courseId: number, accessToken: string, signal?: AbortSignal): Promise<QuizProgress> {
  return readJson<QuizProgress>(await request(`/courses/${courseId}/quiz-progress/`, { signal, cache: "no-store" }, accessToken));
}
