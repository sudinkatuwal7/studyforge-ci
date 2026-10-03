import { request } from "./client";
import type { DocumentError, StudyDocument } from "../types/document";

export const MAX_PDF_BYTES = 20 * 1024 * 1024;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isDocumentError(value: unknown): value is DocumentError {
  return isObject(value) && typeof value.code === "string" &&
    typeof value.message === "string" && value.message.length > 0;
}

export class DocumentRequestError extends Error {
  status: number;
  code: string | null;
  documentId: number | null;

  constructor(status: number, body: unknown) {
    const error = isObject(body) && isDocumentError(body.error) ? body.error : body;
    super(isDocumentError(error) ? error.message : "The request could not be completed. Please try again later.");
    this.name = "DocumentRequestError";
    this.status = status;
    this.code = isDocumentError(error) ? error.code : null;
    this.documentId = isObject(body) && Number.isSafeInteger(body.document_id) &&
      typeof body.document_id === "number" && body.document_id > 0 ? body.document_id : null;
  }
}

async function readDocument(response: Response): Promise<StudyDocument> {
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new DocumentRequestError(response.status, body);

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

export function validatePdf(file: File | null): string | null {
  if (!file) return "Choose a PDF to upload.";
  if (file.size === 0) return "The selected file is empty.";
  if (file.size > MAX_PDF_BYTES) return "The PDF must be no larger than 20 MiB.";
  if (!file.name.toLowerCase().endsWith(".pdf")) return "Choose a file with a .pdf extension.";
  return null;
}

export async function uploadDocument(courseId: number, file: File, accessToken: string, signal: AbortSignal) {
  const body = new FormData();
  body.append("file", file);
  // Let the browser set the multipart boundary. Never replay this POST automatically.
  return readDocument(await request(`/courses/${courseId}/documents/`, { method: "POST", body, signal }, accessToken));
}

export async function getDocument(documentId: number, accessToken: string, signal: AbortSignal) {
  return readDocument(await request(`/documents/${documentId}/`, { signal, cache: "no-store" }, accessToken));
}
