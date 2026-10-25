import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { expect, it, vi } from "vitest";
import CourseWorkspace from "./CourseWorkspace";
import { listDocuments } from "../../api/documents";

vi.mock("../../context/AuthContext", () => ({ useAuth: () => ({ user: { id: 1 }, accessToken: "token" }) }));
vi.mock("../../api/documents", async (original) => ({ ...await original<typeof import("../../api/documents")>(), listDocuments: vi.fn().mockResolvedValue([]) }));
const course = { id: 42, name: "Biology", description: "Cell biology", owner: 1, created_at: "2026-10-01" };

it("switches sections without reloading materials or hiding chat and supports keyboard tabs", async () => {
  render(<MemoryRouter><CourseWorkspace course={course} /></MemoryRouter>);
  await screen.findByText("No materials uploaded yet.");
  const before = vi.mocked(listDocuments).mock.calls.length;
  fireEvent.click(screen.getByRole("tab", { name: "Notes" }));
  expect(screen.getByRole("heading", { name: "Study notes" })).toBeVisible();
  fireEvent.keyDown(screen.getByRole("tab", { name: "Notes" }), { key: "ArrowRight" });
  expect(screen.getByRole("button", { name: "Generate quiz" })).toBeDisabled();
  expect(screen.getByRole("complementary", { name: "Pandu course chat" })).toBeVisible();
  fireEvent.click(screen.getByRole("tab", { name: "Materials" }));
  await waitFor(() => expect(screen.getByLabelText("Document file")).toBeVisible());
  expect(vi.mocked(listDocuments)).toHaveBeenCalledTimes(before);
});

it("collapses and restores the assistant without losing the course content", async () => {
  render(<MemoryRouter><CourseWorkspace course={course} /></MemoryRouter>);
  await screen.findByText("No materials uploaded yet.");
  const toggle = screen.getByRole("button", { name: "Hide AI Assistant" });
  fireEvent.click(toggle);
  expect(toggle).toHaveAttribute("aria-expanded", "false");
  expect(screen.getByRole("heading", { name: "Biology" })).toBeVisible();
  expect(document.getElementById("course-assistant")).toHaveAttribute("inert");
  fireEvent.click(screen.getByRole("button", { name: "Show AI Assistant" }));
  expect(screen.getByRole("complementary", { name: "Pandu course chat" })).toBeVisible();
});

it("starts with the assistant collapsed at the narrow breakpoint", () => {
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true })));
  try {
    render(<MemoryRouter><CourseWorkspace course={course} /></MemoryRouter>);
    expect(screen.getByRole("button", { name: "Show AI Assistant" })).toHaveAttribute("aria-expanded", "false");
    expect(document.getElementById("course-assistant")).toHaveAttribute("inert");
  } finally {
    vi.unstubAllGlobals();
  }
});
