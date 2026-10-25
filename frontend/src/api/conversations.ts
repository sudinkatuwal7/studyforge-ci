import { API_BASE_URL, request } from "./client";
import { DocumentRequestError } from "./documents";
import type { DocumentError, DocumentStatus } from "../types/document";

export type Conversation = { id: number; course_id: number | null; title: string; created_at: string; updated_at: string };
export type ConversationUpload = {
  id: number; course_id: null; conversation_id: number; name: string;
  status: DocumentStatus; created_at: string; updated_at: string; error: DocumentError | null;
};
export type QuestionCitation = { chunk_id: number; document_id: number; page_number: number; excerpt: string };
export type QuestionResult = { status: "ANSWERED"; answer: string; citations: QuestionCitation[] } |
  { status: "INSUFFICIENT_CONTEXT"; answer: null; citations: [] };

function record(value: unknown): value is Record<string, unknown> { return !!value && typeof value === "object" && !Array.isArray(value); }
function positive(value: unknown): value is number { return typeof value === "number" && Number.isSafeInteger(value) && value > 0; }
function conversation(value: unknown): Conversation {
  if (!record(value) || !positive(value.id) || (value.course_id !== null && !positive(value.course_id)) ||
    typeof value.title !== "string" || typeof value.created_at !== "string" || typeof value.updated_at !== "string") {
    throw new Error("The server returned an invalid conversation.");
  }
  return value as Conversation;
}
function upload(value: unknown): ConversationUpload {
  if (!record(value) || !positive(value.id) || value.course_id !== null || !positive(value.conversation_id) ||
    typeof value.name !== "string" || !["PENDING", "PROCESSING", "READY", "FAILED"].includes(String(value.status)) ||
    typeof value.created_at !== "string" || typeof value.updated_at !== "string" ||
    (value.status === "FAILED" ? !record(value.error) || typeof value.error.message !== "string" : value.error !== null)) {
    throw new Error("The server returned an invalid conversation upload.");
  }
  return value as ConversationUpload;
}
async function body(response: Response): Promise<unknown> {
  const value: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new DocumentRequestError(response.status, value);
  return value;
}
export async function listConversations(token: string, signal: AbortSignal) {
  const value = await body(await request("/conversations/", { signal, cache: "no-store" }, token));
  if (!Array.isArray(value)) throw new Error("The server returned an invalid conversation list.");
  return value.map(conversation);
}
export async function createCourseConversation(courseId: number, token: string, signal: AbortSignal) {
  return conversation(await body(await request("/conversations/", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ course_id: courseId }), signal,
  }, token)));
}
export async function listConversationUploads(id: number, token: string, signal: AbortSignal) {
  const value = await body(await request(`/conversations/${id}/documents/`, { signal, cache: "no-store" }, token));
  if (!Array.isArray(value)) throw new Error("The server returned an invalid upload list.");
  return value.map(upload);
}
export async function getConversationUpload(id: number, documentId: number, token: string, signal: AbortSignal) {
  return upload(await body(await request(`/conversations/${id}/documents/${documentId}/`, { signal, cache: "no-store" }, token)));
}
// XHR exposes real upload progress; the existing fetch client does not.
export function uploadConversationDocument(id: number, file: File, token: string, signal: AbortSignal, onProgress: (percent: number) => void): Promise<ConversationUpload> {
  if (!API_BASE_URL) return Promise.reject(new Error("VITE_API_BASE_URL is not configured"));
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const abort = () => xhr.abort();
    const cleanup = () => signal.removeEventListener("abort", abort);
    xhr.open("POST", `${API_BASE_URL}/conversations/${id}/documents/`);
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.upload.onprogress = (event) => { if (event.lengthComputable) onProgress(Math.round(100 * event.loaded / event.total)); };
    xhr.onload = () => {
      cleanup();
      let value: unknown;
      try { value = JSON.parse(xhr.responseText); } catch { value = null; }
      if (xhr.status < 200 || xhr.status >= 300) { reject(new DocumentRequestError(xhr.status, value)); return; }
      try { resolve(upload(value)); } catch (error) { reject(error); }
    };
    xhr.onerror = () => { cleanup(); reject(new Error("The upload could not be confirmed. Check the conversation before uploading again.")); };
    xhr.onabort = () => { cleanup(); reject(new DOMException("Upload cancelled", "AbortError")); };
    signal.addEventListener("abort", abort, { once: true });
    const form = new FormData(); form.append("file", file);
    xhr.send(form);
    if (signal.aborted) abort();
  });
}
export async function askConversationQuestion(id: number, question: string, documentIds: number[], token: string, signal: AbortSignal): Promise<QuestionResult> {
  const value = await body(await request(`/conversations/${id}/questions/`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question, document_ids: documentIds }), signal,
  }, token));
  if (!record(value)) throw new Error("The server returned an invalid answer.");
  if (value.status === "INSUFFICIENT_CONTEXT" && value.answer === null && Array.isArray(value.citations) && value.citations.length === 0) return value as QuestionResult;
  if (value.status === "ANSWERED" && typeof value.answer === "string" && value.answer.trim() && Array.isArray(value.citations) &&
    value.citations.length > 0 && value.citations.every((citation) => record(citation) && positive(citation.chunk_id) && positive(citation.document_id) && positive(citation.page_number) && typeof citation.excerpt === "string")) return value as QuestionResult;
  throw new Error("The server returned an invalid answer.");
}
