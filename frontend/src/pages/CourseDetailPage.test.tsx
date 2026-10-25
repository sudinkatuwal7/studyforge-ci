import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import App from "../App";
import CourseDetailPage from "./CourseDetailPage";

const authState = vi.hoisted(() => ({
  accessToken: "course-session-token",
  user: { id: 9, email: "student@example.test", first_name: "", last_name: "" },
}));

vi.mock("../context/AuthContext", () => ({
  useAuth: () => ({
    ...authState,
    isRestoring: false,
  }),
}));

afterEach(() => { vi.unstubAllGlobals(); authState.accessToken = "course-session-token"; });

const course = {
  id: 42, name: "Data Analysis", description: "Lecture notes", owner: 9,
  created_at: "2026-10-02T00:00:00Z",
};
const document = {
  id: 81, course_id: course.id, name: "Lecture.pdf", status: "PENDING", error: null,
  created_at: "2026-10-02T00:00:00Z", updated_at: "2026-10-02T00:00:00Z",
};

it("opens the selected course, uploads with its ID and session, and displays the polled status", async () => {
  const fetch = vi.fn(async (input: RequestInfo | URL, options?: RequestInit) => {
    const path = new URL(String(input)).pathname;
    if (path === "/api/v1/health/") return Response.json({ status: "ok" });
    if (path === "/api/v1/courses/") return Response.json([
      { ...course, id: 7, name: "Biology" }, course,
    ]);
    if (path === "/api/v1/todos/") return Response.json([]);
    if (path === `/api/v1/courses/${course.id}/`) return Response.json(course);
    if (path === `/api/v1/courses/${course.id}/documents/` && options?.method === "POST") {
      return Response.json(document, { status: 201 });
    }
    if (path === `/api/v1/courses/${course.id}/documents/`) return Response.json([]);
    if (path === `/api/v1/documents/${document.id}/`) {
      return Response.json({ ...document, status: "READY" });
    }
    throw new Error(`Unexpected request: ${path}`);
  });
  vi.stubGlobal("fetch", fetch);
  render(<MemoryRouter><App /></MemoryRouter>);

  const link = await screen.findByRole("link", { name: /Data Analysis/ });
  expect(link).toHaveAttribute("href", `/courses/${course.id}`);
  expect(screen.queryByLabelText("Document file")).not.toBeInTheDocument();
  fireEvent.click(link);
  const input = await screen.findByLabelText("Document file");
  expect(screen.getByRole("heading", { name: course.name })).toBeInTheDocument();
  const file = new File(["%PDF-test"], "Lecture.pdf", { type: "application/pdf" });
  fireEvent.change(input, { target: { files: [file] } });
  fireEvent.click(screen.getByRole("button", { name: "Upload document" }));
  expect(await screen.findByText("PENDING")).toBeInTheDocument();

  const uploads = fetch.mock.calls.filter(([, options]) => options?.method === "POST");
  expect(uploads).toHaveLength(1);
  const [url, options] = uploads[0];
  expect(url).toBe(`http://api.test/api/v1/courses/${course.id}/documents/`);
  expect(new Headers(options?.headers).get("Authorization")).toBe("Bearer course-session-token");
  expect(new Headers(options?.headers).has("Content-Type")).toBe(false);
  const form = options?.body;
  expect(form).toBeInstanceOf(FormData);
  expect((form as FormData).get("file")).toBe(file);
  await waitFor(() => expect(screen.getByText("READY")).toBeInTheDocument(), { timeout: 4000 });
});

it("keeps the upload form hidden when a direct course link returns 404", async () => {
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const path = new URL(String(input)).pathname;
    if (path === "/api/v1/health/") return Response.json({ status: "ok" });
    if (path === "/api/v1/courses/99/") return Response.json({ detail: "Not found." }, { status: 404 });
    throw new Error(`Unexpected request: ${path}`);
  }));
  render(<MemoryRouter initialEntries={["/courses/99/"]}><App /></MemoryRouter>);

  expect(await screen.findByRole("alert")).toHaveTextContent("Course not found or you do not have access to it.");
  expect(screen.queryByLabelText("Document file")).not.toBeInTheDocument();
});

it("keeps an in-flight course chat question mounted through an access-token refresh", async () => {
  sessionStorage.clear();
  let finishQuestion!: (response: Response) => void;
  let questionSignal!: AbortSignal;
  const fetch = vi.fn((input: RequestInfo | URL, options?: RequestInit): Promise<Response> => {
    const path = new URL(String(input)).pathname;
    if (path === `/api/v1/courses/${course.id}/`) return Promise.resolve(Response.json(course));
    if (path === `/api/v1/courses/${course.id}/documents/`) return Promise.resolve(Response.json([{ ...document, status: "READY" }]));
    if (path === "/api/v1/conversations/") return Promise.resolve(Response.json([
      { id: 9, course_id: course.id, title: "", created_at: "2026-10-02", updated_at: "2026-10-02" },
    ]));
    if (path === "/api/v1/conversations/9/documents/") return Promise.resolve(Response.json([]));
    if (path === "/api/v1/conversations/9/questions/") {
      questionSignal = options?.signal as AbortSignal;
      return new Promise((resolve) => { finishQuestion = resolve; });
    }
    throw new Error(`Unexpected request: ${path}`);
  });
  vi.stubGlobal("fetch", fetch);
  const route = () => <MemoryRouter initialEntries={[`/courses/${course.id}`]}>
    <Routes><Route path="/courses/:courseId" element={<CourseDetailPage />} /></Routes>
  </MemoryRouter>;
  const { rerender } = render(route());
  await screen.findByRole("checkbox", { name: /Lecture.pdf/ });
  fireEvent.click(screen.getByRole("checkbox", { name: /Lecture.pdf/ }));
  fireEvent.change(screen.getByRole("textbox", { name: "Message Pandu" }), { target: { value: "Explain this lecture" } });
  fireEvent.click(screen.getByRole("button", { name: "Send to Pandu" }));
  expect(screen.getByText("Explain this lecture")).toBeInTheDocument();
  expect(questionSignal.aborted).toBe(false);
  const chat = screen.getByRole("complementary", { name: "Pandu course chat" });

  authState.accessToken = "refreshed-token";
  rerender(route());
  await waitFor(() => expect(fetch.mock.calls.some(([url, options]) =>
    String(url).endsWith(`/courses/${course.id}/`) && new Headers(options?.headers).get("Authorization") === "Bearer refreshed-token")).toBe(true));
  expect(screen.getByRole("complementary", { name: "Pandu course chat" })).toBe(chat);
  expect(questionSignal.aborted).toBe(false);

  await act(async () => finishQuestion(Response.json({ status: "INSUFFICIENT_CONTEXT", answer: null, citations: [] })));
  expect(screen.getByText(/find enough information in the selected references/)).toBeInTheDocument();
});
