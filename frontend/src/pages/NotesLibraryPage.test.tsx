import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import { ApiError } from "../api/client";
import { listCourses } from "../api/courses";
import { listNotes, NotesRequestError } from "../api/notes";
import type { CourseNotesSummary } from "../types/notes";
import NotesLibraryPage from "./NotesLibraryPage";

vi.mock("../api/courses", async (original) => ({
  ...await original<typeof import("../api/courses")>(),
  listCourses: vi.fn(),
}));
vi.mock("../api/notes", async (original) => ({
  ...await original<typeof import("../api/notes")>(),
  listNotes: vi.fn(),
}));
vi.mock("../context/AuthContext", () => ({ useAuth: () => ({ user: { id: 1 }, accessToken: "token" }) }));

afterEach(() => vi.clearAllMocks());

const biology = { id: 7, name: "Biology", description: "", owner: 1, created_at: "2026-10-01" };
const history = { id: 8, name: "History", description: "", owner: 1, created_at: "2026-10-01" };
const summary = (id: number, title: string, course: typeof biology, createdAt = "2026-10-01T12:00:00Z"): CourseNotesSummary => ({
  id, title, course: course.id, course_name: course.name,
  options: { note_type: "outline", detail_level: "standard", format: "bullets" },
  created_at: createdAt, updated_at: createdAt,
});
const cells = summary(1, "Notes: Cells", biology, "2026-10-02T12:00:00Z");
const treaties = summary(2, "Notes: Treaties", history);

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

// Shows the current URL so tests can check what the filter wrote to it.
function Location() {
  const { pathname, search } = useLocation();
  return <output aria-label="Current URL">{pathname + search}</output>;
}

function BackButton() {
  const navigate = useNavigate();
  return <button type="button" onClick={() => navigate(-1)}>Back</button>;
}

function renderLibrary(path = "/notes") {
  return render(<MemoryRouter initialEntries={[path]}>
    <Routes>
      <Route path="/notes" element={<NotesLibraryPage />} />
      <Route path="/notes/:notesId" element={<p>Note page</p>} />
    </Routes>
    <Location />
    <BackButton />
  </MemoryRouter>);
}

const filter = () => screen.getByLabelText("Course");
const url = () => screen.getByLabelText("Current URL").textContent;

it("lists every saved note with its title, course and date, newest first", async () => {
  vi.mocked(listCourses).mockResolvedValue([biology, history]);
  vi.mocked(listNotes).mockResolvedValue([cells, treaties]);
  renderLibrary();

  const items = await screen.findAllByRole("listitem");
  expect(items).toHaveLength(2);
  expect(within(items[0]).getByRole("link", { name: "Notes: Cells" })).toHaveAttribute("href", "/notes/1");
  expect(items[0]).toHaveTextContent("Biology");
  expect(items[0]).toHaveTextContent("Outline");
  expect(within(items[0]).getByText(/2026/)).toHaveAttribute("datetime", "2026-10-02T12:00:00Z");
  expect(items[1]).toHaveTextContent("Notes: Treaties");
  expect(items[1]).toHaveTextContent("History");
  expect(listNotes).toHaveBeenCalledWith("token", undefined, expect.any(AbortSignal));
});

it("opens a note from the library", async () => {
  vi.mocked(listCourses).mockResolvedValue([biology]);
  vi.mocked(listNotes).mockResolvedValue([cells]);
  renderLibrary();

  fireEvent.click(await screen.findByRole("link", { name: "Notes: Cells" }));
  expect(screen.getByText("Note page")).toBeInTheDocument();
  expect(url()).toBe("/notes/1");
});

it("filters by course, keeps the filter in the URL, and Back restores all courses", async () => {
  vi.mocked(listCourses).mockResolvedValue([biology, history]);
  vi.mocked(listNotes).mockImplementation(async (_token, courseId) => (
    courseId === undefined ? [cells, treaties] : [cells, treaties].filter((item) => item.course === courseId)
  ));
  renderLibrary();
  await screen.findByRole("link", { name: "Notes: Treaties" });

  fireEvent.change(filter(), { target: { value: "7" } });

  expect(await screen.findByRole("link", { name: "Notes: Cells" })).toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "Notes: Treaties" })).not.toBeInTheDocument();
  expect(listNotes).toHaveBeenLastCalledWith("token", 7, expect.any(AbortSignal));
  expect(url()).toBe("/notes?course=7");
  expect(filter()).toHaveValue("7");

  fireEvent.click(screen.getByRole("button", { name: "Back" }));
  expect(await screen.findByRole("link", { name: "Notes: Treaties" })).toBeInTheDocument();
  expect(url()).toBe("/notes");
  expect(filter()).toHaveValue("");
});

it("opens with the course filter from the URL, as after a refresh", async () => {
  vi.mocked(listCourses).mockResolvedValue([biology, history]);
  vi.mocked(listNotes).mockResolvedValue([cells]);
  renderLibrary("/notes?course=7");

  expect(await screen.findByRole("link", { name: "Notes: Cells" })).toBeInTheDocument();
  expect(listNotes).toHaveBeenCalledWith("token", 7, expect.any(AbortSignal));
  expect(listNotes).not.toHaveBeenCalledWith("token", undefined, expect.anything());
  expect(filter()).toHaveValue("7");
});

it("drops a filter that is not one of the student's courses and shows every note", async () => {
  vi.mocked(listCourses).mockResolvedValue([biology]);
  vi.mocked(listNotes).mockImplementation(async (_token, courseId) => (courseId === undefined ? [cells] : []));

  for (const path of ["/notes?course=99", "/notes?course=abc", "/notes?course=0"]) {
    const { unmount } = renderLibrary(path);
    expect(await screen.findByRole("link", { name: "Notes: Cells" })).toBeInTheDocument();
    expect(url()).toBe("/notes");
    expect(filter()).toHaveValue("");
    unmount();
  }
  // A malformed id is never sent to the server.
  for (const [, courseId] of vi.mocked(listNotes).mock.calls) expect([undefined, 99]).toContain(courseId);
});

it("does not let a slower, older response replace the chosen course's notes", async () => {
  const all = deferred<CourseNotesSummary[]>();
  vi.mocked(listCourses).mockResolvedValue([biology, history]);
  vi.mocked(listNotes).mockImplementation((_token, courseId) => (
    courseId === undefined ? all.promise : Promise.resolve([cells])
  ));
  renderLibrary();
  await screen.findByRole("option", { name: "Biology" });

  fireEvent.change(filter(), { target: { value: "7" } });
  expect(await screen.findByRole("link", { name: "Notes: Cells" })).toBeInTheDocument();
  await act(async () => all.resolve([cells, treaties]));

  expect(screen.queryByRole("link", { name: "Notes: Treaties" })).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Notes: Cells" })).toBeInTheDocument();
  expect(screen.queryByText("Loading notes…")).not.toBeInTheDocument();
});

it("with no saved notes, points the student to their courses", async () => {
  vi.mocked(listCourses).mockResolvedValue([biology]);
  vi.mocked(listNotes).mockResolvedValue([]);
  renderLibrary();

  expect(await screen.findByText(/No saved notes yet/)).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Go to my courses" })).toHaveAttribute("href", "/courses");
  expect(screen.queryByRole("list")).not.toBeInTheDocument();
});

it("with no notes for the chosen course, links to that course's notes tab", async () => {
  vi.mocked(listCourses).mockResolvedValue([biology, history]);
  vi.mocked(listNotes).mockResolvedValue([]);
  renderLibrary("/notes?course=8");

  expect(await screen.findByText("No notes for History yet.")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Generate notes for this course" })).toHaveAttribute("href", "/courses/8/notes");
});

it("shows a loading error instead of an empty library", async () => {
  vi.mocked(listCourses).mockResolvedValue([biology]);
  vi.mocked(listNotes).mockRejectedValue(new NotesRequestError(500));
  renderLibrary();

  expect(await screen.findByRole("alert")).toHaveTextContent("Could not load your notes.");
  expect(screen.queryByText(/No saved notes yet/)).not.toBeInTheDocument();
});

it("asks the student to sign in again when the session has expired", async () => {
  vi.mocked(listCourses).mockResolvedValue([biology]);
  vi.mocked(listNotes).mockRejectedValue(new NotesRequestError(401));
  renderLibrary();

  expect(await screen.findByRole("alert")).toHaveTextContent("Your session has expired.");
});

it("still lists notes when the courses cannot be loaded, without the filter", async () => {
  vi.mocked(listCourses).mockRejectedValue(new ApiError(500));
  vi.mocked(listNotes).mockResolvedValue([cells]);
  renderLibrary();

  expect(await screen.findByRole("link", { name: "Notes: Cells" })).toBeInTheDocument();
  expect(screen.getByRole("alert")).toHaveTextContent("The course filter is unavailable.");
  expect(filter()).toBeDisabled();
});
