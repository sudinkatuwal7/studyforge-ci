import { request } from "./client";
import type { DocumentError, StudyDocument } from "../types/document";

export const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024;
export const MAX_PDF_BYTES = MAX_DOCUMENT_BYTES;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isDocumentError(value: unknown): value is DocumentError {
  return isObject(value) && typeof value.code === "string" &&
    typeof value.message === "string" && value.message.length > 0;
}

// Shared AI endpoints return { code, detail }; document endpoints use { code, message }.
function structuredError(body: unknown): DocumentError | null {
  if (isObject(body) && typeof body.code === "string" &&
    typeof body.detail === "string" && body.detail.length > 0) {
    return { code: body.code, message: body.detail };
  }
  const error = isObject(body) && isDocumentError(body.error) ? body.error : body;
  return isDocumentError(error) ? error : null;
}

export class DocumentRequestError extends Error {
  status: number;
  code: string | null;
  documentId: number | null;

  constructor(status: number, body: unknown) {
    const error = structuredError(body);
    super(error ? error.message : "The request could not be completed. Please try again later.");
    this.name = "DocumentRequestError";
    this.status = status;
    this.code = error ? error.code : null;
    this.documentId = isObject(body) && Number.isSafeInteger(body.document_id) &&
      typeof body.document_id === "number" && body.document_id > 0 ? body.document_id : null;
  }
}

async function readDocument(response: Response): Promise<StudyDocument> {
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new DocumentRequestError(response.status, body);
  return parseDocument(body);
}

function parseDocument(body: unknown): StudyDocument {
  if (!isObject(body) || !Number.isSafeInteger(body.id) || Number(body.id) <= 0 ||
    !Number.isSafeInteger(body.course_id) || Number(body.course_id) <= 0 ||
    typeof body.name !== "string" || !body.name ||
    typeof body.status !== "string" || !["PENDING", "PROCESSING", "READY", "FAILED"].includes(body.status) ||
    typeof body.created_at !== "string" || typeof body.updated_at !== "string" ||
    (body.status === "FAILED" ? !isDocumentError(body.error) : body.error !== null)) {
    throw new Error("The server returned an invalid document response.");
  }
  return body as StudyDocument;
}

export function validateDocument(file: File | null): string | null {
  if (!file) return "Choose a PDF, DOCX, or PPTX file to upload.";
  if (file.size === 0) return "The selected file is empty.";
  if (file.size > MAX_DOCUMENT_BYTES) return "The file must be no larger than 20 MiB.";
  if (!/\.(pdf|docx|pptx)$/i.test(file.name)) return "Choose a file with a .pdf, .docx, or .pptx extension.";
  return null;
}

export const validatePdf = validateDocument;

export async function uploadDocument(courseId: number, file: File, accessToken: string, signal: AbortSignal) {
  const body = new FormData();
  body.append("file", file);
  // Let the browser set the multipart boundary. Never replay this POST automatically.
  return readDocument(await request(`/courses/${courseId}/documents/`, { method: "POST", body, signal }, accessToken));
}

export async function getDocument(documentId: number, accessToken: string, signal: AbortSignal) {
  return readDocument(await request(`/documents/${documentId}/`, { signal, cache: "no-store" }, accessToken));
}

export async function listDocuments(courseId: number, accessToken: string, signal: AbortSignal) {
  const response = await request(`/courses/${courseId}/documents/`, { signal, cache: "no-store" }, accessToken);
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new DocumentRequestError(response.status, body);
  if (!Array.isArray(body)) throw new Error("The server returned an invalid material list.");
  return body.map(parseDocument);
}

export async function renameDocument(documentId: number, name: string, accessToken: string, signal: AbortSignal) {
  return readDocument(await request(`/documents/${documentId}/`, {
    method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }), signal,
  }, accessToken));
}

export async function deleteDocument(documentId: number, accessToken: string, signal: AbortSignal) {
  const response = await request(`/documents/${documentId}/`, { method: "DELETE", signal }, accessToken);
  if (!response.ok) throw new DocumentRequestError(response.status, await response.json().catch(() => null));
  if (response.status !== 204) throw new Error("Deletion could not be confirmed. Refresh the material list.");
}
