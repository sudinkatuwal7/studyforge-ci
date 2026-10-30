import "../test/dialogMock";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { listCourses } from "../api/courses";
import { listStudySessions } from "../api/studySessions";
import { listTodos, updateTodoCompletion } from "../api/todos";
import type { StudySession } from "../types/studySession";
import type { TodoItem } from "../types/todo";
import DashboardPage from "./DashboardPage";

vi.mock("../api/courses", () => ({ listCourses: vi.fn() }));
vi.mock("../api/todos", () => ({ listTodos: vi.fn(), updateTodoCompletion: vi.fn(), createTodo: vi.fn() }));
vi.mock("../api/studySessions", () => ({ listStudySessions: vi.fn() }));
vi.mock("../context/AuthContext", () => ({
  useAuth: () => ({
    accessToken: "dashboard-token",
    user: { id: 1, email: "student@example.test", first_name: "Aashish", last_name: "" },
  }),
}));
vi.mock("../components/calendar/calendarDates", async () => {
  const actual = await vi.importActual<typeof import("../components/calendar/calendarDates")>(
    "../components/calendar/calendarDates",
  );
  return {
    ...actual,
    getLocalMonth: () => ({ year: 2026, month: 10 }),
    formatCalendarDate: () => "2026-10-18",
  };
});

const datedTask: TodoItem = {
  id: 1, title: "Read chapter", course: 7, due_date: "2026-10-22",
  is_completed: false, created_at: "2026-10-18T12:00:00Z",
};
const undatedTask: TodoItem = { ...datedTask, id: 2, title: "No date", due_date: null };
const session: StudySession = {
  id: 4, title: "Review graphs", course: 8, date: "2026-10-18", time: null,
  created_at: "2026-10-18T12:00:00Z", updated_at: "2026-10-18T12:00:00Z",
};

describe("dashboard calendar", () => {
  beforeEach(() => {
    vi.mocked(listCourses).mockResolvedValue([]);
    vi.mocked(listTodos).mockResolvedValue([datedTask, undatedTask]);
    vi.mocked(listStudySessions).mockResolvedValue([session]);
  });

  it("shows a compact calendar with a dot for each dated activity", async () => {
    render(
      <MemoryRouter>
        <DashboardPage refreshKey={0} onCourseCreated={() => undefined} />
      </MemoryRouter>,
    );

    const calendar = await screen.findByRole("region", { name: "Calendar" });
    expect(within(calendar).getByRole("link", { name: "Open calendar" })).toHaveAttribute("href", "/calendar");
    expect(within(calendar).getByText("October 2026")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByRole("region", { name: "Calendar" }).querySelectorAll(".calendar-dot")).toHaveLength(2);
    });
    expect(within(calendar).queryByText("Read chapter")).not.toBeInTheDocument();
  });

  it("lists a day's tasks and sessions when that date is clicked", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <DashboardPage refreshKey={0} onCourseCreated={() => undefined} />
      </MemoryRouter>,
    );

    await user.click(await screen.findByRole("button", { name: /October 22, 2026, 1 activity/ }));
    const selected = screen.getByRole("dialog", { name: "October 22, 2026" });
    expect(within(selected).getByText("Task")).toBeInTheDocument();
    expect(within(selected).getByText("Read chapter")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /October 18, 2026, 1 activity/ }));
    const sessionDay = screen.getByRole("dialog", { name: "October 18, 2026" });
    expect(within(sessionDay).getByText("Study session")).toBeInTheDocument();
    expect(within(sessionDay).getByText("Review graphs")).toBeInTheDocument();
  });

  it("updates the upcoming count when a dated task is completed", async () => {
    const user = userEvent.setup();
    const later: TodoItem = { ...datedTask, id: 5, title: "Later assignment", due_date: "2026-10-30" };
    const quiz: TodoItem = { ...datedTask, id: 6, title: "Quiz prep", due_date: "2026-10-23" };
    const overdue: TodoItem = { ...datedTask, id: 7, title: "Old homework", due_date: "2026-10-17" };
    const completed: TodoItem = { ...datedTask, id: 8, title: "Finished outline", due_date: "2026-10-20", is_completed: true };
    vi.mocked(listTodos).mockResolvedValue([datedTask, undatedTask, later, quiz, overdue, completed]);
    vi.mocked(updateTodoCompletion).mockResolvedValue({ ...datedTask, is_completed: true });
    render(
      <MemoryRouter>
        <DashboardPage refreshKey={0} onCourseCreated={() => undefined} />
      </MemoryRouter>,
    );

    const summary = await screen.findByRole("region", { name: "Study summary" });
    await waitFor(() => expect(summary).toHaveTextContent("Upcoming4"));
    expect(screen.queryByRole("region", { name: "Upcoming" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("checkbox", { name: "Mark complete: Read chapter" }));
    await waitFor(() => expect(summary).toHaveTextContent("Upcoming3"));

    await user.click(screen.getByRole("button", { name: /October 22, 2026, 1 activity/ }));
    const selected = screen.getByRole("dialog", { name: "October 22, 2026" });
    expect(within(selected).getByText("Read chapter")).toBeInTheDocument();
    expect(selected.querySelector(".calendar-activity-completed")).not.toBeNull();
  });
});
