import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import type { QuizResult } from "../../types/quiz";
import QuizResults from "./QuizResults";

// Listed out of position order to check the review is sorted by position.
const result: QuizResult = {
  quiz_id: 5, title: "Biology quiz", course: 42, score: 1, total_questions: 3, percentage: 33.33,
  submitted_at: "2026-10-28T10:00:00Z",
  questions: [
    {
      id: 12, position: 2, text: "What is DNA?", options: ["E", "F", "G", "H"],
      selected_option_index: 0, correct_option_index: 2, is_correct: false, explanation: "DNA carries genes.",
    },
    {
      id: 11, position: 1, text: "What is a cell?", options: ["A", "B", "C", "D"],
      selected_option_index: 1, correct_option_index: 1, is_correct: true, explanation: "Cells are the unit of life.",
    },
    {
      id: 13, position: 3, text: "What is RNA?", options: ["I", "J", "K", "L"],
      selected_option_index: null, correct_option_index: 3, is_correct: false, explanation: "RNA copies DNA.",
    },
  ],
};

const renderResults = (onRestart = vi.fn()) => {
  render(<QuizResults result={result} onRestart={onRestart} />);
  return onRestart;
};

// Each reviewed question is a top-level item of the review list, in position order.
const reviewItems = () => [...screen.getAllByRole("list")[0].children] as HTMLElement[];

const option = (question: HTMLElement, text: string) =>
  within(question).getAllByRole("listitem").find((item) => item.textContent?.startsWith(text))!;

it("shows the score and percentage", () => {
  renderResults();
  expect(screen.getByRole("status")).toHaveTextContent("You scored 1 out of 3 (33.33%)");
});

it("reviews questions in position order", () => {
  renderResults();
  expect(reviewItems().map((item) => item.querySelector("strong")?.textContent))
    .toEqual(["What is a cell?", "What is DNA?", "What is RNA?"]);
});

it("marks a correct question as Correct", () => {
  renderResults();
  const [correct] = reviewItems();
  expect(within(correct).getByText("Correct")).toBeVisible();
  expect(option(correct, "B")).toHaveTextContent("(correct answer)");
  expect(within(correct).queryByText(/your answer/)).not.toBeInTheDocument();
});

it("marks a wrong answer as Incorrect and labels the student's and the correct option", () => {
  renderResults();
  const wrong = reviewItems()[1];
  expect(within(wrong).getByText("Incorrect")).toBeVisible();
  expect(option(wrong, "E")).toHaveTextContent("(your answer)");
  expect(option(wrong, "G")).toHaveTextContent("(correct answer)");
  expect(option(wrong, "F")).toHaveTextContent(/^F$/);
});

it("marks an unanswered question as Not answered and still shows the correct option", () => {
  renderResults();
  const skipped = reviewItems()[2];
  expect(within(skipped).getByText("Not answered")).toBeVisible();
  expect(option(skipped, "L")).toHaveTextContent("(correct answer)");
  expect(within(skipped).queryByText(/your answer/)).not.toBeInTheDocument();
});

it("shows the explanation for every question", () => {
  renderResults();
  for (const explanation of ["Cells are the unit of life.", "DNA carries genes.", "RNA copies DNA."]) {
    expect(screen.getByText(explanation)).toBeVisible();
  }
});

it("calls onRestart from Take another quiz", () => {
  const onRestart = renderResults();
  fireEvent.click(screen.getByRole("button", { name: "Take another quiz" }));
  expect(onRestart).toHaveBeenCalledOnce();
});

it("moves focus to the results heading so it is not lost when the player unmounts", () => {
  renderResults();
  expect(screen.getByRole("heading", { name: "Biology quiz" })).toHaveFocus();
});
