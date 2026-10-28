import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import CourseWorkspace from "./CourseWorkspace";
import { listDocuments } from "../../api/documents";
import { askConversationQuestion, listConversations, listConversationUploads } from "../../api/conversations";

vi.mock("../../context/AuthContext", () => ({ useAuth: () => ({ user: { id: 1 }, accessToken: "token" }) }));
vi.mock("../../api/documents", async (original) => ({ ...await original<typeof import("../../api/documents")>(), listDocuments: vi.fn().mockResolvedValue([]) }));
vi.mock("../../api/conversations", () => ({ listConversations: vi.fn().mockResolvedValue([{ id: 9, course_id: 42, title: "", created_at: "2026-10-01", updated_at: "2026-10-01" }]), listConversationUploads: vi.fn().mockResolvedValue([]), askConversationQuestion: vi.fn() }));
const course = { id: 42, name: "Biology", description: "Cell biology", owner: 1, created_at: "2026-10-01" };

afterEach(() => vi.unstubAllGlobals());

function mockCompactScreen(matches: boolean) {
  const listeners = new Set<() => void>();
  const query = {
    matches,
    addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_type: string, listener: () => void) => listeners.delete(listener),
  };
  vi.stubGlobal("matchMedia", vi.fn(() => query));
  return (next: boolean) => act(() => {
    query.matches = next;
    listeners.forEach((listener) => listener());
  });
}

it("switches sections without reloading materials or hiding chat and supports keyboard tabs", async () => {
  render(<MemoryRouter><CourseWorkspace course={course} /></MemoryRouter>);
  await screen.findByText("No materials uploaded yet.");
  const before = vi.mocked(listDocuments).mock.calls.length;
  fireEvent.click(screen.getByRole("tab", { name: "Notes" }));
  expect(screen.getByRole("heading", { name: "Study notes" })).toBeVisible();
  fireEvent.keyDown(screen.getByRole("tab", { name: "Notes" }), { key: "ArrowRight" });
  expect(screen.getByRole("heading", { name: "Generate a quiz" })).toBeVisible();
  expect(screen.getByRole("complementary", { name: "Pandu course chat" })).toBeVisible();
  expect(screen.queryByText("Demo")).not.toBeInTheDocument();
  expect(listConversations).toHaveBeenCalled();
  expect(listConversationUploads).toHaveBeenCalled();
  fireEvent.click(screen.getByRole("tab", { name: "Materials" }));
  await waitFor(() => expect(screen.getByLabelText("Document file")).toBeVisible());
  expect(vi.mocked(listDocuments)).toHaveBeenCalledTimes(before);
});

it("collapses and restores the assistant without losing the course content", async () => {
  render(<MemoryRouter><CourseWorkspace course={course} /></MemoryRouter>);
  await screen.findByText("No materials uploaded yet.");
  const toggle = screen.getByRole("button", { name: "AI Assistant" });
  expect(toggle).toHaveAttribute("aria-expanded", "true");
  fireEvent.click(toggle);
  expect(toggle).toHaveAttribute("aria-expanded", "false");
  expect(screen.getByRole("heading", { name: "Biology" })).toBeVisible();
  expect(document.getElementById("course-assistant")).toHaveAttribute("inert");
  fireEvent.click(toggle);
  expect(toggle).toHaveAttribute("aria-expanded", "true");
  expect(screen.getByRole("complementary", { name: "Pandu course chat" })).toBeVisible();
});

it("starts with the assistant collapsed at the narrow breakpoint", () => {
  mockCompactScreen(true);
  render(<MemoryRouter><CourseWorkspace course={course} /></MemoryRouter>);
  expect(screen.getByRole("button", { name: "AI Assistant" })).toHaveAttribute("aria-expanded", "false");
  expect(document.getElementById("course-assistant")).toHaveAttribute("inert");
});

it("keeps the draft and an in-flight real reply while Pandu is hidden", async () => {
  vi.mocked(listDocuments).mockResolvedValueOnce([{
    id: 81, course_id: 42, name: "Lecture.pdf", status: "READY", error: null,
    created_at: "2026-10-01", updated_at: "2026-10-01",
  }]);
  let finish!: (result: { status: "INSUFFICIENT_CONTEXT"; answer: null; citations: [] }) => void;
  let questionSignal!: AbortSignal;
  vi.mocked(askConversationQuestion).mockImplementationOnce((_id, _question, _ids, _token, signal) => {
    questionSignal = signal;
    return new Promise((resolve) => { finish = resolve; });
  });
  render(<MemoryRouter><CourseWorkspace course={course} /></MemoryRouter>);
  await screen.findByRole("checkbox", { name: /Lecture.pdf/ });
  fireEvent.click(screen.getByRole("checkbox", { name: /Lecture.pdf/ }));
  const message = screen.getByLabelText("Message Pandu");
  fireEvent.change(message, { target: { value: "What is osmosis?" } });
  fireEvent.click(screen.getByRole("button", { name: "Send to Pandu" }));
  expect(askConversationQuestion).toHaveBeenCalledWith(9, "What is osmosis?", [81], "token", questionSignal);
  fireEvent.change(message, { target: { value: "Unsent follow-up" } });

  const toggle = screen.getByRole("button", { name: "AI Assistant" });
  const assistant = document.getElementById("course-assistant");
  fireEvent.click(toggle);
  expect(assistant).toHaveAttribute("inert");
  expect(questionSignal.aborted).toBe(false);
  await act(async () => finish({ status: "INSUFFICIENT_CONTEXT", answer: null, citations: [] }));
  expect(within(assistant!).getByText(/find enough information/)).toBeInTheDocument();
  fireEvent.click(toggle);

  expect(document.getElementById("course-assistant")).toBe(assistant);
  const [question, reply] = within(assistant!).getAllByRole("article");
  expect(within(question).getByText("What is osmosis?")).toBeInTheDocument();
  expect(within(reply).getByText("Pandu")).toBeInTheDocument();
  expect(screen.getByLabelText("Message Pandu")).toBe(message);
  expect(message).toHaveValue("Unsent follow-up");
});

it("returns focus to the toggle after each swap", async () => {
  render(<MemoryRouter><CourseWorkspace course={course} /></MemoryRouter>);
  await screen.findByText("No materials uploaded yet.");
  const toggle = screen.getByRole("button", { name: "AI Assistant" });
  fireEvent.click(toggle);
  expect(toggle).toHaveFocus();
  fireEvent.click(toggle);
  expect(toggle).toHaveFocus();
});

it("moves focus off hidden course content when resizing into the view swap", async () => {
  const resize = mockCompactScreen(false);
  render(<MemoryRouter><CourseWorkspace course={course} /></MemoryRouter>);
  await screen.findByText("No materials uploaded yet.");
  screen.getByRole("tab", { name: "Materials" }).focus();
  resize(true);
  const toggle = screen.getByRole("button", { name: "AI Assistant" });
  expect(toggle).toHaveFocus();
  expect(toggle).toHaveAttribute("aria-expanded", "true");
});

it("leaves focus in Pandu when resizing into the view swap", async () => {
  const resize = mockCompactScreen(false);
  render(<MemoryRouter><CourseWorkspace course={course} /></MemoryRouter>);
  await screen.findByText("No materials uploaded yet.");
  const message = screen.getByLabelText("Message Pandu");
  message.focus();
  resize(true);
  expect(message).toHaveFocus();
});

it("keeps the open or closed choice when the screen crosses 64rem", async () => {
  const resize = mockCompactScreen(true);
  render(<MemoryRouter><CourseWorkspace course={course} /></MemoryRouter>);
  await screen.findByText("No materials uploaded yet.");
  const toggle = screen.getByRole("button", { name: "AI Assistant" });
  expect(toggle).toHaveAttribute("aria-expanded", "false");
  resize(false);
  expect(toggle).toHaveAttribute("aria-expanded", "false");
  fireEvent.click(toggle);
  resize(true);
  expect(toggle).toHaveAttribute("aria-expanded", "true");
});
