// Mirrors QuizHistoryItemSerializer and QuizProgressSerializer in
// backend/apps/quizzes/serializers.py. Keep the two in step.
import type { QuizMode, SurvivalStatus } from "./survival";

// One finished quiz or Survival game.
export type QuizHistoryItem = {
  quiz_id: number;
  title: string;
  course: number;
  course_name: string;
  mode: QuizMode;
  // How a Survival game ended; null for a regular quiz.
  survival_status: Exclude<SurvivalStatus, "ACTIVE"> | null;
  score: number;
  total_questions: number;
  percentage: number;
  // When the quiz was submitted or the game ended.
  submitted_at: string;
};

export type QuizProgress = {
  course: number;
  quizzes_taken: number;
  // Per mode, because an early Survival game-over scores every question.
  // null when no quiz of that mode has been finished in the course.
  best_percentage: Record<QuizMode, number | null>;
  // Up to 5, newest first.
  recent: QuizHistoryItem[];
};
