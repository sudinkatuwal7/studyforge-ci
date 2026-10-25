import { expect, it } from "vitest";
import { reconcileSelection, selectAllReferences, selectedCourseDocumentIds, selectedDocumentIds, toggleReference } from "./chatReferences";

it("returns only selected and available course document IDs", () => {
  expect(selectedCourseDocumentIds([
    { id: "course-8", documentId: 8, available: true },
    { id: "course-9", documentId: 9, available: false },
    { id: "upload-1", documentId: 1, available: false },
  ], ["course-8", "course-9", "upload-1"])).toEqual([8]);
});

it("supports one, many, all, deselect, and clear without duplicate document IDs", () => {
  const references = [
    { id: "course-1", documentId: 1, available: true },
    { id: "course-2", documentId: 2, available: true },
    { id: "upload-3", documentId: 3, available: true },
    { id: "course-4", documentId: 4, available: false },
    { id: "duplicate-1", documentId: 1, available: true },
  ];
  const one = toggleReference(references, [], "course-1");
  expect(one).toEqual(["course-1"]);
  const many = toggleReference(references, one, "upload-3");
  expect(many).toEqual(["course-1", "upload-3"]);
  const all = selectAllReferences(references, many);
  expect(all).toEqual(["course-1", "upload-3", "course-2", "duplicate-1"]);
  expect(selectedDocumentIds(references, all)).toEqual([1, 2, 3]);
  expect(toggleReference(references, all, "course-1")).not.toContain("course-1");
  expect(reconcileSelection(references, [], 1)).toEqual([]);
  expect(reconcileSelection(references, all, 1)).toEqual(["course-1"]);
  expect(toggleReference(references, [], "course-4")).toEqual([]);
});
