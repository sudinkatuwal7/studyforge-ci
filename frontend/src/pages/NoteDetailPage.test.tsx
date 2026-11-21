import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import { deleteNotes, getNotes, NotesRequestError, updateNotes } from "../api/notes";
import type { CourseNotes } from "../types/notes";
import NoteDetailPage from "./NoteDetailPage";

vi.mock("../api/notes", async (original) => ({
  ...await original<typeof import("../api/notes")>(),
  getNotes: vi.fn(),
  updateNotes: vi.fn(),
  deleteNotes: vi.fn(),
}));
vi.mock("../context/AuthContext", () => ({ useAuth: () => ({ user: { id: 1 }, accessToken: "token" }) }));

afterEach(() => vi.clearAllMocks());

const notes: CourseNotes = {
  id: 1,
  title: "Notes: Cells",
  course: 7,
  options: { note_type: "outline", detail_level: "standard", format: "bullets" },
  overview: "Cells and genes.",
  sections: [{
    heading: "Cell structure",
    key_concepts: [{ term: "Membrane", explanation: "Encloses the cell." }],
    points: ["Cells divide by mitosis.", "Ribosomes make proteins."],
  }],
  source_documents: [{ id: 3, name: "Cells.pdf" }],
  created_at: "2026-10-01T12:00:00Z",
  updated_at: "2026-10-01T12:00:00Z",
};

// Shows the current URL so tests can check where delete leads.
function Location() {
  const { pathname } = useLocation();
  return <output aria-label="Current URL">{pathname}</output>;
}

function BackButton() {
  const navigate = useNavigate();
  return <button type="button" onClick={() => navigate(-1)}>Back</button>;
}

function renderNote(path = "/notes/1") {
  return render(<MemoryRouter initialEntries={["/notes", path]} initialIndex={1}>
    <Routes>
      <Route path="/notes" element={<p>Library</p>} />
      <Route path="/notes/:notesId" element={<NoteDetailPage />} />
    </Routes>
    <Location />
    <BackButton />
  </MemoryRouter>);
}

const url = () => screen.getByLabelText("Current URL").textContent;
const section = (number: number) => within(screen.getByRole("group", { name: `Section ${number}` }));

async function startEditing() {
  vi.mocked(getNotes).mockResolvedValue(notes);
  renderNote();
  fireEvent.click(await screen.findByRole("button", { name: "Edit notes" }));
}

it("shows the full content of the notes", async () => {
  vi.mocked(getNotes).mockResolvedValue(notes);
  renderNote();

  expect(await screen.findByRole("heading", { name: "Notes: Cells" })).toBeInTheDocument();
  expect(getNotes).toHaveBeenCalledWith(1, "token", expect.any(AbortSignal));
  expect(screen.getByText("Cells and genes.")).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Cell structure" })).toBeInTheDocument();
  expect(screen.getByText("Membrane")).toBeInTheDocument();
  expect(screen.getByText("Encloses the cell.")).toBeInTheDocument();
  expect(screen.getByText("Cells divide by mitosis.")).toBeInTheDocument();
  expect(screen.getByText("Ribosomes make proteins.")).toBeInTheDocument();
  expect(screen.getByText("From Cells.pdf")).toBeInTheDocument();
  expect(screen.getByText(/^Saved/)).toHaveTextContent("Saved Oct 1, 2026");
  expect(screen.queryByText(/Edited/)).not.toBeInTheDocument();
  // Generation belongs to the course Notes tab, not this page.
  expect(screen.queryByRole("button", { name: "Create new notes" })).not.toBeInTheDocument();
});

it("says notes were not found for a 404, which includes another student's notes", async () => {
  vi.mocked(getNotes).mockRejectedValue(new NotesRequestError(404));
  renderNote();

  expect(await screen.findByRole("alert")).toHaveTextContent("These notes were not found, or you do not have access to them.");
  expect(screen.queryByRole("button", { name: "Edit notes" })).not.toBeInTheDocument();
});

it("treats an id that is not a number as not found, without a request", () => {
  renderNote("/notes/abc");

  expect(screen.getByRole("alert")).toHaveTextContent("These notes were not found");
  expect(getNotes).not.toHaveBeenCalled();
});

it("explains an expired session and other load failures", async () => {
  vi.mocked(getNotes).mockRejectedValueOnce(new NotesRequestError(401));
  const { unmount } = renderNote();
  expect(await screen.findByRole("alert")).toHaveTextContent("Your session has expired.");
  unmount();

  vi.mocked(getNotes).mockRejectedValueOnce(new NotesRequestError(500));
  renderNote();
  expect(await screen.findByRole("alert")).toHaveTextContent("Could not load these notes.");
});

it("saves an edited title and content and shows what the server saved", async () => {
  await startEditing();
  const saved = {
    ...notes,
    title: "My cell notes",
    overview: "How cells divide.",
    sections: [{ ...notes.sections[0], points: ["Mitosis makes two cells.", "Ribosomes make proteins."] }],
    updated_at: "2026-10-05T09:00:00Z",
  };
  vi.mocked(updateNotes).mockResolvedValue(saved);

  fireEvent.change(screen.getByLabelText("Title"), { target: { value: "  My cell notes  " } });
  fireEvent.change(screen.getByLabelText("Overview"), { target: { value: "How cells divide." } });
  fireEvent.change(section(1).getByLabelText("Point 1"), { target: { value: "Mitosis makes two cells." } });
  fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

  expect(await screen.findByRole("heading", { name: "My cell notes" })).toBeInTheDocument();
  expect(updateNotes).toHaveBeenCalledWith(1, {
    title: "My cell notes",
    overview: "How cells divide.",
    sections: saved.sections,
  }, "token");
  expect(screen.getByText("Mitosis makes two cells.")).toBeInTheDocument();
  expect(screen.getByText(/^Saved/)).toHaveTextContent("Edited Oct 5, 2026");
  expect(screen.queryByRole("form", { name: "Edit notes" })).not.toBeInTheDocument();
});

it("sends only the fields that changed", async () => {
  await startEditing();
  vi.mocked(updateNotes).mockResolvedValue({ ...notes, title: "Renamed" });

  fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Renamed" } });
  fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

  expect(await screen.findByRole("heading", { name: "Renamed" })).toBeInTheDocument();
  expect(updateNotes).toHaveBeenCalledWith(1, { title: "Renamed" }, "token");
});

it("closes the editor without a request when nothing changed", async () => {
  await startEditing();

  fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

  expect(screen.getByRole("button", { name: "Edit notes" })).toBeInTheDocument();
  expect(updateNotes).not.toHaveBeenCalled();
});

it("adds and removes sections, key concepts and points", async () => {
  await startEditing();
  vi.mocked(updateNotes).mockResolvedValue(notes);

  fireEvent.click(section(1).getByRole("button", { name: "Remove point 1" }));
  fireEvent.click(section(1).getByRole("button", { name: "Add key concept" }));
  fireEvent.change(within(section(1).getByRole("group", { name: "Key concept 2" })).getByLabelText("Term"), { target: { value: "Nucleus" } });
  fireEvent.change(within(section(1).getByRole("group", { name: "Key concept 2" })).getByLabelText("Explanation"), { target: { value: "Holds DNA." } });
  fireEvent.click(screen.getByRole("button", { name: "Add section" }));
  fireEvent.change(section(2).getByLabelText("Heading"), { target: { value: "Genes" } });
  fireEvent.change(section(2).getByLabelText("Point 1"), { target: { value: "Genes are made of DNA." } });
  fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

  await screen.findByRole("button", { name: "Edit notes" });
  expect(vi.mocked(updateNotes).mock.calls[0][1]).toEqual({
    sections: [
      {
        heading: "Cell structure",
        key_concepts: [
          { term: "Membrane", explanation: "Encloses the cell." },
          { term: "Nucleus", explanation: "Holds DNA." },
        ],
        points: ["Ribosomes make proteins."],
      },
      { heading: "Genes", key_concepts: [], points: ["Genes are made of DNA."] },
    ],
  });
});

it("keeps the student in the point they were editing when the one above it is removed", async () => {
  await startEditing();

  const editing = section(1).getByLabelText("Point 2");
  editing.focus();
  fireEvent.change(editing, { target: { value: "Ribosomes build proteins." } });
  fireEvent.click(section(1).getByRole("button", { name: "Remove point 1" }));

  // The same field survives, now first, still focused and still holding the text.
  expect(section(1).getByLabelText("Point 1")).toBe(editing);
  expect(editing).toHaveFocus();
  expect(editing).toHaveValue("Ribosomes build proteins.");
  expect(section(1).queryByLabelText("Point 2")).not.toBeInTheDocument();
});

it("removes a whole section", async () => {
  await startEditing();
  fireEvent.click(screen.getByRole("button", { name: "Add section" }));

  fireEvent.click(section(1).getByRole("button", { name: "Remove section 1" }));

  expect(screen.queryByRole("group", { name: "Section 2" })).not.toBeInTheDocument();
  expect(section(1).getByLabelText("Heading")).toHaveValue("");
});

it("labels points as paragraphs for notes written in paragraphs", async () => {
  vi.mocked(getNotes).mockResolvedValue({ ...notes, options: { ...notes.options, format: "paragraphs" } });
  renderNote();
  fireEvent.click(await screen.findByRole("button", { name: "Edit notes" }));

  expect(section(1).getByLabelText("Paragraph 1")).toBeInTheDocument();
  expect(section(1).getByRole("button", { name: "Add paragraph" })).toBeInTheDocument();
});

it("shows why the server rejected an edit and keeps the draft", async () => {
  await startEditing();
  vi.mocked(updateNotes).mockRejectedValue(
    new NotesRequestError(400, "NOTES_INVALID_CONTENT", "Every outline section needs points"),
  );

  fireEvent.click(section(1).getByRole("button", { name: "Remove point 1" }));
  fireEvent.click(section(1).getByRole("button", { name: "Remove point 1" }));
  fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

  expect(await screen.findByRole("alert")).toHaveTextContent("These notes could not be saved. Every outline section needs points.");
  expect(screen.getByRole("form", { name: "Edit notes" })).toBeInTheDocument();
  expect(section(1).queryByLabelText("Point 1")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Save changes" })).toBeEnabled();
});

it("explains other save failures", async () => {
  await startEditing();
  fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Renamed" } });

  for (const [failure, message] of [
    [new NotesRequestError(400, "", "Title cannot contain control characters."), "The title could not be saved. Title cannot contain control characters."],
    [new NotesRequestError(404), "These notes no longer exist."],
    [new NotesRequestError(401), "Your session has ended."],
    [new NotesRequestError(500), "Your changes could not be saved."],
  ] as const) {
    vi.mocked(updateNotes).mockRejectedValueOnce(failure);
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(message);
  }
});

it("requires a title before sending anything", async () => {
  await startEditing();

  fireEvent.change(screen.getByLabelText("Title"), { target: { value: "   " } });
  fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

  expect(screen.getByRole("alert")).toHaveTextContent("Give these notes a title.");
  expect(updateNotes).not.toHaveBeenCalled();
});

it("cancel discards the draft", async () => {
  await startEditing();

  fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Unsaved title" } });
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

  expect(screen.getByRole("heading", { name: "Notes: Cells" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Edit notes" }));
  expect(screen.getByLabelText("Title")).toHaveValue("Notes: Cells");
  expect(updateNotes).not.toHaveBeenCalled();
});

it("deletes only after confirmation, then returns to the library", async () => {
  vi.mocked(getNotes).mockResolvedValue(notes);
  vi.mocked(deleteNotes).mockResolvedValue(undefined);
  renderNote();

  fireEvent.click(await screen.findByRole("button", { name: "Delete notes" }));
  const dialog = within(screen.getByRole("dialog", { name: "Delete Notes: Cells?" }));
  expect(deleteNotes).not.toHaveBeenCalled();

  fireEvent.click(dialog.getByRole("button", { name: "Delete" }));

  expect(await screen.findByText("Library")).toBeInTheDocument();
  expect(deleteNotes).toHaveBeenCalledWith(1, "token");
  // Replaced, so Back skips the deleted notes.
  fireEvent.click(screen.getByRole("button", { name: "Back" }));
  expect(url()).not.toBe("/notes/1");
});

it("keeps the notes when the confirmation is cancelled", async () => {
  vi.mocked(getNotes).mockResolvedValue(notes);
  renderNote();

  fireEvent.click(await screen.findByRole("button", { name: "Delete notes" }));
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancel" }));

  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Notes: Cells" })).toBeInTheDocument();
  expect(deleteNotes).not.toHaveBeenCalled();
});

it("treats notes already deleted elsewhere as deleted", async () => {
  vi.mocked(getNotes).mockResolvedValue(notes);
  vi.mocked(deleteNotes).mockRejectedValue(new NotesRequestError(404));
  renderNote();

  fireEvent.click(await screen.findByRole("button", { name: "Delete notes" }));
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete" }));

  expect(await screen.findByText("Library")).toBeInTheDocument();
});

it("shows a failed delete in the dialog and keeps the notes", async () => {
  vi.mocked(getNotes).mockResolvedValue(notes);
  vi.mocked(deleteNotes).mockRejectedValue(new NotesRequestError(500));
  renderNote();

  fireEvent.click(await screen.findByRole("button", { name: "Delete notes" }));
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete" }));

  expect(await within(screen.getByRole("dialog")).findByRole("alert")).toHaveTextContent("Could not delete these notes.");
  expect(url()).toBe("/notes/1");
  expect(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete" })).toBeEnabled();
});
