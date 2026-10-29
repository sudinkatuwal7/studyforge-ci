import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import type { Quiz } from "../../types/quiz";
import QuizPlayer from "./QuizPlayer";

const quiz: Quiz = {
  id: 5, title: "Biology quiz", course: 42, source_documents: [1], created_at: "2026-10-27", is_submitted: false,
  questions: [
    { id: 11, position: 1, text: "What is a cell?", options: ["A", "B", "C", "D"] },
    { id: 12, position: 2, text: "What is DNA?", options: ["E", "F", "G", "H"] },
  ],
};

const renderPlayer = (onSubmit = vi.fn()) => {
  render(<QuizPlayer quiz={quiz} submitting={false} error="" onSubmit={onSubmit} />);
  return onSubmit;
};

it("shows one question at a time and never shows answers or explanations", () => {
  renderPlayer();
  expect(screen.getByText("What is a cell?")).toBeVisible();
  expect(screen.queryByText("What is DNA?")).not.toBeInTheDocument();
  expect(screen.queryByText(/correct/i)).not.toBeInTheDocument();
  expect(screen.queryByText(/explanation/i)).not.toBeInTheDocument();
});

it("lets the student navigate and change an answer before submitting", () => {
  const onSubmit = renderPlayer();
  fireEvent.click(screen.getByLabelText("A"));
  fireEvent.click(screen.getByLabelText("B"));
  expect(screen.getByLabelText("B")).toBeChecked();
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  fireEvent.click(screen.getByLabelText("G"));
  fireEvent.click(screen.getByRole("button", { name: "Previous" }));
  expect(screen.getByLabelText("B")).toBeChecked();
  fireEvent.click(screen.getByRole("button", { name: "Question 2, answered" }));
  fireEvent.click(screen.getByRole("button", { name: "Submit Quiz" }));
  expect(onSubmit).toHaveBeenCalledWith([
    { question_id: 11, selected_option_index: 1 },
    { question_id: 12, selected_option_index: 2 },
  ]);
});

it("only offers Submit Quiz on the last question", () => {
  renderPlayer();
  expect(screen.queryByRole("button", { name: "Submit Quiz" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  expect(screen.getByRole("button", { name: "Submit Quiz" })).toBeVisible();
});

it("asks for confirmation before submitting with unanswered questions, sending null for them", () => {
  const onSubmit = renderPlayer();
  fireEvent.click(screen.getByLabelText("A"));
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  fireEvent.click(screen.getByRole("button", { name: "Submit Quiz" }));
  expect(onSubmit).not.toHaveBeenCalled();
  expect(screen.getByRole("alert")).toHaveTextContent("1 question is unanswered");
  fireEvent.click(screen.getByRole("button", { name: "Keep answering" }));
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Submit Quiz" }));
  fireEvent.click(screen.getByRole("button", { name: "Submit anyway" }));
  expect(onSubmit).toHaveBeenCalledWith([
    { question_id: 11, selected_option_index: 0 },
    { question_id: 12, selected_option_index: null },
  ]);
});

it("reports progress as questions are answered", () => {
  renderPlayer();
  expect(screen.getByRole("status")).toHaveTextContent("Question 1 of 2 · 0 of 2 answered");
  fireEvent.click(screen.getByLabelText("C"));
  expect(screen.getByRole("status")).toHaveTextContent("1 of 2 answered");
});
