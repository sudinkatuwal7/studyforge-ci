import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import ConnectedCourseChat from "./ConnectedCourseChat";
import { DocumentRequestError } from "../../api/documents";
import {
  QuestionRequestError, askConversationQuestion, createCourseConversation, deleteConversation, deleteConversationUpload,
  getConversationUpload, listConversationMessages, listConversationUploads, listConversations, retryConversationQuestion,
  uploadConversationDocument, type Conversation, type ConversationMessage, type QuestionCitation, type QuestionResult, type ToolTraceEntry,
} from "../../api/conversations";
import { fetchSourceFile } from "../../api/sourceFiles";

// Mutable so a test can refresh the access token while the chat stays mounted.
const auth = vi.hoisted(() => ({ user: { id: 1 }, accessToken: "token" }));
vi.mock("../../context/AuthContext", () => ({ useAuth: () => auth }));
vi.mock("../../api/conversations", async (original) => ({
  // Keep the real error class so instanceof checks behave as in production.
  QuestionRequestError: (await original<typeof import("../../api/conversations")>()).QuestionRequestError,
  listConversations: vi.fn(), createCourseConversation: vi.fn(), listConversationUploads: vi.fn(), listConversationMessages: vi.fn(),
  getConversationUpload: vi.fn(), uploadConversationDocument: vi.fn(), askConversationQuestion: vi.fn(), retryConversationQuestion: vi.fn(),
  deleteConversation: vi.fn(), deleteConversationUpload: vi.fn(),
}));
vi.mock("../../api/sourceFiles", () => ({ fetchSourceFile: vi.fn() }));

const SESSION = "studyforge:course-chat:1:42";
const thread = (id: number, title = "", courseId = 42) => ({ id, course_id: courseId, title, created_at: "2026-11-16", updated_at: "2026-11-16T10:00:00Z" });
const question = (id: number, content: string, status: "ANSWERED" | "FAILED" | "PENDING" = "ANSWERED"): ConversationMessage =>
  ({ id, role: "user", status, content, citations: [], tool_trace: [], reply_to: null, created_at: "2026-11-16" });
const reply = (id: number, replyTo: number, content: string, extra: { citations?: QuestionCitation[]; tool_trace?: ToolTraceEntry[] } = {}): ConversationMessage =>
  ({ id, role: "assistant", status: "ANSWERED", content, citations: extra.citations ?? [], tool_trace: extra.tool_trace ?? [], reply_to: replyTo, created_at: "2026-11-16" });
const answered = (q: ConversationMessage, r: ConversationMessage): QuestionResult =>
  ({ status: "ANSWERED", answer: r.content, citations: r.citations, tool_trace: r.tool_trace, question: q, reply: r });
const cite = (documentId: number, page: number, name: string | null, format: "pdf" | "pptx" | "docx" | null, available = true): QuestionCitation =>
  ({ chunk_id: documentId * 10, document_id: documentId, page_number: page, excerpt: `Evidence ${documentId}`, document_name: name, source_format: format, available });
const material = (id: number, courseId: number, name: string, status = "READY") => ({ id, name, snapshot: {
  id, course_id: courseId, name, status: status as "READY", error: null, created_at: "2026-10-01", updated_at: "2026-10-01",
} });
const upload = (id: number, conversationId: number, name: string, status: "PENDING" | "PROCESSING" | "READY" | "FAILED" = "READY") => ({
  id, course_id: null, conversation_id: conversationId, name, status,
  error: status === "FAILED" ? { code: "PROCESSING_FAILED", message: "Could not read file." } : null,
  created_at: "2026-10-01", updated_at: "2026-10-01",
});
function deferred<T>() {
  let resolve!: (value: T) => void; let reject!: (cause: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
let history: Record<number, ConversationMessage[]>;

beforeEach(() => {
  sessionStorage.clear();
  auth.accessToken = "token";
  history = {
    9: [question(1, "How do cells divide?"), reply(2, 1, "Mitosis.")],
    10: [question(3, "What is osmosis?"), reply(4, 3, "Water moves.")],
  };
  vi.mocked(listConversations).mockReset().mockResolvedValue([thread(9, "Cells"), thread(10, "Osmosis"), thread(20, "Other course", 43)]);
  vi.mocked(createCourseConversation).mockReset().mockResolvedValue(thread(12));
  vi.mocked(listConversationMessages).mockReset().mockImplementation(async (id) => history[id] ?? []);
  vi.mocked(listConversationUploads).mockReset().mockImplementation(async (id) => id === 9 ? [upload(13, 9, "Chat.docx")] : []);
  vi.mocked(getConversationUpload).mockReset().mockResolvedValue(upload(13, 9, "Chat.docx"));
  vi.mocked(uploadConversationDocument).mockReset();
  vi.mocked(askConversationQuestion).mockReset();
  vi.mocked(retryConversationQuestion).mockReset();
  vi.mocked(deleteConversation).mockReset().mockResolvedValue(undefined);
  vi.mocked(deleteConversationUpload).mockReset().mockResolvedValue(undefined);
  vi.mocked(fetchSourceFile).mockReset().mockResolvedValue(new Blob(["file"]));
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const chats = () => screen.getByRole("list", { name: "Chats" });
const threadButton = (title: string) => within(chats()).getByRole("button", { name: new RegExp(`^${title}`) });
const threadNames = () => within(chats()).getAllByRole("listitem").map((item) => item.querySelector(".chat-thread-select span")?.textContent);
const messagesLog = () => screen.getByRole("log", { name: "Messages with Pandu" });
async function sendQuestion(text: string, source = /Lecture.pdf/) {
  const box = screen.getByRole("checkbox", { name: source }) as HTMLInputElement;
  if (!box.checked) fireEvent.click(box);
  fireEvent.change(screen.getByRole("textbox"), { target: { value: text } });
  fireEvent.click(screen.getByRole("button", { name: "Send to Pandu" }));
}
async function ready(text = "Mitosis.") { await within(messagesLog()).findByText(text); }

// --- Threads and history (criteria 1, 2, 8) -------------------------------------------

it("loads this course's chats and restores the saved chat's history from the backend after a refresh", async () => {
  sessionStorage.setItem(SESSION, JSON.stringify({ conversationId: 10, selected: ["course-1"],
    messages: [{ id: "old", role: "user", text: "Stale browser copy" }] }));
  render(<ConnectedCourseChat courseId={42} materials={[material(1, 42, "Lecture.pdf")]} />);
  await ready("Water moves.");
  expect(screen.queryByText("Stale browser copy")).not.toBeInTheDocument();
  expect(listConversationMessages).toHaveBeenCalledWith(10, "token", expect.any(AbortSignal));
  expect(screen.getByText("Chats · Osmosis")).toBeInTheDocument();
  expect(within(chats()).getAllByRole("listitem").map((item) => item.querySelector("span")?.textContent)).toEqual(["Cells", "Osmosis"]);
  expect(within(chats()).getByRole("button", { current: true })).toHaveTextContent("Osmosis");
  expect(screen.getByText("Sources · 1 selected")).toBeInTheDocument();
  // Only the active chat and the sources are kept in the browser.
  expect(JSON.parse(sessionStorage.getItem(SESSION)!)).toEqual({ conversationId: 10, selected: ["course-1"] });
});

it("starts a new chat, shows it in the list and switches to its empty history", async () => {
  render(<ConnectedCourseChat courseId={42} materials={[]} />);
  await ready();
  fireEvent.click(screen.getByRole("button", { name: "+ New chat" }));
  await waitFor(() => expect(listConversationMessages).toHaveBeenCalledWith(12, "token", expect.any(AbortSignal)));
  expect(createCourseConversation).toHaveBeenCalledWith(42, "token", expect.any(AbortSignal));
  expect(within(chats()).getByRole("button", { current: true })).toHaveTextContent("New chat");
  expect(await screen.findByText("Hi! I’m Pandu.")).toBeInTheDocument();
  expect(screen.queryByText("Mitosis.")).not.toBeInTheDocument();
});

it("switches chats and never shows a slower earlier load in the newer chat", async () => {
  render(<ConnectedCourseChat courseId={42} materials={[]} />);
  await ready();
  const slow = deferred<ConversationMessage[]>();
  vi.mocked(listConversationMessages).mockImplementation(async (id) => id === 10 ? slow.promise : history[id] ?? []);
  fireEvent.click(threadButton("Osmosis"));
  expect(await screen.findByText("Loading this chat…")).toBeInTheDocument();
  fireEvent.click(threadButton("Cells"));
  await ready();
  await act(async () => slow.resolve(history[10]));
  expect(screen.queryByText("Water moves.")).not.toBeInTheDocument();
  expect(within(chats()).getByRole("button", { current: true })).toHaveTextContent("Cells");
});

it("cancels an in-flight reply when switching chats; the saved answer appears only back in its own chat", async () => {
  render(<ConnectedCourseChat courseId={42} materials={[material(1, 42, "Lecture.pdf")]} />);
  await ready();
  const pending = deferred<QuestionResult>();
  let signal!: AbortSignal;
  vi.mocked(askConversationQuestion).mockImplementation((_id, _text, _ids, _token, nextSignal) => { signal = nextSignal; return pending.promise; });
  await sendQuestion("Late question");
  fireEvent.click(threadButton("Osmosis"));
  expect(signal.aborted).toBe(true);
  await ready("Water moves.");
  await act(async () => pending.resolve(answered(question(5, "Late question"), reply(6, 5, "Late answer"))));
  expect(screen.queryByText("Late answer")).not.toBeInTheDocument();
  expect(screen.queryByText("Late question")).not.toBeInTheDocument();
  // The server still finished and saved it; going back reloads it from history.
  history[9] = [...history[9], question(5, "Late question"), reply(6, 5, "Late answer")];
  fireEvent.click(threadButton("Cells"));
  expect(await screen.findByText("Late answer")).toBeInTheDocument();
});

// --- Refreshing the chat list after an answer (server titles and order) --------------------

it("keeps a chat created while the list refresh is in flight, even though the server's list predates it", async () => {
  render(<ConnectedCourseChat courseId={42} materials={[material(1, 42, "Lecture.pdf")]} />);
  await ready();
  const staleList = deferred<Conversation[]>();
  vi.mocked(listConversations).mockReturnValueOnce(staleList.promise);
  vi.mocked(askConversationQuestion).mockResolvedValueOnce(answered(question(5, "Mitosis phases?"), reply(6, 5, "Four phases.")));
  await sendQuestion("Mitosis phases?");
  await screen.findByText("Four phases.");
  // The refresh is waiting; meanwhile the student starts a new chat, which is saved.
  fireEvent.click(screen.getByRole("button", { name: "+ New chat" }));
  expect(await screen.findByText("Hi! I’m Pandu.")).toBeInTheDocument();
  // The server answered the refresh before the new chat existed.
  await act(async () => staleList.resolve([thread(9, "Cells"), thread(10, "Osmosis")]));
  expect(threadNames()).toEqual(["New chat", "Cells", "Osmosis"]);
  expect(within(chats()).getByRole("button", { current: true })).toHaveTextContent("New chat");
  // It is not stuck: the next refresh brings the server's title for it.
  vi.mocked(listConversations).mockResolvedValueOnce([thread(12, "First question here"), thread(9, "Cells"), thread(10, "Osmosis")]);
  vi.mocked(askConversationQuestion).mockResolvedValueOnce(answered(question(7, "First question here"), reply(8, 7, "Fresh answer.")));
  await sendQuestion("First question here");
  await screen.findByText("Fresh answer.");
  await waitFor(() => expect(threadNames()).toEqual(["First question here", "Cells", "Osmosis"]));
});

it("drops a chat the server no longer lists, such as one deleted in another tab", async () => {
  render(<ConnectedCourseChat courseId={42} materials={[material(1, 42, "Lecture.pdf")]} />);
  await ready();
  vi.mocked(listConversations).mockResolvedValueOnce([thread(9, "Cells")]);
  vi.mocked(askConversationQuestion).mockResolvedValueOnce(answered(question(5, "Q"), reply(6, 5, "A.")));
  await sendQuestion("Q");
  await screen.findByText("A.");
  await waitFor(() => expect(threadNames()).toEqual(["Cells"]));
});

it("refreshes the list with the latest token when the token was refreshed during a long answer", async () => {
  const view = <ConnectedCourseChat courseId={42} materials={[material(1, 42, "Lecture.pdf")]} />;
  const { rerender } = render(view);
  await ready();
  const pending = deferred<QuestionResult>();
  vi.mocked(askConversationQuestion).mockReturnValueOnce(pending.promise);
  await sendQuestion("Long one");
  auth.accessToken = "refreshed-token";
  rerender(<ConnectedCourseChat courseId={42} materials={[material(1, 42, "Lecture.pdf")]} />);
  await act(async () => pending.resolve(answered(question(5, "Long one"), reply(6, 5, "Finally."))));
  await screen.findByText("Finally.");
  await waitFor(() => expect(vi.mocked(listConversations).mock.lastCall?.[0]).toBe("refreshed-token"));
  // The question itself went out with the token current at the time.
  expect(askConversationQuestion).toHaveBeenCalledWith(9, "Long one", [1], "token", expect.any(AbortSignal));
});

it("ignores an older list refresh that finishes after a newer one", async () => {
  render(<ConnectedCourseChat courseId={42} materials={[material(1, 42, "Lecture.pdf")]} />);
  await ready();
  const older = deferred<Conversation[]>();
  const newer = deferred<Conversation[]>();
  vi.mocked(listConversations).mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise);
  vi.mocked(askConversationQuestion)
    .mockResolvedValueOnce(answered(question(5, "First"), reply(6, 5, "One.")))
    .mockResolvedValueOnce(answered(question(7, "Second"), reply(8, 7, "Two.")));
  await sendQuestion("First");
  await screen.findByText("One.");
  await sendQuestion("Second");
  await screen.findByText("Two.");
  // Different titles only to tell the two responses apart.
  await act(async () => newer.resolve([thread(9, "Cells (newer)"), thread(10, "Osmosis")]));
  await act(async () => older.resolve([thread(9, "Cells (older)"), thread(10, "Osmosis")]));
  expect(threadNames()).toEqual(["Cells (newer)", "Osmosis"]);
});

// --- Deleting threads (criteria 3, 7, 9) -----------------------------------------------

it("deletes a chat only after confirmation and switches to the most recent remaining chat", async () => {
  render(<ConnectedCourseChat courseId={42} materials={[]} />);
  await ready();
  fireEvent.click(screen.getByRole("button", { name: "Delete chat Cells" }));
  fireEvent.click(within(screen.getByRole("group", { name: "Delete Cells?" })).getByRole("button", { name: "Cancel" }));
  expect(deleteConversation).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Delete chat Cells" }));
  fireEvent.click(within(screen.getByRole("group", { name: "Delete Cells?" })).getByRole("button", { name: "Delete" }));
  await ready("Water moves.");
  expect(deleteConversation).toHaveBeenCalledWith(9, "token", expect.any(AbortSignal));
  expect(within(chats()).queryByText("Cells")).not.toBeInTheDocument();
  expect(screen.queryByText("Mitosis.")).not.toBeInTheDocument();
  expect(JSON.parse(sessionStorage.getItem(SESSION)!).conversationId).toBe(10);
});

it("keeps the chat and its messages and shows an error when deletion fails", async () => {
  vi.mocked(deleteConversation).mockRejectedValue(new DocumentRequestError(503, { code: "UNAVAILABLE", message: "Deletion is unavailable right now." }));
  render(<ConnectedCourseChat courseId={42} materials={[]} />);
  await ready();
  fireEvent.click(screen.getByRole("button", { name: "Delete chat Cells" }));
  fireEvent.click(within(screen.getByRole("group", { name: "Delete Cells?" })).getByRole("button", { name: "Delete" }));
  expect(await screen.findByText("Deletion is unavailable right now.")).toBeInTheDocument();
  expect(within(chats()).getByText("Cells")).toBeInTheDocument();
  expect(screen.getByText("Mitosis.")).toBeInTheDocument();
  expect(within(chats()).getByRole("button", { current: true })).toHaveTextContent("Cells");
});

it("treats a 404 on delete as already deleted and removes the chat", async () => {
  vi.mocked(deleteConversation).mockRejectedValue(new DocumentRequestError(404, { code: "RESOURCE_NOT_FOUND", message: "Resource not found." }));
  render(<ConnectedCourseChat courseId={42} materials={[]} />);
  await ready();
  fireEvent.click(screen.getByRole("button", { name: "Delete chat Cells" }));
  fireEvent.click(within(screen.getByRole("group", { name: "Delete Cells?" })).getByRole("button", { name: "Delete" }));
  await ready("Water moves.");
  expect(within(chats()).queryByText("Cells")).not.toBeInTheDocument();
});

it("cancels the reply in flight before deleting the active chat, so it can never appear", async () => {
  render(<ConnectedCourseChat courseId={42} materials={[material(1, 42, "Lecture.pdf")]} />);
  await ready();
  const pending = deferred<QuestionResult>();
  let signal!: AbortSignal;
  vi.mocked(askConversationQuestion).mockImplementation((_id, _text, _ids, _token, nextSignal) => { signal = nextSignal; return pending.promise; });
  let abortedWhenDeleting: boolean | undefined;
  vi.mocked(deleteConversation).mockImplementation(async () => { abortedWhenDeleting = signal.aborted; });
  await sendQuestion("Doomed question");
  fireEvent.click(screen.getByRole("button", { name: "Delete chat Cells" }));
  fireEvent.click(within(screen.getByRole("group", { name: "Delete Cells?" })).getByRole("button", { name: "Delete" }));
  await ready("Water moves.");
  expect(abortedWhenDeleting).toBe(true);
  await act(async () => pending.resolve(answered(question(5, "Doomed question"), reply(6, 5, "Ghost answer"))));
  expect(screen.queryByText("Ghost answer")).not.toBeInTheDocument();
});

it("shows an empty state after the last chat is deleted instead of creating one", async () => {
  vi.mocked(listConversations).mockResolvedValue([thread(9, "Cells")]);
  render(<ConnectedCourseChat courseId={42} materials={[material(1, 42, "Lecture.pdf")]} />);
  await ready();
  fireEvent.click(screen.getByRole("button", { name: "Delete chat Cells" }));
  fireEvent.click(within(screen.getByRole("group", { name: "Delete Cells?" })).getByRole("button", { name: "Delete" }));
  expect(await screen.findByRole("heading", { name: "No chats yet" })).toBeInTheDocument();
  expect(createCourseConversation).not.toHaveBeenCalled();
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "Anyone there?" } });
  expect(screen.getByRole("button", { name: "Send to Pandu" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Start a new chat" }));
  await waitFor(() => expect(createCourseConversation).toHaveBeenCalledOnce());
});

// --- Sending, failures and retries ----------------------------------------------------------

it("keeps a failed question with a retry that re-answers it without a duplicate", async () => {
  vi.mocked(askConversationQuestion).mockRejectedValue(new QuestionRequestError(503, {
    code: "RAG_GENERATION_FAILED", detail: "The question could not be answered right now. Please try again.", question: question(5, "Explain diffusion", "FAILED"),
  }));
  render(<ConnectedCourseChat courseId={42} materials={[material(1, 42, "Lecture.pdf")]} />);
  await ready();
  await sendQuestion("Explain diffusion");
  expect(await screen.findByText("The question could not be answered right now. Please try again.")).toBeInTheDocument();
  expect(screen.getByText("Pandu didn’t answer this question.")).toBeInTheDocument();
  vi.mocked(retryConversationQuestion).mockResolvedValue(answered(question(5, "Explain diffusion"), reply(6, 5, "Particles spread out.")));
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  expect(await screen.findByText("Particles spread out.")).toBeInTheDocument();
  expect(retryConversationQuestion).toHaveBeenCalledWith(9, 5, [1], "token", expect.any(AbortSignal));
  expect(screen.getAllByText("Explain diffusion")).toHaveLength(1);
  expect(screen.queryByText("Pandu didn’t answer this question.")).not.toBeInTheDocument();
});

it("reloads the saved history when the outcome of a send is unknown", async () => {
  vi.mocked(askConversationQuestion).mockRejectedValue(new Error("offline"));
  render(<ConnectedCourseChat courseId={42} materials={[material(1, 42, "Lecture.pdf")]} />);
  await ready();
  const loads = vi.mocked(listConversationMessages).mock.calls.length;
  history[9] = [...history[9], question(5, "Lost?", "FAILED")];
  await sendQuestion("Lost?");
  expect(await screen.findByRole("alert")).toHaveTextContent("could not answer");
  await waitFor(() => expect(vi.mocked(listConversationMessages).mock.calls.length).toBe(loads + 1));
  expect(await screen.findByRole("button", { name: "Retry" })).toBeInTheDocument();
  expect(screen.getAllByText("Lost?")).toHaveLength(1);
});

it("stops waiting for a reply and reloads what the server saved", async () => {
  vi.mocked(askConversationQuestion).mockImplementation(() => new Promise(() => {}));
  render(<ConnectedCourseChat courseId={42} materials={[material(1, 42, "Lecture.pdf")]} />);
  await ready();
  await sendQuestion("Slow one");
  history[9] = [...history[9], question(5, "Slow one", "PENDING")];
  fireEvent.click(screen.getByRole("button", { name: "Stop response" }));
  expect(await screen.findByText("Pandu is still answering…")).toBeInTheDocument();
});

it("shows a question still being answered in history, with a check-again action", async () => {
  history[9] = [question(1, "Slow?", "PENDING")];
  render(<ConnectedCourseChat courseId={42} materials={[]} />);
  expect(await screen.findByText("Pandu is still answering…")).toBeInTheDocument();
  history[9] = [question(1, "Slow?"), reply(2, 1, "Done now.")];
  fireEvent.click(screen.getByRole("button", { name: "Check again" }));
  expect(await screen.findByText("Done now.")).toBeInTheDocument();
});

it("sends only the selected sources and shows the no-context reply in the same words after a refresh", async () => {
  vi.mocked(askConversationQuestion).mockResolvedValue({ status: "INSUFFICIENT_CONTEXT", answer: null, citations: [], tool_trace: [],
    question: question(5, "Unknown topic"), reply: { ...reply(6, 5, ""), status: "INSUFFICIENT_CONTEXT" } });
  render(<ConnectedCourseChat courseId={42} materials={[material(1, 42, "Lecture.pdf"), material(99, 43, "Foreign.pdf")]} />);
  await ready();
  expect(screen.queryByText("Foreign.pdf")).not.toBeInTheDocument();
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "Unknown topic" } });
  expect(screen.getByRole("button", { name: "Send to Pandu" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Select all READY" }));
  fireEvent.click(screen.getByRole("button", { name: "Send to Pandu" }));
  expect(screen.getByRole("button", { name: "Send to Pandu" })).toBeDisabled();
  expect(await screen.findByText(/couldn’t find enough information/)).toBeInTheDocument();
  expect(askConversationQuestion).toHaveBeenCalledWith(9, "Unknown topic", [1, 13], "token", expect.any(AbortSignal));
});

// --- Tools used and citations (criteria 4, 5, 6) -----------------------------------------

it("shows the tools Pandu used, and nothing extra for an answer without tools or citations", async () => {
  history[9] = [question(1, "Q1"), reply(2, 1, "Traced answer.", { tool_trace: [{ tool: "search_sources", sources: {
    course_materials: { documents_searched: 2, passages_used: 3 }, chat_uploads: { documents_searched: 1, passages_used: 2 } } }] }),
    question(3, "Q2"), reply(4, 3, "Plain answer.")];
  render(<ConnectedCourseChat courseId={42} materials={[]} />);
  const traced = (await screen.findByText("Traced answer.")).closest("article")!;
  expect(within(traced).getByText("Searched course materials and your uploads")).toBeInTheDocument();
  expect(within(traced).getByText("2 course materials · 3 passages used")).toBeInTheDocument();
  const plain = screen.getByText("Plain answer.").closest("article")!;
  expect(within(plain).queryByText(/Searched/)).not.toBeInTheDocument();
  expect(within(plain).queryByRole("list", { name: "Sources for this answer" })).not.toBeInTheDocument();
  expect(within(plain).queryAllByRole("button")).toHaveLength(0);
});

function stubTab() {
  const tab = { opener: {} as unknown, location: { href: "" }, close: vi.fn() };
  const open = vi.fn(() => tab as unknown as Window);
  vi.stubGlobal("open", open);
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:source");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  return { tab, open };
}

it("opens a cited PDF in a new tab at its page, opening the tab before the file arrives", async () => {
  history[9] = [question(1, "Q"), reply(2, 1, "Cited.", { citations: [cite(1, 4, "Lecture 3", "pdf")] })];
  const { tab, open } = stubTab();
  const file = deferred<Blob>();
  vi.mocked(fetchSourceFile).mockReturnValue(file.promise);
  render(<ConnectedCourseChat courseId={42} materials={[]} />);
  fireEvent.click(await screen.findByRole("button", { name: "Lecture 3 · Page 4" }));
  // Opened during the click: after an await the browser would block it as a pop-up.
  expect(open).toHaveBeenCalledWith("", "_blank");
  expect(tab.opener).toBeNull();
  await act(async () => file.resolve(new Blob(["%PDF"])));
  expect(fetchSourceFile).toHaveBeenCalledWith(1, "token", expect.any(AbortSignal));
  expect(tab.location.href).toBe("blob:source#page=4");
  expect(URL.revokeObjectURL).not.toHaveBeenCalled();
});

it("downloads cited slides and documents with their names, without opening a tab", async () => {
  history[9] = [question(1, "Q"), reply(2, 1, "Cited.", { citations: [cite(2, 3, "Week 2", "pptx"), cite(3, 1, "Reading.docx", "docx")] })];
  const { open } = stubTab();
  const clicked: { download: string; href: string }[] = [];
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) { clicked.push({ download: this.download, href: this.href }); });
  render(<ConnectedCourseChat courseId={42} materials={[]} />);
  fireEvent.click(await screen.findByRole("button", { name: "Week 2 · Slide 3" }));
  await waitFor(() => expect(clicked).toHaveLength(1));
  fireEvent.click(screen.getByRole("button", { name: "Reading.docx" }));
  await waitFor(() => expect(clicked).toHaveLength(2));
  expect(clicked).toEqual([{ download: "Week 2.pptx", href: "blob:source" }, { download: "Reading.docx", href: "blob:source" }]);
  expect(open).not.toHaveBeenCalled();
});

it("explains unavailable sources and failed opens without leaving a blank tab", async () => {
  history[9] = [question(1, "Q"), reply(2, 1, "Cited.", { citations: [cite(4, 2, null, null, false), cite(1, 4, "Lecture 3", "pdf")] })];
  const { tab } = stubTab();
  render(<ConnectedCourseChat courseId={42} materials={[]} />);
  fireEvent.click(await screen.findByRole("button", { name: "Source no longer available" }));
  expect(screen.getByRole("alert")).toHaveTextContent("This source is no longer available.");
  expect(fetchSourceFile).not.toHaveBeenCalled();
  vi.mocked(fetchSourceFile).mockRejectedValue(new DocumentRequestError(404, { code: "RESOURCE_NOT_FOUND", message: "Resource not found." }));
  fireEvent.click(screen.getByRole("button", { name: "Lecture 3 · Page 4" }));
  await waitFor(() => expect(tab.close).toHaveBeenCalled());
  expect(screen.getByRole("alert")).toHaveTextContent("This source is no longer available.");
  // The excerpt is still readable without opening the file.
  expect(screen.getByText("Evidence 1")).toBeInTheDocument();
});

it("tells the student when the browser blocks the new tab", async () => {
  history[9] = [question(1, "Q"), reply(2, 1, "Cited.", { citations: [cite(1, 4, "Lecture 3", "pdf")] })];
  vi.stubGlobal("open", vi.fn(() => null));
  render(<ConnectedCourseChat courseId={42} materials={[]} />);
  fireEvent.click(await screen.findByRole("button", { name: "Lecture 3 · Page 4" }));
  expect(screen.getByRole("alert")).toHaveTextContent("Allow pop-ups");
  expect(fetchSourceFile).not.toHaveBeenCalled();
});

// --- Uploads (criterion 10, and existing behaviour) ------------------------------------------

it("deletes a chat upload after confirmation, deselects it, and keeps it when deletion fails", async () => {
  vi.mocked(listConversationUploads).mockResolvedValue([upload(13, 9, "Chat.docx"), upload(14, 9, "Keep.pdf")]);
  render(<ConnectedCourseChat courseId={42} materials={[]} />);
  await ready();
  fireEvent.click(screen.getByRole("checkbox", { name: /Chat.docx/ }));
  expect(screen.getByText("Sources · 1 selected")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Delete upload Chat.docx" }));
  fireEvent.click(within(screen.getByRole("group", { name: "Delete Chat.docx?" })).getByRole("button", { name: "Delete" }));
  await waitFor(() => expect(screen.queryByRole("checkbox", { name: /Chat.docx/ })).not.toBeInTheDocument());
  expect(deleteConversationUpload).toHaveBeenCalledWith(9, 13, "token", expect.any(AbortSignal));
  expect(screen.getByText("Sources · 0 selected")).toBeInTheDocument();
  vi.mocked(deleteConversationUpload).mockRejectedValue(new DocumentRequestError(500, null));
  fireEvent.click(screen.getByRole("button", { name: "Delete upload Keep.pdf" }));
  fireEvent.click(within(screen.getByRole("group", { name: "Delete Keep.pdf?" })).getByRole("button", { name: "Delete" }));
  expect(await screen.findByText(/could not be completed/)).toBeInTheDocument();
  expect(screen.getByRole("checkbox", { name: /Keep.pdf/ })).toBeInTheDocument();
});

it("uploads a conversation reference and follows processing to READY", async () => {
  vi.mocked(listConversationUploads).mockResolvedValue([]);
  let finish!: (value: ReturnType<typeof upload>) => void;
  vi.mocked(uploadConversationDocument).mockImplementation((_id, _file, _token, _signal, progress) =>
    new Promise((done) => { progress(60); finish = done; }));
  vi.mocked(getConversationUpload).mockResolvedValue(upload(14, 9, "New.pdf", "READY"));
  render(<ConnectedCourseChat courseId={42} materials={[]} />);
  await waitFor(() => expect(screen.getByRole("button", { name: "+ Add conversation upload" })).toBeEnabled());
  fireEvent.change(screen.getByLabelText("Add documents to Pandu"), { target: { files: [new File(["pdf"], "New.pdf")] } });
  expect(screen.getByText("Uploading 60%")).toBeInTheDocument();
  await act(async () => finish(upload(14, 9, "New.pdf", "PROCESSING")));
  expect(await screen.findByRole("checkbox", { name: /New.pdf/ })).toBeDisabled();
  await act(async () => { await new Promise((done) => setTimeout(done, 2100)); });
  expect(screen.getByRole("checkbox", { name: /New.pdf/ })).toBeEnabled();
  expect(uploadConversationDocument).toHaveBeenCalledWith(9, expect.any(File), "token", expect.any(AbortSignal), expect.any(Function));
});

it("keeps each course's chats separate and creates a chat for a course that has none", async () => {
  vi.mocked(listConversations).mockResolvedValue([thread(9, "Cells")]);
  vi.mocked(createCourseConversation).mockResolvedValue(thread(30, "", 43));
  const { rerender } = render(<ConnectedCourseChat courseId={42} materials={[]} />);
  await ready();
  rerender(<ConnectedCourseChat key="course-43" courseId={43} materials={[]} />);
  await waitFor(() => expect(listConversationMessages).toHaveBeenCalledWith(30, "token", expect.any(AbortSignal)));
  expect(createCourseConversation).toHaveBeenCalledWith(43, "token", expect.any(AbortSignal));
  expect(screen.queryByText("Mitosis.")).not.toBeInTheDocument();
  expect(screen.queryByText("Cells")).not.toBeInTheDocument();
});

it("shows upload validation and transport failures without adding a reference", async () => {
  vi.mocked(listConversationUploads).mockResolvedValue([]);
  vi.mocked(uploadConversationDocument).mockRejectedValue(new Error("offline"));
  render(<ConnectedCourseChat courseId={42} materials={[]} />);
  await waitFor(() => expect(screen.getByRole("button", { name: "+ Add conversation upload" })).toBeEnabled());
  fireEvent.change(screen.getByLabelText("Add documents to Pandu"), { target: { files: [new File(["text"], "Bad.txt")] } });
  expect(screen.getByRole("alert")).toHaveTextContent(".pdf, .docx, or .pptx");
  expect(uploadConversationDocument).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText("Add documents to Pandu"), { target: { files: [new File(["pdf"], "Good.pdf")] } });
  expect(await screen.findByRole("alert")).toHaveTextContent("could not be confirmed");
  expect(screen.queryByRole("checkbox", { name: /Good.pdf/ })).not.toBeInTheDocument();
});
