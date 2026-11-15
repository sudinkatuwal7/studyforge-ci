import { useState } from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import { createCourse, listCourses } from "../api/courses";
import type { Course } from "../types/course";
import CoursesPage from "./CoursesPage";

vi.mock("../api/courses", async (original) => ({
  ...await original<typeof import("../api/courses")>(),
  listCourses: vi.fn(),
  createCourse: vi.fn(),
}));
vi.mock("../context/AuthContext", () => ({ useAuth: () => ({ user: { id: 1 }, accessToken: "token" }) }));

afterEach(() => vi.clearAllMocks());

const biology: Course = { id: 7, name: "Biology", description: "Cells", owner: 1, created_at: "2026-10-01" };
const history: Course = { id: 8, name: "History", description: "", owner: 1, created_at: "2026-10-02" };

// Plays App's part: creating a course bumps the refresh key so the list reloads.
function Harness() {
  const [version, setVersion] = useState(0);
  return <CoursesPage refreshKey={version} onCourseCreated={() => setVersion((v) => v + 1)} />;
}

it("lists the student's courses, each opening its course page", async () => {
  vi.mocked(listCourses).mockResolvedValue([biology, history]);
  render(<MemoryRouter><Harness /></MemoryRouter>);

  expect(await screen.findByRole("link", { name: /Biology/ })).toHaveAttribute("href", "/courses/7");
  expect(screen.getByRole("link", { name: /History/ })).toHaveAttribute("href", "/courses/8");
});

it("leaves the page title to the top bar: no heading of its own above the list", async () => {
  vi.mocked(listCourses).mockResolvedValue([biology]);
  render(<MemoryRouter><Harness /></MemoryRouter>);
  await screen.findByRole("link", { name: /Biology/ });

  expect(screen.queryAllByRole("heading", { level: 1 })).toHaveLength(0);
  expect(screen.queryByRole("heading", { name: "My Courses" })).not.toBeInTheDocument();
  // The form keeps its own section heading.
  expect(screen.getByRole("heading", { level: 2, name: "Create a course" })).toBeInTheDocument();
});

it("+ New puts the cursor in the course name field", async () => {
  const user = userEvent.setup();
  vi.mocked(listCourses).mockResolvedValue([biology]);
  render(<MemoryRouter><Harness /></MemoryRouter>);
  await screen.findByRole("link", { name: /Biology/ });

  const shortcut = screen.getByRole("button", { name: "New course" });
  expect(shortcut).toHaveTextContent("+ New");
  await user.click(shortcut);
  expect(screen.getByLabelText("Course name")).toHaveFocus();
});

it("adds a newly created course to the list", async () => {
  const user = userEvent.setup();
  vi.mocked(listCourses).mockResolvedValueOnce([biology]).mockResolvedValueOnce([history, biology]);
  vi.mocked(createCourse).mockResolvedValue(history);
  render(<MemoryRouter><Harness /></MemoryRouter>);
  await screen.findByRole("link", { name: /Biology/ });

  await user.type(screen.getByLabelText("Course name"), "History");
  await user.click(screen.getByRole("button", { name: "Create" }));

  expect(await screen.findByRole("link", { name: /History/ })).toHaveAttribute("href", "/courses/8");
  await waitFor(() => expect(listCourses).toHaveBeenCalledTimes(2));
});

it("still offers the create form when the student has no courses", async () => {
  vi.mocked(listCourses).mockResolvedValue([]);
  const { container } = render(<MemoryRouter><Harness /></MemoryRouter>);

  expect(await screen.findByText(/You have no courses yet./)).toBeInTheDocument();
  expect(screen.getByLabelText("Course name")).toHaveAttribute("id", "course-name");
  expect(within(container).getByRole("button", { name: "Create" })).toBeInTheDocument();
});

it("its empty state puts the cursor in the course name field", async () => {
  const user = userEvent.setup();
  vi.mocked(listCourses).mockResolvedValue([]);
  render(<MemoryRouter><Harness /></MemoryRouter>);

  await user.click(await screen.findByRole("button", { name: "Create a course" }));
  expect(screen.getByLabelText("Course name")).toHaveFocus();
});

it("shows loading, then the error, but never the empty state when courses fail to load", async () => {
  vi.mocked(listCourses).mockRejectedValue(new Error("Server unavailable"));
  render(<MemoryRouter><Harness /></MemoryRouter>);

  expect(screen.getByRole("status")).toHaveTextContent("Loading courses...");
  expect(await screen.findByRole("alert")).toHaveTextContent("Server unavailable");
  expect(screen.queryByText(/You have no courses yet/)).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Create a course" })).not.toBeInTheDocument();
});
