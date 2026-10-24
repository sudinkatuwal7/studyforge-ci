import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../api/client";
import { listCourses } from "../../api/courses";
import { createTodo, listTodos, updateTodoCompletion } from "../../api/todos";
import { useAuth } from "../../context/AuthContext";
import type { Course } from "../../types/course";
import type { TodoItem } from "../../types/todo";
import TodoPanel from "./TodoPanel";

vi.mock("../../api/courses", () => ({ listCourses: vi.fn() }));
vi.mock("../../api/todos", () => ({
  listTodos: vi.fn(),
  createTodo: vi.fn(),
  updateTodoCompletion: vi.fn(),
}));
vi.mock("../../context/AuthContext", () => ({ useAuth: vi.fn() }));

const course: Course = {
  id: 7, name: "Algorithms", description: "", owner: 1, created_at: "2026-10-01T00:00:00Z",
};
const tasks: TodoItem[] = [
  { id: 1, title: "Done soon", course: 7, due_date: "2026-10-18", is_completed: true, created_at: "2026-10-01T00:00:00Z" },
  { id: 2, title: "No date", course: 7, due_date: null, is_completed: false, created_at: "2026-10-02T00:00:00Z" },
  { id: 3, title: "Later", course: 7, due_date: "2026-11-01", is_completed: false, created_at: "2026-10-03T00:00:00Z" },
  { id: 4, title: "Soon", course: 7, due_date: "2026-10-20", is_completed: false, created_at: "2026-10-04T00:00:00Z" },
];

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(useAuth).mockReturnValue({
    accessToken: "test-access-token",
    user: { id: 1, email: "student@example.test", first_name: "", last_name: "" },
    isRestoring: false,
    isSigningOut: false,
    signedOutReason: null,
    saveLogin: vi.fn(),
    signOut: vi.fn(),
    authenticatedFetch: vi.fn(async () => new Response()),
  });
  vi.mocked(listCourses).mockResolvedValue([course]);
  vi.mocked(listTodos).mockResolvedValue(tasks);
});

describe("dashboard task list", () => {
  it("shows a loading state, then incomplete tasks before dated and undated work", async () => {
    render(<TodoPanel refreshKey={0} />);
    expect(screen.getByText("Loading tasks...")).toBeInTheDocument();

    const items = await screen.findAllByRole("listitem");
    expect(items.map((item) => item.textContent)).toEqual([
      expect.stringContaining("Soon"),
      expect.stringContaining("Later"),
      expect.stringContaining("No date"),
      expect.stringContaining("Done soon"),
    ]);
    expect(items[0]).toHaveTextContent("Algorithms");
    expect(items[0]).toHaveTextContent("Oct 20, 2026");
    expect(items[2]).toHaveTextContent("No due date");
    expect(screen.getByRole("checkbox", { name: "Mark complete: Soon" })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Mark incomplete: Done soon" })).toBeChecked();
  });

  it("shows an empty state when there are no tasks", async () => {
    vi.mocked(listTodos).mockResolvedValue([]);
    render(<TodoPanel refreshKey={0} />);
    expect(await screen.findByText("You have no tasks yet.")).toBeInTheDocument();
  });

  it("shows an error when tasks cannot be loaded", async () => {
    vi.mocked(listTodos).mockRejectedValue(new ApiError(500));
    render(<TodoPanel refreshKey={0} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Request failed with status 500");
    expect(screen.queryByRole("listitem")).not.toBeInTheDocument();
  });

  it("saves a completion change and moves the task after incomplete work", async () => {
    const user = userEvent.setup();
    vi.mocked(updateTodoCompletion).mockResolvedValue({ ...tasks[3], is_completed: true });
    render(<TodoPanel refreshKey={0} />);
    await user.click(await screen.findByRole("checkbox", { name: "Mark complete: Soon" }));

    expect(updateTodoCompletion).toHaveBeenCalledWith("test-access-token", 4, true);
    await waitFor(() => {
      const items = screen.getAllByRole("listitem");
      expect(items.map((item) => item.textContent?.includes("Soon"))).toEqual([false, false, false, true]);
    });
    expect(screen.getByRole("checkbox", { name: "Mark incomplete: Soon" })).toBeChecked();
  });

  it("keeps the previous completion state when the update fails", async () => {
    const user = userEvent.setup();
    vi.mocked(updateTodoCompletion).mockRejectedValue(new ApiError(500));
    render(<TodoPanel refreshKey={0} />);
    await user.click(await screen.findByRole("checkbox", { name: "Mark complete: Soon" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Could not update the task. Please try again.");
    expect(screen.getByRole("checkbox", { name: "Mark complete: Soon" })).not.toBeChecked();
    expect(screen.getAllByRole("listitem")[0]).toHaveTextContent("Soon");
  });

  it("places a newly created task using the same order", async () => {
    const user = userEvent.setup();
    vi.mocked(listTodos).mockResolvedValue([]);
    const created: TodoItem = {
      id: 9, title: "Read chapter", course: 7, due_date: "2026-10-19",
      is_completed: false, created_at: "2026-10-17T00:00:00Z",
    };
    vi.mocked(createTodo).mockResolvedValue(created);
    render(<TodoPanel refreshKey={0} />);
    await screen.findByText("You have no tasks yet.");

    await user.type(screen.getByLabelText("Task title (required)"), "Read chapter");
    await user.selectOptions(screen.getByLabelText("Course (required)"), "7");
    await user.click(screen.getByRole("button", { name: "Add task" }));

    expect(await screen.findByRole("listitem")).toHaveTextContent("Read chapter");
    expect(screen.queryByText("You have no tasks yet.")).not.toBeInTheDocument();
  });
});
