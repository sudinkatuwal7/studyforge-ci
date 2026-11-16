import { QuizRequestError } from "../../api/quizzes";

// Words a quiz-generation failure for the student. Shared by the regular quiz and
// Survival, whose start endpoint returns the same codes. The API layer only reports status and code.
export function generateErrorMessage(cause: unknown): string {
  if (cause instanceof QuizRequestError) {
    if (cause.code === "DOCUMENT_NOT_READY") return "Some selected materials are still processing. Wait for them to be ready, or deselect them.";
    if (cause.code === "DOCUMENT_HAS_NO_TEXT") return "No readable text could be found in some selected materials. Deselect them and try again.";
    if (cause.code === "QUIZ_GENERATION_FAILED") return "The quiz could not be generated right now. Please try again.";
    if (cause.status === 400) return "Choose at least one material and a quiz length.";
    if (cause.status === 404) return "One of the selected materials could not be found. Refresh the page and try again.";
  }
  return "The quiz could not be generated. Please try again.";
}
