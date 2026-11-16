// Mirrors the Survival section of docs/api-contract.md. Keep the two in step.
import type { QuizQuestion } from "./quiz";

export type QuizMode = "regular" | "survival";

export type SurvivalStatus = "ACTIVE" | "GAME_OVER" | "COMPLETED";

// The server owns every number here. The UI only displays them.
export type SurvivalSession = {
  id: number;
  quiz_id: number;
  course: number;
  status: SurvivalStatus;
  lives: number;
  max_lives: number;
  score: number;
  // After the game ends this stays on the last question answered.
  current_position: number;
  total_questions: number;
  // Never includes the answer; null once the game has ended.
  current_question: QuizQuestion | null;
  started_at: string;
  ended_at: string | null;
};

// Reveals the answer only for the question just answered.
export type SurvivalAnswerResult = {
  question_id: number;
  selected_option_index: number;
  is_correct: boolean;
  correct_option_index: number;
  explanation: string;
  session: SurvivalSession;
};

// The question the student just answered, kept so its feedback can be shown
// after the server has already moved the session on to the next question.
export type SurvivalFeedback = { question: QuizQuestion; result: SurvivalAnswerResult };
