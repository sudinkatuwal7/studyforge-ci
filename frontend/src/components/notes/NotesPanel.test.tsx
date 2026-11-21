import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import { generateNotes, getNotes, NotesRequestError } from "../../api/notes";
import type { TrackedDocument } from "../../types/document";
import { DEFAULT_NOTES_OPTIONS, type CourseNotes } from "../../types/notes";
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
  id: 5, title: "Notes: Cells.pdf, Genes.pdf", course: 42, overview: "Cells carry genes.", created_at: "", updated_at: "",
  options: DEFAULT_NOTES_OPTIONS,
  source_documents: [{ id: 1, name: "Cells.pdf" }, { id: 2, name: "Genes.pdf" }],
  sections: [{
    heading: "Cell structure",
    key_concepts: [{ term: "Membrane", explanation: "Encloses the cell." }],
    points: ["Cells divide by mitosis."],
  }],
};

// The panel links to the notes library and note page, so it needs a router.
const renderPanel = (list = materials) => render(<NotesPanel courseId={42} materials={list} />, { wrapper: MemoryRouter });
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
  expect(generateNotes).toHaveBeenCalledWith(42, [1, 2], DEFAULT_NOTES_OPTIONS, "tok", expect.any(AbortSignal));
  expect(screen.getByRole("status")).toHaveTextContent("writing your notes");

  const title = await screen.findByRole("heading", { name: notes.title });
  await waitFor(() => expect(title).toHaveFocus());
  expect(screen.getByRole("heading", { name: "Cell structure", level: 4 })).toBeVisible();
  expect(screen.getByText("Membrane")).toBeVisible();
  expect(screen.getByText("Encloses the cell.")).toBeVisible();
  expect(screen.getByText("Cells divide by mitosis.")).toBeVisible();
  expect(screen.getByText("From Cells.pdf, Genes.pdf")).toBeVisible();
});

it("shows default options when an older API response has no options field", async () => {
  vi.mocked(generateNotes).mockResolvedValue({ ...notes, options: undefined } as unknown as CourseNotes);
  renderPanel();
  fireEvent.click(screen.getByLabelText("Cells.pdf"));
  fireEvent.click(generateButton());

  await screen.findByRole("heading", { name: notes.title });
  expect(screen.getByText("Outline · Standard · Bullet points")).toBeVisible();
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
  expect(generateNotes).toHaveBeenCalledWith(42, [1], DEFAULT_NOTES_OPTIONS, "tok", expect.any(AbortSignal));
  await screen.findByRole("heading", { name: notes.title });
});

it.each([
  [new NotesRequestError(409, "DOCUMENT_NOT_READY"), "still processing"],
  [new NotesRequestError(409, "DOCUMENT_HAS_NO_TEXT"), "No readable text"],
  [new NotesRequestError(422, "NOTES_INPUT_TOO_LARGE"), "too long to combine"],
  [new NotesRequestError(503, "NOTES_PROVIDER_UNAVAILABLE"), "AI service is unavailable"],
  [new NotesRequestError(503, "NOTES_INVALID_OUTPUT"), "could not be used, so nothing was saved"],
  [new NotesRequestError(503), "could not be generated"],
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
  vi.mocked(generateNotes).mockImplementation((_course, _ids, _options, _token, passed) => {
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

// SCRUM-86: note options

const group = (name: string) => within(screen.getByRole("group", { name }));

it("offers only fixed option choices, with the defaults selected", () => {
  renderPanel();
  expect(group("Note type").getAllByRole("radio")).toHaveLength(3);
  expect(group("Detail level").getAllByRole("radio")).toHaveLength(3);
  expect(group("Format").getAllByRole("radio")).toHaveLength(2);
  expect(group("Note type").getByRole("radio", { name: /^Outline/ })).toBeChecked();
  expect(group("Detail level").getByRole("radio", { name: /^Standard/ })).toBeChecked();
  expect(group("Format").getByRole("radio", { name: /^Bullet points/ })).toBeChecked();
  // Nothing the student types can reach the prompt.
  expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
});

it("sends the chosen options with the selected materials", async () => {
  vi.mocked(generateNotes).mockResolvedValue(notes);
  renderPanel();
  fireEvent.click(screen.getByLabelText("Cells.pdf"));
  fireEvent.click(screen.getByLabelText("Genes.pdf"));
  fireEvent.click(group("Note type").getByRole("radio", { name: /^Summary/ }));
  fireEvent.click(group("Detail level").getByRole("radio", { name: /^Brief/ }));
  fireEvent.click(group("Format").getByRole("radio", { name: /^Paragraphs/ }));
  fireEvent.click(generateButton());
  expect(generateNotes).toHaveBeenCalledWith(
    42, [1, 2], { note_type: "summary", detail_level: "brief", format: "paragraphs" }, "tok", expect.any(AbortSignal),
  );
  await screen.findByRole("heading", { name: notes.title });
});

it("keeps the chosen options when the student creates new notes", async () => {
  vi.mocked(generateNotes).mockResolvedValue(notes);
  renderPanel();
  fireEvent.click(screen.getByLabelText("Cells.pdf"));
  fireEvent.click(group("Detail level").getByRole("radio", { name: /^Detailed/ }));
  fireEvent.click(generateButton());
  fireEvent.click(await screen.findByRole("button", { name: "Create new notes" }));
  expect(group("Detail level").getByRole("radio", { name: /^Detailed/ })).toBeChecked();
});

it("disables the options while generating", async () => {
  vi.mocked(generateNotes).mockReturnValue(new Promise(() => {}));
  renderPanel();
  fireEvent.click(screen.getByLabelText("Cells.pdf"));
  fireEvent.click(generateButton());
  expect(group("Format").getByRole("radio", { name: /^Paragraphs/ })).toBeDisabled();
});

it("renders bullet notes as a list and paragraph notes as prose, with the options shown", async () => {
  vi.mocked(generateNotes).mockResolvedValue(notes);
  const first = renderPanel();
  fireEvent.click(screen.getByLabelText("Cells.pdf"));
  fireEvent.click(generateButton());
  await screen.findByRole("heading", { name: notes.title });
  expect(screen.getByRole("listitem")).toHaveTextContent("Cells divide by mitosis.");
  expect(screen.getByText("Outline · Standard · Bullet points")).toBeVisible();
  first.unmount();
  sessionStorage.clear();

  vi.mocked(generateNotes).mockResolvedValue({
    ...notes, id: 6, options: { note_type: "summary", detail_level: "brief", format: "paragraphs" },
  });
  renderPanel();
  fireEvent.click(screen.getByLabelText("Cells.pdf"));
  fireEvent.click(generateButton());
  await screen.findByRole("heading", { name: notes.title });
  expect(screen.queryByRole("listitem")).not.toBeInTheDocument();
  expect(screen.getByText("Cells divide by mitosis.").tagName).toBe("P");
  expect(screen.getByRole("heading", { name: "Explanation", level: 5 })).toBeVisible();
  expect(screen.getByText("Summary · Brief · Paragraphs")).toBeVisible();
});

it("links to this course's notes in the library before any notes are open", () => {
  renderPanel();

  expect(screen.getByRole("link", { name: "All notes for this course" })).toHaveAttribute("href", "/notes?course=42");
  expect(screen.queryByRole("link", { name: "Edit or delete these notes" })).not.toBeInTheDocument();
});

it("links new notes to their page, where they can be edited or deleted", async () => {
  vi.mocked(generateNotes).mockResolvedValue(notes);
  renderPanel();
  fireEvent.click(screen.getByLabelText("Cells.pdf"));
  fireEvent.click(generateButton());

  await screen.findByRole("heading", { name: notes.title });
  expect(screen.getByRole("link", { name: "Edit or delete these notes" })).toHaveAttribute("href", "/notes/5");
  expect(screen.getByRole("link", { name: "All notes for this course" })).toHaveAttribute("href", "/notes?course=42");
});

it("links restored notes to their page after a reload", async () => {
  sessionStorage.setItem("studyforge:notes:1:42", "5");
  vi.mocked(getNotes).mockResolvedValue(notes);
  renderPanel();

  expect(await screen.findByRole("link", { name: "Edit or delete these notes" })).toHaveAttribute("href", "/notes/5");
});

it("drops the edit link when Create new notes returns to the setup", async () => {
  vi.mocked(generateNotes).mockResolvedValue(notes);
  renderPanel();
  fireEvent.click(screen.getByLabelText("Cells.pdf"));
  fireEvent.click(generateButton());
  fireEvent.click(await screen.findByRole("button", { name: "Create new notes" }));

  expect(screen.queryByRole("link", { name: "Edit or delete these notes" })).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: "All notes for this course" })).toBeInTheDocument();
});
