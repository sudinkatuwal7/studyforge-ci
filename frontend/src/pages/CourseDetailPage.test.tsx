import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import App from "../App";

vi.mock("../context/AuthContext", () => ({
  useAuth: () => ({
    user: { id: 9, email: "student@example.test" },
    accessToken: "course-session-token",
    isRestoring: false,
  }),
}));

afterEach(() => vi.unstubAllGlobals());

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
