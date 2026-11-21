import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { deleteNotes, getNotes, NotesRequestError } from "../../api/notes";
import { useAuth } from "../../context/AuthContext";
import type { CourseNotes } from "../../types/notes";
import ConfirmDeleteDialog from "../shared/ConfirmDeleteDialog";
import NotesEditor from "./NotesEditor";
import NotesView from "./NotesView";
import "./NoteDetail.css";

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; notes: CourseNotes };

// Another student's notes are a 404 too, so the message never confirms they exist.
const NOT_FOUND = "These notes were not found, or you do not have access to them.";

function parseNotesId(value: string): number | null {
  if (!/^[1-9]\d*$/.test(value)) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) ? id : null;
}

function loadErrorMessage(cause: unknown): string {
  if (cause instanceof NotesRequestError && cause.status === 404) return NOT_FOUND;
  if (cause instanceof NotesRequestError && cause.status === 401) return "Your session has expired. Please sign in again.";
  return "Could not load these notes. Please reload the page to try again.";
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

// Creation sets both timestamps a moment apart; only a later save counts as an edit.
function wasEdited(notes: CourseNotes): boolean {
  return Date.parse(notes.updated_at) - Date.parse(notes.created_at) > 1000;
}

export default function NoteDetail({ notesId }: { notesId: string }) {
  const { accessToken } = useAuth();
  const id = parseNotesId(notesId);
  return (
    <div className="note-detail">
      <Link to="/notes" className="note-detail-back">← My notes</Link>
      {!accessToken && <p role="alert">Sign in to see your notes.</p>}
      {accessToken && id === null && <p className="form-error" role="alert">{NOT_FOUND}</p>}
      {accessToken && id !== null && <Note key={id} notesId={id} accessToken={accessToken} />}
    </div>
  );
}

function Note({ notesId, accessToken }: { notesId: number; accessToken: string }) {
  const navigate = useNavigate();
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [mode, setMode] = useState<"view" | "edit" | "delete">("view");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    getNotes(notesId, accessToken, controller.signal)
      .then((notes) => { if (!controller.signal.aborted) setState({ status: "ready", notes }); })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) setState({ status: "error", message: loadErrorMessage(cause) });
      });
    return () => controller.abort();
  }, [notesId, accessToken]);

  async function remove() {
    if (deleting) return;
    setDeleting(true);
    setDeleteError("");
    try {
      await deleteNotes(notesId, accessToken);
    } catch (cause) {
      // Already gone (deleted in another tab) is the outcome the student asked for.
      if (!(cause instanceof NotesRequestError && cause.status === 404)) {
        setDeleteError(cause instanceof NotesRequestError && cause.status === 401
          ? "Your session has ended. Sign in again to delete these notes."
          : "Could not delete these notes. Please try again.");
        setDeleting(false);
        return;
      }
    }
    // Replace, so Back does not return to notes that no longer exist.
    navigate("/notes", { replace: true });
  }

  if (state.status === "loading") return <p role="status">Loading notes…</p>;
  if (state.status === "error") return <p className="form-error" role="alert">{state.message}</p>;

  const { notes } = state;
  if (mode === "edit") {
    return <NotesEditor
      notes={notes}
      accessToken={accessToken}
      onSaved={(saved) => { setState({ status: "ready", notes: saved }); setMode("view"); }}
      onCancel={() => setMode("view")}
    />;
  }

  return (
    <>
      <div className="note-detail-toolbar">
        <p className="note-detail-dates">
          Saved <time dateTime={notes.created_at}>{formatDate(notes.created_at)}</time>
          {wasEdited(notes) && <> · Edited <time dateTime={notes.updated_at}>{formatDate(notes.updated_at)}</time></>}
        </p>
        <div className="note-detail-actions">
          <button type="button" onClick={() => setMode("edit")}>Edit notes</button>
          <button type="button" onClick={() => { setDeleteError(""); setMode("delete"); }}>Delete notes</button>
        </div>
      </div>
      <NotesView notes={notes} />
      {mode === "delete" && <ConfirmDeleteDialog
        title={`Delete ${notes.title}?`}
        description="This permanently removes these notes. The course and its materials are not affected."
        busy={deleting}
        error={deleteError}
        onCancel={() => { setDeleteError(""); setMode("view"); }}
        onConfirm={() => void remove()}
      />}
    </>
  );
}
