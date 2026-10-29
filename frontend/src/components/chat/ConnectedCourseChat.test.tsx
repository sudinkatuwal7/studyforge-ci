import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import ConnectedCourseChat from "./ConnectedCourseChat";
import { DocumentRequestError } from "../../api/documents";
import { askConversationQuestion, createCourseConversation, getConversationUpload, listConversationUploads, listConversations, uploadConversationDocument } from "../../api/conversations";

vi.mock("../../context/AuthContext", () => ({ useAuth: () => ({ user: { id: 1 }, accessToken: "token" }) }));
vi.mock("../../api/conversations", () => ({
  listConversations: vi.fn(), createCourseConversation: vi.fn(), listConversationUploads: vi.fn(),
  getConversationUpload: vi.fn(), uploadConversationDocument: vi.fn(), askConversationQuestion: vi.fn(),
}));
const conversation = (id: number, courseId: number) => ({ id, course_id: courseId, title: "", created_at: "2026-10-01", updated_at: "2026-10-01" });
const material = (id: number, courseId: number, name: string, status = "READY") => ({ id, name, snapshot: {
  id, course_id: courseId, name, status: status as "READY", error: null, created_at: "2026-10-01", updated_at: "2026-10-01",
} });
const upload = (id: number, conversationId: number, name: string, status: "PENDING" | "PROCESSING" | "READY" | "FAILED" = "READY") => ({
  id, course_id: null, conversation_id: conversationId, name, status,
  error: status === "FAILED" ? { code: "PROCESSING_FAILED", message: "Could not read file." } : null,
  created_at: "2026-10-01", updated_at: "2026-10-01",
});
beforeEach(() => {
  sessionStorage.clear();
  vi.mocked(listConversations).mockReset().mockResolvedValue([conversation(9, 42), conversation(10, 43)]);
  vi.mocked(createCourseConversation).mockReset().mockResolvedValue(conversation(9, 42));
  vi.mocked(listConversationUploads).mockReset().mockImplementation(async (id) => id === 9 ? [upload(13, 9, "Chat.docx")] : []);
  vi.mocked(getConversationUpload).mockReset().mockResolvedValue(upload(13, 9, "Chat.docx"));
  vi.mocked(uploadConversationDocument).mockReset();
  vi.mocked(askConversationQuestion).mockReset();
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

it("selects course and conversation sources, sends the selected IDs, and renders real citations", async () => {
  vi.mocked(askConversationQuestion).mockResolvedValue({ status: "ANSWERED", answer: "Cells divide.", citations: [
    { chunk_id: 1, document_id: 1, page_number: 2, excerpt: "PDF evidence" },
    { chunk_id: 2, document_id: 2, page_number: 3, excerpt: "Slide evidence" },
    { chunk_id: 3, document_id: 13, page_number: 1, excerpt: "Word evidence" },
  ] });
  render(<ConnectedCourseChat courseId={42} materials={[material(1, 42, "Lecture.pdf"), material(2, 42, "Slides.pptx"), material(99, 43, "Foreign.pdf")]} />);
  await screen.findByRole("checkbox", { name: /Chat.docx/ });
  expect(screen.getByRole("group", { name: "Course Materials" })).toHaveTextContent("Lecture.pdf");
  expect(screen.getByRole("group", { name: "Conversation Uploads" })).toHaveTextContent("Chat.docx");
  expect(screen.queryByText("Foreign.pdf")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Select all READY" }));
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "How do cells divide?" } });
  fireEvent.click(screen.getByRole("button", { name: "Send to Pandu" }));
  expect(await screen.findByText("Cells divide.")).toBeInTheDocument();
  expect(askConversationQuestion).toHaveBeenCalledWith(9, "How do cells divide?", [1, 2, 13], "token", expect.any(AbortSignal));
  expect(screen.getByRole("button", { name: "Lecture.pdf · Page 2" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Slides.pptx · Slide 3" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Chat.docx · Source excerpt" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Chat.docx · Source excerpt" }));
  expect(screen.getByRole("region", { name: "Citation details" })).toHaveTextContent("Word evidence");
  expect(createCourseConversation).not.toHaveBeenCalled();
});

it("shows insufficient context, blocks empty selection, prevents duplicate requests, and reports errors", async () => {
  let resolve!: (value: { status: "INSUFFICIENT_CONTEXT"; answer: null; citations: [] }) => void;
  vi.mocked(askConversationQuestion).mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
  render(<ConnectedCourseChat courseId={42} materials={[material(1, 42, "Lecture.pdf")]} />);
  await screen.findByRole("checkbox", { name: /Chat.docx/ });
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "Explain" } });
  expect(screen.getByRole("button", { name: "Send to Pandu" })).toBeDisabled();
  fireEvent.click(screen.getByRole("checkbox", { name: /Lecture.pdf/ }));
  fireEvent.click(screen.getByRole("button", { name: "Send to Pandu" }));
  expect(screen.getByRole("button", { name: "Send to Pandu" })).toBeDisabled();
  expect(askConversationQuestion).toHaveBeenCalledTimes(1);
  await act(async () => resolve({ status: "INSUFFICIENT_CONTEXT", answer: null, citations: [] }));
  expect(screen.getByText(/couldn’t find enough information/)).toBeInTheDocument();
  vi.mocked(askConversationQuestion).mockRejectedValueOnce(new Error("connection failed"));
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "Another question" } });
  fireEvent.click(screen.getByRole("button", { name: "Send to Pandu" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("could not answer");
});

it("shows the backend detail when Pandu generation fails", async () => {
  vi.mocked(askConversationQuestion).mockRejectedValue(new DocumentRequestError(503, {
    code: "RAG_GENERATION_FAILED", detail: "The question could not be answered right now. Please try again.",
  }));
  render(<ConnectedCourseChat courseId={42} materials={[material(1, 42, "Lecture.pdf")]} />);
  await screen.findByRole("checkbox", { name: /Chat.docx/ });
  fireEvent.click(screen.getByRole("checkbox", { name: /Lecture.pdf/ }));
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "Explain hazard management costs" } });
  fireEvent.click(screen.getByRole("button", { name: "Send to Pandu" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("The question could not be answered right now. Please try again.");
});

it("uploads a conversation reference, follows processing to READY, and deselects without deletion", async () => {
  vi.mocked(listConversationUploads).mockResolvedValue([]);
  let finish!: (value: ReturnType<typeof upload>) => void;
  vi.mocked(uploadConversationDocument).mockImplementation((_id, _file, _token, _signal, progress) =>
    new Promise((done) => { progress(60); finish = done; }));
  vi.mocked(getConversationUpload).mockResolvedValue(upload(14, 9, "New.pdf", "READY"));
  render(<ConnectedCourseChat courseId={42} materials={[]} />);
  await waitFor(() => expect(screen.getByRole("button", { name: "+ Add conversation upload" })).toBeEnabled());
  fireEvent.change(screen.getByLabelText("Add documents to Pandu"), { target: { files: [new File(["pdf"], "New.pdf")] } });
  expect(screen.getByRole("status", { name: "" })).toHaveTextContent("Uploading 60%");
  await act(async () => finish(upload(14, 9, "New.pdf", "PROCESSING")));
  expect(await screen.findByRole("checkbox", { name: /New.pdf/ })).toBeDisabled();
  expect(screen.getByText("PROCESSING")).toBeInTheDocument();
  await act(async () => { await new Promise((done) => setTimeout(done, 2100)); });
  expect(screen.getByRole("checkbox", { name: /New.pdf/ })).toBeEnabled();
  fireEvent.click(screen.getByRole("checkbox", { name: /New.pdf/ }));
  expect(screen.getByText("Sources · 1 selected")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Clear selection" }));
  expect(screen.getByText("Sources · 0 selected")).toBeInTheDocument();
  expect(screen.getByRole("checkbox", { name: /New.pdf/ })).toBeInTheDocument();
  expect(uploadConversationDocument).toHaveBeenCalledWith(9, expect.any(File), "token", expect.any(AbortSignal), expect.any(Function));
});

it("keeps each course's active messages and selections separate across navigation", async () => {
  vi.mocked(askConversationQuestion).mockResolvedValue({ status: "INSUFFICIENT_CONTEXT", answer: null, citations: [] });
  const { rerender, unmount } = render(<ConnectedCourseChat courseId={42} materials={[material(1, 42, "Lecture.pdf")]} />);
  await screen.findByRole("checkbox", { name: /Chat.docx/ });
  fireEvent.click(screen.getByRole("checkbox", { name: /Lecture.pdf/ }));
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "Course A question" } });
  fireEvent.click(screen.getByRole("button", { name: "Send to Pandu" }));
  await screen.findByText("Course A question");
  rerender(<ConnectedCourseChat key="course-43" courseId={43} materials={[material(2, 43, "Other.pdf")]} />);
  await waitFor(() => expect(listConversationUploads).toHaveBeenCalledWith(10, "token", expect.any(AbortSignal)));
  expect(screen.queryByText("Course A question")).not.toBeInTheDocument();
  expect(screen.getByText("Sources · 0 selected")).toBeInTheDocument();
  expect(screen.queryByText("Chat.docx")).not.toBeInTheDocument();
  unmount();
  render(<ConnectedCourseChat courseId={42} materials={[material(1, 42, "Lecture.pdf")]} />);
  await screen.findByRole("checkbox", { name: /Chat.docx/ });
  expect(screen.getByText("Course A question")).toBeInTheDocument();
  expect(screen.getByText("Sources · 1 selected")).toBeInTheDocument();
});

it("creates a course conversation when none exists and displays a failed upload", async () => {
  vi.mocked(listConversations).mockResolvedValue([]);
  vi.mocked(listConversationUploads).mockResolvedValue([upload(20, 9, "Broken.pptx", "FAILED")]);
  render(<ConnectedCourseChat courseId={42} materials={[]} />);
  await screen.findByRole("checkbox", { name: /Broken.pptx/ });
  expect(createCourseConversation).toHaveBeenCalledWith(42, "token", expect.any(AbortSignal));
  expect(screen.getByRole("checkbox", { name: /Broken.pptx/ })).toBeDisabled();
  expect(screen.getByText(/Could not read file/)).toBeInTheDocument();
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
