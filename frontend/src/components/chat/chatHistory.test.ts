import { expect, it } from "vitest";
import type { ConversationMessage, QuestionCitation } from "../../api/conversations";
import { NO_CONTEXT_TEXT, citationView, replaceMessage, toChatMessage, toolUses } from "./chatHistory";

const base: ConversationMessage = { id: 1, role: "user", status: "ANSWERED", content: "Q", citations: [], tool_trace: [], reply_to: null, created_at: "2026-11-16" };
const cite = (changes: Partial<QuestionCitation>): QuestionCitation => ({
  chunk_id: 5, document_id: 13, page_number: 4, excerpt: "Evidence", document_name: "Lecture 3", source_format: "pdf", available: true, ...changes,
});

it("labels PDF pages and PPTX slides, never a DOCX page, and hides unavailable names", () => {
  expect(citationView(cite({})).label).toBe("Lecture 3 · Page 4");
  expect(citationView(cite({ source_format: "pptx", document_name: "Week 2" })).label).toBe("Week 2 · Slide 4");
  expect(citationView(cite({ source_format: "docx", document_name: "Reading", page_number: 1 })).label).toBe("Reading");
  const gone = citationView(cite({ available: false, document_name: null, source_format: null }));
  expect(gone.label).toBe("Source no longer available");
  expect(gone.source).toEqual({ documentId: 13, name: null, format: null, page: 4, available: false });
  expect(gone.detail).toBe("Evidence");
});

it("describes the one search that ran, by source kind, and skips unknown or empty traces", () => {
  expect(toolUses([])).toEqual([]);
  expect(toolUses([{ tool: "future_tool" }])).toEqual([]);
  expect(toolUses([{ tool: "search_sources", sources: {
    course_materials: { documents_searched: 2, passages_used: 3 }, chat_uploads: { documents_searched: 1, passages_used: 0 },
  } }])).toEqual([{ id: "search_sources-0", summary: "Searched course materials and your uploads",
    details: ["2 course materials · 3 passages used", "1 upload · 0 passages used"] }]);
  expect(toolUses([{ tool: "search_sources", sources: { chat_uploads: { documents_searched: 1, passages_used: 1 } } }])[0])
    .toMatchObject({ summary: "Searched your uploads", details: ["1 upload · 1 passage used"] });
});

it("maps saved questions and replies, supplying the no-context sentence and question states", () => {
  expect(toChatMessage({ ...base, status: "FAILED" })).toMatchObject({ serverId: 1, role: "user", state: "failed" });
  expect(toChatMessage({ ...base, status: "PENDING" }).state).toBe("pending");
  expect(toChatMessage(base).state).toBeUndefined();
  const empty = toChatMessage({ ...base, id: 2, role: "assistant", status: "INSUFFICIENT_CONTEXT", content: "", reply_to: 1 });
  expect(empty).toMatchObject({ text: NO_CONTEXT_TEXT, citations: [], tools: [] });
});

it("replaces a message in place and does not duplicate saved messages already shown", () => {
  const list = [toChatMessage({ ...base, id: 1, status: "FAILED" }), toChatMessage({ ...base, id: 5, content: "Later" })];
  const reply: ConversationMessage = { ...base, id: 9, role: "assistant", content: "A", reply_to: 1 };
  const next = replaceMessage(list, (item) => item.serverId === 1 && item.role === "user", [{ ...base, id: 1 }, reply]);
  expect(next.map((item) => item.id)).toEqual(["message-1", "message-9", "message-5"]);
  expect(next[0].state).toBeUndefined();
  // A reload may already show the saved question; it is not added twice.
  const reloaded = [toChatMessage({ ...base, id: 1, status: "PENDING" })];
  const local = [...reloaded, { id: "local-1", role: "user" as const, text: "Q", state: "sending" as const }];
  expect(replaceMessage(local, (item) => item.id === "local-1", [{ ...base, id: 1 }, reply]).map((item) => item.id)).toEqual(["message-1", "message-9"]);
});
