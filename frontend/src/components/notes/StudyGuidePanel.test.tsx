import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { StudyGuideError, generateStudyGuide } from "../../api/studyGuide";
import StudyGuidePanel from "./StudyGuidePanel";

vi.mock("../../api/studyGuide", async () => {
  const actual =
    await vi.importActual<typeof import("../../api/studyGuide")>("../../api/studyGuide");
  return { ...actual, generateStudyGuide: vi.fn() };
});

const mockGenerate = vi.mocked(generateStudyGuide);

function renderPanel() {
  return render(
    <StudyGuidePanel documentId={7} documentName="Lecture 07.pdf" accessToken="token" />,
  );
}

describe("StudyGuidePanel", () => {
  beforeEach(() => {
    mockGenerate.mockReset();
  });

  it("shows the three sections once notes come back", async () => {
    mockGenerate.mockResolvedValue({
      key_concepts: ["Hash function"],
      important_points: ["Collisions are unavoidable when n > m"],
      summary: "A hash table stores entries by computing an index from the key.",
    });

    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: /generate study notes/i }));

    expect(await screen.findByText("Hash function")).toBeInTheDocument();
    expect(screen.getByText(/collisions are unavoidable/i)).toBeInTheDocument();
    expect(screen.getByText(/hash table stores entries/i)).toBeInTheDocument();
  });

  it("explains a scanned PDF differently from one still processing", async () => {
    mockGenerate.mockRejectedValue(new StudyGuideError(409, "DOCUMENT_HAS_NO_TEXT"));

    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: /generate study notes/i }));

    // Both failures are 409. Branching on the status alone would show the
    // wrong message here, which is the bug this test exists to catch.
    expect(await screen.findByText(/no readable text/i)).toBeInTheDocument();
  });

  it("tells the student to wait when the document is not ready", async () => {
    mockGenerate.mockRejectedValue(new StudyGuideError(409, "DOCUMENT_NOT_READY"));

    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: /generate study notes/i }));

    expect(await screen.findByText(/still being processed/i)).toBeInTheDocument();
  });
});