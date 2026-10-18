import { StrictMode } from "react";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { deleteDocument, DocumentRequestError, getDocument, listDocuments, renameDocument, uploadDocument } from "../../api/documents";
import type { StudyDocument } from "../../types/document";
import CourseMaterials from "./CourseMaterials";

vi.mock("../../context/AuthContext", () => ({ useAuth: () => ({ user: { id: 1 }, accessToken: "token" }) }));
vi.mock("../../api/documents", async (original) => ({
  ...await original<typeof import("../../api/documents")>(),
  listDocuments: vi.fn(), renameDocument: vi.fn(), deleteDocument: vi.fn(), uploadDocument: vi.fn(), getDocument: vi.fn(),
}));

const document: StudyDocument = {
  id: 12, course_id: 7, name: "Lecture.pdf", status: "READY", error: null,
  created_at: "2026-10-01T12:00:00Z", updated_at: "2026-10-01T12:00:00Z",
};
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
async function show() {
  await act(async () => { render(<StrictMode><CourseMaterials courseId={7} /></StrictMode>); });
}
async function click(name: string) {
  await act(async () => { fireEvent.click(screen.getByRole("button", { name })); });
}
async function upload() {
  fireEvent.change(screen.getByLabelText("PDF file"), { target: { files: [new File(["%PDF-test"], "Lecture.pdf")] } });
  await click("Upload PDF");
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(listDocuments).mockReset().mockResolvedValue([document]);
  vi.mocked(renameDocument).mockReset().mockResolvedValue({ ...document, name: "Renamed" });
  vi.mocked(deleteDocument).mockReset().mockResolvedValue(undefined);
  vi.mocked(uploadDocument).mockReset().mockResolvedValue(document);
  vi.mocked(getDocument).mockReset().mockResolvedValue(document);
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

it("renders persistent materials, metadata, and all four processing statuses", async () => {
  vi.mocked(listDocuments).mockResolvedValue((["PENDING", "PROCESSING", "READY", "FAILED"] as const).map((status, index) => ({
    ...document, id: index + 1, name: `${status}.pdf`, status,
    error: status === "FAILED" ? { code: "PROCESSING_FAILED", message: "Processing failed." } : null,
  })));
  await show();
  expect(screen.getAllByRole("article")).toHaveLength(4);
  for (const status of ["PENDING", "PROCESSING", "READY", "FAILED"]) {
    expect(screen.getByText(status)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: `${status}.pdf` })).toBeInTheDocument();
  }
  expect(screen.getAllByText(/Uploaded/)).toHaveLength(4);
});

it("shows an empty list and a recoverable safe API error", async () => {
  vi.mocked(listDocuments).mockRejectedValue(new DocumentRequestError(503, { code: "UNAVAILABLE", message: "Materials unavailable." }));
  await show();
  expect(screen.getByRole("alert")).toHaveTextContent("Materials unavailable.");
  vi.mocked(listDocuments).mockResolvedValue([]);
  await click("Retry loading materials");
  expect(screen.getByText("No materials uploaded yet.")).toBeInTheDocument();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

it("prefills rename, cancels without a request, and saves a trimmed name", async () => {
  await show();
  await click("Rename");
  expect(screen.getByLabelText("Material name")).toHaveValue("Lecture.pdf");
  fireEvent.change(screen.getByLabelText("Material name"), { target: { value: "Abandoned" } });
  await click("Cancel");
  expect(renameDocument).not.toHaveBeenCalled();
  await click("Rename");
  expect(screen.getByLabelText("Material name")).toHaveValue("Lecture.pdf");
  fireEvent.change(screen.getByLabelText("Material name"), { target: { value: "  Renamed  " } });
  await click("Save name");
  expect(renameDocument).toHaveBeenCalledWith(12, "Renamed", "token", expect.any(AbortSignal));
  expect(screen.getByRole("heading", { name: "Renamed" })).toBeInTheDocument();
  expect(screen.getByText("Material renamed.")).toBeInTheDocument();
});

it("rejects blank names without a request and preserves the name on API failure", async () => {
  await show();
  await click("Rename");
  fireEvent.change(screen.getByLabelText("Material name"), { target: { value: "   " } });
  await click("Save name");
  expect(screen.getByRole("alert")).toHaveTextContent("1 to 255");
  expect(renameDocument).not.toHaveBeenCalled();
  vi.mocked(renameDocument).mockRejectedValue(new DocumentRequestError(400, { code: "INVALID_NAME", message: "Invalid material name." }));
  fireEvent.change(screen.getByLabelText("Material name"), { target: { value: "Changed" } });
  await click("Save name");
  expect(screen.getByRole("alert")).toHaveTextContent("Invalid material name.");
  expect(screen.getByRole("heading", { name: "Lecture.pdf" })).toBeInTheDocument();
});

it("requires delete confirmation, supports cancel, and removes only the selected item", async () => {
  vi.mocked(listDocuments).mockResolvedValue([document, { ...document, id: 13, name: "Keep.pdf" }]);
  await show();
  const item = within(screen.getByRole("article", { name: "Lecture.pdf" }));
  fireEvent.click(item.getByRole("button", { name: "Delete" }));
  expect(screen.getByRole("group", { name: "Confirm deletion" })).toBeInTheDocument();
  expect(deleteDocument).not.toHaveBeenCalled();
  await click("Cancel");
  expect(deleteDocument).not.toHaveBeenCalled();
  fireEvent.click(item.getByRole("button", { name: "Delete" }));
  await click("Confirm delete");
  expect(deleteDocument).toHaveBeenCalledWith(12, "token", expect.any(AbortSignal));
  expect(screen.queryByRole("article", { name: "Lecture.pdf" })).not.toBeInTheDocument();
  expect(screen.getByRole("article", { name: "Keep.pdf" })).toBeInTheDocument();
  expect(screen.getByText("Material deleted.")).toBeInTheDocument();
});

it("keeps a material and displays a safe error when deletion fails", async () => {
  vi.mocked(deleteDocument).mockRejectedValue(new DocumentRequestError(503, { code: "MATERIAL_UNAVAILABLE", message: "Deletion unavailable." }));
  await show();
  await click("Delete");
  await click("Confirm delete");
  expect(screen.getByRole("alert")).toHaveTextContent("Deletion unavailable.");
  expect(screen.getByRole("heading", { name: "Lecture.pdf" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Confirm delete" })).toBeEnabled();
});

it.each(["rename", "delete"])("disables controls and prevents duplicate %s requests", async (action) => {
  const response = deferred<StudyDocument>();
  if (action === "rename") vi.mocked(renameDocument).mockReturnValue(response.promise);
  else vi.mocked(deleteDocument).mockReturnValue(response.promise.then(() => undefined));
  await show();
  await click(action === "rename" ? "Rename" : "Delete");
  await click(action === "rename" ? "Save name" : "Confirm delete");
  const button = screen.getByRole("button", { name: action === "rename" ? "Saving..." : "Deleting..." });
  expect(button).toBeDisabled();
  expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
  fireEvent.click(button);
  expect(action === "rename" ? renameDocument : deleteDocument).toHaveBeenCalledTimes(1);
  await act(async () => { response.resolve(document); });
});

it("puts uploads in the persistent list with one poller and retains them after another upload starts", async () => {
  vi.mocked(listDocuments).mockResolvedValue([]);
  vi.mocked(uploadDocument).mockResolvedValue({ ...document, status: "PENDING" });
  await show();
  await upload();
  expect(screen.getAllByRole("article")).toHaveLength(1);
  expect(screen.getAllByRole("heading", { name: "Lecture.pdf" })).toHaveLength(1);
  await click("Upload another PDF");
  await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
  expect(getDocument).toHaveBeenCalledTimes(1);
  expect(screen.getByText("READY")).toBeInTheDocument();
});

it("adds saved uploads with unconfirmed processing and keeps their manual status check", async () => {
  vi.mocked(listDocuments).mockResolvedValue([]);
  vi.mocked(uploadDocument).mockRejectedValue(new DocumentRequestError(503, {
    document_id: 12, error: { code: "PROCESSING_HANDOFF_UNCONFIRMED", message: "Processing unconfirmed." },
  }));
  await show();
  await upload();
  expect(screen.getAllByRole("article")).toHaveLength(1);
  expect(getDocument).not.toHaveBeenCalled();
  await click("Refresh status");
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
  expect(getDocument).toHaveBeenCalledTimes(1);
  expect(screen.getByText("READY")).toBeInTheDocument();
});

it.each(["rename", "delete"])("ignores stale polling after %s", async (action) => {
  const poll = deferred<StudyDocument>();
  vi.mocked(listDocuments).mockResolvedValue([{ ...document, status: "PENDING" }]);
  vi.mocked(getDocument).mockReturnValue(poll.promise);
  await show();
  await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
  const signal = vi.mocked(getDocument).mock.calls[0][2];
  await click(action === "rename" ? "Rename" : "Delete");
  await click(action === "rename" ? "Save name" : "Confirm delete");
  expect(signal.aborted).toBe(true);
  await act(async () => { poll.resolve(document); });
  expect(screen.queryByRole("heading", { name: "Lecture.pdf" })).not.toBeInTheDocument();
  if (action === "rename") expect(screen.getByRole("heading", { name: "Renamed" })).toBeInTheDocument();
  else expect(screen.queryByRole("article")).not.toBeInTheDocument();
});

it.each(["rename", "delete"])("does not let a late initial list undo an upload followed by %s", async (action) => {
  const listing = deferred<StudyDocument[]>();
  vi.mocked(listDocuments).mockReturnValue(listing.promise);
  await show();
  await upload();
  await click(action === "rename" ? "Rename" : "Delete");
  await click(action === "rename" ? "Save name" : "Confirm delete");
  await act(async () => { listing.resolve([document]); });
  expect(screen.queryByRole("heading", { name: "Lecture.pdf" })).not.toBeInTheDocument();
  if (action === "rename") expect(screen.getByRole("heading", { name: "Renamed" })).toBeInTheDocument();
  else expect(screen.queryByRole("article")).not.toBeInTheDocument();
});
