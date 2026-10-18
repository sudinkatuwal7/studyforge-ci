import { useEffect, useId, useRef, useState, type SubmitEvent } from "react";
import { deleteDocument, DocumentRequestError, renameDocument } from "../../api/documents";
import type { TrackedDocument } from "../../types/document";
import StudyGuidePanel from "../notes/StudyGuidePanel";
import DocumentStatus from "./DocumentStatus";

type Props = {
  tracked: TrackedDocument; courseId: number; accessToken: string;
  onRenamed: (document: TrackedDocument) => void; onDeleted: () => void;
};

export default function MaterialItem({ tracked, courseId, accessToken, onRenamed, onDeleted }: Props) {
  const inputId = useId();
  const [mode, setMode] = useState<"view" | "rename" | "delete">("view");
  const [name, setName] = useState(tracked.name);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => { pending.current?.abort(); }, []);

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
    <DocumentStatus key={revision} tracked={tracked} courseId={courseId} accessToken={accessToken} />
    {tracked.snapshot && <p className="material-date">Uploaded <time dateTime={tracked.snapshot.created_at}>{new Date(tracked.snapshot.created_at).toLocaleString()}</time></p>}
    {mode === "view" && <div className="material-actions">
      <button onClick={() => { setName(tracked.name); setError(""); setNotice(""); setMode("rename"); }}>Rename</button>
      <button className="material-delete" onClick={() => { setError(""); setNotice(""); setMode("delete"); }}>Delete</button>
    </div>}
    {mode === "rename" && <form onSubmit={submit}>
      <label htmlFor={inputId}>Material name</label>
      <input id={inputId} value={name} maxLength={255} disabled={busy} onChange={(event) => setName(event.target.value)} autoFocus />
      <div className="material-actions"><button disabled={busy} type="submit">{busy ? "Saving..." : "Save name"}</button><button type="button" disabled={busy} onClick={cancel}>Cancel</button></div>
    </form>}
    {mode === "delete" && <div role="group" aria-label="Confirm deletion">
      <p>Delete {tracked.name}? This permanently removes its source file, processing results, and study notes. Existing quizzes are kept.</p>
      <div className="material-actions"><button className="material-delete" disabled={busy} onClick={() => void mutate("delete")}>{busy ? "Deleting..." : "Confirm delete"}</button><button disabled={busy} onClick={cancel}>Cancel</button></div>
    </div>}
    {error && <p role="alert" className="document-error">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    <StudyGuidePanel documentId={tracked.id} documentName={tracked.name} accessToken={accessToken} />
  </article>;
}
