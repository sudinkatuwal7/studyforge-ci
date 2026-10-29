import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { generateQuiz, getQuiz, getQuizResults, QuizRequestError, submitQuiz } from "../../api/quizzes";
import type { TrackedDocument } from "../../types/document";
import type { Quiz, QuizResult } from "../../types/quiz";
import QuizPanel from "./QuizPanel";

vi.mock("../../context/AuthContext", () => ({ useAuth: () => ({ user: { id: 1 }, accessToken: "tok" }) }));
vi.mock("../../api/quizzes", async (original) => ({
  ...await original<typeof import("../../api/quizzes")>(),
  generateQuiz: vi.fn(), submitQuiz: vi.fn(), getQuiz: vi.fn(), getQuizResults: vi.fn(),
}));

afterEach(() => { vi.clearAllMocks(); sessionStorage.clear(); });

const doc = (id: number, name: string, status: "READY" | "PROCESSING" | "FAILED"): TrackedDocument => ({
  id, name, snapshot: { id, course_id: 42, name, status, created_at: "", updated_at: "", error: status === "FAILED" ? { code: "x", message: "x" } : null },
});
const materials = [doc(1, "Cells.pdf", "READY"), doc(2, "Genes.pdf", "READY"), doc(3, "Slides.pptx", "PROCESSING")];

const quiz: Quiz = {
  id: 5, title: "Biology quiz", course: 42, source_documents: [1], created_at: "", is_submitted: false,
  questions: [{ id: 11, position: 1, text: "What is a cell?", options: ["A", "B", "C", "D"] }],
};
const result: QuizResult = {
  quiz_id: 5, title: "Biology quiz", course: 42, score: 1, total_questions: 1, percentage: 100, submitted_at: "",
  questions: [{ ...quiz.questions[0], selected_option_index: 0, correct_option_index: 0, is_correct: true, explanation: "Cells are the unit of life." }],
};

const renderPanel = () => render(<QuizPanel courseId={42} materials={materials} />);

it("disables materials that are not READY and requires a selection", () => {
  renderPanel();
  expect(screen.getByLabelText(/Slides.pptx/)).toBeDisabled();
  expect(screen.getByText("Still processing")).toBeVisible();
  expect(screen.getByRole("button", { name: "Generate quiz" })).toBeDisabled();
  expect(screen.getByText("Select at least one material.")).toBeVisible();
});

it("generates, answers, submits, then reveals the score and explanations", async () => {
  vi.mocked(generateQuiz).mockResolvedValue(quiz);
  vi.mocked(submitQuiz).mockResolvedValue(result);
  renderPanel();
  fireEvent.click(screen.getByLabelText("Cells.pdf"));
  fireEvent.click(screen.getByLabelText("10 questions"));
  fireEvent.click(screen.getByRole("button", { name: "Generate quiz" }));
  expect(generateQuiz).toHaveBeenCalledWith(42, [1], 10, "tok", expect.any(AbortSignal));

  await screen.findByText("What is a cell?");
  expect(screen.queryByText("Cells are the unit of life.")).not.toBeInTheDocument();
  fireEvent.click(screen.getByLabelText("A"));
  fireEvent.click(screen.getByRole("button", { name: "Submit Quiz" }));

  expect(await screen.findByText(/You scored 1 out of 1 \(100%\)/)).toBeVisible();
  expect(screen.getByText("Cells are the unit of life.")).toBeVisible();
  expect(submitQuiz).toHaveBeenCalledWith(5, [{ question_id: 11, selected_option_index: 0 }], "tok", expect.any(AbortSignal));
});

it("keeps the selection when the student starts another quiz", async () => {
  vi.mocked(generateQuiz).mockResolvedValue(quiz);
  vi.mocked(submitQuiz).mockResolvedValue(result);
  renderPanel();
  fireEvent.click(screen.getByLabelText("Cells.pdf"));
  fireEvent.click(screen.getByRole("button", { name: "Generate quiz" }));
  await screen.findByText("What is a cell?");
  fireEvent.click(screen.getByLabelText("A"));
  fireEvent.click(screen.getByRole("button", { name: "Submit Quiz" }));
  fireEvent.click(await screen.findByRole("button", { name: "Take another quiz" }));
  expect(screen.getByLabelText("Cells.pdf")).toBeChecked();
});

it.each([
  ["DOCUMENT_NOT_READY", 409, /still processing/],
  ["DOCUMENT_HAS_NO_TEXT", 409, /No readable text/],
  ["QUIZ_GENERATION_FAILED", 503, /could not be generated right now/],
])("explains a %s failure and keeps the setup so the student can retry", async (code, status, message) => {
  vi.mocked(generateQuiz).mockRejectedValue(new QuizRequestError(status, code));
  renderPanel();
  fireEvent.click(screen.getByLabelText("Cells.pdf"));
  fireEvent.click(screen.getByRole("button", { name: "Generate quiz" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(message);
  expect(screen.getByLabelText("Cells.pdf")).toBeChecked();
  expect(screen.getByRole("button", { name: "Generate quiz" })).toBeEnabled();
});

it("keeps the answers and shows an error when submitting fails", async () => {
  vi.mocked(generateQuiz).mockResolvedValue(quiz);
  vi.mocked(submitQuiz).mockRejectedValue(new QuizRequestError(500));
  renderPanel();
  fireEvent.click(screen.getByLabelText("Cells.pdf"));
  fireEvent.click(screen.getByRole("button", { name: "Generate quiz" }));
  await screen.findByText("What is a cell?");
  fireEvent.click(screen.getByLabelText("B"));
  fireEvent.click(screen.getByRole("button", { name: "Submit Quiz" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("still here");
  expect(screen.getByLabelText("B")).toBeChecked();
});

it("shows the saved grade when the quiz was already submitted", async () => {
  vi.mocked(generateQuiz).mockResolvedValue(quiz);
  vi.mocked(submitQuiz).mockRejectedValue(new QuizRequestError(409, "QUIZ_ALREADY_SUBMITTED"));
  vi.mocked(getQuizResults).mockResolvedValue(result);
  renderPanel();
  fireEvent.click(screen.getByLabelText("Cells.pdf"));
  fireEvent.click(screen.getByRole("button", { name: "Generate quiz" }));
  await screen.findByText("What is a cell?");
  fireEvent.click(screen.getByLabelText("A"));
  fireEvent.click(screen.getByRole("button", { name: "Submit Quiz" }));
  await waitFor(() => expect(getQuizResults).toHaveBeenCalledWith(5, "tok", expect.any(AbortSignal)));
  expect(await screen.findByText(/You scored 1 out of 1/)).toBeVisible();
});

const savedKey = "studyforge:quiz:1:42";

it("remembers the open quiz and forgets it on Take another quiz", async () => {
  vi.mocked(generateQuiz).mockResolvedValue(quiz);
  vi.mocked(submitQuiz).mockResolvedValue(result);
  renderPanel();
  fireEvent.click(screen.getByLabelText("Cells.pdf"));
  fireEvent.click(screen.getByRole("button", { name: "Generate quiz" }));
  await screen.findByText("What is a cell?");
  expect(sessionStorage.getItem(savedKey)).toBe("5");
  fireEvent.click(screen.getByLabelText("A"));
  fireEvent.click(screen.getByRole("button", { name: "Submit Quiz" }));
  fireEvent.click(await screen.findByRole("button", { name: "Take another quiz" }));
  expect(sessionStorage.getItem(savedKey)).toBeNull();
});

it("shows the saved results again after a reload", async () => {
  sessionStorage.setItem(savedKey, "5");
  vi.mocked(getQuiz).mockResolvedValue({ ...quiz, is_submitted: true });
  vi.mocked(getQuizResults).mockResolvedValue(result);
  renderPanel();
  expect(screen.getByRole("status")).toHaveTextContent("Loading your quiz");
  expect(await screen.findByText(/You scored 1 out of 1 \(100%\)/)).toBeVisible();
  expect(getQuiz).toHaveBeenCalledWith(5, "tok", expect.any(AbortSignal));
  expect(getQuizResults).toHaveBeenCalledWith(5, "tok", expect.any(AbortSignal));
});

it("reopens an unsubmitted quiz after a reload without showing answers", async () => {
  sessionStorage.setItem(savedKey, "5");
  vi.mocked(getQuiz).mockResolvedValue(quiz);
  renderPanel();
  expect(await screen.findByText("What is a cell?")).toBeVisible();
  expect(getQuizResults).not.toHaveBeenCalled();
  expect(screen.queryByText("Cells are the unit of life.")).not.toBeInTheDocument();
});

it("forgets a saved quiz that no longer exists and shows setup", async () => {
  sessionStorage.setItem(savedKey, "5");
  vi.mocked(getQuiz).mockRejectedValue(new QuizRequestError(404));
  renderPanel();
  expect(await screen.findByRole("button", { name: "Generate quiz" })).toBeVisible();
  expect(sessionStorage.getItem(savedKey)).toBeNull();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

it("keeps the saved quiz and explains when it cannot be loaded", async () => {
  sessionStorage.setItem(savedKey, "5");
  vi.mocked(getQuiz).mockRejectedValue(new QuizRequestError(500));
  renderPanel();
  expect(await screen.findByText(/Your last quiz could not be loaded/)).toBeVisible();
  expect(sessionStorage.getItem(savedKey)).toBe("5");
});
