import { useEffect, useId, useRef, useState, type SubmitEvent } from "react";
import { deleteDocument, DocumentRequestError, renameDocument } from "../../api/documents";
import type { StudyDocument, TrackedDocument } from "../../types/document";
import DocumentStatus from "./DocumentStatus";

type Props = {
  tracked: TrackedDocument; courseId: number; accessToken: string;
  onStatusChange?: (document: StudyDocument) => void;
  onRenamed: (document: TrackedDocument) => void; onDeleted: () => void;
};

export default function MaterialItem({ tracked, courseId, accessToken, onRenamed, onDeleted, onStatusChange }: Props) {
  const inputId = useId();
  const [mode, setMode] = useState<"view" | "rename" | "delete">("view");
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const [name, setName] = useState(tracked.name);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => { pending.current?.abort(); }, []);
  useEffect(() => {
    if (!menuOpen) return;
    function close(event: PointerEvent) {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  async function mutate(action: "rename" | "delete") {
    if (pending.current) return;
    const trimmed = name.trim();
    const hasControlCharacter = Array.from(trimmed).some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127);
    if (action === "rename" && (!trimmed || trimmed.length > 255 || hasControlCharacter)) {
      setError("Use a name of 1 to 255 characters without control characters."); return;
    }
    const controller = new AbortController();
    pending.current = controller; setBusy(true); setError(""); setNotice("");
    try {
      if (action === "rename") {
        const document = await renameDocument(tracked.id, trimmed, accessToken, controller.signal);
        if (controller.signal.aborted) return;
        if (document.id !== tracked.id || document.course_id !== courseId) throw new Error("Unexpected document.");
        onRenamed({ id: document.id, name: document.name, snapshot: document });
        // The existing poller's cleanup discards responses with the old name.
        setRevision((value) => value + 1); setMode("view"); setNotice("Material renamed.");
      } else {
        await deleteDocument(tracked.id, accessToken, controller.signal);
        if (!controller.signal.aborted) onDeleted();
      }
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause instanceof DocumentRequestError ? cause.message : "The material request could not be completed. Please try again.");
    } finally {
      if (!controller.signal.aborted) { pending.current = null; setBusy(false); }
    }
  }

  function cancel() { setMode("view"); setError(""); }
  function submit(event: SubmitEvent<HTMLFormElement>) { event.preventDefault(); void mutate("rename"); }

  return <article className="material-item" aria-label={tracked.name} aria-busy={busy}>
    <DocumentStatus key={revision} compact tracked={tracked} courseId={courseId} accessToken={accessToken} onStatusChange={onStatusChange} />
    <div className="material-row">
      <FileTypeIcon />
      <div className="material-copy">
        <h3>{tracked.name}</h3>
        <p className="material-meta">{fileType(tracked.name)}{tracked.sizeBytes != null ? ` · ${formatSize(tracked.sizeBytes)}` : ""}</p>
      </div>
      {tracked.snapshot?.status && <span className={`material-status material-status-${tracked.snapshot.status.toLowerCase()}`}>{tracked.snapshot.status}</span>}
      {tracked.snapshot && <time className="material-date" dateTime={tracked.snapshot.created_at}>{new Date(tracked.snapshot.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</time>}
      <div className="material-menu" ref={menuRef}>
        <button type="button" className="material-options" aria-label={`Options for ${tracked.name}`} aria-expanded={menuOpen} aria-haspopup="true" onClick={() => setMenuOpen((open) => !open)}>
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><circle cx="12" cy="5" r="1.6" fill="currentColor" /><circle cx="12" cy="12" r="1.6" fill="currentColor" /><circle cx="12" cy="19" r="1.6" fill="currentColor" /></svg>
        </button>
        {menuOpen && mode === "view" && <div className="material-menu-panel">
          <button type="button" onClick={() => { setName(tracked.name); setError(""); setNotice(""); setMenuOpen(false); setMode("rename"); }}>Rename</button>
          <button type="button" className="material-delete" onClick={() => { setError(""); setNotice(""); setMenuOpen(false); setMode("delete"); }}>Delete</button>
        </div>}
      </div>
    </div>
    {mode === "rename" && <form onSubmit={submit}>
      <label htmlFor={inputId}>Material name</label>
      <input id={inputId} value={name} maxLength={255} disabled={busy} onChange={(event) => setName(event.target.value)} autoFocus />
      <div className="material-actions"><button disabled={busy} type="submit">{busy ? "Saving..." : "Save name"}</button><button type="button" disabled={busy} onClick={cancel}>Cancel</button></div>
    </form>}
    {mode === "delete" && <div role="group" aria-label="Confirm deletion">
      <p>Delete {tracked.name}? This permanently removes its source file, processing results, and study notes, including combined notes made from it. Existing quizzes are kept.</p>
      <div className="material-actions"><button className="material-delete" disabled={busy} onClick={() => void mutate("delete")}>{busy ? "Deleting..." : "Confirm delete"}</button><button disabled={busy} onClick={cancel}>Cancel</button></div>
    </div>}
    {error && <p role="alert" className="document-error">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    </article>;
}

function fileType(name: string) {
  const extension = name.match(/\.([a-z0-9]+)$/i)?.[1];
  return (extension ?? "file").toUpperCase();
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  const megabytes = bytes / (1024 * 1024);
  return `${megabytes >= 10 ? Math.round(megabytes) : megabytes.toFixed(1)} MB`;
}

function FileTypeIcon() {
  return (
    <svg className="material-file-icon" viewBox="0 0 32 32" aria-hidden="true">
      <path fill="currentColor" opacity=".16" d="M8 3h10.2L26 10.8V27a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" />
      <path fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" d="M8.8 4.2h8.6L24.8 11.6V26.4a1.2 1.2 0 0 1-1.2 1.2H8.8a1.2 1.2 0 0 1-1.2-1.2V5.4a1.2 1.2 0 0 1 1.2-1.2z" />
      <path fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" d="M17.2 4.2V11.6h7.6" />
    </svg>
  );
}
