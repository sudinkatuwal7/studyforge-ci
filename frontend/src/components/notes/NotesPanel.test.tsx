import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { generateNotes, getNotes, NotesRequestError } from "../../api/notes";
import type { TrackedDocument } from "../../types/document";
import type { CourseNotes } from "../../types/notes";
import NotesPanel from "./NotesPanel";

vi.mock("../../context/AuthContext", () => ({ useAuth: () => ({ user: { id: 1 }, accessToken: "tok" }) }));
vi.mock("../../api/notes", async (original) => ({
  ...await original<typeof import("../../api/notes")>(),
  generateNotes: vi.fn(), getNotes: vi.fn(),
}));

afterEach(() => { vi.clearAllMocks(); sessionStorage.clear(); });

const doc = (id: number, name: string, status: "READY" | "PROCESSING" | "FAILED"): TrackedDocument => ({
  id, name, snapshot: { id, course_id: 42, name, status, created_at: "", updated_at: "", error: status === "FAILED" ? { code: "x", message: "x" } : null },
});
const materials = [doc(1, "Cells.pdf", "READY"), doc(2, "Genes.pdf", "READY"), doc(3, "Slides.pptx", "PROCESSING")];

const notes: CourseNotes = {
  id: 5, title: "Notes: Cells.pdf, Genes.pdf", course: 42, overview: "Cells carry genes.", created_at: "",
  source_documents: [{ id: 1, name: "Cells.pdf" }, { id: 2, name: "Genes.pdf" }],
  sections: [{
    heading: "Cell structure",
    key_concepts: [{ term: "Membrane", explanation: "Encloses the cell." }],
    points: ["Cells divide by mitosis."],
  }],
};

const renderPanel = (list = materials) => render(<NotesPanel courseId={42} materials={list} />);
const generateButton = () => screen.getByRole("button", { name: "Generate notes" });

it("disables materials that are not READY and requires a selection", () => {
  renderPanel();
  expect(screen.getByLabelText(/Slides.pptx/)).toBeDisabled();
  expect(generateButton()).toBeDisabled();
  expect(screen.getByText("Select at least one material.")).toBeVisible();
});

it("generates from several materials and shows headed notes with concepts and explanations", async () => {
  vi.mocked(generateNotes).mockResolvedValue(notes);
  renderPanel();
  fireEvent.click(screen.getByLabelText("Cells.pdf"));
  fireEvent.click(screen.getByLabelText("Genes.pdf"));
  fireEvent.click(generateButton());
  expect(generateNotes).toHaveBeenCalledWith(42, [1, 2], "tok", expect.any(AbortSignal));
  expect(screen.getByRole("status")).toHaveTextContent("writing your notes");

  const title = await screen.findByRole("heading", { name: notes.title });
  await waitFor(() => expect(title).toHaveFocus());
  expect(screen.getByRole("heading", { name: "Cell structure", level: 4 })).toBeVisible();
  expect(screen.getByText("Membrane")).toBeVisible();
  expect(screen.getByText("Encloses the cell.")).toBeVisible();
  expect(screen.getByText("Cells divide by mitosis.")).toBeVisible();
  expect(screen.getByText("From Cells.pdf, Genes.pdf")).toBeVisible();
});

it("accepts one material and selects all READY materials on request", async () => {
  vi.mocked(generateNotes).mockResolvedValue(notes);
  renderPanel();
  fireEvent.click(screen.getByRole("button", { name: "Select all" }));
  expect(screen.getByLabelText("Cells.pdf")).toBeChecked();
  expect(screen.getByLabelText("Genes.pdf")).toBeChecked();
  expect(screen.getByLabelText(/Slides.pptx/)).not.toBeChecked();
  fireEvent.click(screen.getByLabelText("Genes.pdf"));
  fireEvent.click(generateButton());
  expect(generateNotes).toHaveBeenCalledWith(42, [1], "tok", expect.any(AbortSignal));
  await screen.findByRole("heading", { name: notes.title });
});

it.each([
  [new NotesRequestError(409, "DOCUMENT_NOT_READY"), "still processing"],
  [new NotesRequestError(409, "DOCUMENT_HAS_NO_TEXT"), "No readable text"],
  [new NotesRequestError(422, "NOTES_INPUT_TOO_LARGE"), "too long to combine"],
  [new NotesRequestError(503, "NOTES_GENERATION_FAILED"), "could not be generated right now"],
  [new NotesRequestError(401), "session has ended"],
  [new NotesRequestError(404), "could not be found"],
  [new Error("network"), "could not be generated"],
])("explains a failed generation and allows a retry: %s", async (cause, message) => {
  vi.mocked(generateNotes).mockRejectedValue(cause);
  renderPanel();
  fireEvent.click(screen.getByLabelText("Cells.pdf"));
  fireEvent.click(generateButton());
  expect(await screen.findByRole("alert")).toHaveTextContent(message);
  expect(screen.getByLabelText("Cells.pdf")).toBeChecked();
  expect(generateButton()).toBeEnabled();
});

it("keeps the selection when the student creates new notes", async () => {
  vi.mocked(generateNotes).mockResolvedValue(notes);
  renderPanel();
  fireEvent.click(screen.getByLabelText("Cells.pdf"));
  fireEvent.click(generateButton());
  fireEvent.click(await screen.findByRole("button", { name: "Create new notes" }));
  expect(screen.getByLabelText("Cells.pdf")).toBeChecked();
  expect(sessionStorage.getItem("studyforge:notes:1:42")).toBeNull();
});

it("reopens the notes after a reload without generating again", async () => {
  vi.mocked(generateNotes).mockResolvedValue(notes);
  const first = renderPanel();
  fireEvent.click(screen.getByLabelText("Cells.pdf"));
  fireEvent.click(generateButton());
  await screen.findByRole("heading", { name: notes.title });
  first.unmount();

  vi.mocked(getNotes).mockResolvedValue(notes);
  renderPanel();
  expect(screen.getByRole("status")).toHaveTextContent("Loading your notes");
  await screen.findByRole("heading", { name: notes.title });
  expect(getNotes).toHaveBeenCalledWith(5, "tok", expect.any(AbortSignal));
  expect(generateNotes).toHaveBeenCalledTimes(1);
});

it("quietly forgets saved notes that no longer exist", async () => {
  sessionStorage.setItem("studyforge:notes:1:42", "5");
  vi.mocked(getNotes).mockRejectedValue(new NotesRequestError(404));
  renderPanel();
  await waitFor(() => expect(generateButton()).toBeVisible());
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(sessionStorage.getItem("studyforge:notes:1:42")).toBeNull();
});

it("reports saved notes that fail to load for another reason", async () => {
  sessionStorage.setItem("studyforge:notes:1:42", "5");
  vi.mocked(getNotes).mockRejectedValue(new NotesRequestError(503));
  renderPanel();
  expect(await screen.findByRole("alert")).toHaveTextContent("could not be loaded");
  expect(sessionStorage.getItem("studyforge:notes:1:42")).toBe("5");
});

it("stops showing notes when a source material is deleted", async () => {
  vi.mocked(generateNotes).mockResolvedValue(notes);
  const { rerender } = renderPanel();
  fireEvent.click(screen.getByLabelText("Cells.pdf"));
  fireEvent.click(generateButton());
  await screen.findByRole("heading", { name: notes.title });

  rerender(<NotesPanel courseId={42} materials={materials.filter((item) => item.id !== 1)} />);

  expect(screen.queryByRole("heading", { name: notes.title })).not.toBeInTheDocument();
  expect(generateButton()).toBeVisible();
  expect(sessionStorage.getItem("studyforge:notes:1:42")).toBeNull();
});

it("keeps restored notes open while the material list is still loading", async () => {
  sessionStorage.setItem("studyforge:notes:1:42", "5");
  vi.mocked(getNotes).mockResolvedValue(notes);
  const { rerender } = renderPanel([]);
  await screen.findByRole("heading", { name: notes.title });
  rerender(<NotesPanel courseId={42} materials={materials} />);
  expect(screen.getByRole("heading", { name: notes.title })).toBeVisible();
});

it("cancels a generation in flight when the panel unmounts", async () => {
  let signal!: AbortSignal;
  vi.mocked(generateNotes).mockImplementation((_course, _ids, _token, passed) => {
    signal = passed!;
    return new Promise(() => {});
  });
  const { unmount } = renderPanel();
  fireEvent.click(screen.getByLabelText("Cells.pdf"));
  fireEvent.click(generateButton());
  const form = screen.getByRole("button", { name: "Generating notes..." });
  expect(form).toBeDisabled();
  expect(within(screen.getByRole("group", { name: "Materials" })).getByLabelText("Cells.pdf")).toBeDisabled();
  await act(async () => { unmount(); });
  expect(signal.aborted).toBe(true);
});
