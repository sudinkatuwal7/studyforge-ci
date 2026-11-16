import { afterEach, expect, it, vi } from "vitest";
import {
  QuestionRequestError, askConversationQuestion, createCourseConversation, deleteConversation, deleteConversationUpload,
  getConversationUpload, listConversationMessages, listConversationUploads, listConversations, retryConversationQuestion, uploadConversationDocument,
} from "./conversations";
import { DocumentRequestError } from "./documents";
import { fetchSourceFile } from "./sourceFiles";

const conversation = { id: 9, course_id: 42, title: "", created_at: "2026-10-01", updated_at: "2026-10-01" };
const upload = { id: 13, course_id: null, conversation_id: 9, name: "Notes.docx", status: "PENDING", error: null, created_at: "2026-10-01", updated_at: "2026-10-01" };
afterEach(() => vi.unstubAllGlobals());

it("uses the existing course conversation, upload list, and status endpoints", async () => {
  const fetch = vi.fn().mockResolvedValueOnce(Response.json([conversation]))
    .mockResolvedValueOnce(Response.json(conversation)).mockResolvedValueOnce(Response.json([upload]))
    .mockResolvedValueOnce(Response.json({ ...upload, status: "READY" }));
  vi.stubGlobal("fetch", fetch);
  const signal = new AbortController().signal;
  expect(await listConversations("token", signal)).toEqual([conversation]);
  expect(await createCourseConversation(42, "token", signal)).toEqual(conversation);
  expect(await listConversationUploads(9, "token", signal)).toEqual([upload]);
  expect((await getConversationUpload(9, 13, "token", signal)).status).toBe("READY");
  expect(fetch.mock.calls.map(([url]) => url)).toEqual([
    "http://api.test/api/v1/conversations/", "http://api.test/api/v1/conversations/",
    "http://api.test/api/v1/conversations/9/documents/", "http://api.test/api/v1/conversations/9/documents/13/",
  ]);
  expect(fetch.mock.calls[1][1].body).toBe(JSON.stringify({ course_id: 42 }));
  expect(new Headers(fetch.mock.calls[2][1].headers).get("Authorization")).toBe("Bearer token");
});

const cited = { chunk_id: 5, document_id: 13, page_number: 2, excerpt: "Cells divide.", document_name: "Lecture", source_format: "pdf", available: true };
const trace = [{ tool: "search_sources", sources: { course_materials: { documents_searched: 1, passages_used: 1 } } }];
const question = { id: 31, role: "user", status: "ANSWERED", content: "Explain", citations: [], tool_trace: [], reply_to: null, created_at: "2026-11-16" };
const reply = { id: 32, role: "assistant", status: "ANSWERED", content: "Cells divide.", citations: [cited], tool_trace: trace, reply_to: 31, created_at: "2026-11-16" };
const answered = { status: "ANSWERED", answer: "Cells divide.", citations: [cited], tool_trace: trace, question, reply };

it("sends the exact SCRUM-76 question payload and returns the saved question, reply, citations and trace", async () => {
  const noContextReply = { ...reply, status: "INSUFFICIENT_CONTEXT", content: "", citations: [], tool_trace: trace };
  const fetch = vi.fn().mockResolvedValueOnce(Response.json(answered))
    .mockResolvedValueOnce(Response.json({ status: "INSUFFICIENT_CONTEXT", answer: null, citations: [], tool_trace: trace, question, reply: noContextReply }));
  vi.stubGlobal("fetch", fetch);
  const signal = new AbortController().signal;
  expect(await askConversationQuestion(9, "Explain", [13], "token", signal)).toEqual(answered);
  expect(fetch.mock.calls[0][0]).toBe("http://api.test/api/v1/conversations/9/questions/");
  expect(fetch.mock.calls[0][1].body).toBe(JSON.stringify({ question: "Explain", document_ids: [13] }));
  expect((await askConversationQuestion(9, "Unknown", [13], "token", signal)).status).toBe("INSUFFICIENT_CONTEXT");
});

it("accepts an answered response without citations", async () => {
  const uncited = { ...answered, citations: [], reply: { ...reply, citations: [] } };
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(uncited)));
  expect(await askConversationQuestion(9, "Explain", [13], "token", new AbortController().signal)).toEqual(uncited);
});

it("rejects answers whose saved messages do not belong together or whose citations are malformed", async () => {
  for (const bad of [
    { ...answered, reply: { ...reply, reply_to: 99 } },
    { ...answered, citations: [{ ...cited, source_format: "txt" }] },
    { ...answered, citations: [{ ...cited, available: "yes" }] },
    { ...answered, question: { ...question, role: "assistant" } },
  ]) {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(bad)));
    await expect(askConversationQuestion(9, "Explain", [13], "token", new AbortController().signal)).rejects.toThrow("invalid");
  }
});

it("keeps the saved failed question from a 503 so it can be retried", async () => {
  const failed = { ...question, status: "FAILED" };
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ code: "RAG_GENERATION_FAILED", detail: "Try again.", question: failed }, { status: 503 })));
  const error = await askConversationQuestion(9, "Explain", [13], "token", new AbortController().signal).catch((cause: unknown) => cause);
  expect(error).toBeInstanceOf(QuestionRequestError);
  expect((error as QuestionRequestError).status).toBe(503);
  expect((error as QuestionRequestError).message).toBe("Try again.");
  expect((error as QuestionRequestError).question).toEqual(failed);
});

it("retries a saved question by id, loads history, and deletes threads and uploads", async () => {
  const fetch = vi.fn().mockResolvedValueOnce(Response.json(answered)).mockResolvedValueOnce(Response.json([question, reply]))
    .mockResolvedValueOnce(new Response(null, { status: 204 })).mockResolvedValueOnce(new Response(null, { status: 204 }));
  vi.stubGlobal("fetch", fetch);
  const signal = new AbortController().signal;
  expect((await retryConversationQuestion(9, 31, [13], "token", signal)).reply.id).toBe(32);
  expect(await listConversationMessages(9, "token", signal)).toEqual([question, reply]);
  await deleteConversation(9, "token", signal);
  await deleteConversationUpload(9, 13, "token", signal);
  expect(fetch.mock.calls.map(([url, init]) => [url, init.method ?? "GET"])).toEqual([
    ["http://api.test/api/v1/conversations/9/messages/31/retry/", "POST"],
    ["http://api.test/api/v1/conversations/9/messages/", "GET"],
    ["http://api.test/api/v1/conversations/9/", "DELETE"],
    ["http://api.test/api/v1/conversations/9/documents/13/", "DELETE"],
  ]);
  // A retry sends only the sources; the server re-asks the saved text.
  expect(fetch.mock.calls[0][1].body).toBe(JSON.stringify({ document_ids: [13] }));
});

it("reports a failed deletion with the server's status instead of pretending it worked", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ code: "RESOURCE_NOT_FOUND", message: "Resource not found." }, { status: 404 })));
  const error = await deleteConversation(9, "token", new AbortController().signal).catch((cause: unknown) => cause);
  expect(error).toBeInstanceOf(DocumentRequestError);
  expect((error as DocumentRequestError).status).toBe(404);
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 200 })));
  await expect(deleteConversationUpload(9, 13, "token", new AbortController().signal)).rejects.toThrow("could not be confirmed");
});

it("fetches a source file with the bearer token", async () => {
  const fetch = vi.fn().mockResolvedValueOnce(new Response("%PDF", { status: 200 }))
    .mockResolvedValueOnce(Response.json({ code: "RESOURCE_NOT_FOUND", message: "Resource not found." }, { status: 404 }));
  vi.stubGlobal("fetch", fetch);
  expect(await (await fetchSourceFile(13, "token")).text()).toBe("%PDF");
  expect(fetch.mock.calls[0][0]).toBe("http://api.test/api/v1/documents/13/file/");
  expect(new Headers(fetch.mock.calls[0][1].headers).get("Authorization")).toBe("Bearer token");
  await expect(fetchSourceFile(14, "token")).rejects.toMatchObject({ status: 404 });
});

it("reports measured upload progress and returns a conversation-scoped document", async () => {
  class FakeXHR {
    upload: { onprogress?: (event: ProgressEvent) => void } = {};
    onload?: () => void;
    onerror?: () => void;
    onabort?: () => void;
    status = 201;
    responseText = JSON.stringify(upload);
    open = vi.fn(); setRequestHeader = vi.fn();
    send = vi.fn(() => { this.upload.onprogress?.({ lengthComputable: true, loaded: 5, total: 10 } as ProgressEvent); this.onload?.(); });
    abort = vi.fn(() => this.onabort?.());
  }
  const instances: FakeXHR[] = [];
  class StubXHR extends FakeXHR { constructor() { super(); instances.push(this); } }
  vi.stubGlobal("XMLHttpRequest", StubXHR);
  const progress = vi.fn();
  expect(await uploadConversationDocument(9, new File(["content"], "Notes.docx"), "token", new AbortController().signal, progress)).toEqual(upload);
  const xhr = instances[0];
  expect(xhr.open).toHaveBeenCalledWith("POST", "http://api.test/api/v1/conversations/9/documents/");
  expect(xhr.setRequestHeader).toHaveBeenCalledWith("Authorization", "Bearer token");
  expect(progress).toHaveBeenCalledWith(50);
});
