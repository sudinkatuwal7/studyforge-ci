import { afterEach, expect, it, vi } from "vitest";
import { askConversationQuestion, createCourseConversation, getConversationUpload, listConversationUploads, listConversations, uploadConversationDocument } from "./conversations";

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

it("sends the exact SCRUM-76 question payload and preserves validated citation metadata", async () => {
  const answer = { status: "ANSWERED", answer: "Cells divide.", citations: [{ chunk_id: 5, document_id: 13, page_number: 2, excerpt: "Cells divide." }] };
  const fetch = vi.fn().mockResolvedValueOnce(Response.json(answer))
    .mockResolvedValueOnce(Response.json({ status: "INSUFFICIENT_CONTEXT", answer: null, citations: [] }));
  vi.stubGlobal("fetch", fetch);
  const signal = new AbortController().signal;
  expect(await askConversationQuestion(9, "Explain", [13], "token", signal)).toEqual(answer);
  expect(fetch.mock.calls[0][0]).toBe("http://api.test/api/v1/conversations/9/questions/");
  expect(fetch.mock.calls[0][1].body).toBe(JSON.stringify({ question: "Explain", document_ids: [13] }));
  expect((await askConversationQuestion(9, "Unknown", [13], "token", signal)).status).toBe("INSUFFICIENT_CONTEXT");
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
