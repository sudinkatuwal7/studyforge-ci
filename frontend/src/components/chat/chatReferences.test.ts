import { expect, it } from "vitest";
import { selectedCourseDocumentIds } from "./chatReferences";

it("returns only selected and available course document IDs", () => {
  expect(selectedCourseDocumentIds([
    { id: "course-8", documentId: 8, name: "Ready.pdf", source: "course", detail: "READY", available: true },
    { id: "course-9", documentId: 9, name: "Pending.pdf", source: "course", detail: "PENDING", available: false },
    { id: "upload-1", name: "Local.pdf", source: "upload", detail: "Local demo", available: false },
  ], ["course-8", "course-9", "upload-1"])).toEqual([8]);
});
