import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import { listCourses } from "../api/courses";
import { listTodos } from "../api/todos";
import type { TodoItem } from "../types/todo";
import TasksPage from "./TasksPage";
import CoursesPage from "./CoursesPage";

vi.mock("../api/courses", async (original) => ({
  ...await original<typeof import("../api/courses")>(),
  listCourses: vi.fn(),
}));
vi.mock("../api/todos", () => ({ listTodos: vi.fn(), createTodo: vi.fn(), updateTodoCompletion: vi.fn() }));
vi.mock("../context/AuthContext", () => ({ useAuth: () => ({ user: { id: 1 }, accessToken: "token" }) }));

afterEach(() => vi.clearAllMocks());

const biology = { id: 7, name: "Biology", description: "", owner: 1, created_at: "2026-10-01" };
const history = { id: 8, name: "History", description: "", owner: 1, created_at: "2026-10-01" };
const task = (id: number, title: string, course: number): TodoItem => ({
  id, title, course, due_date: null, is_completed: false, created_at: "2026-10-18T12:00:00Z",
});

it("shows every task across the student's courses, with the form to add one", async () => {
  vi.mocked(listCourses).mockResolvedValue([biology, history]);
  vi.mocked(listTodos).mockResolvedValue([task(1, "Read chapter 3", 7), task(2, "Essay outline", 8)]);
  render(<MemoryRouter><TasksPage refreshKey={0} /></MemoryRouter>);

  const panel = within(screen.getByRole("region", { name: "My To-Do List" }));
  expect(await panel.findByText("Read chapter 3")).toBeInTheDocument();
  expect(panel.getByText("Essay outline")).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Add a task" })).toBeInTheDocument();
});

it("shows the loading error instead of an empty list when tasks fail to load", async () => {
  vi.mocked(listCourses).mockResolvedValue([biology]);
  vi.mocked(listTodos).mockRejectedValue(new Error("Could not load tasks."));
  render(<MemoryRouter><TasksPage refreshKey={0} /></MemoryRouter>);

  expect(await screen.findByRole("alert")).toHaveTextContent("Could not load tasks.");
  expect(screen.queryByText(/You have no tasks yet./)).not.toBeInTheDocument();
});

it("with no tasks, Add your first task puts the cursor in the task title", async () => {
  vi.mocked(listCourses).mockResolvedValue([biology]);
  vi.mocked(listTodos).mockResolvedValue([]);
  render(<MemoryRouter><TasksPage refreshKey={0} /></MemoryRouter>);

  fireEvent.click(await screen.findByRole("button", { name: "Add your first task" }));
  expect(screen.getByLabelText("Task title (required)")).toHaveFocus();
});

it("with no courses, asks for a course first instead of a task", async () => {
  vi.mocked(listCourses).mockResolvedValue([]);
  vi.mocked(listTodos).mockResolvedValue([]);
  render(<MemoryRouter><TasksPage refreshKey={0} /></MemoryRouter>);

  expect(await screen.findByText(/Tasks belong to a course, so create a course first/)).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Create a course" })).toHaveAttribute("href", "/courses");
  expect(screen.queryByRole("button", { name: "Add your first task" })).not.toBeInTheDocument();
});

it("takes the create-course link to the form and focuses its name field", async () => {
  vi.mocked(listCourses).mockResolvedValue([]);
  vi.mocked(listTodos).mockResolvedValue([]);
  render(<MemoryRouter initialEntries={["/tasks"]}><Routes>
    <Route path="/tasks" element={<TasksPage refreshKey={0} />} />
    <Route path="/courses" element={<CoursesPage refreshKey={0} onCourseCreated={() => undefined} />} />
  </Routes></MemoryRouter>);

  fireEvent.click(await screen.findByRole("link", { name: "Create a course" }));
  expect(screen.getByLabelText("Course name")).toHaveFocus();
});
