import { type SubmitEvent, useId, useState } from "react";
import { deleteCourse, renameCourse } from "../../api/courses";
import { useAuth } from "../../context/AuthContext";
import type { Course } from "../../types/course";
import ConfirmDeleteDialog from "../shared/ConfirmDeleteDialog";
import "./CourseActions.css";

export default function CourseActions({ course, onRenamed, onDeleted }: {
  course: Course;
  onRenamed: (course: Course) => void;
  onDeleted: () => void;
}) {
  const { accessToken } = useAuth();
  const id = useId();
  const [mode, setMode] = useState<"view" | "rename" | "delete">("view");
  const [name, setName] = useState(course.name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const trimmed = name.trim();
    if (!trimmed || trimmed.length > 200 || [...trimmed].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)) {
      setError("Use a course name of 1 to 200 characters without control characters.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const updated = await renameCourse(accessToken, course.id, trimmed);
      onRenamed(updated);
      setMode("view");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not rename the course.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await deleteCourse(accessToken, course.id);
      onDeleted();
    } catch {
      setError("Could not delete the course. Please try again.");
      setBusy(false);
    }
  }

  return <div className="course-actions">
    {mode === "view" && <>
      <button type="button" onClick={() => { setName(course.name); setError(""); setMode("rename"); }} aria-label={`Rename ${course.name}`}>Rename</button>
      <button type="button" onClick={() => { setError(""); setMode("delete"); }} aria-label={`Delete ${course.name}`}>Delete</button>
    </>}
    {mode === "rename" && <form onSubmit={save}>
      <label htmlFor={`${id}-name`}>New name for {course.name}</label>
      <input id={`${id}-name`} value={name} maxLength={200} autoFocus disabled={busy} onChange={(event) => { setName(event.target.value); setError(""); }} />
      <button type="submit" disabled={busy}>{busy ? "Saving..." : "Save"}</button>
      <button type="button" disabled={busy} onClick={() => { setError(""); setMode("view"); }}>Cancel</button>
      {error && <p className="form-error" role="alert">{error}</p>}
    </form>}
    {mode === "delete" && <ConfirmDeleteDialog
      title={`Delete ${course.name}?`}
      description="This permanently removes the course and its materials, notes, quizzes, tasks, study sessions, and course conversations."
      busy={busy} error={error}
      onCancel={() => { setError(""); setMode("view"); }}
      onConfirm={() => void remove()}
    />}
  </div>;
}
