import { ApiError } from "../../api/client";
import { QuizRequestError } from "../../api/quizzes";
import type { QuizHistoryItem } from "../../types/quizHistory";

export function loadErrorMessage(cause: unknown, what: string): string {
  const status = cause instanceof QuizRequestError || cause instanceof ApiError ? cause.status : 0;
  if (status === 401) return "Your session has expired. Please sign in again.";
  return `Could not load your ${what}. Please reload the page to try again.`;
}

export function formatDate(value: string): string {
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function modeLabel(item: QuizHistoryItem): string {
  if (item.mode === "regular") return "Quiz";
  return item.survival_status === "COMPLETED" ? "Survival · Completed" : "Survival · Game over";
}

export function scoreLabel(item: QuizHistoryItem): string {
  return `${item.score}/${item.total_questions} (${item.percentage}%)`;
}
