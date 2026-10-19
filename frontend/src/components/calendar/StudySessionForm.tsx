import { type SubmitEvent, useId, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ApiError } from "../../api/client";
import { createStudySession, updateStudySession } from "../../api/studySessions";
import { useAuth } from "../../context/AuthContext";
import type { Course } from "../../types/course";
import type { StudySession } from "../../types/studySession";
import "../todos/TodoForm.css";

type StudySessionFormProps = {
  courses: Course[];
  session?: StudySession | null;
  onSaved: (session: StudySession) => void;
  onCancelEdit?: () => void;
};

type FieldErrors = Partial<Record<"title" | "course" | "date" | "time", string>>;

function clockValue(time: string | null | undefined): string {
  // The time input wants HH:MM. The API stores HH:MM:SS or null.
  return time ? time.slice(0, 5) : "";
}

export default function StudySessionForm({
  courses,
  session = null,
  onSaved,
  onCancelEdit,
}: StudySessionFormProps) {
  const { accessToken } = useAuth();
  const id = useId();
  const dateInput = useRef<HTMLInputElement>(null);
  const timeInput = useRef<HTMLInputElement>(null);
  const saving = useRef(false);
  const pendingCreation = useRef<{ fingerprint: string; key: string } | null>(null);
  const [title, setTitle] = useState(session?.title ?? "");
  const [courseId, setCourseId] = useState(session ? String(session.course) : "");
  const [date, setDate] = useState(session?.date ?? "");
  const [time, setTime] = useState(clockValue(session?.time));
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const editing = session !== null;
  const disabled = submitting || courses.length === 0 || !accessToken;
  const selectedCourse = courses.some((course) => String(course.id) === courseId) ? courseId : "";

  function clearFeedback() {
    setError("");
    setSuccess("");
    setFieldErrors({});
  }

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving.current || disabled) return;
    clearFeedback();

    const errors: FieldErrors = {};
    if (!title.trim()) errors.title = "Enter a session title.";
    else if (title.trim().length > 200) errors.title = "Use 200 characters or fewer.";
    if (!selectedCourse) errors.course = "Choose a course.";
    if (!date) errors.date = "Choose a date.";
    else if (dateInput.current && !dateInput.current.validity.valid) {
      errors.date = "Enter a valid date with a four-digit year.";
    }
    if (time && timeInput.current && !timeInput.current.validity.valid) {
      errors.time = "Enter a valid time, or leave it blank.";
    }
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    const details = {
      title: title.trim(),
      course: Number(selectedCourse),
      date,
      time: time || null,
    };
    saving.current = true;
    setSubmitting(true);
    let saved: StudySession;
    try {
      if (editing && session) {
        saved = await updateStudySession(accessToken, session.id, details);
      } else {
        const fingerprint = JSON.stringify(details);
        // An unchanged retry reuses the key so a lost response does not create a second session.
        if (pendingCreation.current?.fingerprint !== fingerprint) {
          pendingCreation.current = { fingerprint, key: crypto.randomUUID() };
        }
        saved = await createStudySession(accessToken, {
          ...details,
          creation_key: pendingCreation.current.key,
        });
      }
    } catch (caught: unknown) {
      if (caught instanceof ApiError && caught.status === 401) {
        setError("Your session has expired. Please sign in again.");
      } else if (caught instanceof ApiError && caught.status === 400) {
        setError("Could not save the study session. Check the title, course, date, and time, then try again.");
      } else if (caught instanceof ApiError && caught.status === 409) {
        setError("This submission conflicts with an earlier study session. Reload the calendar before trying again.");
      } else {
        setError("Could not save the study session. Please try again.");
      }
      return;
    } finally {
      saving.current = false;
      setSubmitting(false);
    }

    pendingCreation.current = null;
    if (!editing) {
      setTitle("");
      setCourseId("");
      setDate("");
      setTime("");
    }
    setSuccess(editing ? "Study session updated." : "Study session added.");
    onSaved(saved);
  }

  return (
    <form className="todo-form" aria-labelledby={`${id}-heading`} aria-busy={submitting} onSubmit={handleSubmit} noValidate>
      <h2 id={`${id}-heading`}>{editing ? "Edit study session" : "Add a study session"}</h2>
      <p>Choose a course, a date, and an optional time.</p>
      {courses.length === 0 && (
        <p role="status">
          Create a course before adding a study session. <Link to="/#courses">Create a course</Link>
        </p>
      )}

      <label htmlFor={`${id}-title`}>Title (required)</label>
      <input
        id={`${id}-title`}
        name="title"
        required
        maxLength={200}
        value={title}
        disabled={disabled}
        aria-invalid={Boolean(fieldErrors.title)}
        aria-describedby={fieldErrors.title ? `${id}-title-error` : undefined}
        onChange={(event) => { setTitle(event.target.value); clearFeedback(); }}
      />
      {fieldErrors.title && <p id={`${id}-title-error`} className="form-error" role="alert">{fieldErrors.title}</p>}

      <label htmlFor={`${id}-course`}>Course (required)</label>
      <select
        id={`${id}-course`}
        name="course"
        required
        value={selectedCourse}
        disabled={disabled}
        aria-invalid={Boolean(fieldErrors.course)}
        aria-describedby={fieldErrors.course ? `${id}-course-error` : undefined}
        onChange={(event) => { setCourseId(event.target.value); clearFeedback(); }}
      >
        <option value="">Choose a course</option>
        {courses.map((course) => <option key={course.id} value={course.id}>{course.name}</option>)}
      </select>
      {fieldErrors.course && <p id={`${id}-course-error`} className="form-error" role="alert">{fieldErrors.course}</p>}

      <label htmlFor={`${id}-date`}>Date (required)</label>
      <input
        ref={dateInput}
        id={`${id}-date`}
        name="date"
        type="date"
        required
        max="9999-12-31"
        value={date}
        disabled={disabled}
        aria-invalid={Boolean(fieldErrors.date)}
        aria-describedby={fieldErrors.date ? `${id}-date-error` : undefined}
        onChange={(event) => { setDate(event.target.value); clearFeedback(); }}
      />
      {fieldErrors.date && <p id={`${id}-date-error`} className="form-error" role="alert">{fieldErrors.date}</p>}

      <label htmlFor={`${id}-time`}>Time (optional)</label>
      <input
        ref={timeInput}
        id={`${id}-time`}
        name="time"
        type="time"
        value={time}
        disabled={disabled}
        aria-invalid={Boolean(fieldErrors.time)}
        aria-describedby={fieldErrors.time ? `${id}-time-error` : `${id}-time-hint`}
        onChange={(event) => { setTime(event.target.value); clearFeedback(); }}
      />
      <p id={`${id}-time-hint`} className="todo-form-hint">Leave blank if this session has no time.</p>
      {fieldErrors.time && <p id={`${id}-time-error`} className="form-error" role="alert">{fieldErrors.time}</p>}

      <button type="submit" disabled={disabled}>{submitting ? "Saving..." : editing ? "Save changes" : "Add study session"}</button>
      {editing && (
        <button type="button" onClick={onCancelEdit}>Cancel</button>
      )}
      {error && <p className="form-error" role="alert">{error}</p>}
      <p className="todo-form-success" role="status">{success}</p>
    </form>
  );
}
