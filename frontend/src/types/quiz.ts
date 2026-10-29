// Mirrors backend/apps/quizzes/serializers.py. Keep the two in step.

export const QUIZ_LENGTHS = [5, 10] as const;
export type QuizLength = (typeof QUIZ_LENGTHS)[number];

// What a student sees while taking a quiz: no correct answer, no explanation.
export type QuizQuestion = {
  id: number;
  position: number;
  text: string;
  options: string[];
};

export type Quiz = {
  id: number;
  title: string;
  course: number;
  source_documents: number[];
  created_at: string;
  is_submitted: boolean;
  questions: QuizQuestion[];
};

// null means the student left the question unanswered.
export type QuizAnswer = { question_id: number; selected_option_index: number | null };

// One reviewed question. Only the results endpoints ever send these fields.
export type QuestionResult = QuizQuestion & {
  selected_option_index: number | null;
  correct_option_index: number;
  is_correct: boolean;
  explanation: string;
};

export type QuizResult = {
  quiz_id: number;
  title: string;
  course: number;
  score: number;
  total_questions: number;
  percentage: number;
  submitted_at: string;
  questions: QuestionResult[];
};
