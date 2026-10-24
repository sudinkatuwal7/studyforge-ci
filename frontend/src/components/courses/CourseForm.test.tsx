import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../../App";
import { createCourse, listCourses } from "../../api/courses";
import { getHealth } from "../../api/health";
import { listStudySessions } from "../../api/studySessions";
import { listTodos } from "../../api/todos";
import { useAuth } from "../../context/AuthContext";
import type { Course } from "../../types/course";

// Replace API calls with controlled responses; no live backend is needed.
vi.mock("../../api/courses", async (importOriginal) => ({
  ...await importOriginal<typeof import("../../api/courses")>(),
  createCourse: vi.fn(),
  listCourses: vi.fn(),
}));
vi.mock("../../api/health", () => ({ getHealth: vi.fn() }));
vi.mock("../../api/todos", () => ({
  listTodos: vi.fn(),
  createTodo: vi.fn(),
  updateTodoCompletion: vi.fn(),
}));
vi.mock("../../api/studySessions", () => ({
  listStudySessions: vi.fn().mockResolvedValue([]),
}));
vi.mock("../../context/AuthContext", () => ({ useAuth: vi.fn() }));

const accessToken = "test-access-token";
const savedCourse: Course = {
  id: 7,
  name: "Algorithms",
  description: "Lecture notes",
  owner: 1,
  created_at: "2026-10-02T12:00:00Z",
};

beforeEach(() => {
  // Start each test with a signed-in student and an empty course list.
  vi.mocked(useAuth).mockReturnValue({
    accessToken,
    user: { id: 1, email: "student@example.test", first_name: "", last_name: "" },
    isRestoring: false,
    isSigningOut: false,
    signedOutReason: null,
    saveLogin: vi.fn(),
    signOut: vi.fn(),
    authenticatedFetch: vi.fn(async () => new Response()),
  });
  vi.mocked(getHealth).mockResolvedValue({ status: "ok" });
  vi.mocked(listCourses).mockResolvedValue([]);
  vi.mocked(listTodos).mockResolvedValue([]);
  vi.mocked(listStudySessions).mockResolvedValue([]);
  vi.mocked(createCourse).mockResolvedValue(savedCourse);
});

afterEach(() => {
  // Remove the rendered page and mock responses before the next test.
  cleanup();
  vi.resetAllMocks();
});

function renderDashboard() {
  // Render the real form/list connection in App, including its refresh callback.
  render(<MemoryRouter initialEntries={["/"]}><App /></MemoryRouter>);
}

describe("SCRUM-36: course form validation and dashboard updates", () => {
  it.each([
    ["empty", ""],
    ["spaces-only", "   "],
  ])("rejects an %s name without calling the create API", async (_label, name) => {
    const user = userEvent.setup();
    renderDashboard();
    await screen.findByText("You have no courses yet.");

    if (name) await user.type(screen.getByLabelText("Course name"), name);
    await user.click(screen.getByRole("button", { name: "Create" }));

    expect(screen.getByRole("alert").textContent).toBe("Course name is required.");
    expect(createCourse).not.toHaveBeenCalled();
    expect(screen.queryByRole("link", { name: /Open course/ })).toBeNull();
  });

  it("displays courses returned by the list API", async () => {
    vi.mocked(listCourses).mockResolvedValue([savedCourse]);
    renderDashboard();

    const card = await screen.findByRole("link", { name: /Algorithms/ });
    expect(card.getAttribute("href")).toBe("/courses/7");
    expect(card.textContent).toContain("Lecture notes");
    expect(listCourses).toHaveBeenCalledWith(accessToken);
  });

  it.each([
    ["a description", "Lecture notes"],
    ["no description", ""],
  ])("creates a course with %s and shows it on the dashboard", async (_label, description) => {
    const course = { ...savedCourse, description };
    // The first list is empty; the list fetched after creation contains the course.
    vi.mocked(listCourses).mockResolvedValueOnce([]).mockResolvedValue([course]);
    vi.mocked(createCourse).mockResolvedValue(course);
    const user = userEvent.setup();
    renderDashboard();
    await screen.findByText("You have no courses yet.");

    // First trigger validation, then verify that a successful retry clears it.
    await user.click(screen.getByRole("button", { name: "Create" }));
    expect(screen.getByRole("alert").textContent).toBe("Course name is required.");
    await user.type(screen.getByLabelText("Course name"), "  Algorithms  ");
    if (description) await user.type(screen.getByLabelText("Description"), description);
    await user.click(screen.getByRole("button", { name: "Create" }));

    // Verify the trimmed name and current token sent to the feature API.
    expect(createCourse).toHaveBeenCalledExactlyOnceWith(accessToken, {
      name: "Algorithms", description,
    });
    const card = await screen.findByRole("link", { name: /Algorithms/ });
    expect(card.getAttribute("href")).toBe(`/courses/${course.id}`);
    if (description) expect(card.textContent).toContain(description);
    expect((screen.getByLabelText("Course name") as HTMLInputElement).value).toBe("");
    expect((screen.getByLabelText("Description") as HTMLTextAreaElement).value).toBe("");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByText("You have no courses yet.")).toBeNull();
  });

  it("shows a creation error and keeps the entered values for retry", async () => {
    vi.mocked(createCourse).mockRejectedValue(new Error("Could not save course."));
    const user = userEvent.setup();
    renderDashboard();
    await screen.findByText("You have no courses yet.");

    await user.type(screen.getByLabelText("Course name"), "Algorithms");
    await user.type(screen.getByLabelText("Description"), "Lecture notes");
    await user.click(screen.getByRole("button", { name: "Create" }));

    expect((await screen.findByRole("alert")).textContent).toBe("Could not save course.");
    expect((screen.getByLabelText("Course name") as HTMLInputElement).value).toBe("Algorithms");
    expect((screen.getByLabelText("Description") as HTMLTextAreaElement).value).toBe("Lecture notes");
    expect((screen.getByRole("button", { name: "Create" }) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.queryByRole("link", { name: /Open course/ })).toBeNull();
  });

  it("disables creation while saving to prevent duplicate submissions", async () => {
    // Hold the API response until we have checked the pending state.
    let finishCreation!: (course: Course) => void;
    vi.mocked(createCourse).mockReturnValue(new Promise<Course>((resolve) => {
      finishCreation = resolve;
    }));
    const user = userEvent.setup();
    renderDashboard();
    await screen.findByText("You have no courses yet.");
    await user.type(screen.getByLabelText("Course name"), "Algorithms");
    await user.dblClick(screen.getByRole("button", { name: "Create" }));

    expect(createCourse).toHaveBeenCalledTimes(1);
    expect((screen.getByRole("button", { name: "Creating..." }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByLabelText("Course name") as HTMLInputElement).value).toBe("Algorithms");

    await act(async () => { finishCreation(savedCourse); });
    await waitFor(() => {
      expect((screen.getByRole("button", { name: "Create" }) as HTMLButtonElement).disabled).toBe(false);
    });
  });
});
