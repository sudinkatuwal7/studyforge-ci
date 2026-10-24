import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import DemoCourseChat from "./DemoCourseChat";
import CourseChat from "./CourseChat";

afterEach(() => vi.useRealTimers());

const readyDocument = {
  id: 1,
  course_id: 42,
  name: "Lecture.pdf",
  status: "READY" as const,
  error: null,
  created_at: "2026-10-01T00:00:00Z",
  updated_at: "2026-10-01T00:00:00Z",
};

it("labels demo replies and citations honestly, supports references, and prevents duplicate sends", async () => {
  vi.useFakeTimers();
  render(<DemoCourseChat courseId={42} materials={[{ id: 1, name: "Lecture.pdf", snapshot: readyDocument }]} />);
  expect(screen.getByText("Demo")).toBeInTheDocument();
  fireEvent.click(screen.getByText("Sources · 0 selected"));
  fireEvent.click(screen.getByRole("checkbox", { name: /Lecture.pdf/ }));
  expect(screen.getByText("Sources · 1 selected")).toBeInTheDocument();
  const input = screen.getByRole("textbox");
  fireEvent.change(input, { target: { value: "Explain this topic" } });
  fireEvent.keyDown(input, { key: "Enter" });
  expect(screen.getByText("Explain this topic")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /Send to Pandu \(demo\)/ })).toBeDisabled();
  await act(() => vi.advanceTimersByTimeAsync(600));
  expect(screen.getByText(/Pandu sample reply:/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Pandu sample citation · Preview" }));
  expect(screen.getByRole("region", { name: "Citation details" })).toHaveTextContent("No course document supports this sample reply");
});

it("keeps chat attachments local and removes deleted materials from selected references", () => {
  const { rerender } = render(<DemoCourseChat courseId={42} materials={[{ id: 1, name: "Lecture.pdf", snapshot: readyDocument }]} />);
  fireEvent.click(screen.getByText("Sources · 0 selected"));
  fireEvent.click(screen.getByRole("checkbox", { name: /Lecture.pdf/ }));
  fireEvent.change(screen.getByLabelText("Add documents to Pandu"), { target: { files: [new File(["sample"], "Local.pdf")] } });
  expect(screen.getByText(/Pandu demo attachment — local, not uploaded or processed/)).toBeInTheDocument();
  rerender(<DemoCourseChat courseId={42} materials={[]} />);
  expect(screen.getByText("Sources · 0 selected")).toBeInTheDocument();
  expect(screen.queryByText("Lecture.pdf")).not.toBeInTheDocument();
});

it("supports injected errors and retries without a demo dependency", () => {
  const retry = vi.fn();
  render(<CourseChat courseId={42} messages={[]} references={[]} selectedReferences={[]} status="error" error="Connection lost" onRetry={retry} onSend={vi.fn()} onReferencesChange={vi.fn()} onAddDocuments={vi.fn()} onCitation={vi.fn()} />);
  expect(screen.getByRole("alert")).toHaveTextContent("Connection lost");
  fireEvent.click(screen.getByRole("button", { name: "Retry with Pandu" }));
  expect(retry).toHaveBeenCalledOnce();
});

it("distinguishes sending from streaming and lets the student stop a response", () => {
  const stop = vi.fn();
  const props = {
    courseId: 42,
    messages: [],
    references: [],
    selectedReferences: [],
    onRetry: vi.fn(),
    onSend: vi.fn(),
    onStop: stop,
    onReferencesChange: vi.fn(),
    onAddDocuments: vi.fn(),
    onCitation: vi.fn(),
  };
  const { rerender } = render(<CourseChat {...props} status="sending" />);

  expect(screen.getByRole("status")).toHaveTextContent("Sending your message to Pandu");
  fireEvent.click(screen.getByRole("button", { name: "Stop response" }));
  expect(stop).toHaveBeenCalledOnce();

  rerender(<CourseChat {...props} status="streaming" />);
  expect(screen.getByRole("status")).toHaveTextContent("Pandu is responding");
  fireEvent.click(screen.getByRole("button", { name: "Stop response" }));
  expect(stop).toHaveBeenCalledTimes(2);
});

it("cancels Pandu's pending demo response", async () => {
  vi.useFakeTimers();
  render(<DemoCourseChat courseId={42} materials={[]} />);

  fireEvent.change(screen.getByRole("textbox"), { target: { value: "Explain this" } });
  fireEvent.click(screen.getByRole("button", { name: "Send to Pandu (demo)" }));
  fireEvent.click(screen.getByRole("button", { name: "Stop response" }));
  await act(() => vi.advanceTimersByTimeAsync(600));

  expect(screen.getByText("Pandu’s response was stopped.")).toBeInTheDocument();
  expect(screen.queryByText(/Pandu sample reply:/)).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Send to Pandu (demo)" })).toBeDisabled();
});

it("sends only selected and ready backend course document IDs", () => {
  const send = vi.fn();
  render(<CourseChat courseId={42} messages={[]} references={[
    { id: "course-1", documentId: 1, name: "Ready.pdf", source: "course", detail: "READY", available: true },
    { id: "course-2", documentId: 2, name: "Pending.pdf", source: "course", detail: "PROCESSING", available: false },
  ]} selectedReferences={["course-1", "course-2"]} status="idle" onRetry={vi.fn()} onSend={send}
    onReferencesChange={vi.fn()} onAddDocuments={vi.fn()} onCitation={vi.fn()} />);

  expect(screen.getByRole("checkbox", { name: /Pending.pdf/ })).toBeDisabled();
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "Compare the notes" } });
  fireEvent.click(screen.getByRole("button", { name: "Send to Pandu" }));

  expect(send).toHaveBeenCalledWith("Compare the notes", [1]);
});

it("fills the composer from a suggested prompt and marks the streamed message", () => {
  const { rerender } = render(<CourseChat courseId={42} messages={[]} references={[]} selectedReferences={[]} status="idle"
    onRetry={vi.fn()} onSend={vi.fn()} onReferencesChange={vi.fn()} onAddDocuments={vi.fn()} onCitation={vi.fn()} />);

  fireEvent.click(screen.getByRole("button", { name: "Explain a concept" }));
  expect(screen.getByRole("textbox")).toHaveValue("Explain a concept");

  rerender(<CourseChat courseId={42} messages={[{ id: "answer-1", role: "assistant", text: "Partial answer" }]} references={[]}
    selectedReferences={[]} status="streaming" onStop={vi.fn()} onRetry={vi.fn()} onSend={vi.fn()}
    onReferencesChange={vi.fn()} onAddDocuments={vi.fn()} onCitation={vi.fn()} />);
  expect(screen.getByText("Partial answer").closest("article")).toHaveAttribute("aria-busy", "true");
});
