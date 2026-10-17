import { type SubmitEvent, useId, useRef, useState } from "react";
import { ApiError } from "../../api/client";
import { createTodo } from "../../api/todos";
import { useAuth } from "../../context/AuthContext";
import type { Course } from "../../types/course";
import type { TodoItem } from "../../types/todo";
import "./TodoForm.css";

type TodoFormProps = {
  courses: Course[];
  onCreated: (todo: TodoItem) => void;
};

type FieldErrors = Partial<Record<"title" | "course" | "dueDate", string>>;

export default function TodoForm({ courses, onCreated }: TodoFormProps) {
  const { accessToken } = useAuth();
  const id = useId();
  const dateInput = useRef<HTMLInputElement>(null);
  const saving = useRef(false);
  const pendingCreation = useRef<{ fingerprint: string; key: string } | null>(null);
  const [title, setTitle] = useState("");
  const [courseId, setCourseId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const disabled = submitting || courses.length === 0 || !accessToken;
  // A removed course must not remain selected when the parent refreshes courses.
  const selectedCourse = courses.some((course) => String(course.id) === courseId) ? courseId : "";

  function clearFeedback() {
    setError("");
    setSuccess("");
    setFieldErrors({});
  }

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    // The ref also guards repeated submissions before React updates the button.
    if (saving.current || disabled) return;
    clearFeedback();

    const errors: FieldErrors = {};
    if (!title.trim()) errors.title = "Enter a task title.";
    else if (title.trim().length > 200) errors.title = "Use 200 characters or fewer.";
    if (!selectedCourse) errors.course = "Choose a course.";
    if (dateInput.current && !dateInput.current.validity.valid) {
      errors.dueDate = "Enter a valid date with a four-digit year, or leave it blank.";
    }
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    saving.current = true;
    setSubmitting(true);
    let savedTodo: TodoItem;
    try {
      const details = {
        title: title.trim(),
        course: Number(selectedCourse),
        due_date: dueDate || null,
      };
      const fingerprint = JSON.stringify(details);
      // An unchanged retry keeps its key, even if the previous response was lost.
      if (pendingCreation.current?.fingerprint !== fingerprint) {
        pendingCreation.current = { fingerprint, key: crypto.randomUUID() };
      }
      savedTodo = await createTodo(accessToken, {
        ...details,
        creation_key: pendingCreation.current.key,
      });
    } catch (caught: unknown) {
      if (caught instanceof ApiError && caught.status === 401) {
        setError("Your session has expired. Please sign in again.");
      } else if (caught instanceof ApiError && caught.status === 400) {
        setError("Could not save the task. Check the title, course, and date, then try again.");
      } else if (caught instanceof ApiError && caught.status === 409) {
        setError("This submission conflicts with an earlier task. Reload your task list before trying again.");
      } else {
        setError("Could not save the task. Please try again.");
      }
      return;
    } finally {
      saving.current = false;
      setSubmitting(false);
    }

    // Reset only after the server confirms that the task was saved.
    pendingCreation.current = null;
    setTitle("");
    setCourseId("");
    setDueDate("");
    setSuccess("Task added.");
    onCreated(savedTodo);
  }

  return (
    <form className="todo-form" aria-labelledby={`${id}-heading`} aria-busy={submitting} onSubmit={handleSubmit} noValidate>
      <h2 id={`${id}-heading`}>Add a task</h2>
      <p>Choose a course and add what you need to do.</p>
      {!accessToken && <p role="status">Log in to add tasks.</p>}
      {courses.length === 0 && <p role="status">Create a course first to add tasks.</p>}

      <label htmlFor={`${id}-title`}>Task title (required)</label>
      <input
        id={`${id}-title`}
        name="title"
        required
        maxLength={200}
        placeholder="e.g. Finish chapter 3 exercises"
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

      <label htmlFor={`${id}-due-date`}>Due date (optional)</label>
      <input
        ref={dateInput}
        id={`${id}-due-date`}
        name="due_date"
        type="date"
        max="9999-12-31"
        value={dueDate}
        disabled={disabled}
        aria-invalid={Boolean(fieldErrors.dueDate)}
        aria-describedby={fieldErrors.dueDate ? `${id}-date-error` : `${id}-date-hint`}
        onChange={(event) => { setDueDate(event.target.value); clearFeedback(); }}
      />
      <p id={`${id}-date-hint`} className="todo-form-hint">Leave blank if there is no deadline.</p>
      {fieldErrors.dueDate && <p id={`${id}-date-error`} className="form-error" role="alert">{fieldErrors.dueDate}</p>}

      <button type="submit" disabled={disabled}>{submitting ? "Adding task..." : "Add task"}</button>
      {error && <p className="form-error" role="alert">{error}</p>}
      <p className="todo-form-success" role="status">{success}</p>
    </form>
  );
}
