import { useEffect, useId, useRef, useState } from "react";
import type { ChatMessage, CourseChatProps } from "../../types/chat";
import ChatThreads from "./ChatThreads";
import { reconcileSelection, selectAllReferences, selectedDocumentIds, toggleReference } from "./chatReferences";

function PanduLogo({ size }: { size: "small" | "large" }) {
  return (
    <img
      className={`pandu-avatar pandu-avatar-${size}`}
      src={`${import.meta.env.BASE_URL}images/StudyForge.png`}
      alt=""
    />
  );
}

type MessageActions = { onRetryMessage?: CourseChatProps["onRetryMessage"]; onReloadHistory?: CourseChatProps["onReloadHistory"]; busy?: boolean };

export function ChatMessageView({ message, onCitation, streaming = false, onRetryMessage, onReloadHistory, busy }: { message: ChatMessage; onCitation: CourseChatProps["onCitation"]; streaming?: boolean } & MessageActions) {
  return <article className={`chat-message chat-message-${message.role}`} aria-busy={streaming || message.state === "sending"}>
    <strong>{message.role === "user" ? "You" : "Pandu"}</strong>
    <p>{message.text}{streaming && <span className="chat-streaming-cursor" aria-hidden="true" />}</p>
    {message.state === "failed" && <div className="chat-message-state">
      <span>Pandu didn’t answer this question.</span>
      {onRetryMessage && message.serverId !== undefined && <button type="button" disabled={busy} onClick={() => onRetryMessage(message)}>Retry</button>}
    </div>}
    {message.state === "pending" && <div className="chat-message-state">
      <span>Pandu is still answering…</span>
      {onReloadHistory && <button type="button" onClick={onReloadHistory}>Check again</button>}
    </div>}
    {!!message.tools?.length && <details className="chat-tools">
      <summary>{message.tools.map((tool) => tool.summary).join(" · ")}</summary>
      <ul>{message.tools.flatMap((tool) => tool.details.map((detail) => <li key={`${tool.id}:${detail}`}>{detail}</li>))}</ul>
    </details>}
    {!!message.citations?.length && <ul className="chat-citations" aria-label="Sources for this answer">
      {message.citations.map((citation) => <li key={citation.id}>
        <button type="button" className="chat-citation" onClick={() => onCitation(citation)}>{citation.label}</button>
        {citation.detail && <details className="chat-citation-excerpt"><summary>Excerpt</summary><q>{citation.detail}</q></details>}
      </li>)}
    </ul>}
  </article>;
}

type UploadDeletion = Pick<CourseChatProps, "onDeleteUpload" | "deletingUploadId" | "uploadDeleteError">;

export function ReferencePicker({ references, selectedReferences, onReferencesChange, onAddDocuments, uploading, uploadProgress, uploadError, loadingReferences, referenceError, onRetryReferences, uploadStatusViews, chatReady, onDeleteUpload, deletingUploadId, uploadDeleteError }: Pick<CourseChatProps, "references" | "selectedReferences" | "onReferencesChange" | "onAddDocuments" | "uploading" | "uploadProgress" | "uploadError" | "loadingReferences" | "referenceError" | "onRetryReferences" | "uploadStatusViews" | "chatReady"> & UploadDeletion) {
  const input = useRef<HTMLInputElement>(null);
  const [confirming, setConfirming] = useState<number | null>(null);
  const selected = reconcileSelection(references, selectedReferences);
  return <details className="chat-references">
    <summary>Sources · {selected.length} selected</summary>
    <div className="reference-options">
      {loadingReferences && <p role="status">Loading conversation uploads...</p>}
      {referenceError && <div role="alert">{referenceError} {onRetryReferences && <button type="button" onClick={onRetryReferences}>Retry references</button>}</div>}
      <div className="reference-actions"><button type="button" disabled={!references.some((item) => item.available)} onClick={() => onReferencesChange(selectAllReferences(references, selected))}>Select all READY</button><button type="button" disabled={!selected.length} onClick={() => onReferencesChange([])}>Clear selection</button></div>
      {(["course", "upload"] as const).map((source) => <fieldset key={source}>
        <legend>{source === "course" ? "Course Materials" : "Conversation Uploads"}</legend>
        {!references.some((item) => item.source === source) && <p>No documents yet.</p>}
        {references.filter((item) => item.source === source).map((item) => <div key={item.id} className="reference-item">
          <label>
            <input type="checkbox" disabled={!item.available || (!selected.includes(item.id) && selected.length >= 20)} checked={selected.includes(item.id)} onChange={() => onReferencesChange(toggleReference(references, selected, item.id))} />
            <span>{item.name}<small>{item.detail}{!item.available && " · Unavailable"}</small></span>
          </label>
          {source === "upload" && onDeleteUpload && (confirming === item.documentId ?
            <div role="group" aria-label={`Delete ${item.name}?`} className="reference-delete-confirm">
              <span>Delete this upload?</span>
              <button type="button" onClick={() => { setConfirming(null); onDeleteUpload(item.documentId); }}>Delete</button>
              <button type="button" autoFocus onClick={() => setConfirming(null)}>Cancel</button>
            </div> :
            <button type="button" className="reference-delete" aria-label={`Delete upload ${item.name}`}
              disabled={deletingUploadId !== null && deletingUploadId !== undefined} onClick={() => setConfirming(item.documentId)}>
              {deletingUploadId === item.documentId ? "Deleting…" : "Delete"}
            </button>)}
        </div>)}
      </fieldset>)}
      {uploadDeleteError && <p className="document-error" role="alert">{uploadDeleteError}</p>}
      {uploadStatusViews}
      <input ref={input} type="file" accept=".pdf,.docx,.pptx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.presentationml.presentation" hidden aria-label="Add documents to Pandu" onChange={(event) => {
        onAddDocuments(Array.from(event.target.files ?? [])); event.target.value = "";
      }} />
      <button className="reference-upload" type="button" disabled={uploading || chatReady === false} onClick={() => input.current?.click()}>+ Add conversation upload</button>
      {uploading && <div role="status">Uploading {uploadProgress === null || uploadProgress === undefined ? "..." : `${uploadProgress}%`}<progress value={uploadProgress ?? undefined} max={100} /></div>}
      {uploadError && <p className="document-error" role="alert">{uploadError}</p>}
    </div>
  </details>;
}

export default function CourseChat(props: CourseChatProps) {
  const [draft, setDraft] = useState("");
  const inputId = useId();
  const log = useRef<HTMLDivElement>(null);
  const busy = props.status === "sending" || props.status === "streaming";
  const documentIds = selectedDocumentIds(props.references, props.selectedReferences);
  const lastAssistantId = [...props.messages].reverse().find((message) => message.role === "assistant")?.id;
  // With saved history, there may be no chat at all (all deleted) or one still loading.
  const noThread = !!props.threads && props.threads.activeId === null && !props.threads.loading;
  const showWelcome = !props.messages.length && !noThread && !props.historyLoading && !props.historyError;
  useEffect(() => { if (log.current) log.current.scrollTop = log.current.scrollHeight; }, [props.messages, props.status]);
  function send() {
    if (!draft.trim() || busy || !documentIds.length || props.chatReady === false) return;
    props.onSend(draft.trim(), documentIds); setDraft("");
  }
  const prompts = ["Summarize selected materials", "Explain a concept", "Generate practice questions"];
  return <aside className="course-chat" aria-label="Pandu course chat" aria-busy={busy} data-course-id={props.courseId}>
    <header className="chat-header">
      <PanduLogo size="small" />
      <div><h3>Pandu</h3><p>Your study partner</p></div>
      {props.demo && <span className="chat-demo-badge">Demo</span>}
    </header>
    {props.threads && <ChatThreads {...props.threads} />}
    <div ref={log} className="chat-messages" role="log" aria-label="Messages with Pandu" aria-live="polite">
      {props.historyLoading && !props.messages.length && <p className="chat-history-status" role="status">Loading this chat…</p>}
      {props.historyError && <div className="chat-history-status" role="alert"><p>{props.historyError}</p>
        {props.onReloadHistory && <button type="button" onClick={props.onReloadHistory}>Try again</button>}</div>}
      {noThread && <div className="chat-empty">
        <PanduLogo size="large" />
        <h4>No chats yet</h4>
        <p>Start a chat to ask Pandu about your course materials.</p>
        <div className="chat-prompts"><button type="button" disabled={props.threads?.creating} onClick={props.threads?.onCreate}>Start a new chat</button></div>
      </div>}
      {showWelcome && <div className="chat-empty">
        <PanduLogo size="large" />
        <h4>Hi! I’m Pandu.</h4>
        <p>Ask me questions about your course materials.</p>
        <div className="chat-prompts" role="group" aria-label="Suggested prompts">
          {prompts.map((prompt) => <button type="button" key={prompt} disabled={busy} onClick={() => setDraft(prompt)}>{prompt}</button>)}
        </div>
        {props.demo && <small>Demo replies and citations are samples.</small>}
      </div>}
      {props.messages.map((message) => <ChatMessageView key={message.id} message={message} onCitation={props.onCitation} streaming={props.status === "streaming" && message.id === lastAssistantId}
        onRetryMessage={props.onRetryMessage} onReloadHistory={props.onReloadHistory} busy={busy || props.chatReady === false} />)}
      {props.status === "sending" && <div className="chat-streaming-status" role="status"><p>{props.demo ? "Pandu is preparing a demo reply…" : "Sending your message to Pandu…"}</p>{props.onStop && <button type="button" onClick={props.onStop}>Stop response</button>}</div>}
      {props.status === "streaming" && <div className="chat-streaming-status" role="status"><p>Pandu is responding…</p>{props.onStop && <button type="button" onClick={props.onStop}>Stop response</button>}</div>}
      {props.status === "error" && <div role="alert"><p>{props.error || "Pandu could not send a reply."}</p>{props.onRetry && <button type="button" onClick={props.onRetry}>Retry with Pandu</button>}</div>}
    </div>
    {props.notice && <div className="chat-notice" role="alert"><p>{props.notice}</p>{props.onDismissNotice && <button type="button" onClick={props.onDismissNotice}>Dismiss</button>}</div>}
    <ReferencePicker {...props} />
    <form className="chat-composer" onSubmit={(event) => { event.preventDefault(); send(); }}>
      <label className="chat-composer-label" htmlFor={inputId}>Message Pandu</label>
      <textarea id={inputId} rows={1} value={draft} placeholder="Ask Pandu a question…" onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => {
        if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); send(); }
      }} />
      <button className="chat-send" aria-label={props.demo ? "Send to Pandu (demo)" : "Send to Pandu"} disabled={!draft.trim() || busy || !documentIds.length || props.chatReady === false} type="submit">↑</button>
    </form>
  </aside>;
}
