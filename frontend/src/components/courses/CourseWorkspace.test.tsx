import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { expect, it, vi } from "vitest";
import CourseWorkspace from "./CourseWorkspace";
import { listDocuments } from "../../api/documents";
import { listConversations, listConversationUploads } from "../../api/conversations";

vi.mock("../../context/AuthContext", () => ({ useAuth: () => ({ user: { id: 1 }, accessToken: "token" }) }));
vi.mock("../../api/documents", async (original) => ({ ...await original<typeof import("../../api/documents")>(), listDocuments: vi.fn().mockResolvedValue([]) }));
vi.mock("../../api/conversations", () => ({ listConversations: vi.fn().mockResolvedValue([{ id: 9, course_id: 42, title: "", created_at: "2026-10-01", updated_at: "2026-10-01" }]), listConversationUploads: vi.fn().mockResolvedValue([]) }));
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
  expect(screen.queryByText("Demo")).not.toBeInTheDocument();
  expect(listConversations).toHaveBeenCalled();
  expect(listConversationUploads).toHaveBeenCalled();
  fireEvent.click(screen.getByRole("tab", { name: "Materials" }));
  await waitFor(() => expect(screen.getByLabelText("Document file")).toBeVisible());
  expect(vi.mocked(listDocuments)).toHaveBeenCalledTimes(before);
});
