import type { ConversationMessage, QuestionCitation, ToolTraceEntry } from "../../api/conversations";
import type { ChatCitation, ChatMessage, ChatToolUse } from "../../types/chat";

// The backend saves this reply with empty text; live and reloaded replies read the same.
export const NO_CONTEXT_TEXT = "I couldn’t find enough information in the selected references to answer that question.";

function plural(count: number, word: string) { return `${count} ${word}${count === 1 ? "" : "s"}`; }

// PDF pages and PPTX slides are real locations. A DOCX page number is an internal
// value (always 1), never shown as a page.
export function citationView(item: QuestionCitation): ChatCitation {
  const location = item.source_format === "pdf" ? `Page ${item.page_number}` :
    item.source_format === "pptx" ? `Slide ${item.page_number}` : null;
  const name = item.document_name ?? "Source";
  return {
    id: `${item.chunk_id}:${item.document_id}`,
    label: !item.available ? "Source no longer available" : location ? `${name} · ${location}` : name,
    detail: item.excerpt,
    source: { documentId: item.document_id, name: item.document_name, format: item.source_format, page: item.page_number, available: item.available },
  };
}

// One entry per search that actually ran; unknown tools are skipped, not guessed at.
export function toolUses(trace: ToolTraceEntry[]): ChatToolUse[] {
  return trace.flatMap((entry, index) => {
    if (entry.tool !== "search_sources") return [];
    const course = entry.sources?.course_materials;
    const uploads = entry.sources?.chat_uploads;
    const summary = course && uploads ? "Searched course materials and your uploads" :
      course ? "Searched course materials" : uploads ? "Searched your uploads" : "Searched your sources";
    const details = [
      ...(course ? [`${plural(course.documents_searched, "course material")} · ${plural(course.passages_used, "passage")} used`] : []),
      ...(uploads ? [`${plural(uploads.documents_searched, "upload")} · ${plural(uploads.passages_used, "passage")} used`] : []),
    ];
    return [{ id: `${entry.tool}-${index}`, summary, details }];
  });
}

export function toChatMessage(item: ConversationMessage): ChatMessage {
  if (item.role === "user") {
    return {
      id: `message-${item.id}`, serverId: item.id, role: "user", text: item.content,
      ...(item.status === "FAILED" ? { state: "failed" as const } : item.status === "PENDING" ? { state: "pending" as const } : {}),
    };
  }
  return {
    id: `message-${item.id}`, serverId: item.id, role: "assistant",
    text: item.status === "INSUFFICIENT_CONTEXT" ? NO_CONTEXT_TEXT : item.content,
    citations: item.citations.map(citationView), tools: toolUses(item.tool_trace),
  };
}

// Replace one message (a local "sending" bubble or a saved question) in place with
// saved messages, so a retried older question keeps its position in the thread.
export function replaceMessage(list: ChatMessage[], match: (message: ChatMessage) => boolean, saved: ConversationMessage[]) {
  const next = saved.map(toChatMessage);
  const savedIds = new Set(next.map((item) => item.id));
  const rest = list.filter((item) => !savedIds.has(item.id) || match(item));
  const index = rest.findIndex(match);
  return index === -1 ? [...rest, ...next] : [...rest.slice(0, index), ...next, ...rest.slice(index + 1)];
}
