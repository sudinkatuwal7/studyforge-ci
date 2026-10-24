import type { ChatReference, CourseMaterialReference } from "../../types/chat";

// Translate selected UI reference IDs into backend document IDs for Pandu requests.
export function selectedCourseDocumentIds(
  references: ChatReference[],
  selectedReferenceIds: string[],
): number[] {
  const selected = new Set(selectedReferenceIds);
  return references
    .filter((reference): reference is CourseMaterialReference =>
      reference.source === "course" &&
      reference.available &&
      selected.has(reference.id))
    .map((reference) => reference.documentId);
}
