import type { ChatReference } from "../../types/chat";
import type { TrackedDocument } from "../../types/document";

export type SelectableReference = Pick<ChatReference, "id" | "documentId" | "available">;

// Only READY materials have text to work from, so the others stay visible but disabled.
export function materialReferences(materials: TrackedDocument[]): (SelectableReference & { name: string; status: string })[] {
  return materials.map((item) => ({
    id: String(item.id),
    documentId: item.id,
    available: item.snapshot?.status === "READY",
    name: item.name,
    status: item.snapshot?.status ?? "PENDING",
  }));
}

// Shared by the Course Chat, Quiz, and Notes pickers.
export function reconcileSelection(references: SelectableReference[], selected: string[], limit = 20) {
  const eligible = new Set(references.filter((item) => item.available).map((item) => item.id));
  return [...new Set(selected)].filter((id) => eligible.has(id)).slice(0, limit);
}

export function toggleReference(references: SelectableReference[], selected: string[], id: string, limit = 20) {
  const current = reconcileSelection(references, selected, limit);
  if (current.includes(id)) return current.filter((item) => item !== id);
  return reconcileSelection(references, [...current, id], limit);
}

export function selectAllReferences(references: SelectableReference[], selected: string[], limit = 20) {
  return reconcileSelection(references, [...selected, ...references.map((item) => item.id)], limit);
}

export function selectedDocumentIds(references: SelectableReference[], selected: string[]) {
  const ids = new Set(reconcileSelection(references, selected));
  return [...new Set(references.filter((item) => ids.has(item.id)).map((item) => item.documentId))];
}

export const selectedCourseDocumentIds = selectedDocumentIds;
