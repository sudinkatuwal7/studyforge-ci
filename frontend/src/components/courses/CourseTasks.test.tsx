import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { listTodos } from "../../api/todos";
import CourseTasks from "./CourseTasks";

vi.mock("../../api/todos", () => ({ listTodos: vi.fn() }));
vi.mock("../../context/AuthContext", () => ({ useAuth: () => ({ accessToken: "token" }) }));
beforeEach(() => vi.resetAllMocks());

it("shows only the open course's saved tasks, including completed and undated tasks", async () => {
  vi.mocked(listTodos).mockResolvedValue([
    { id: 1, course: 7, title: "Read chapter", due_date: "2026-11-01", is_completed: false, created_at: "2026-10-29" },
    { id: 2, course: 7, title: "Finished homework", due_date: null, is_completed: true, created_at: "2026-10-29" },
    { id: 3, course: 8, title: "Other course task", due_date: null, is_completed: false, created_at: "2026-10-29" },
  ]);
  render(<CourseTasks courseId={7} />);
  expect(await screen.findByText("Read chapter")).toBeInTheDocument();
  expect(screen.getByText("Finished homework")).toBeInTheDocument();
  expect(screen.queryByText("Other course task")).not.toBeInTheDocument();
  expect(screen.getByText("Completed")).toBeInTheDocument();
  expect(screen.getByText("Pending")).toBeInTheDocument();
  expect(screen.getByText("No due date")).toBeInTheDocument();
  expect(screen.getByText("2026-11-01")).toHaveAttribute("datetime", "2026-11-01");
  expect(listTodos).toHaveBeenCalledWith("token");
});

it("allows retry after a failed load and shows an empty state", async () => {
  vi.mocked(listTodos).mockRejectedValueOnce(new Error("Offline")).mockResolvedValueOnce([]);
  render(<CourseTasks courseId={7} />);
  expect(await screen.findByRole("alert")).toHaveTextContent("Could not load course tasks.");
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(await screen.findByText("No tasks for this course yet.")).toBeInTheDocument();
});
