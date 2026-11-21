import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ApiError } from "../api/client";
import { listCourses } from "../api/courses";
import { getQuizProgress, listQuizHistory } from "../api/quizHistory";
import { QuizRequestError } from "../api/quizzes";
import type { QuizHistoryItem, QuizProgress } from "../types/quizHistory";
import QuizHistoryPage from "./QuizHistoryPage";

vi.mock("../api/courses", async (original) => ({
  ...await original<typeof import("../api/courses")>(),
  listCourses: vi.fn(),
}));
vi.mock("../api/quizHistory", () => ({ listQuizHistory: vi.fn(), getQuizProgress: vi.fn() }));
vi.mock("../context/AuthContext", () => ({ useAuth: () => ({ user: { id: 1 }, accessToken: "token" }) }));

afterEach(() => vi.clearAllMocks());

const noProgress = (course: number): QuizProgress => ({
  course, quizzes_taken: 0, best_percentage: { regular: null, survival: null }, recent: [],
});
beforeEach(() => {
  vi.mocked(getQuizProgress).mockImplementation(async (courseId) => noProgress(courseId));
});

const biology = { id: 7, name: "Biology", description: "", owner: 1, created_at: "2026-10-01" };
const history = { id: 8, name: "History", description: "", owner: 1, created_at: "2026-10-01" };
const row = (quizId: number, title: string, course: typeof biology, extra: Partial<QuizHistoryItem> = {}): QuizHistoryItem => ({
  quiz_id: quizId, title, course: course.id, course_name: course.name,
  mode: "regular", survival_status: null, score: 3, total_questions: 5, percentage: 60,
  submitted_at: "2026-11-02T12:00:00Z", ...extra,
});
const cells = row(1, "Quiz: Cells", biology);
const treaties = row(2, "Quiz: Treaties", history, {
  mode: "survival", survival_status: "GAME_OVER", score: 2, percentage: 40, submitted_at: "2026-11-01T12:00:00Z",
});

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

function renderHistory(path = "/quiz-history") {
  return render(<MemoryRouter initialEntries={[path]}>
    <Routes><Route path="/quiz-history" element={<QuizHistoryPage />} /></Routes>
    <Location />
    <BackButton />
  </MemoryRouter>);
}

const filter = () => screen.getByLabelText("Course");
const url = () => screen.getByLabelText("Current URL").textContent;
const titles = () => screen.queryAllByRole("listitem").map((item) => item.querySelector(".quiz-history-title")?.textContent);

it("lists every result with its course, mode, score and date", async () => {
  vi.mocked(listCourses).mockResolvedValue([biology, history]);
  vi.mocked(listQuizHistory).mockResolvedValue([cells, treaties]);
  renderHistory();

  const items = await screen.findAllByRole("listitem");
  expect(items).toHaveLength(2);
  expect(items[0]).toHaveTextContent("Quiz: Cells");
  expect(items[0]).toHaveTextContent("Biology");
  expect(within(items[0]).getByText("Quiz")).toBeInTheDocument();
  expect(items[0]).toHaveTextContent("3/5 (60%)");
  expect(within(items[0]).getByText(/2026/)).toHaveAttribute("datetime", "2026-11-02T12:00:00Z");
  expect(items[1]).toHaveTextContent("History");
  expect(items[1]).toHaveTextContent("Survival · Game over");
  expect(items[1]).toHaveTextContent("2/5 (40%)");
  expect(listQuizHistory).toHaveBeenCalledWith("token", undefined, expect.any(AbortSignal));
});

it("labels a Survival game that was completed", async () => {
  vi.mocked(listCourses).mockResolvedValue([history]);
  vi.mocked(listQuizHistory).mockResolvedValue([{ ...treaties, survival_status: "COMPLETED" }]);
  renderHistory();

  expect(await screen.findByText("Survival · Completed")).toBeInTheDocument();
});

it("filters by course, keeps the filter in the URL, and Back restores all courses", async () => {
  vi.mocked(listCourses).mockResolvedValue([biology, history]);
  vi.mocked(listQuizHistory).mockImplementation(async (_token, courseId) => (
    courseId === undefined ? [cells, treaties] : [cells, treaties].filter((item) => item.course === courseId)
  ));
  renderHistory();
  await screen.findByText("Quiz: Treaties");
  await screen.findByRole("option", { name: "Biology" });

  fireEvent.change(filter(), { target: { value: "7" } });

  expect(await screen.findByText("Quiz: Cells")).toBeInTheDocument();
  expect(screen.queryByText("Quiz: Treaties")).not.toBeInTheDocument();
  expect(listQuizHistory).toHaveBeenLastCalledWith("token", 7, expect.any(AbortSignal));
  expect(url()).toBe("/quiz-history?course=7");
  expect(filter()).toHaveValue("7");

  fireEvent.click(screen.getByRole("button", { name: "Back" }));
  expect(await screen.findByText("Quiz: Treaties")).toBeInTheDocument();
  expect(url()).toBe("/quiz-history");
  expect(filter()).toHaveValue("");
});

it("opens with the course filter from the URL, as after a refresh", async () => {
  vi.mocked(listCourses).mockResolvedValue([biology, history]);
  vi.mocked(listQuizHistory).mockResolvedValue([cells]);
  renderHistory("/quiz-history?course=7");

  expect(await screen.findByText("Quiz: Cells")).toBeInTheDocument();
  expect(listQuizHistory).toHaveBeenCalledWith("token", 7, expect.any(AbortSignal));
  expect(listQuizHistory).not.toHaveBeenCalledWith("token", undefined, expect.anything());
  expect(filter()).toHaveValue("7");
});

it("drops a filter that is not one of the student's courses and shows every result", async () => {
  vi.mocked(listCourses).mockResolvedValue([biology]);
  vi.mocked(listQuizHistory).mockImplementation(async (_token, courseId) => {
    // The backend's answer for another student's course.
    if (courseId !== undefined) throw new QuizRequestError(404);
    return [cells];
  });

  for (const path of ["/quiz-history?course=99", "/quiz-history?course=abc", "/quiz-history?course=0"]) {
    const { unmount } = renderHistory(path);
    expect(await screen.findByText("Quiz: Cells")).toBeInTheDocument();
    expect(url()).toBe("/quiz-history");
    expect(filter()).toHaveValue("");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    unmount();
  }
  // A malformed id is never sent to the server.
  for (const [, courseId] of vi.mocked(listQuizHistory).mock.calls) expect([undefined, 99]).toContain(courseId);
});

it("does not let a slower, older response replace the chosen course's results", async () => {
  const all = deferred<QuizHistoryItem[]>();
  vi.mocked(listCourses).mockResolvedValue([biology, history]);
  vi.mocked(listQuizHistory).mockImplementation((_token, courseId) => (
    courseId === undefined ? all.promise : Promise.resolve([cells])
  ));
  renderHistory();
  await screen.findByRole("option", { name: "Biology" });

  fireEvent.change(filter(), { target: { value: "7" } });
  expect(await screen.findByText("Quiz: Cells")).toBeInTheDocument();
  await act(async () => all.resolve([cells, treaties]));

  expect(titles()).toEqual(["Quiz: Cells"]);
  expect(screen.queryByText("Loading quiz history…")).not.toBeInTheDocument();
});

it("with no results, points the student to their courses", async () => {
  vi.mocked(listCourses).mockResolvedValue([biology]);
  vi.mocked(listQuizHistory).mockResolvedValue([]);
  renderHistory();

  expect(await screen.findByText(/No quiz results yet/)).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Go to my courses" })).toHaveAttribute("href", "/courses");
  expect(screen.queryByRole("list")).not.toBeInTheDocument();
});

it("with no results for the chosen course, links to that course's quizzes", async () => {
  vi.mocked(listCourses).mockResolvedValue([biology, history]);
  vi.mocked(listQuizHistory).mockResolvedValue([]);
  renderHistory("/quiz-history?course=8");

  expect(await screen.findByText("No quiz results for History yet.")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Take a quiz in this course" })).toHaveAttribute("href", "/courses/8/quizzes");
});

it("shows a loading error instead of an empty history", async () => {
  vi.mocked(listCourses).mockResolvedValue([biology]);
  vi.mocked(listQuizHistory).mockRejectedValue(new QuizRequestError(500));
  renderHistory();

  expect(await screen.findByRole("alert")).toHaveTextContent("Could not load your quiz history.");
  expect(screen.queryByText(/No quiz results yet/)).not.toBeInTheDocument();
});

it("asks the student to sign in again when the session has expired", async () => {
  vi.mocked(listCourses).mockResolvedValue([biology]);
  vi.mocked(listQuizHistory).mockRejectedValue(new QuizRequestError(401));
  renderHistory();

  expect(await screen.findByRole("alert")).toHaveTextContent("Your session has expired.");
});

it("still lists results when the courses cannot be loaded, without the filter", async () => {
  vi.mocked(listCourses).mockRejectedValue(new ApiError(500));
  vi.mocked(listQuizHistory).mockResolvedValue([cells]);
  renderHistory();

  expect(await screen.findByText("Quiz: Cells")).toBeInTheDocument();
  expect(screen.getByRole("alert")).toHaveTextContent("The course filter is unavailable.");
  expect(filter()).toBeDisabled();
});

it("shows the chosen course's quizzes taken, best scores and recent scores", async () => {
  vi.mocked(listCourses).mockResolvedValue([biology, history]);
  vi.mocked(listQuizHistory).mockResolvedValue([cells]);
  vi.mocked(getQuizProgress).mockResolvedValue({
    course: 7, quizzes_taken: 4, best_percentage: { regular: 80, survival: 40 },
    recent: [cells, { ...treaties, quiz_id: 3, course: 7, course_name: "Biology" }],
  });
  renderHistory("/quiz-history?course=7");

  const progress = within(await screen.findByRole("region", { name: "Progress in Biology" }));
  expect(getQuizProgress).toHaveBeenCalledWith(7, "token", expect.any(AbortSignal));
  expect(progress.getByText("Quizzes taken").nextElementSibling).toHaveTextContent("4");
  expect(progress.getByText("Best quiz score").nextElementSibling).toHaveTextContent("80%");
  expect(progress.getByText("Best Survival score").nextElementSibling).toHaveTextContent("40%");
  const recent = within(progress.getByRole("list", { name: "Recent scores, newest first" })).getAllByRole("listitem");
  expect(recent.map((item) => item.querySelector("strong")?.textContent)).toEqual(["60%", "40%"]);
  expect(recent[1]).toHaveTextContent("Survival · Game over");
});

it("says None yet for a mode the student has not finished in that course", async () => {
  vi.mocked(listCourses).mockResolvedValue([biology]);
  vi.mocked(listQuizHistory).mockResolvedValue([cells]);
  vi.mocked(getQuizProgress).mockResolvedValue({
    course: 7, quizzes_taken: 1, best_percentage: { regular: 60, survival: null }, recent: [cells],
  });
  renderHistory("/quiz-history?course=7");

  const progress = within(await screen.findByRole("region", { name: "Progress in Biology" }));
  expect(progress.getByText("Best Survival score").nextElementSibling).toHaveTextContent("None yet");
});

it("shows no progress for all courses, only for one", async () => {
  vi.mocked(listCourses).mockResolvedValue([biology]);
  vi.mocked(listQuizHistory).mockResolvedValue([cells]);
  renderHistory();

  await screen.findByText("Quiz: Cells");
  expect(getQuizProgress).not.toHaveBeenCalled();
  expect(screen.queryByRole("region", { name: /Progress in/ })).not.toBeInTheDocument();
});

it("leaves the progress out when the course has no finished quizzes", async () => {
  vi.mocked(listCourses).mockResolvedValue([biology]);
  vi.mocked(listQuizHistory).mockResolvedValue([]);
  renderHistory("/quiz-history?course=7");

  expect(await screen.findByText("No quiz results for Biology yet.")).toBeInTheDocument();
  await vi.waitFor(() => expect(getQuizProgress).toHaveBeenCalled());
  expect(screen.queryByRole("region", { name: /Progress in/ })).not.toBeInTheDocument();
});

it("never asks for progress on a course that is not the student's", async () => {
  vi.mocked(listCourses).mockResolvedValue([biology]);
  vi.mocked(listQuizHistory).mockResolvedValue([cells]);
  renderHistory("/quiz-history?course=99");

  await screen.findByText("Quiz: Cells");
  expect(url()).toBe("/quiz-history");
  expect(getQuizProgress).not.toHaveBeenCalled();
});

it("switches the progress when the student picks another course", async () => {
  vi.mocked(listCourses).mockResolvedValue([biology, history]);
  vi.mocked(listQuizHistory).mockResolvedValue([cells]);
  vi.mocked(getQuizProgress).mockImplementation(async (courseId) => ({
    ...noProgress(courseId), quizzes_taken: courseId === 7 ? 2 : 5, recent: [cells],
  }));
  renderHistory("/quiz-history?course=7");
  await screen.findByRole("region", { name: "Progress in Biology" });

  fireEvent.change(filter(), { target: { value: "8" } });

  const progress = within(await screen.findByRole("region", { name: "Progress in History" }));
  expect(progress.getByText("Quizzes taken").nextElementSibling).toHaveTextContent("5");
  expect(screen.queryByRole("region", { name: "Progress in Biology" })).not.toBeInTheDocument();
});

it("shows a progress error without hiding the history", async () => {
  vi.mocked(listCourses).mockResolvedValue([biology]);
  vi.mocked(listQuizHistory).mockResolvedValue([cells]);
  vi.mocked(getQuizProgress).mockRejectedValue(new QuizRequestError(500));
  renderHistory("/quiz-history?course=7");

  expect(await screen.findByRole("alert")).toHaveTextContent("Could not load your progress.");
  expect(screen.getByText("Quiz: Cells")).toBeInTheDocument();
});
