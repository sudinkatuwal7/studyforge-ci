import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RefreshRejectedError } from "../api/auth";
import { deleteStudySession } from "../api/studySessions";
import type { Course } from "../types/course";
import type { StudySession } from "../types/studySession";
import type { TodoItem } from "../types/todo";
import CalendarPage from "./CalendarPage";

vi.mock("../api/studySessions", () => ({
  deleteStudySession: vi.fn(),
  createStudySession: vi.fn(),
  updateStudySession: vi.fn(),
}));

const { authenticatedFetch } = vi.hoisted(() => ({ authenticatedFetch: vi.fn() }));

vi.mock("../context/AuthContext", () => ({
  useAuth: () => ({ accessToken: "calendar-token", authenticatedFetch }),
}));
vi.mock("../components/calendar/calendarDates", async () => {
  const actual = await vi.importActual<typeof import("../components/calendar/calendarDates")>(
    "../components/calendar/calendarDates",
  );
  return { ...actual, getLocalMonth: () => ({ year: 2026, month: 10 }) };
});

const datedTask: TodoItem = {
  id: 1, title: "Read chapter", course: 7, due_date: "2026-10-22",
  is_completed: false, created_at: "2026-10-18T12:00:00Z",
};
const undatedTask: TodoItem = { ...datedTask, id: 2, title: "No date", due_date: null };
const completedTask: TodoItem = { ...datedTask, id: 3, title: "Finished outline", is_completed: true };
const session: StudySession = {
  id: 4, title: "Review graphs", course: 8, date: "2026-10-22", time: "09:30:00",
  created_at: "2026-10-18T12:00:00Z", updated_at: "2026-10-18T12:00:00Z",
};
const courses: Course[] = [
  { id: 7, name: "English", description: "", owner: 1, created_at: "2026-10-18T12:00:00Z" },
  { id: 8, name: "Graphs", description: "", owner: 1, created_at: "2026-10-18T12:00:00Z" },
];

describe("CalendarPage", () => {
  beforeEach(() => {
    authenticatedFetch.mockImplementation(async (path: string) => {
      if (path === "/todos/") return Response.json([datedTask, undatedTask, completedTask]);
      if (path === "/study-sessions/") return Response.json([session]);
      if (path === "/courses/") return Response.json(courses);
      throw new Error(`Unexpected path ${path}`);
    });
  });

  it("shows dated tasks and study sessions, including completed tasks", async () => {
    render(<CalendarPage />, { wrapper: MemoryRouter });

    expect(await screen.findByRole("heading", { name: "Calendar" })).toBeInTheDocument();
    expect(screen.getByText("October 2026")).toBeInTheDocument();
    expect(screen.getByText("Read chapter")).toBeInTheDocument();
    expect(screen.getByText("Finished outline")).toBeInTheDocument();
    expect(screen.getByText("Review graphs")).toBeInTheDocument();
    expect(screen.getAllByText("Task")).toHaveLength(2);
    expect(screen.getByText("Study session")).toBeInTheDocument();
    expect(screen.queryByText("No date")).not.toBeInTheDocument();
    expect(authenticatedFetch).toHaveBeenCalledWith("/todos/");
    expect(authenticatedFetch).toHaveBeenCalledWith("/study-sessions/");
  });

  it("opens the edit form and removes a study session after delete is confirmed", async () => {
    const user = userEvent.setup();
    vi.mocked(deleteStudySession).mockResolvedValue(undefined);
    render(<CalendarPage />, { wrapper: MemoryRouter });
    await screen.findByRole("heading", { name: "Calendar" });

    await user.click(screen.getByRole("button", { name: /Thursday, October 22, 2026, 3 activities/ }));
    await user.click(screen.getByRole("button", { name: "Edit Review graphs" }));
    expect(screen.getByRole("heading", { name: "Edit study session" })).toBeInTheDocument();
    expect(screen.getByLabelText("Title (required)")).toHaveValue("Review graphs");

    await user.click(screen.getByRole("button", { name: "Delete Review graphs" }));
    await user.click(screen.getByRole("button", { name: "Confirm delete Review graphs" }));
    await waitFor(() => expect(deleteStudySession).toHaveBeenCalledWith("calendar-token", 4));
    expect(screen.queryByText("Review graphs")).not.toBeInTheDocument();
  });

  it("keeps the loading screen when the session is rejected so login can replace it", async () => {
    authenticatedFetch.mockRejectedValue(new RefreshRejectedError("Session expired. Please sign in again."));
    render(<CalendarPage />, { wrapper: MemoryRouter });

    await waitFor(() => expect(authenticatedFetch).toHaveBeenCalled());
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByText("Loading calendar...")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows an empty message when there are no dated tasks or study sessions", async () => {
    authenticatedFetch.mockImplementation(async (path: string) => {
      if (path === "/todos/") return Response.json([undatedTask]);
      if (path === "/study-sessions/") return Response.json([]);
      if (path === "/courses/") return Response.json(courses);
      throw new Error(`Unexpected path ${path}`);
    });
    render(<CalendarPage />, { wrapper: MemoryRouter });

    expect(await screen.findByText(/No dated tasks or study sessions yet/)).toBeInTheDocument();
    expect(screen.getByText("October 2026")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Add a study session" })).toBeInTheDocument();
    expect(screen.queryByText("No date")).not.toBeInTheDocument();
  });

  it("loads the calendar again after Try again", async () => {
    const user = userEvent.setup();
    authenticatedFetch.mockResolvedValue(new Response(null, { status: 500 }));
    render(<CalendarPage />, { wrapper: MemoryRouter });
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not load the calendar.");

    authenticatedFetch.mockImplementation(async (path: string) => {
      if (path === "/todos/") return Response.json([]);
      if (path === "/study-sessions/") return Response.json([]);
      if (path === "/courses/") return Response.json(courses);
      throw new Error(`Unexpected path ${path}`);
    });
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText(/No dated tasks or study sessions yet/)).toBeInTheDocument();
  });

  it("shows a calendar error when the request fails for another reason", async () => {
    authenticatedFetch.mockResolvedValue(new Response(null, { status: 500 }));
    render(<CalendarPage />, { wrapper: MemoryRouter });

    expect(await screen.findByRole("alert")).toHaveTextContent("Could not load the calendar.");
  });

  it("offers a study session or a dated task when nothing is on the calendar", async () => {
    const user = userEvent.setup();
    authenticatedFetch.mockImplementation(async (path: string) => {
      if (path === "/todos/") return Response.json([undatedTask]);
      if (path === "/study-sessions/") return Response.json([]);
      if (path === "/courses/") return Response.json(courses);
      throw new Error(`Unexpected path ${path}`);
    });
    render(<CalendarPage />, { wrapper: MemoryRouter });

    const empty = (await screen.findByText("No dated tasks or study sessions yet.")).parentElement!;
    expect(within(empty).getByRole("link", { name: "Add a task with a due date" })).toHaveAttribute("href", "/tasks");
    await user.click(within(empty).getByRole("button", { name: "Plan a study session" }));
    expect(screen.getByLabelText("Title (required)")).toHaveFocus();
  });

  it("asks for a course first when the student has none", async () => {
    authenticatedFetch.mockImplementation(async (path: string) => {
      if (path === "/courses/") return Response.json([]);
      if (path === "/todos/" || path === "/study-sessions/") return Response.json([]);
      throw new Error(`Unexpected path ${path}`);
    });
    render(<CalendarPage />, { wrapper: MemoryRouter });

    const empty = (await screen.findByText(/Nothing on your calendar yet/)).parentElement!;
    expect(within(empty).getByRole("link", { name: "Create a course" })).toHaveAttribute("href", "/courses");
    expect(within(empty).queryByRole("button", { name: "Plan a study session" })).not.toBeInTheDocument();
  });

  it("shows loading, not the empty message, while the calendar loads", async () => {
    authenticatedFetch.mockImplementation(() => new Promise(() => undefined));
    render(<CalendarPage />, { wrapper: MemoryRouter });
    expect(screen.getByRole("status")).toHaveTextContent("Loading calendar...");
    expect(screen.queryByText(/No dated tasks/)).not.toBeInTheDocument();
  });
});
