import { StrictMode } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DocumentRequestError, getDocument, uploadDocument } from "../../api/documents";
import type { StudyDocument } from "../../types/document";
import DocumentUpload from "./DocumentUpload";

const auth = vi.hoisted(() => ({ accessToken: "test-token", user: { id: 1, email: "test@example.test" } }));
vi.mock("../../context/AuthContext", () => ({ useAuth: () => auth }));
vi.mock("../../api/documents", async (importOriginal) => ({
  ...await importOriginal<typeof import("../../api/documents")>(),
  uploadDocument: vi.fn(),
  getDocument: vi.fn(),
}));

const pending: StudyDocument = {
  id: 12, course_id: 7, name: "Lecture.pdf", status: "PENDING",
  created_at: "2026-09-30T12:00:00Z", updated_at: "2026-09-30T12:00:00Z", error: null,
};
const ready: StudyDocument = { ...pending, status: "READY" };
const mockUpload = vi.mocked(uploadDocument);
const mockGet = vi.mocked(getDocument);
const tree = (courseId = 7) => <StrictMode><DocumentUpload courseId={courseId} /></StrictMode>;

async function chooseAndSubmit() {
  fireEvent.change(screen.getByLabelText("Document file"), { target: { files: [new File(["%PDF-test"], "Lecture.pdf", { type: "application/pdf" })] } });
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Upload document" })); });
}

async function advance(ms = 2000) {
  await act(async () => { await vi.advanceTimersByTimeAsync(ms); });
}

beforeEach(() => {
  vi.useFakeTimers();
  mockUpload.mockReset().mockResolvedValue(pending);
  mockGet.mockReset();
  auth.accessToken = "test-token";
  auth.user = { id: 1, email: "test@example.test" };
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("PDF upload and status", () => {
  it("offers all three supported formats in the existing file picker", () => {
    render(tree());
    expect(screen.getByLabelText("Document file")).toHaveAttribute(
      "accept", expect.stringContaining(".pdf,.docx,.pptx"),
    );
  });
  it("selects a file dropped on the upload area", () => {
    render(tree());
    const zone = screen.getByRole("heading", { name: "Upload course materials" }).closest(".document-drop");
    fireEvent.drop(zone!, { dataTransfer: { files: [new File(["%PDF"], "Dropped.pdf", { type: "application/pdf" })] } });
    expect(screen.getByText("Selected: Dropped.pdf")).toBeInTheDocument();
  });
  it("requires a file and blocks invalid selections before a request", async () => {
    render(tree());
    fireEvent.click(screen.getByRole("button", { name: "Upload document" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Choose a PDF");
    fireEvent.change(screen.getByLabelText("Document file"), { target: { files: [new File(["hello"], "notes.txt")] } });
    fireEvent.click(screen.getByRole("button", { name: "Upload document" }));
    expect(screen.getByRole("alert")).toHaveTextContent(".pdf, .docx, or .pptx extension");
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it("shows the saved filename, polls PENDING and PROCESSING, and stops at READY in Strict Mode", async () => {
    mockGet.mockResolvedValueOnce({ ...pending, status: "PROCESSING" }).mockResolvedValueOnce(ready);
    render(tree());
    await chooseAndSubmit();
    expect(mockUpload).toHaveBeenCalledWith(7, expect.any(File), "test-token", expect.any(AbortSignal));
    expect(screen.getByRole("heading", { name: "Lecture.pdf" })).toBeInTheDocument();
    expect(screen.getByText("PENDING")).toBeInTheDocument();
    await advance();
    expect(screen.getByText("PROCESSING")).toBeInTheDocument();
    await advance();
    expect(screen.getByText("READY")).toBeInTheDocument();
    await advance(60000);
    expect(mockGet).toHaveBeenCalledTimes(2);
    expect(mockUpload).toHaveBeenCalledTimes(1);
  });

  it("shows a safe terminal failure and stops polling", async () => {
    mockGet.mockResolvedValue({ ...pending, status: "FAILED", error: { code: "PROCESSING_FAILED", message: "This PDF could not be processed." } });
    render(tree());
    await chooseAndSubmit();
    await advance();
    expect(screen.getByText("FAILED")).toBeInTheDocument();
    expect(screen.getByText("This PDF could not be processed.")).toBeInTheDocument();
    await advance(60000);
    expect(mockGet).toHaveBeenCalledTimes(1);
  });

  it("waits for each request to finish before scheduling another", async () => {
    let resolve!: (value: StudyDocument) => void;
    mockGet.mockImplementationOnce(() => new Promise((done) => { resolve = done; })).mockResolvedValue(ready);
    render(tree());
    await chooseAndSubmit();
    await advance();
    await advance(10000);
    expect(mockGet).toHaveBeenCalledTimes(1);
    await act(async () => { resolve({ ...pending, status: "PROCESSING" }); });
    await advance(1999);
    expect(mockGet).toHaveBeenCalledTimes(1);
    await advance(1);
    expect(mockGet).toHaveBeenCalledTimes(2);
  });

  it("pauses after three failures, preserves status, and resumes only on explicit refresh", async () => {
    mockGet.mockRejectedValue(new TypeError("Network unavailable"));
    render(tree());
    await chooseAndSubmit();
    await advance(6000);
    expect(screen.getByText("PENDING")).toBeInTheDocument();
    expect(screen.getByText(/paused after three connection failures/)).toBeInTheDocument();
    await advance(60000);
    expect(mockGet).toHaveBeenCalledTimes(3);
    mockGet.mockResolvedValue(ready);
    fireEvent.click(screen.getByRole("button", { name: "Refresh status" }));
    await advance(0);
    expect(screen.getByText("READY")).toBeInTheDocument();
    expect(mockUpload).toHaveBeenCalledTimes(1);
  });

  it("resets consecutive failure count after a successful status check", async () => {
    mockGet.mockRejectedValueOnce(new Error("offline")).mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(pending).mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(ready);
    render(tree());
    await chooseAndSubmit();
    await advance(10000);
    expect(screen.getByText("READY")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Refresh status" })).not.toBeInTheDocument();
  });

  it.each([401, 403, 404])("stops on status HTTP %i without retrying or changing the processing state", async (status) => {
    mockGet.mockRejectedValue(new DocumentRequestError(status, { code: "ERROR", message: "Unavailable" }));
    render(tree());
    await chooseAndSubmit();
    await advance();
    expect(screen.getByText(status === 404 ? /document is unavailable/ : /session has ended/)).toBeInTheDocument();
    expect(screen.getByText("PENDING")).toBeInTheDocument();
    await advance(60000);
    expect(mockGet).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: "Refresh status" })).not.toBeInTheDocument();
  });

  it.each(["PROCESSING_DISPATCH_FAILED", "PROCESSING_HANDOFF_UNCONFIRMED"])("recovers the saved document for %s without re-uploading", async (code) => {
    mockUpload.mockRejectedValue(new DocumentRequestError(503, { document_id: 12, error: { code, message: "The PDF was saved. Check its status." } }));
    mockGet.mockResolvedValue(ready);
    render(tree());
    await chooseAndSubmit();
    expect(screen.getByRole("alert")).toHaveTextContent("The PDF was saved");
    expect(screen.getByText("Not yet checked")).toBeInTheDocument();
    await advance(10000);
    expect(mockGet).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Refresh status" }));
    await advance(0);
    expect(mockGet).toHaveBeenCalledWith(12, "test-token", expect.any(AbortSignal));
    expect(screen.getByText("READY")).toBeInTheDocument();
    expect(mockUpload).toHaveBeenCalledTimes(1);
  });

  it("warns about ambiguous network upload failures and never replays the POST", async () => {
    mockUpload.mockRejectedValue(new TypeError("offline"));
    render(tree());
    await chooseAndSubmit();
    expect(screen.getByRole("alert")).toHaveTextContent("may already have been saved");
    await advance(60000);
    expect(mockUpload).toHaveBeenCalledTimes(1);
    expect(mockGet).not.toHaveBeenCalled();
  });

  it.each([400, 404, 401])("shows upload HTTP %i errors without starting a poll", async (status) => {
    mockUpload.mockRejectedValue(new DocumentRequestError(status, { code: "INVALID_PDF", message: "Upload a valid, readable PDF." }));
    render(tree());
    await chooseAndSubmit();
    expect(screen.getByRole("alert")).toHaveTextContent(status === 401 ? /session has ended/ : status === 404 ? /course is unavailable/ : /valid, readable PDF/);
    if (status === 401) expect(screen.getByRole("button", { name: "Upload document" })).toBeDisabled();
    await advance(10000);
    expect(mockGet).not.toHaveBeenCalled();
  });

  it("aborts an upload on course change and ignores its late completion", async () => {
    let resolve!: (value: StudyDocument) => void;
    mockUpload.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    const view = render(tree());
    await chooseAndSubmit();
    expect(screen.getByRole("button", { name: "Uploading…" })).toBeDisabled();
    const signal = mockUpload.mock.calls[0][3];
    view.rerender(tree(8));
    expect(signal.aborted).toBe(true);
    await act(async () => { resolve(pending); });
    expect(screen.queryByText("PENDING")).not.toBeInTheDocument();
    await advance(6000);
    expect(mockGet).not.toHaveBeenCalled();
  });

  it("aborts status requests on unmount and ignores stale responses", async () => {
    let resolve!: (value: StudyDocument) => void;
    mockGet.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    const view = render(tree());
    await chooseAndSubmit();
    await advance();
    const signal = mockGet.mock.calls[0][2];
    view.unmount();
    expect(signal.aborted).toBe(true);
    await act(async () => { resolve(pending); });
    await advance(6000);
    expect(mockGet).toHaveBeenCalledTimes(1);
  });

  it("cleans up pending timers when starting another document", async () => {
    render(tree());
    await chooseAndSubmit();
    fireEvent.click(screen.getByRole("button", { name: "Upload another document" }));
    await advance(6000);
    expect(mockGet).not.toHaveBeenCalled();
    expect(screen.queryByText("PENDING")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Document file")).toHaveValue("");
  });
});
