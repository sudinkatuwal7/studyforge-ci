import "../test/dialogMock";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { listCourses, renameCourse } from "../api/courses";
import { listStudySessions } from "../api/studySessions";
import { listTodos, updateTodoCompletion } from "../api/todos";
import type { StudySession } from "../types/studySession";
import type { TodoItem } from "../types/todo";
import DashboardPage from "./DashboardPage";

// Keep the real error classes: CourseList checks `instanceof NotLoggedInError` when loading fails.
vi.mock("../api/courses", async (original) => ({
  ...await original<typeof import("../api/courses")>(),
  listCourses: vi.fn(),
  renameCourse: vi.fn(),
}));
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

  it("lists and counts the next 7 days, and updates both when a dated task is completed", async () => {
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

    // Today is Oct 18, so the window is Oct 18–24: the session (18th), Read chapter (22nd), Quiz prep (23rd).
    // Later assignment (30th) is outside it; overdue, completed and undated tasks never count.
    const summary = await screen.findByRole("region", { name: "Study summary" });
    await waitFor(() => expect(summary).toHaveTextContent("Upcoming3"));
    const upcoming = within(screen.getByRole("region", { name: "Upcoming" }));
    const titles = () => upcoming.getAllByRole("listitem").map((item) => item.querySelector("strong")?.textContent);
    expect(titles()).toEqual(["Review graphs", "Read chapter", "Quiz prep"]);

    await user.click(screen.getByRole("checkbox", { name: "Mark complete: Read chapter" }));
    await waitFor(() => expect(summary).toHaveTextContent("Upcoming2"));
    expect(titles()).toEqual(["Review graphs", "Quiz prep"]);

    await user.click(screen.getByRole("button", { name: /October 22, 2026, 1 activity/ }));
    const selected = screen.getByRole("dialog", { name: "October 22, 2026" });
    expect(within(selected).getByText("Read chapter")).toBeInTheDocument();
    expect(selected.querySelector(".calendar-activity-completed")).not.toBeNull();
  });
});

describe("dashboard calendar empty state", () => {
  beforeEach(() => {
    vi.mocked(listCourses).mockResolvedValue([]);
  });

  it("offers to plan a study session when nothing is dated", async () => {
    vi.mocked(listTodos).mockResolvedValue([undatedTask]);
    vi.mocked(listStudySessions).mockResolvedValue([]);
    render(<MemoryRouter><DashboardPage refreshKey={0} onCourseCreated={() => undefined} /></MemoryRouter>);

    const calendar = within(screen.getByRole("region", { name: "Calendar" }));
    expect(await calendar.findByText("No dated tasks or study sessions yet.")).toBeInTheDocument();
    expect(calendar.getByRole("link", { name: "Plan a study session" })).toHaveAttribute("href", "/calendar");
  });

  it("waits for both lists before calling the calendar empty", async () => {
    vi.mocked(listTodos).mockResolvedValue([]);
    vi.mocked(listStudySessions).mockReturnValue(new Promise(() => undefined));
    render(<MemoryRouter><DashboardPage refreshKey={0} onCourseCreated={() => undefined} /></MemoryRouter>);

    const calendar = within(screen.getByRole("region", { name: "Calendar" }));
    expect(await calendar.findByText("October 2026")).toBeInTheDocument();
    expect(calendar.queryByText(/No dated tasks/)).not.toBeInTheDocument();
  });

  it("shows the error, not the empty state, when study sessions fail to load", async () => {
    vi.mocked(listTodos).mockResolvedValue([]);
    vi.mocked(listStudySessions).mockRejectedValue(new Error("offline"));
    render(<MemoryRouter><DashboardPage refreshKey={0} onCourseCreated={() => undefined} /></MemoryRouter>);

    const calendar = within(screen.getByRole("region", { name: "Calendar" }));
    expect(await calendar.findByRole("alert")).toHaveTextContent("Could not load study sessions.");
    expect(calendar.queryByText(/No dated tasks/)).not.toBeInTheDocument();
  });

  it("does not show the empty state once something is dated", async () => {
    vi.mocked(listTodos).mockResolvedValue([datedTask]);
    vi.mocked(listStudySessions).mockResolvedValue([]);
    render(<MemoryRouter><DashboardPage refreshKey={0} onCourseCreated={() => undefined} /></MemoryRouter>);

    const calendar = within(screen.getByRole("region", { name: "Calendar" }));
    await waitFor(() => expect(screen.getByRole("region", { name: "Calendar" }).querySelectorAll(".calendar-dot")).toHaveLength(1));
    expect(calendar.queryByText(/No dated tasks/)).not.toBeInTheDocument();
  });
});

describe("dashboard quick links", () => {
  const biology = { id: 7, name: "Biology", description: "", owner: 1, created_at: "2026-10-01" };
  const renderDashboard = () => render(
    <MemoryRouter>
      <DashboardPage refreshKey={0} onCourseCreated={() => undefined} />
    </MemoryRouter>,
  );

  beforeEach(() => {
    localStorage.clear();
    vi.mocked(listTodos).mockResolvedValue([]);
    vi.mocked(listStudySessions).mockResolvedValue([]);
  });

  it("links into the last opened course once the course list loads", async () => {
    localStorage.setItem("studyforge:lastCourse:1", "7");
    vi.mocked(listCourses).mockResolvedValue([biology]);
    renderDashboard();

    const quickLinks = within(screen.getByRole("region", { name: "Quick links" }));
    expect(quickLinks.getByRole("status")).toHaveTextContent("Loading quick links...");
    expect(await quickLinks.findByRole("link", { name: /Quizzes/ })).toHaveAttribute("href", "/courses/7/quizzes");
    expect(quickLinks.getByRole("link", { name: /Ask Pandu/ })).toHaveAttribute("href", "/courses/7/materials?pandu=open");
  });

  it("shows a renamed course in its card and saved quick links", async () => {
    const user = userEvent.setup();
    localStorage.setItem("studyforge:lastCourse:1", "7");
    vi.mocked(listCourses).mockResolvedValue([biology]);
    vi.mocked(renameCourse).mockResolvedValue({ ...biology, name: "Cell Biology" });
    renderDashboard();

    const quickLinks = within(screen.getByRole("region", { name: "Quick links" }));
    expect(await quickLinks.findByText("Biology")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Rename Biology" }));
    await user.clear(screen.getByLabelText("New name for Biology"));
    await user.type(screen.getByLabelText("New name for Biology"), "Cell Biology");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByRole("link", { name: /Cell Biology/ })).toBeInTheDocument();
    expect(await quickLinks.findByText("Cell Biology")).toBeInTheDocument();
    expect(localStorage.getItem("studyforge:lastCourse:1")).toBe("7");
  });

  it("sends all create-course shortcuts to the dashboard's real course form", async () => {
    const user = userEvent.setup();
    vi.mocked(listCourses).mockResolvedValue([]);
    renderDashboard();
    const quickLinks = within(screen.getByRole("region", { name: "Quick links" }));
    const field = screen.getByLabelText("Course name");

    await user.click(await quickLinks.findByRole("button", { name: "Create your first course" }));
    expect(field).toHaveFocus();

    field.blur();
    await user.click(screen.getByRole("button", { name: "New course" }));
    expect(field).toHaveFocus();

    field.blur();
    const tasks = within(screen.getByRole("region", { name: "My To-Do List" }));
    await user.click(await tasks.findByRole("button", { name: "Create a course" }));
    expect(field).toHaveFocus();
  });

  it("shows an error in the quick links when the course list fails", async () => {
    vi.mocked(listCourses).mockRejectedValue(new Error("Server unavailable"));
    renderDashboard();

    const quickLinks = within(screen.getByRole("region", { name: "Quick links" }));
    expect(await quickLinks.findByRole("alert")).toHaveTextContent("Could not load your courses");
    expect(quickLinks.queryByRole("status")).not.toBeInTheDocument();
  });
});
