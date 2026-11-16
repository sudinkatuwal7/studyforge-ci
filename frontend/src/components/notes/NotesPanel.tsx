import { useEffect, useRef, useState } from "react";
import { generateNotes, getNotes, NotesRequestError } from "../../api/notes";
import { useAuth } from "../../context/AuthContext";
import type { MaterialsLoadState, TrackedDocument } from "../../types/document";
import { DEFAULT_NOTES_OPTIONS, type CourseNotes, type NotesOptions } from "../../types/notes";
import NotesSetup from "./NotesSetup";
import NotesView from "./NotesView";

type Props = { courseId: number; materials: TrackedDocument[]; materialsState?: MaterialsLoadState };

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
const CODE_MESSAGES: Record<string, string> = {
  DOCUMENT_NOT_READY: "Some selected materials are still processing. Wait for them to be ready, or deselect them.",
  DOCUMENT_HAS_NO_TEXT: "No readable text could be found in some selected materials. Deselect them and try again.",
  NOTES_INPUT_TOO_LARGE: "These materials are too long to combine at once. Select fewer, or choose a lower detail level, and try again.",
  // Both AI failures: the materials are fine and nothing was saved.
  NOTES_PROVIDER_UNAVAILABLE: "The AI service is unavailable right now. Your materials are fine. Please try again in a few minutes.",
  NOTES_INVALID_OUTPUT: "The AI returned notes that could not be used, so nothing was saved. Please try again, or choose a lower detail level or fewer materials.",
};
const STATUS_MESSAGES: Record<number, string> = {
  400: "Choose at least one material.",
  401: "Your session has ended. Sign in again to generate notes.",
  403: "Your session has ended. Sign in again to generate notes.",
  404: "One of the selected materials could not be found. Refresh the page and try again.",
};

function generateErrorMessage(cause: unknown): string {
  const fallback = "The notes could not be generated. Please try again.";
  if (!(cause instanceof NotesRequestError)) return fallback;
  return CODE_MESSAGES[cause.code] ?? STATUS_MESSAGES[cause.status] ?? fallback;
}

export default function NotesPanel(props: Props) {
  const { accessToken, user } = useAuth();
  if (!accessToken || !user) return <p role="alert">Sign in to generate study notes.</p>;
  // A new account or course starts from a clean slate.
  return <Notes key={`${user.id}:${props.courseId}`} {...props} accessToken={accessToken} storageKey={notesKey(user.id, props.courseId)} />;
}

function Notes({ courseId, materials, materialsState = "ready", accessToken, storageKey }: Props & { accessToken: string; storageKey: string }) {
  // Selection and options live here, not in NotesSetup, so "Create new notes" keeps them.
  const [selected, setSelected] = useState<string[]>([]);
  const [options, setOptions] = useState<NotesOptions>(DEFAULT_NOTES_OPTIONS);
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

  const generate = async (documentIds: number[], chosen: NotesOptions) => {
    controller.current?.abort();
    controller.current = new AbortController();
    const signal = controller.current.signal;
    setBusy(true);
    setError("");
    try {
      const created = await generateNotes(courseId, documentIds, chosen, accessToken, signal);
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
  return <NotesSetup courseId={courseId} materials={materials} materialsState={materialsState} selected={selected} onSelectedChange={setSelected}
    options={options} onOptionsChange={setOptions} busy={busy} error={error} onGenerate={generate} />;
}
