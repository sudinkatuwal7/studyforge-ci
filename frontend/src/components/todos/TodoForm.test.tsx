import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../api/client";
import { createTodo } from "../../api/todos";
import { useAuth } from "../../context/AuthContext";
import type { Course } from "../../types/course";
import type { TodoItem } from "../../types/todo";
import TodoForm from "./TodoForm";

vi.mock("../../api/todos", () => ({ createTodo: vi.fn() }));
vi.mock("../../context/AuthContext", () => ({ useAuth: vi.fn() }));

const course: Course = {
  id: 7, name: "Algorithms", description: "", owner: 1, created_at: "2026-10-17T00:00:00Z",
};
const savedTodo: TodoItem = {
  id: 12, title: "Finish homework", course: 7, due_date: null,
  is_completed: false, created_at: "2026-10-17T00:30:00Z",
};

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
  vi.mocked(createTodo).mockResolvedValue(savedTodo);
});

function renderForm(courses = [course]) {
  const onCreated = vi.fn();
  return { ...render(<TodoForm courses={courses} onCreated={onCreated} />), onCreated };
}

async function fillRequiredFields(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("Task title (required)"), "  Finish homework  ");
  await user.selectOptions(screen.getByLabelText("Course (required)"), "7");
}

describe("To-Do creation form", () => {
  it.each(["", "   "])("rejects an empty or whitespace-only title: %j", async (title) => {
    const user = userEvent.setup();
    const { onCreated } = renderForm();
    if (title) await user.type(screen.getByLabelText("Task title (required)"), title);
    await user.selectOptions(screen.getByLabelText("Course (required)"), "7");
    await user.click(screen.getByRole("button", { name: "Add task" }));

    expect(screen.getByRole("alert")).toHaveTextContent("Enter a task title.");
    expect(screen.getByLabelText("Task title (required)")).toHaveAttribute("aria-invalid", "true");
    expect(createTodo).not.toHaveBeenCalled();
    expect(onCreated).not.toHaveBeenCalled();
  });

  it("requires a course selection", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.type(screen.getByLabelText("Task title (required)"), "Study");
    await user.click(screen.getByRole("button", { name: "Add task" }));

    expect(screen.getByRole("alert")).toHaveTextContent("Choose a course.");
    expect(createTodo).not.toHaveBeenCalled();
  });

  it.each(["", "2026-10-20"])("creates a task with due date %j and resets after success", async (dueDate) => {
    const user = userEvent.setup();
    const returnedTodo = { ...savedTodo, due_date: dueDate || null };
    vi.mocked(createTodo).mockResolvedValue(returnedTodo);
    const { onCreated } = renderForm();
    await fillRequiredFields(user);
    if (dueDate) fireEvent.change(screen.getByLabelText("Due date (optional)"), { target: { value: dueDate } });
    await user.click(screen.getByRole("button", { name: "Add task" }));

    expect(createTodo).toHaveBeenCalledExactlyOnceWith("test-access-token", expect.objectContaining({
      title: "Finish homework", course: 7, due_date: dueDate || null,
    }));
    expect(vi.mocked(createTodo).mock.calls[0][1].creation_key).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    expect(onCreated).toHaveBeenCalledExactlyOnceWith(returnedTodo);
    expect(screen.getByRole("status")).toHaveTextContent("Task added.");
    expect(screen.getByLabelText("Task title (required)")).toHaveValue("");
    expect(screen.getByLabelText("Course (required)")).toHaveValue("");
    expect(screen.getByLabelText("Due date (optional)")).toHaveValue("");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    await user.type(screen.getByLabelText("Task title (required)"), "Next task");
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
  });

  it("disables the form without courses and enables it when a course becomes available", () => {
    const { rerender, onCreated } = renderForm([]);
    expect(screen.getByText("Create a course first to add tasks.")).toBeInTheDocument();
    expect(screen.getByLabelText("Task title (required)")).toBeDisabled();
    expect(screen.getByLabelText("Course (required)")).toBeDisabled();
    expect(screen.getByLabelText("Due date (optional)")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Add task" })).toBeDisabled();

    rerender(<TodoForm courses={[course]} onCreated={onCreated} />);
    expect(screen.getByRole("button", { name: "Add task" })).toBeEnabled();
    expect(screen.getByRole("option", { name: "Algorithms" })).toBeInTheDocument();
  });

  it("requires login before allowing creation", () => {
    vi.mocked(useAuth).mockReturnValue({ ...useAuth(), accessToken: null, user: null });
    renderForm();
    expect(screen.getByText("Log in to add tasks.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add task" })).toBeDisabled();
    expect(createTodo).not.toHaveBeenCalled();
  });

  it("locks inputs and prevents duplicate requests while saving", async () => {
    let finish!: (todo: TodoItem) => void;
    vi.mocked(createTodo).mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    const user = userEvent.setup();
    const { onCreated } = renderForm();
    await fillRequiredFields(user);
    await user.dblClick(screen.getByRole("button", { name: "Add task" }));
    // Even a repeated form event cannot create a duplicate while the request is pending.
    fireEvent.submit(screen.getByRole("form", { name: "Add a task" }));

    expect(createTodo).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Adding task..." })).toBeDisabled();
    expect(screen.getByLabelText("Task title (required)")).toBeDisabled();
    expect(screen.getByLabelText("Course (required)")).toBeDisabled();
    expect(screen.getByLabelText("Due date (optional)")).toBeDisabled();
    expect(onCreated).not.toHaveBeenCalled();

    await act(async () => { finish(savedTodo); });
    expect(screen.getByRole("button", { name: "Add task" })).toBeEnabled();
    expect(onCreated).toHaveBeenCalledExactlyOnceWith(savedTodo);
  });

  it("preserves all input after failure and allows a successful retry", async () => {
    vi.mocked(createTodo).mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const user = userEvent.setup();
    const { onCreated } = renderForm();
    await fillRequiredFields(user);
    fireEvent.change(screen.getByLabelText("Due date (optional)"), { target: { value: "2026-10-20" } });
    await user.click(screen.getByRole("button", { name: "Add task" }));

    expect(screen.getByRole("alert")).toHaveTextContent("Could not save the task. Please try again.");
    expect(screen.getByLabelText("Task title (required)")).toHaveValue("  Finish homework  ");
    expect(screen.getByLabelText("Course (required)")).toHaveValue("7");
    expect(screen.getByLabelText("Due date (optional)")).toHaveValue("2026-10-20");
    expect(screen.getByRole("button", { name: "Add task" })).toBeEnabled();
    expect(onCreated).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Add task" }));
    expect(createTodo).toHaveBeenCalledTimes(2);
    expect(onCreated).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Task added.");
  });

  it.each([
    { status: 401, message: "Your session has expired. Please sign in again." },
    { status: 400, message: "Could not save the task. Check the title, course, and date, then try again." },
  ])("explains HTTP $status errors", async ({ status, message }) => {
    vi.mocked(createTodo).mockRejectedValue(new ApiError(status));
    const user = userEvent.setup();
    const { onCreated } = renderForm();
    await fillRequiredFields(user);
    await user.click(screen.getByRole("button", { name: "Add task" }));
    expect(screen.getByRole("alert")).toHaveTextContent(message);
    expect(onCreated).not.toHaveBeenCalled();
  });

  it("rejects a selected course that disappeared from the available courses", async () => {
    const user = userEvent.setup();
    const { rerender, onCreated } = renderForm();
    await fillRequiredFields(user);
    rerender(<TodoForm courses={[{ ...course, id: 8, name: "Databases" }]} onCreated={onCreated} />);
    expect(screen.getByLabelText("Course (required)")).toHaveValue("");
    await user.click(screen.getByRole("button", { name: "Add task" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Choose a course.");
    expect(createTodo).not.toHaveBeenCalled();
  });

  it("rejects dates beyond the backend's four-digit year range", async () => {
    const user = userEvent.setup();
    renderForm();
    await fillRequiredFields(user);
    fireEvent.change(screen.getByLabelText("Due date (optional)"), { target: { value: "10000-01-01" } });
    await user.click(screen.getByRole("button", { name: "Add task" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Enter a valid date");
    expect(createTodo).not.toHaveBeenCalled();
  });
});
