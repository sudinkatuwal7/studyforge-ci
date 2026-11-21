import { useEffect, useId, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ApiError } from "../../api/client";
import { listCourses } from "../../api/courses";
import { listNotes, NotesRequestError } from "../../api/notes";
import { useAuth } from "../../context/AuthContext";
import type { Course } from "../../types/course";
import { NOTE_TYPES, type CourseNotesSummary } from "../../types/notes";
import { coursePath } from "../courses/courseSections";
import EmptyState from "../shared/EmptyState";
import "./NotesLibrary.css";

type LoadState<T> =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; value: T };

// The filter is in the URL (?course=7) so a refresh, a shared link and Back keep it.
function parseCourseId(value: string | null): number | undefined {
  if (value === null || !/^[1-9]\d*$/.test(value)) return undefined;
  const id = Number(value);
  return Number.isSafeInteger(id) ? id : undefined;
}

function loadErrorMessage(cause: unknown, what: string): string {
  const status = cause instanceof NotesRequestError || cause instanceof ApiError ? cause.status : 0;
  if (status === 401) return "Your session has expired. Please sign in again.";
  return `Could not load your ${what}. Please reload the page to try again.`;
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function noteTypeLabel(notes: CourseNotesSummary): string {
  return NOTE_TYPES.find((choice) => choice.value === notes.options?.note_type)?.label ?? "Notes";
}

export default function NotesLibrary() {
  const { accessToken } = useAuth();
  if (!accessToken) return <p role="alert">Sign in to see your notes.</p>;
  return <Library accessToken={accessToken} />;
}

function Library({ accessToken }: { accessToken: string }) {
  const filterId = useId();
  const [searchParams, setSearchParams] = useSearchParams();
  const [courses, setCourses] = useState<LoadState<Course[]>>({ status: "loading" });
  // Tagged with the filter it was loaded for, so a list never shows under the wrong course.
  const [notes, setNotes] = useState<{ filter: string; result: LoadState<CourseNotesSummary[]> } | null>(null);

  const rawCourse = searchParams.get("course");
  const requestedId = parseCourseId(rawCourse);
  const knownCourse = courses.status === "ready" ? courses.value.find((course) => course.id === requestedId) : undefined;
  // Not a course id, or not one of the student's courses (deleted, or another student's).
  const staleFilter = rawCourse !== null && (requestedId === undefined || (courses.status === "ready" && !knownCourse));
  const courseId = staleFilter ? undefined : requestedId;
  const filter = String(courseId ?? "all");

  useEffect(() => {
    let cancelled = false;
    listCourses(accessToken)
      .then((value) => { if (!cancelled) setCourses({ status: "ready", value }); })
      .catch((cause: unknown) => { if (!cancelled) setCourses({ status: "error", message: loadErrorMessage(cause, "courses") }); });
    return () => { cancelled = true; };
  }, [accessToken]);

  useEffect(() => {
    // Aborting on a filter change keeps a slower, older response from replacing the new list.
    const controller = new AbortController();
    listNotes(accessToken, courseId, controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) setNotes({ filter, result: { status: "ready", value } });
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) setNotes({ filter, result: { status: "error", message: loadErrorMessage(cause, "notes") } });
      });
    return () => controller.abort();
  }, [accessToken, courseId, filter]);

  // Drop a filter that cannot apply, without adding a history entry.
  useEffect(() => {
    if (!staleFilter) return;
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.delete("course");
      return next;
    }, { replace: true });
  }, [staleFilter, setSearchParams]);

  // Each filter change is a history entry, so Back returns to the previous course.
  function chooseCourse(value: string) {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      if (value) next.set("course", value);
      else next.delete("course");
      return next;
    });
  }

  const result: LoadState<CourseNotesSummary[]> = notes?.filter === filter ? notes.result : { status: "loading" };

  return (
    <section className="notes-library" aria-labelledby={`${filterId}-heading`}>
      <div className="section-heading notes-library-toolbar">
        <h2 id={`${filterId}-heading`}>Saved notes</h2>
        <div className="notes-library-filter">
          <label htmlFor={filterId}>Course</label>
          <select
            id={filterId}
            value={courseId ?? ""}
            disabled={courses.status !== "ready"}
            onChange={(event) => chooseCourse(event.target.value)}
          >
            <option value="">All courses</option>
            {courses.status === "ready" && courses.value.map((course) => (
              <option key={course.id} value={course.id}>{course.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* The notes still list without courses; only the filter is lost. */}
      {courses.status === "error" && (
        <p className="form-error" role="alert">{courses.message} The course filter is unavailable.</p>
      )}

      {result.status === "loading" && <p role="status">Loading notes…</p>}
      {result.status === "error" && <p className="form-error" role="alert">{result.message}</p>}
      {result.status === "ready" && result.value.length === 0 && (
        courseId === undefined ? (
          <EmptyState message="No saved notes yet. Open a course and generate notes from its materials.">
            <Link to="/courses" className="empty-state-action">Go to my courses</Link>
          </EmptyState>
        ) : (
          <EmptyState message={`No notes for ${knownCourse?.name ?? "this course"} yet.`}>
            <Link to={coursePath(courseId, "notes")} className="empty-state-action">Generate notes for this course</Link>
          </EmptyState>
        )
      )}
      {result.status === "ready" && result.value.length > 0 && (
        <ul className="notes-library-list">
          {result.value.map((item) => (
            <li key={item.id} className="notes-library-item">
              <Link to={`/notes/${item.id}`} className="notes-library-title">{item.title}</Link>
              <p className="notes-library-meta">
                <span>{item.course_name}</span>
                <span>{noteTypeLabel(item)}</span>
                <time dateTime={item.created_at}>{formatDate(item.created_at)}</time>
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
