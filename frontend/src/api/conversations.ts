import { API_BASE_URL, request } from "./client";
import { DocumentRequestError } from "./documents";
import type { DocumentError, DocumentStatus } from "../types/document";

export type Conversation = { id: number; course_id: number | null; title: string; created_at: string; updated_at: string };
export type ConversationUpload = {
  id: number; course_id: null; conversation_id: number; name: string;
  status: DocumentStatus; created_at: string; updated_at: string; error: DocumentError | null;
};
export type SourceFormat = "pdf" | "docx" | "pptx";
// Saved citation plus the source as it is now; unavailable sources have null name and format.
export type QuestionCitation = {
  chunk_id: number; document_id: number; page_number: number; excerpt: string;
  document_name: string | null; source_format: SourceFormat | null; available: boolean;
};
export type SourceUse = { documents_searched: number; passages_used: number };
export type ToolTraceEntry = { tool: string; sources?: { course_materials?: SourceUse; chat_uploads?: SourceUse } };
export type ConversationMessage = {
  id: number; role: "user" | "assistant";
  status: "PENDING" | "ANSWERED" | "FAILED" | "INSUFFICIENT_CONTEXT";
  content: string; citations: QuestionCitation[]; tool_trace: ToolTraceEntry[];
  reply_to: number | null; created_at: string;
};
export type QuestionResult = ({ status: "ANSWERED"; answer: string } | { status: "INSUFFICIENT_CONTEXT"; answer: null }) &
  { citations: QuestionCitation[]; tool_trace: ToolTraceEntry[]; question: ConversationMessage; reply: ConversationMessage };

// A failed answer still saved the question; keep it so the UI can offer a retry.
export class QuestionRequestError extends DocumentRequestError {
  question: ConversationMessage | null;
  constructor(status: number, body: unknown) {
    super(status, body);
    this.name = "QuestionRequestError";
    let question: ConversationMessage | null = null;
    if (record(body) && body.question !== undefined) {
      try { question = message(body.question); } catch { question = null; }
    }
    this.question = question;
  }
}

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
const FORMATS = ["pdf", "docx", "pptx"];
function citation(value: unknown): QuestionCitation {
  if (!record(value) || !positive(value.chunk_id) || !positive(value.document_id) || !positive(value.page_number) ||
    typeof value.excerpt !== "string" || typeof value.available !== "boolean" ||
    (value.document_name !== null && typeof value.document_name !== "string") ||
    (value.source_format !== null && !FORMATS.includes(String(value.source_format)))) {
    throw new Error("The server returned an invalid citation.");
  }
  return value as QuestionCitation;
}
function sourceUse(value: unknown) {
  return record(value) && Number.isSafeInteger(value.documents_searched) && Number.isSafeInteger(value.passages_used);
}
function toolEntry(value: unknown): ToolTraceEntry {
  if (!record(value) || typeof value.tool !== "string" || (value.sources !== undefined &&
    (!record(value.sources) || !Object.values(value.sources).every(sourceUse)))) {
    throw new Error("The server returned an invalid tool trace.");
  }
  return value as ToolTraceEntry;
}
const QUESTION_STATUSES = ["PENDING", "ANSWERED", "FAILED"];
const REPLY_STATUSES = ["ANSWERED", "INSUFFICIENT_CONTEXT"];
function message(value: unknown): ConversationMessage {
  if (!record(value) || !positive(value.id) || typeof value.content !== "string" || typeof value.created_at !== "string" ||
    !Array.isArray(value.citations) || !Array.isArray(value.tool_trace) ||
    !(value.role === "user" ? QUESTION_STATUSES.includes(String(value.status)) && value.reply_to === null :
      value.role === "assistant" && REPLY_STATUSES.includes(String(value.status)) && positive(value.reply_to))) {
    throw new Error("The server returned an invalid message.");
  }
  return { ...(value as ConversationMessage), citations: value.citations.map(citation), tool_trace: value.tool_trace.map(toolEntry) };
}
async function body(response: Response): Promise<unknown> {
  const value: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new DocumentRequestError(response.status, value);
  return value;
}
async function deleted(response: Response) {
  if (!response.ok) throw new DocumentRequestError(response.status, await response.json().catch(() => null));
  if (response.status !== 204) throw new Error("Deletion could not be confirmed. Refresh and check again.");
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
async function answer(response: Response): Promise<QuestionResult> {
  const value: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new QuestionRequestError(response.status, value);
  if (!record(value) || !Array.isArray(value.citations) || !Array.isArray(value.tool_trace)) throw new Error("The server returned an invalid answer.");
  const question = message(value.question);
  const reply = message(value.reply);
  if (question.role !== "user" || reply.role !== "assistant" || reply.reply_to !== question.id) throw new Error("The server returned an invalid answer.");
  const citations = value.citations.map(citation);
  const toolTrace = value.tool_trace.map(toolEntry);
  if (value.status === "INSUFFICIENT_CONTEXT" && value.answer === null && citations.length === 0) {
    return { status: "INSUFFICIENT_CONTEXT", answer: null, citations, tool_trace: toolTrace, question, reply };
  }
  if (value.status === "ANSWERED" && typeof value.answer === "string" && value.answer.trim()) {
    return { status: "ANSWERED", answer: value.answer, citations, tool_trace: toolTrace, question, reply };
  }
  throw new Error("The server returned an invalid answer.");
}
export async function askConversationQuestion(id: number, question: string, documentIds: number[], token: string, signal: AbortSignal): Promise<QuestionResult> {
  return answer(await request(`/conversations/${id}/questions/`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question, document_ids: documentIds }), signal,
  }, token));
}
// Re-answers the same saved question; only the sources are sent.
export async function retryConversationQuestion(id: number, messageId: number, documentIds: number[], token: string, signal: AbortSignal): Promise<QuestionResult> {
  return answer(await request(`/conversations/${id}/messages/${messageId}/retry/`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ document_ids: documentIds }), signal,
  }, token));
}
export async function listConversationMessages(id: number, token: string, signal: AbortSignal) {
  const value = await body(await request(`/conversations/${id}/messages/`, { signal, cache: "no-store" }, token));
  if (!Array.isArray(value)) throw new Error("The server returned an invalid message list.");
  return value.map(message);
}
export async function deleteConversation(id: number, token: string, signal: AbortSignal) {
  await deleted(await request(`/conversations/${id}/`, { method: "DELETE", signal }, token));
}
export async function deleteConversationUpload(id: number, documentId: number, token: string, signal: AbortSignal) {
  await deleted(await request(`/conversations/${id}/documents/${documentId}/`, { method: "DELETE", signal }, token));
}
