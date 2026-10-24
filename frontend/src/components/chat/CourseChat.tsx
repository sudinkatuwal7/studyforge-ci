import { useEffect, useId, useRef, useState } from "react";
import type { ChatMessage, CourseChatProps } from "../../types/chat";
import { selectedCourseDocumentIds } from "./chatReferences";

export function ChatMessageView({ message, onCitation, streaming = false }: { message: ChatMessage; onCitation: CourseChatProps["onCitation"]; streaming?: boolean }) {
  return <article className={`chat-message chat-message-${message.role}`} aria-busy={streaming}>
    <strong>{message.role === "user" ? "You" : "Pandu"}</strong>
    <p>{message.text}{streaming && <span className="chat-streaming-cursor" aria-hidden="true" />}</p>
    {message.citations?.map((citation) => <button type="button" className="chat-citation" key={citation.id} onClick={() => onCitation(citation)}>{citation.label}</button>)}
  </article>;
}

export function ReferencePicker({ references, selectedReferences, onReferencesChange, onAddDocuments }: Pick<CourseChatProps, "references" | "selectedReferences" | "onReferencesChange" | "onAddDocuments">) {
  const input = useRef<HTMLInputElement>(null);
  return <details className="chat-references">
    <summary>Sources · {selectedReferences.length} selected</summary>
    <div className="reference-options">
      {/* Keep permanent course sources separate from temporary Pandu attachments. */}
      {(["course", "upload"] as const).map((source) => <fieldset key={source}>
        <legend>{source === "course" ? "Course materials" : "Pandu chat uploads"}</legend>
        {!references.some((item) => item.source === source) && <p>No documents yet.</p>}
        {references.filter((item) => item.source === source).map((item) => <label key={item.id}>
          <input type="checkbox" disabled={!item.available} checked={item.available && selectedReferences.includes(item.id)} onChange={(event) => onReferencesChange(event.target.checked ? [...selectedReferences, item.id] : selectedReferences.filter((id) => id !== item.id))} />
          <span>{item.name}<small>{item.detail}{!item.available && " · Unavailable"}</small></span>
        </label>)}
      </fieldset>)}
      {/* A styled button activates this native input for keyboard and file-picker support. */}
      <input ref={input} type="file" accept=".pdf,application/pdf" multiple hidden aria-label="Add documents to Pandu" onChange={(event) => {
        onAddDocuments(Array.from(event.target.files ?? [])); event.target.value = "";
      }} />
      <button type="button" onClick={() => input.current?.click()}>+ Add documents</button>
    </div>
  </details>;
}

export default function CourseChat(props: CourseChatProps) {
  const [draft, setDraft] = useState("");
  const inputId = useId();
  const log = useRef<HTMLDivElement>(null);
  const busy = props.status === "sending" || props.status === "streaming";
  const lastAssistantId = [...props.messages].reverse().find((message) => message.role === "assistant")?.id;
  // Reveal the latest message or status whenever the conversation changes.
  useEffect(() => { if (log.current) log.current.scrollTop = log.current.scrollHeight; }, [props.messages, props.status]);
  function send() {
    // Keep one Pandu request active at a time while sending or streaming.
    if (!draft.trim() || busy) return;
    // Send real backend document IDs rather than presentation-only reference IDs.
    const documentIds = selectedCourseDocumentIds(props.references, props.selectedReferences);
    props.onSend(draft.trim(), documentIds); setDraft("");
  }
  const prompts = ["Summarize selected materials", "Explain a concept", "Generate practice questions"];
  return <aside className="course-chat" aria-label="Pandu course chat" aria-busy={busy} data-course-id={props.courseId}>
    <header className="chat-header">
      {/* Replace this neutral mark with the panda asset when it is available. */}
      <span className="pandu-avatar pandu-avatar-small" aria-hidden="true">✦</span>
      <div><h3>Pandu</h3><p>Your study partner</p></div>
      {props.demo && <span className="chat-demo-badge">Demo</span>}
    </header>
    <div ref={log} className="chat-messages" role="log" aria-label="Messages with Pandu" aria-live="polite">
      {!props.messages.length && <div className="chat-empty">
        <span className="pandu-avatar pandu-avatar-large" aria-hidden="true">✦</span>
        <h4>Hi! I’m Pandu.</h4>
        <p>Ask me questions about your course materials.</p>
        <div className="chat-prompts" role="group" aria-label="Suggested prompts">
          {prompts.map((prompt) => <button type="button" key={prompt} disabled={busy} onClick={() => setDraft(prompt)}>{prompt}</button>)}
        </div>
        {props.demo && <small>Demo replies and citations are samples.</small>}
      </div>}
      {props.messages.map((message) => <ChatMessageView key={message.id} message={message} onCitation={props.onCitation} streaming={props.status === "streaming" && message.id === lastAssistantId} />)}
      {props.status === "sending" && <div className="chat-streaming-status" role="status">
        <p>{props.demo ? "Pandu is preparing a demo reply…" : "Sending your message to Pandu…"}</p>
        {props.onStop && <button type="button" onClick={props.onStop}>Stop response</button>}
      </div>}
      {props.status === "streaming" && <div className="chat-streaming-status" role="status">
        <p>Pandu is responding…</p>
        {props.onStop && <button type="button" onClick={props.onStop}>Stop response</button>}
      </div>}
      {props.status === "error" && <div role="alert"><p>{props.error || "Pandu could not send a reply."}</p><button type="button" onClick={props.onRetry}>Retry with Pandu</button></div>}
    </div>
    <ReferencePicker {...props} />
    <form className="chat-composer" onSubmit={(event) => { event.preventDefault(); send(); }}>
      <label className="chat-composer-label" htmlFor={inputId}>Message Pandu</label>
      <textarea id={inputId} rows={1} value={draft} placeholder="Ask Pandu a question…" onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => {
        // Enter sends; Shift+Enter keeps the expected multiline behavior.
        if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); send(); }
      }} />
      <button className="chat-send" aria-label={props.demo ? "Send to Pandu (demo)" : "Send to Pandu"} disabled={!draft.trim() || busy} type="submit">↑</button>
    </form>
  </aside>;
}
