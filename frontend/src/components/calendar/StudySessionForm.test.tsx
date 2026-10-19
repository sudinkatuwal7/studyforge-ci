import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../api/client";
import { createStudySession } from "../../api/studySessions";
import type { Course } from "../../types/course";
import StudySessionForm from "./StudySessionForm";

vi.mock("../../api/studySessions", () => ({
  createStudySession: vi.fn(),
  updateStudySession: vi.fn(),
}));
vi.mock("../../context/AuthContext", () => ({
  useAuth: () => ({ accessToken: "calendar-token" }),
}));

const course: Course = {
  id: 8, name: "Graphs", description: "", owner: 1, created_at: "2026-10-18T12:00:00Z",
};

describe("StudySessionForm", () => {
  beforeEach(() => {
    vi.mocked(createStudySession).mockReset();
  });

  it("reuses the creation key when an unchanged submission is retried", async () => {
    const user = userEvent.setup();
    vi.mocked(createStudySession)
      .mockRejectedValueOnce(new ApiError(500))
      .mockResolvedValueOnce({
        id: 9, title: "Review graphs", course: 8, date: "2026-10-22", time: null,
        created_at: "2026-10-18T12:00:00Z", updated_at: "2026-10-18T12:00:00Z",
      });
    render(<StudySessionForm courses={[course]} onSaved={vi.fn()} />);

    await user.type(screen.getByLabelText("Title (required)"), "Review graphs");
    await user.selectOptions(screen.getByLabelText("Course (required)"), "8");
    await user.type(screen.getByLabelText("Date (required)"), "2026-10-22");
    await user.click(screen.getByRole("button", { name: "Add study session" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not save the study session. Please try again.");
    expect(screen.getByLabelText("Title (required)")).toHaveValue("Review graphs");

    await user.click(screen.getByRole("button", { name: "Add study session" }));
    const firstKey = vi.mocked(createStudySession).mock.calls[0][1].creation_key;
    const secondKey = vi.mocked(createStudySession).mock.calls[1][1].creation_key;
    expect(secondKey).toBe(firstKey);
    expect(vi.mocked(createStudySession).mock.calls[1][1].time).toBeNull();
  });
});
