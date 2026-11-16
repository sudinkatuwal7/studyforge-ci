import { useState } from "react";
import type { ChatThread, ChatThreadsProps } from "../../types/chat";

function threadTitle(thread: ChatThread) { return thread.title.trim() || "New chat"; }

function activity(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" :
    date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

// The course's Pandu chats: start, switch and delete (with an inline confirmation).
export default function ChatThreads({ items, activeId, loading, error, creating, deletingId, onSelect, onCreate, onDelete, onRetry }: ChatThreadsProps) {
  const [confirming, setConfirming] = useState<number | null>(null);
  const active = items.find((thread) => thread.id === activeId);
  return <details className="chat-threads">
    <summary>Chats · {active ? threadTitle(active) : loading ? "Loading…" : "None"}</summary>
    <div className="chat-thread-panel">
      <button type="button" className="chat-thread-new" disabled={creating || loading} onClick={onCreate}>{creating ? "Starting a chat…" : "+ New chat"}</button>
      {loading && <p role="status">Loading chats…</p>}
      {error && <div role="alert" className="chat-thread-error"><p>{error}</p>{onRetry && <button type="button" onClick={onRetry}>Try again</button>}</div>}
      {!loading && !items.length && <p>No chats yet.</p>}
      <ul aria-label="Chats">
        {items.map((thread) => {
          const title = threadTitle(thread);
          const deleting = deletingId === thread.id;
          return <li key={thread.id} className={thread.id === activeId ? "chat-thread chat-thread-active" : "chat-thread"}>
            {confirming === thread.id ? <div role="group" aria-label={`Delete ${title}?`} className="chat-thread-confirm">
              <span>Delete this chat and its messages?</span>
              <button type="button" className="chat-thread-delete-confirm" onClick={() => { setConfirming(null); onDelete(thread.id); }}>Delete</button>
              <button type="button" autoFocus onClick={() => setConfirming(null)}>Cancel</button>
            </div> : <>
              <button type="button" className="chat-thread-select" aria-current={thread.id === activeId ? "true" : undefined}
                disabled={deleting} onClick={() => onSelect(thread.id)}>
                <span>{title}</span><small>{activity(thread.updatedAt)}</small>
              </button>
              <button type="button" className="chat-thread-delete" aria-label={`Delete chat ${title}`}
                disabled={deletingId !== null && deletingId !== undefined} onClick={() => setConfirming(thread.id)}>
                {deleting ? "Deleting…" : "Delete"}
              </button>
            </>}
          </li>;
        })}
      </ul>
    </div>
  </details>;
}
