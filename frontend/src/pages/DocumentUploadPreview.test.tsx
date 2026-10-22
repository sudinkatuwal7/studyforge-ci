import { beforeEach, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import DocumentUploadPreview from "./DocumentUploadPreview";

vi.mock("../context/AuthContext", () => ({
  useAuth: () => ({
    user: { id: 1, email: "test@example.test" },
    accessToken: "test-token",
    isRestoring: false,
  }),
}));

beforeEach(() => window.history.replaceState(null, "", "/upload-preview.html"));

it("opens the actual Document file picker from the page without needing a URL parameter", () => {
  render(<DocumentUploadPreview />);
  expect(screen.queryByLabelText("Document file")).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Course ID"), { target: { value: "1" } });
  fireEvent.click(screen.getByRole("button", { name: "Open upload form" }));
  expect(screen.getByLabelText("Document file")).toHaveAttribute("type", "file");
  expect(screen.getByRole("button", { name: "Upload document" })).toBeEnabled();
  expect(window.location.search).toBe("?courseId=1");
});

it("still opens the uploader immediately when the URL includes a course ID", () => {
  window.history.replaceState(null, "", "/upload-preview.html?courseId=1");
  render(<DocumentUploadPreview />);
  expect(screen.getByLabelText("Course ID")).toHaveValue(1);
  expect(screen.getByLabelText("Document file")).toBeEnabled();
});
