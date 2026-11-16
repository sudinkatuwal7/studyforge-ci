import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { getQuizResults } from "../../api/quizzes";
import { answerSurvival, getSurvivalSession, startSurvival, SurvivalRequestError } from "../../api/survival";
import type { TrackedDocument } from "../../types/document";
import type { QuizResult } from "../../types/quiz";
import type { SurvivalAnswerResult, SurvivalSession } from "../../types/survival";
import QuizPanel from "./QuizPanel";

vi.mock("../../context/AuthContext", () => ({ useAuth: () => ({ user: { id: 1 }, accessToken: "tok" }) }));
vi.mock("../../api/survival", async (original) => ({
  ...await original<typeof import("../../api/survival")>(),
  startSurvival: vi.fn(), getSurvivalSession: vi.fn(), answerSurvival: vi.fn(),
}));
vi.mock("../../api/quizzes", async (original) => ({
  ...await original<typeof import("../../api/quizzes")>(),
  generateQuiz: vi.fn(), submitQuiz: vi.fn(), getQuiz: vi.fn(), getQuizResults: vi.fn(),
}));

afterEach(() => { vi.clearAllMocks(); sessionStorage.clear(); });

const doc = (id: number, name: string): TrackedDocument => ({
  id, name, snapshot: { id, course_id: 42, name, status: "READY", created_at: "", updated_at: "", error: null },
});
const materials = [doc(1, "Stacks.pdf"), doc(2, "Queues.pdf")];
const savedKey = "studyforge:survival:1:42";

const q1 = { id: 101, position: 1, text: "Which is last in, first out?", options: ["Stack", "Queue", "Tree", "Graph"] };
const q2 = { id: 102, position: 2, text: "Which is first in, first out?", options: ["Stack", "Queue", "Tree", "Graph"] };

const state = (overrides: Partial<SurvivalSession> = {}): SurvivalSession => ({
  id: 7, quiz_id: 9, course: 42, status: "ACTIVE", lives: 3, max_lives: 3, score: 0,
  current_position: 1, total_questions: 5, current_question: q1, started_at: "", ended_at: null, ...overrides,
});
const answered = (overrides: Partial<SurvivalAnswerResult>, session: SurvivalSession): SurvivalAnswerResult => ({
  question_id: 101, selected_option_index: 0, is_correct: true, correct_option_index: 0, explanation: "A stack pops the newest item.", session, ...overrides,
});

const renderPanel = () => render(<QuizPanel courseId={42} materials={materials} />);
const score = () => screen.getByText(/^Score:/);

async function startGame() {
  vi.mocked(startSurvival).mockResolvedValue(state());
  renderPanel();
  fireEvent.click(screen.getByLabelText(/Survival/));
  fireEvent.click(screen.getByLabelText("Stacks.pdf"));
  fireEvent.click(screen.getByRole("button", { name: "Start Survival" }));
  await screen.findByText(q1.text);
}

it("starts a Survival game from the course quiz setup with 3 lives and score 0", async () => {
  await startGame();
  expect(startSurvival).toHaveBeenCalledWith(42, [1], 5, "tok", expect.any(AbortSignal));
  expect(screen.getByRole("img", { name: "3 of 3 lives left" })).toBeVisible();
  expect(score()).toHaveTextContent("Score: 0");
  expect(screen.getByText("Question 1 of 5")).toBeVisible();
  expect(screen.getByRole("progressbar", { name: "Game progress" })).toHaveAttribute("value", "0");
  expect(JSON.parse(sessionStorage.getItem(savedKey) ?? "null")).toEqual({ sessionId: 7, documentIds: [1] });
});

it("shows the server's new score after a correct answer, then the next question", async () => {
  await startGame();
  vi.mocked(answerSurvival).mockResolvedValue(answered({}, state({ score: 1, current_position: 2, current_question: q2 })));
  fireEvent.click(screen.getByRole("button", { name: "Stack" }));
  expect(answerSurvival).toHaveBeenCalledWith(7, 101, 0, "tok", expect.any(AbortSignal));

  expect(await screen.findByText("Correct! +1 point")).toBeVisible();
  expect(score()).toHaveTextContent("Score: 1");
  expect(screen.getByRole("img", { name: "3 of 3 lives left" })).toBeVisible();
  expect(screen.getByRole("progressbar", { name: "Game progress" })).toHaveAttribute("value", "1");
  expect(screen.getByRole("status")).toHaveTextContent("Correct. Your score is 1.");
  expect(screen.queryByText(/^The correct answer was/)).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: /Stack/ })).toHaveClass("survival-option-correct");

  fireEvent.click(screen.getByRole("button", { name: "Next question" }));
  expect(screen.getByText(q2.text)).toBeVisible();
  expect(screen.getByText("Question 2 of 5")).toBeVisible();
});

it("shows a lost life, the correct option and the explanation after a wrong answer", async () => {
  await startGame();
  vi.mocked(answerSurvival).mockResolvedValue(answered(
    { selected_option_index: 1, is_correct: false }, state({ lives: 2, current_position: 2, current_question: q2 }),
  ));
  fireEvent.click(screen.getByRole("button", { name: "Queue" }));

  expect(await screen.findByText("Not quite. You lost a life.")).toBeVisible();
  expect(screen.getByRole("img", { name: "2 of 3 lives left" })).toBeVisible();
  expect(score()).toHaveTextContent("Score: 0");
  expect(screen.getByRole("button", { name: "Queue Your answer" })).toHaveClass("survival-option-wrong");
  expect(screen.getByRole("button", { name: "Stack Correct answer" })).toHaveClass("survival-option-correct");
  expect(screen.getByText("A stack pops the newest item.")).toBeVisible();
  // Named in words too, in case the green option is scrolled under the pinned bar.
  expect(screen.getByText(/^The correct answer was/)).toHaveTextContent("The correct answer was A. Stack");
  expect(screen.getByRole("status")).toHaveTextContent("Wrong answer. You lost a life. 2 of 3 left. The correct answer was A. Stack.");
  expect(document.querySelectorAll(".survival-heart-losing")).toHaveLength(1);
  // Every option stays locked until the student moves on.
  for (const option of screen.getAllByRole("button", { name: /Stack|Queue|Tree|Graph/ })) expect(option).toBeDisabled();
});

it("disables the options while an answer is being sent and sends it only once", async () => {
  await startGame();
  let finish: (value: SurvivalAnswerResult) => void = () => {};
  vi.mocked(answerSurvival).mockReturnValue(new Promise((resolve) => { finish = resolve; }));
  const stack = screen.getByRole("button", { name: "Stack" });
  fireEvent.click(stack);
  fireEvent.click(stack);
  fireEvent.click(screen.getByRole("button", { name: "Queue" }));

  expect(answerSurvival).toHaveBeenCalledTimes(1);
  for (const option of screen.getAllByRole("button", { name: /Stack|Queue|Tree|Graph/ })) expect(option).toBeDisabled();
  expect(stack).toHaveClass("survival-option-pending");

  await act(async () => finish(answered({}, state({ score: 1, current_position: 2, current_question: q2 }))));
  expect(screen.getByText("Correct! +1 point")).toBeVisible();
});

it("shows the real question when the server says the answered one is no longer current", async () => {
  await startGame();
  vi.mocked(answerSurvival).mockRejectedValue(new SurvivalRequestError(409, "QUESTION_NOT_CURRENT", [],
    state({ lives: 2, score: 0, current_position: 2, current_question: q2 })));
  fireEvent.click(screen.getByRole("button", { name: "Stack" }));

  expect(await screen.findByRole("alert")).toHaveTextContent("already answered");
  expect(screen.getByText(q2.text)).toBeVisible();
  expect(screen.getByRole("img", { name: "2 of 3 lives left" })).toBeVisible();
  expect(screen.getByRole("button", { name: "Stack" })).toBeEnabled();
});

it("goes to the summary when the server says the game already ended", async () => {
  await startGame();
  vi.mocked(answerSurvival).mockRejectedValue(new SurvivalRequestError(409, "SURVIVAL_SESSION_ENDED", [],
    state({ status: "GAME_OVER", lives: 0, score: 2, current_position: 4, current_question: null, ended_at: "x" })));
  fireEvent.click(screen.getByRole("button", { name: "Stack" }));

  expect(await screen.findByRole("heading", { name: "Game over" })).toBeVisible();
  expect(screen.getByText(/^Final score:/)).toHaveTextContent("Final score: 2 out of 5");
});

it("keeps the question and costs nothing when the answer is rejected as invalid", async () => {
  await startGame();
  vi.mocked(answerSurvival).mockRejectedValue(new SurvivalRequestError(400));
  fireEvent.click(screen.getByRole("button", { name: "Stack" }));

  expect(await screen.findByRole("alert")).toHaveTextContent("No life was lost");
  expect(screen.getByRole("img", { name: "3 of 3 lives left" })).toBeVisible();
  expect(screen.getByRole("button", { name: "Stack" })).toBeEnabled();
});

it("shows the last answer's feedback, then the game-over summary", async () => {
  await startGame();
  vi.mocked(answerSurvival).mockResolvedValue(answered({ selected_option_index: 1, is_correct: false },
    state({ status: "GAME_OVER", lives: 0, score: 1, current_position: 4, current_question: null, ended_at: "x" })));
  fireEvent.click(screen.getByRole("button", { name: "Queue" }));

  expect(await screen.findByText("Out of lives!")).toBeVisible();
  expect(screen.getByRole("img", { name: "0 of 3 lives left" })).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "See results" }));

  expect(screen.getByRole("heading", { name: "Game over" })).toHaveFocus();
  expect(screen.getByText(/^Final score:/)).toHaveTextContent("Final score: 1 out of 5");
  expect(screen.getByText("You ran out of lives on question 4 of 5.")).toBeVisible();
});

const ended = state({ status: "COMPLETED", lives: 2, score: 4, current_position: 5, current_question: null, ended_at: "x" });

it("plays again with the same materials and length", async () => {
  sessionStorage.setItem(savedKey, JSON.stringify({ sessionId: 7, documentIds: [2] }));
  vi.mocked(getSurvivalSession).mockResolvedValue(ended);
  vi.mocked(startSurvival).mockResolvedValue(state({ id: 8 }));
  renderPanel();
  expect(await screen.findByRole("heading", { name: "You survived!" })).toBeVisible();
  expect(screen.getByText("You answered every question with 2 lives left.")).toBeVisible();

  fireEvent.click(screen.getByRole("button", { name: "Play again" }));
  expect(startSurvival).toHaveBeenCalledWith(42, [2], 5, "tok", expect.any(AbortSignal));
  expect(await screen.findByText(q1.text)).toBeVisible();
  expect(JSON.parse(sessionStorage.getItem(savedKey) ?? "null")).toEqual({ sessionId: 8, documentIds: [2] });
});

it("exits to the quiz setup and forgets the finished game", async () => {
  sessionStorage.setItem(savedKey, JSON.stringify({ sessionId: 7, documentIds: [2] }));
  vi.mocked(getSurvivalSession).mockResolvedValue(ended);
  renderPanel();
  fireEvent.click(await screen.findByRole("button", { name: "Exit" }));

  expect(screen.getByRole("button", { name: "Start Survival" })).toBeVisible();
  expect(screen.getByLabelText(/Survival/)).toBeChecked();
  expect(sessionStorage.getItem(savedKey)).toBeNull();
});

const review: QuizResult = {
  quiz_id: 9, title: "Survival quiz", course: 42, score: 1, total_questions: 2, percentage: 50, submitted_at: "",
  questions: [
    { ...q1, selected_option_index: 0, correct_option_index: 0, is_correct: true, explanation: "A stack pops the newest item." },
    { ...q2, selected_option_index: null, correct_option_index: 1, is_correct: false, explanation: "A queue serves the oldest item." },
  ],
};

it("reviews every answer after the game from the saved results, marking unreached questions", async () => {
  sessionStorage.setItem(savedKey, JSON.stringify({ sessionId: 7, documentIds: [1] }));
  vi.mocked(getSurvivalSession).mockResolvedValue(state({ status: "GAME_OVER", lives: 0, score: 1, current_position: 1, current_question: null, ended_at: "x" }));
  vi.mocked(getQuizResults).mockResolvedValue(review);
  renderPanel();
  fireEvent.click(await screen.findByRole("button", { name: "Review answers" }));

  expect(getQuizResults).toHaveBeenCalledWith(9, "tok", expect.any(AbortSignal));
  expect(await screen.findByRole("heading", { name: "Your answers" })).toHaveFocus();
  expect(screen.getByText("Not reached")).toBeVisible();
  expect(screen.getByText("A queue serves the oldest item.")).toBeVisible();
  expect(screen.queryByRole("button", { name: "Review answers" })).not.toBeInTheDocument();
  // The summary and its actions stay above the review.
  expect(screen.getByRole("button", { name: "Play again" })).toBeEnabled();
});

it("keeps the summary and lets the student retry when the review cannot be loaded", async () => {
  sessionStorage.setItem(savedKey, JSON.stringify({ sessionId: 7, documentIds: [1] }));
  vi.mocked(getSurvivalSession).mockResolvedValue(ended);
  vi.mocked(getQuizResults).mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(review);
  renderPanel();
  fireEvent.click(await screen.findByRole("button", { name: "Review answers" }));

  expect(await screen.findByRole("alert")).toHaveTextContent("could not be loaded");
  expect(screen.getByRole("heading", { name: "You survived!" })).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Review answers" }));
  expect(await screen.findByRole("heading", { name: "Your answers" })).toBeVisible();
});

it("resumes the same game after a reload with the server's lives, score and question", async () => {
  sessionStorage.setItem(savedKey, JSON.stringify({ sessionId: 7, documentIds: [1] }));
  vi.mocked(getSurvivalSession).mockResolvedValue(state({ lives: 2, score: 1, current_position: 2, current_question: q2 }));
  renderPanel();
  expect(screen.getByRole("status")).toHaveTextContent("Loading your quiz");

  expect(await screen.findByText(q2.text)).toBeVisible();
  expect(getSurvivalSession).toHaveBeenCalledWith(7, "tok", expect.any(AbortSignal));
  expect(screen.getByRole("img", { name: "2 of 3 lives left" })).toBeVisible();
  expect(score()).toHaveTextContent("Score: 1");
  expect(screen.getByText("Question 2 of 5")).toBeVisible();
});

it("forgets a saved game that no longer exists and shows setup", async () => {
  sessionStorage.setItem(savedKey, JSON.stringify({ sessionId: 7, documentIds: [1] }));
  vi.mocked(getSurvivalSession).mockRejectedValue(new SurvivalRequestError(404));
  renderPanel();

  expect(await screen.findByRole("button", { name: "Start Survival" })).toBeVisible();
  expect(sessionStorage.getItem(savedKey)).toBeNull();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

it("explains a failed start and keeps the setup so the student can retry", async () => {
  vi.mocked(startSurvival).mockRejectedValue(new SurvivalRequestError(409, "DOCUMENT_NOT_READY"));
  renderPanel();
  fireEvent.click(screen.getByLabelText(/Survival/));
  fireEvent.click(screen.getByLabelText("Stacks.pdf"));
  fireEvent.click(screen.getByRole("button", { name: "Start Survival" }));

  expect(await screen.findByRole("alert")).toHaveTextContent(/still processing/);
  expect(screen.getByRole("button", { name: "Start Survival" })).toBeEnabled();
  expect(sessionStorage.getItem(savedKey)).toBeNull();
});
