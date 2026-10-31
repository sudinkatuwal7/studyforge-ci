import { useEffect, useRef, useState } from "react";
import { generateNotes, getNotes, NotesRequestError } from "../../api/notes";
import { useAuth } from "../../context/AuthContext";
import type { TrackedDocument } from "../../types/document";
import type { CourseNotes } from "../../types/notes";
import NotesSetup from "./NotesSetup";
import NotesView from "./NotesView";

type Props = { courseId: number; materials: TrackedDocument[] };

// The open notes' id survives a reload, so a refresh never pays for a new generation.
function notesKey(userId: number, courseId: number) { return `studyforge:notes:${userId}:${courseId}`; }
function readNotesId(key: string): number | null {
  try {
    const value: unknown = JSON.parse(sessionStorage.getItem(key) ?? "null");
    if (Number.isSafeInteger(value)) return value as number;
  } catch { /* Private browsing or a stale entry: start fresh. */ }
  return null;
}
function saveNotesId(key: string, notesId: number | null) {
  try {
    if (notesId === null) sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, String(notesId));
  } catch { /* The notes stay open until the page reloads. */ }
}

// Words each failure for the student. The API layer only reports status and code.
function generateErrorMessage(cause: unknown): string {
  if (cause instanceof NotesRequestError) {
    if (cause.code === "DOCUMENT_NOT_READY") return "Some selected materials are still processing. Wait for them to be ready, or deselect them.";
    if (cause.code === "DOCUMENT_HAS_NO_TEXT") return "No readable text could be found in some selected materials. Deselect them and try again.";
    if (cause.code === "NOTES_INPUT_TOO_LARGE") return "These materials are too long to combine at once. Select fewer and try again.";
    if (cause.code === "NOTES_GENERATION_FAILED") return "The notes could not be generated right now. Please try again.";
    if (cause.status === 401 || cause.status === 403) return "Your session has ended. Sign in again to generate notes.";
    if (cause.status === 400) return "Choose at least one material.";
    if (cause.status === 404) return "One of the selected materials could not be found. Refresh the page and try again.";
  }
  return "The notes could not be generated. Please try again.";
}

export default function NotesPanel(props: Props) {
  const { accessToken, user } = useAuth();
  if (!accessToken || !user) return <p role="alert">Sign in to generate study notes.</p>;
  // A new account or course starts from a clean slate.
  return <Notes key={`${user.id}:${props.courseId}`} {...props} accessToken={accessToken} storageKey={notesKey(user.id, props.courseId)} />;
}

function Notes({ courseId, materials, accessToken, storageKey }: Props & { accessToken: string; storageKey: string }) {
  // Selection lives here, not in NotesSetup, so "Create new notes" keeps it.
  const [selected, setSelected] = useState<string[]>([]);
  const [notes, setNotes] = useState<CourseNotes | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [restoring, setRestoring] = useState(() => readNotesId(storageKey) !== null);
  const controller = useRef<AbortController | null>(null);
  const seenMaterials = useRef(new Set<number>());

  // Cancel any request still in flight when the student leaves the course.
  useEffect(() => () => controller.current?.abort(), []);

  // After a reload, reopen the notes the student had open.
  useEffect(() => {
    const savedId = restoring ? readNotesId(storageKey) : null;
    if (savedId === null) return;
    controller.current?.abort();
    controller.current = new AbortController();
    const signal = controller.current.signal;
    (async () => {
      try {
        const saved = await getNotes(savedId, accessToken, signal);
        if (!signal.aborted) setNotes(saved);
      } catch (cause) {
        if (signal.aborted) return;
        // 404: the notes were deleted with a source material, so forget them quietly.
        if (cause instanceof NotesRequestError && cause.status === 404) saveNotesId(storageKey, null);
        else setError("Your last notes could not be loaded. Reload the page to try again, or create new notes.");
      } finally {
        if (!signal.aborted) setRestoring(false);
      }
    })();
    // Once restored, a refreshed token must not refetch or abort a generation in flight.
  }, [accessToken, storageKey, restoring]);

  // Deleting a source material deletes these notes on the server, so stop showing
  // them. Only a material seen earlier counts: the list starts empty while loading.
  useEffect(() => {
    const current = new Set(materials.map((item) => item.id));
    const deleted = notes?.source_documents.some((document) => seenMaterials.current.has(document.id) && !current.has(document.id));
    current.forEach((id) => seenMaterials.current.add(id));
    if (deleted) {
      saveNotesId(storageKey, null);
      setNotes(null);
    }
  }, [materials, notes, storageKey]);

  const generate = async (documentIds: number[]) => {
    controller.current?.abort();
    controller.current = new AbortController();
    const signal = controller.current.signal;
    setBusy(true);
    setError("");
    try {
      const created = await generateNotes(courseId, documentIds, accessToken, signal);
      if (signal.aborted) return;
      saveNotesId(storageKey, created.id);
      setNotes(created);
    } catch (cause) {
      if (!signal.aborted) setError(generateErrorMessage(cause));
    } finally {
      if (!signal.aborted) setBusy(false);
    }
  };

  const createNew = () => { saveNotesId(storageKey, null); setNotes(null); setError(""); };

  if (restoring) return <p role="status">Loading your notes…</p>;
  if (notes) return <NotesView key={notes.id} notes={notes} onCreateNew={createNew} />;
  return <NotesSetup materials={materials} selected={selected} onSelectedChange={setSelected} busy={busy} error={error} onGenerate={generate} />;
}
