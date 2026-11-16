import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, type NavigateFunction, Route, Routes, useLocation, useNavigate, useParams } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import CourseWorkspace from "./CourseWorkspace";
import type { CourseSection } from "./courseSections";
import { listDocuments } from "../../api/documents";
import { askConversationQuestion, listConversations, listConversationUploads, type QuestionResult } from "../../api/conversations";
import { generateNotes, getNotes } from "../../api/notes";
import { generateQuiz, getQuiz } from "../../api/quizzes";
import { DEFAULT_NOTES_OPTIONS, type CourseNotes } from "../../types/notes";
import type { Quiz } from "../../types/quiz";

vi.mock("../../context/AuthContext", () => ({ useAuth: () => ({ user: { id: 1 }, accessToken: "token" }) }));
vi.mock("../../api/documents", async (original) => ({ ...await original<typeof import("../../api/documents")>(), listDocuments: vi.fn().mockResolvedValue([]) }));
vi.mock("../../api/conversations", () => ({ listConversations: vi.fn().mockResolvedValue([{ id: 9, course_id: 42, title: "", created_at: "2026-10-01", updated_at: "2026-10-01" }]), listConversationUploads: vi.fn().mockResolvedValue([]), listConversationMessages: vi.fn().mockResolvedValue([]), askConversationQuestion: vi.fn() }));
vi.mock("../../api/quizzes", async (original) => ({ ...await original<typeof import("../../api/quizzes")>(), generateQuiz: vi.fn(), getQuiz: vi.fn(), getQuizResults: vi.fn(), submitQuiz: vi.fn() }));
vi.mock("../../api/notes", async (original) => ({ ...await original<typeof import("../../api/notes")>(), generateNotes: vi.fn(), getNotes: vi.fn() }));
// SCRUM-24: answers carry the saved question and reply.
const noContext: QuestionResult = { status: "INSUFFICIENT_CONTEXT", answer: null, citations: [], tool_trace: [],
  question: { id: 1, role: "user", status: "ANSWERED", content: "What is osmosis?", citations: [], tool_trace: [], reply_to: null, created_at: "2026-10-01" },
  reply: { id: 2, role: "assistant", status: "INSUFFICIENT_CONTEXT", content: "", citations: [], tool_trace: [], reply_to: 1, created_at: "2026-10-01" } };
const course = { id: 42, name: "Biology", description: "Cell biology", owner: 1, created_at: "2026-10-01" };

afterEach(() => { vi.unstubAllGlobals(); sessionStorage.clear(); });

// Renders the workspace at a real course route and records the address, so tests can check
// the URL and use Back/Forward the way the app does.
const browser = { navigate: (() => {}) as NavigateFunction, url: "", key: "" };
function Workspace() {
  const { section } = useParams();
  return <CourseWorkspace course={course} section={section as CourseSection} />;
}
function AddressProbe() {
  const location = useLocation();
  browser.navigate = useNavigate();
  browser.url = location.pathname + location.search;
  browser.key = location.key;
  return null;
}
function renderWorkspace(...entries: string[]) {
  const urls = entries.length ? entries : ["/courses/42/materials"];
  return render(<MemoryRouter initialEntries={urls} initialIndex={urls.length - 1}>
    <Routes><Route path="/courses/:courseId/:section" element={<Workspace />} /></Routes>
    <AddressProbe />
  </MemoryRouter>);
}
const back = () => act(async () => browser.navigate(-1));
const forward = () => act(async () => browser.navigate(1));

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
  renderWorkspace();
  await screen.findByText(/No materials uploaded yet./);
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
  await waitFor(() => expect(screen.getByRole("button", { name: "Choose files" })).toBeVisible());
  expect(screen.queryByRole("heading", { name: "Course tasks" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("tab", { name: "Tasks" }));
  expect(screen.getByRole("heading", { name: "Course tasks" })).toBeVisible();
  expect(vi.mocked(listDocuments)).toHaveBeenCalledTimes(before);
});

it("offers multi-material notes in the Notes tab, separate from material management", async () => {
  vi.mocked(listDocuments).mockResolvedValueOnce([
    { id: 81, course_id: 42, name: "Cells.pdf", status: "READY", error: null, created_at: "2026-10-01", updated_at: "2026-10-01" },
    { id: 82, course_id: 42, name: "Genes.pdf", status: "READY", error: null, created_at: "2026-10-01", updated_at: "2026-10-01" },
  ]);
  renderWorkspace();
  fireEvent.click(await screen.findByRole("tab", { name: "Notes" }));
  const panel = within(screen.getByRole("tabpanel", { name: "Notes" }));
  expect(await panel.findByRole("checkbox", { name: "Cells.pdf" })).toBeVisible();
  expect(panel.getByRole("checkbox", { name: "Genes.pdf" })).toBeVisible();
  expect(screen.queryByRole("button", { name: "Choose files" })).not.toBeInTheDocument();
  expect(screen.getByRole("tab", { name: "Notes" })).toHaveAttribute("aria-controls", "panel-Notes");
});

it("collapses and restores the assistant without losing the course content", async () => {
  renderWorkspace();
  await screen.findByText(/No materials uploaded yet./);
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
  renderWorkspace();
  expect(screen.getByRole("button", { name: "AI Assistant" })).toHaveAttribute("aria-expanded", "false");
  expect(document.getElementById("course-assistant")).toHaveAttribute("inert");
});

it("keeps the draft and an in-flight real reply while Pandu is hidden", async () => {
  vi.mocked(listDocuments).mockResolvedValueOnce([{
    id: 81, course_id: 42, name: "Lecture.pdf", status: "READY", error: null,
    created_at: "2026-10-01", updated_at: "2026-10-01",
  }]);
  let finish!: (result: QuestionResult) => void;
  let questionSignal!: AbortSignal;
  vi.mocked(askConversationQuestion).mockImplementationOnce((_id, _question, _ids, _token, signal) => {
    questionSignal = signal;
    return new Promise((resolve) => { finish = resolve; });
  });
  renderWorkspace();
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
  await act(async () => finish(noContext));
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
  renderWorkspace();
  await screen.findByText(/No materials uploaded yet./);
  const toggle = screen.getByRole("button", { name: "AI Assistant" });
  fireEvent.click(toggle);
  expect(toggle).toHaveFocus();
  fireEvent.click(toggle);
  expect(toggle).toHaveFocus();
});

it("moves focus off hidden course content when resizing into the view swap", async () => {
  const resize = mockCompactScreen(false);
  renderWorkspace();
  await screen.findByText(/No materials uploaded yet./);
  screen.getByRole("tab", { name: "Materials" }).focus();
  resize(true);
  const toggle = screen.getByRole("button", { name: "AI Assistant" });
  expect(toggle).toHaveFocus();
  expect(toggle).toHaveAttribute("aria-expanded", "true");
});

it("leaves focus in Pandu when resizing into the view swap", async () => {
  const resize = mockCompactScreen(false);
  renderWorkspace();
  await screen.findByText(/No materials uploaded yet./);
  const message = screen.getByLabelText("Message Pandu");
  message.focus();
  resize(true);
  expect(message).toHaveFocus();
});

it("keeps the open or closed choice when the screen crosses 64rem", async () => {
  const resize = mockCompactScreen(true);
  renderWorkspace();
  await screen.findByText(/No materials uploaded yet./);
  const toggle = screen.getByRole("button", { name: "AI Assistant" });
  expect(toggle).toHaveAttribute("aria-expanded", "false");
  resize(false);
  expect(toggle).toHaveAttribute("aria-expanded", "false");
  fireEvent.click(toggle);
  resize(true);
  expect(toggle).toHaveAttribute("aria-expanded", "true");
});

it("opens the section and Pandu state named in the address", async () => {
  renderWorkspace("/courses/42/quizzes?pandu=closed");
  expect(screen.getByRole("tab", { name: "Quizzes" })).toHaveAttribute("aria-selected", "true");
  expect(screen.getByRole("heading", { name: "Generate a quiz" })).toBeVisible();
  expect(screen.getByRole("button", { name: "AI Assistant" })).toHaveAttribute("aria-expanded", "false");
  await screen.findByText(/No materials uploaded yet./);
});

it("lets ?pandu=open override the collapsed default on a narrow screen", async () => {
  mockCompactScreen(true);
  renderWorkspace("/courses/42/notes?pandu=open");
  expect(screen.getByRole("button", { name: "AI Assistant" })).toHaveAttribute("aria-expanded", "true");
  expect(document.getElementById("course-assistant")).not.toHaveAttribute("inert");
  await screen.findByText(/No materials uploaded yet./);
});

it("ignores an unknown ?pandu value and uses the screen-size default", async () => {
  mockCompactScreen(true);
  renderWorkspace("/courses/42/materials?pandu=maybe");
  expect(screen.getByRole("button", { name: "AI Assistant" })).toHaveAttribute("aria-expanded", "false");
  await screen.findByText(/No materials uploaded yet./);
});

it("puts each section switch and Pandu toggle in history and restores them with Back and Forward", async () => {
  renderWorkspace();
  await screen.findByText(/No materials uploaded yet./);
  const documentLoads = vi.mocked(listDocuments).mock.calls.length;
  const toggle = screen.getByRole("button", { name: "AI Assistant" });
  const message = screen.getByLabelText("Message Pandu");
  fireEvent.change(message, { target: { value: "Draft question" } });

  fireEvent.click(screen.getByRole("tab", { name: "Notes" }));
  expect(browser.url).toBe("/courses/42/notes");
  fireEvent.click(toggle);
  expect(browser.url).toBe("/courses/42/notes?pandu=closed");
  // A section switch keeps Pandu's state.
  fireEvent.click(screen.getByRole("tab", { name: "Quizzes" }));
  expect(browser.url).toBe("/courses/42/quizzes?pandu=closed");
  expect(toggle).toHaveAttribute("aria-expanded", "false");

  await back();
  expect(screen.getByRole("tab", { name: "Notes" })).toHaveAttribute("aria-selected", "true");
  expect(toggle).toHaveAttribute("aria-expanded", "false");
  await back();
  expect(screen.getByRole("tab", { name: "Notes" })).toHaveAttribute("aria-selected", "true");
  expect(toggle).toHaveAttribute("aria-expanded", "true");
  await back();
  expect(browser.url).toBe("/courses/42/materials");
  expect(screen.getByRole("tab", { name: "Materials" })).toHaveAttribute("aria-selected", "true");
  await forward();
  await forward();
  expect(browser.url).toBe("/courses/42/notes?pandu=closed");
  expect(toggle).toHaveAttribute("aria-expanded", "false");

  // History moves never remount the workspace: same chat, same draft, no reload of materials.
  expect(screen.getByLabelText("Message Pandu")).toBe(message);
  expect(message).toHaveValue("Draft question");
  expect(vi.mocked(listDocuments)).toHaveBeenCalledTimes(documentLoads);
});

it("closes Pandu with Back after opening it on a narrow screen", async () => {
  mockCompactScreen(true);
  renderWorkspace();
  await screen.findByText(/No materials uploaded yet./);
  const toggle = screen.getByRole("button", { name: "AI Assistant" });
  fireEvent.click(toggle);
  expect(browser.url).toBe("/courses/42/materials?pandu=open");
  expect(toggle).toHaveAttribute("aria-expanded", "true");
  await back();
  expect(browser.url).toBe("/courses/42/materials");
  expect(toggle).toHaveAttribute("aria-expanded", "false");
});

it("does not add a history entry when the current section's tab is clicked", async () => {
  renderWorkspace();
  await screen.findByText(/No materials uploaded yet./);
  const key = browser.key;
  fireEvent.click(screen.getByRole("tab", { name: "Materials" }));
  expect(browser.key).toBe(key);
});

it("restores sections and Pandu with Back and Forward on a narrow screen", async () => {
  mockCompactScreen(true);
  renderWorkspace();
  await screen.findByText(/No materials uploaded yet./);
  const toggle = screen.getByRole("button", { name: "AI Assistant" });
  const expectView = (url: string, section: string, panduOpen: boolean) => {
    expect(browser.url).toBe(url);
    expect(screen.getByRole("tab", { name: section })).toHaveAttribute("aria-selected", "true");
    expect(toggle).toHaveAttribute("aria-expanded", String(panduOpen));
  };

  fireEvent.click(screen.getByRole("tab", { name: "Notes" }));
  fireEvent.click(toggle);
  fireEvent.click(screen.getByRole("tab", { name: "Quizzes" }));
  expectView("/courses/42/quizzes?pandu=open", "Quizzes", true);

  await back();
  expectView("/courses/42/notes?pandu=open", "Notes", true);
  await back();
  expectView("/courses/42/notes", "Notes", false);
  await back();
  expectView("/courses/42/materials", "Materials", false);
  await forward();
  expectView("/courses/42/notes", "Notes", false);
  await forward();
  expectView("/courses/42/notes?pandu=open", "Notes", true);
});

it("keeps sent Pandu messages and replies through Back and Forward", async () => {
  vi.mocked(listDocuments).mockResolvedValueOnce([{
    id: 81, course_id: 42, name: "Lecture.pdf", status: "READY", error: null,
    created_at: "2026-10-01", updated_at: "2026-10-01",
  }]);
  vi.mocked(askConversationQuestion).mockResolvedValueOnce({ status: "INSUFFICIENT_CONTEXT", answer: null, citations: [] });
  renderWorkspace();
  const assistant = document.getElementById("course-assistant")!;
  fireEvent.click(await within(assistant).findByRole("checkbox", { name: /Lecture.pdf/ }));
  fireEvent.change(screen.getByLabelText("Message Pandu"), { target: { value: "What is osmosis?" } });
  fireEvent.click(screen.getByRole("button", { name: "Send to Pandu" }));
  expect(await within(assistant).findByText(/find enough information/)).toBeInTheDocument();
  const conversationLoads = vi.mocked(listConversations).mock.calls.length;

  fireEvent.click(screen.getByRole("tab", { name: "Notes" }));
  fireEvent.click(screen.getByRole("button", { name: "AI Assistant" }));
  await back();
  await back();
  await forward();

  expect(document.getElementById("course-assistant")).toBe(assistant);
  const [question, reply] = within(assistant).getAllByRole("article");
  expect(within(question).getByText("What is osmosis?")).toBeInTheDocument();
  expect(within(reply).getByText(/find enough information/)).toBeInTheDocument();
  expect(vi.mocked(listConversations)).toHaveBeenCalledTimes(conversationLoads);
});

const readyMaterial = {
  id: 81, course_id: 42, name: "Cells.pdf", status: "READY" as const, error: null,
  created_at: "2026-10-01", updated_at: "2026-10-01",
};

it("keeps an in-progress quiz, its answers and current question through section changes", async () => {
  const quiz: Quiz = {
    id: 5, title: "Biology quiz", course: 42, source_documents: [81], created_at: "", is_submitted: false,
    questions: [
      { id: 11, position: 1, text: "What is a cell?", options: ["A", "B", "C", "D"] },
      { id: 12, position: 2, text: "What is a gene?", options: ["E", "F", "G", "H"] },
    ],
  };
  vi.mocked(listDocuments).mockResolvedValueOnce([readyMaterial]);
  vi.mocked(generateQuiz).mockResolvedValueOnce(quiz);
  renderWorkspace("/courses/42/quizzes");
  const panel = within(screen.getByRole("tabpanel", { name: "Quizzes" }));
  fireEvent.click(await panel.findByRole("checkbox", { name: "Cells.pdf" }));
  fireEvent.click(panel.getByLabelText("10 questions"));
  fireEvent.click(panel.getByRole("button", { name: "Generate quiz" }));
  await panel.findByText("What is a cell?");
  fireEvent.click(panel.getByLabelText("A"));
  fireEvent.click(panel.getByRole("button", { name: "Next" }));
  expect(panel.getByText(/Question 2 of 2 · 1 of 2 answered/)).toBeVisible();

  // Leave by tab and return with Back, then leave by tab once more and return with Back.
  fireEvent.click(screen.getByRole("tab", { name: "Notes" }));
  expect(browser.url).toBe("/courses/42/notes");
  await back();
  expect(browser.url).toBe("/courses/42/quizzes");
  fireEvent.click(screen.getByRole("tab", { name: "Materials" }));
  await back();
  expect(browser.url).toBe("/courses/42/quizzes");

  expect(panel.getByText(/Question 2 of 2 · 1 of 2 answered/)).toBeVisible();
  expect(panel.getByText("What is a gene?")).toBeVisible();
  expect(panel.getByRole("button", { name: "Question 1, answered" })).toBeInTheDocument();
  // A remount would restore the saved quiz from the API and lose the answers.
  expect(generateQuiz).toHaveBeenCalledTimes(1);
  expect(getQuiz).not.toHaveBeenCalled();
});

it("keeps a note generation running through section changes and shows its result", async () => {
  const notes: CourseNotes = {
    id: 6, title: "Notes: Cells.pdf", course: 42, overview: "Cells are small.", created_at: "",
    options: DEFAULT_NOTES_OPTIONS,
    source_documents: [{ id: 81, name: "Cells.pdf" }],
    sections: [{ heading: "Cell structure", key_concepts: [], points: ["Cells divide by mitosis."] }],
  };
  let finish!: (value: CourseNotes) => void;
  let signal!: AbortSignal;
  vi.mocked(listDocuments).mockResolvedValueOnce([readyMaterial]);
  vi.mocked(generateNotes).mockImplementationOnce((_course, _ids, _options, _token, requestSignal) => {
    signal = requestSignal!;
    return new Promise((resolve) => { finish = resolve; });
  });
  renderWorkspace("/courses/42/notes");
  const panel = within(screen.getByRole("tabpanel", { name: "Notes" }));
  fireEvent.click(await panel.findByRole("checkbox", { name: "Cells.pdf" }));
  fireEvent.click(panel.getByRole("button", { name: "Generate notes" }));
  expect(panel.getByRole("status")).toHaveTextContent("writing your notes");

  fireEvent.click(screen.getByRole("tab", { name: "Quizzes" }));
  fireEvent.click(screen.getByRole("button", { name: "AI Assistant" }));
  await back();
  await back();
  expect(browser.url).toBe("/courses/42/notes");
  expect(signal.aborted).toBe(false);

  await act(async () => finish(notes));
  expect(await panel.findByRole("heading", { name: notes.title })).toBeVisible();
  expect(panel.getByText("Cells divide by mitosis.")).toBeVisible();
  expect(generateNotes).toHaveBeenCalledTimes(1);
  expect(getNotes).not.toHaveBeenCalled();
});

describe("Notes and Quizzes before materials are known", () => {
  const notesPanel = () => within(document.getElementById("panel-Notes")!);
  const quizzesPanel = () => within(document.getElementById("panel-Quizzes")!);

  it("show loading, not 'no materials', while the material list loads", async () => {
    vi.mocked(listDocuments).mockReturnValueOnce(new Promise(() => undefined));
    renderWorkspace("/courses/42/notes");

    expect(notesPanel().getByText("Loading materials...")).toBeVisible();
    expect(quizzesPanel().getByText("Loading materials...")).toBeInTheDocument();
    expect(notesPanel().queryByText(/No materials yet/)).not.toBeInTheDocument();
    expect(notesPanel().queryByRole("link", { name: "Go to Materials" })).not.toBeInTheDocument();
  });

  it("show the load error with a way back to Materials to retry", async () => {
    vi.mocked(listDocuments).mockRejectedValueOnce(new Error("offline"));
    renderWorkspace("/courses/42/quizzes");

    expect(await quizzesPanel().findByRole("alert")).toHaveTextContent("Materials could not be loaded. Open Materials to try again.");
    expect(quizzesPanel().queryByText(/No materials yet/)).not.toBeInTheDocument();
    fireEvent.click(quizzesPanel().getByRole("link", { name: "Go to Materials" }));
    expect(browser.url).toBe("/courses/42/materials");
    expect(screen.getByRole("button", { name: "Retry loading materials" })).toBeVisible();
  });

  it("show the empty state with Go to Materials, keeping Pandu's state", async () => {
    renderWorkspace("/courses/42/notes?pandu=closed");

    expect(await notesPanel().findByText("No materials yet. Upload one in Materials to create notes.")).toBeVisible();
    expect(quizzesPanel().getByText("No materials yet. Upload one in Materials to create a quiz.")).toBeInTheDocument();
    const link = notesPanel().getByRole("link", { name: "Go to Materials" });
    expect(link).toHaveAttribute("href", "/courses/42/materials?pandu=closed");

    fireEvent.click(link);
    expect(browser.url).toBe("/courses/42/materials?pandu=closed");
    expect(screen.getByRole("tab", { name: "Materials" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("button", { name: "AI Assistant" })).toHaveAttribute("aria-expanded", "false");
  });
});
