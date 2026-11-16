import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { RefreshRejectedError } from "../api/auth";
import { ApiError } from "../api/client";
import { deleteStudySession } from "../api/studySessions";
import CalendarMonth from "../components/calendar/CalendarMonth";
import StudySessionForm from "../components/calendar/StudySessionForm";
import { getLocalMonth } from "../components/calendar/calendarDates";
import { buildCalendarEvents } from "../components/calendar/calendarEvents";
import EmptyState from "../components/shared/EmptyState";
import { revealAndFocus } from "../components/shared/revealAndFocus";
import { useAuth } from "../context/AuthContext";
import type { Course } from "../types/course";
import type { StudySession } from "../types/studySession";
import type { TodoItem } from "../types/todo";

type CalendarState =
  | { status: "loading" }
  | { status: "ready"; todos: TodoItem[]; sessions: StudySession[]; courses: Course[] }
  | { status: "error" };

async function readList<T>(
  authenticatedFetch: (path: string) => Promise<Response>,
  path: string,
): Promise<T> {
  const response = await authenticatedFetch(path);
  // A 401 after the refresh attempt means the session was already cleared.
  if (response.status === 401) {
    throw new RefreshRejectedError("Session expired. Please sign in again.");
  }
  if (!response.ok) throw new ApiError(response.status);
  return response.json() as Promise<T>;
}

export default function CalendarPage() {
  const { accessToken, authenticatedFetch } = useAuth();
  const [state, setState] = useState<CalendarState>({ status: "loading" });
  const [loadVersion, setLoadVersion] = useState(0);
  const [editing, setEditing] = useState<StudySession | null>(null);
  const [focusDate, setFocusDate] = useState<string | null>(null);
  const [actionError, setActionError] = useState("");
  const calendarRef = useRef<HTMLElement>(null);
  const opened = getLocalMonth();
  const focusParts = focusDate?.split("-").map(Number);
  const year = focusParts?.[0] || opened.year;
  const month = focusParts?.[1] || opened.month;

  useEffect(() => {
    // Ignore a response that arrives after logout or leaving the page.
    let cancelled = false;

    Promise.all([
      readList<TodoItem[]>(authenticatedFetch, "/todos/"),
      readList<StudySession[]>(authenticatedFetch, "/study-sessions/"),
      readList<Course[]>(authenticatedFetch, "/courses/"),
    ])
      .then(([todos, sessions, courses]) => {
        if (cancelled) return;
        setState({ status: "ready", todos, sessions, courses });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        // Login replaces this page once the session is cleared. Keep the loading text until then.
        if (error instanceof RefreshRejectedError) return;
        setState({ status: "error" });
      });

    return () => {
      cancelled = true;
    };
  }, [authenticatedFetch, loadVersion]);

  function saveSession(saved: StudySession) {
    setState((current) => {
      if (current.status !== "ready") return current;
      const exists = current.sessions.some((item) => item.id === saved.id);
      const sessions = exists
        ? current.sessions.map((item) => (item.id === saved.id ? saved : item))
        : [...current.sessions, saved];
      return { ...current, sessions };
    });
    setFocusDate(saved.date);
    setEditing(null);
    setActionError("");
  }

  async function removeSession(sessionId: number) {
    setActionError("");
    try {
      await deleteStudySession(accessToken, sessionId);
    } catch {
      setActionError("Could not delete the study session. Please try again.");
      return;
    }
    setState((current) => {
      if (current.status !== "ready") return current;
      return { ...current, sessions: current.sessions.filter((item) => item.id !== sessionId) };
    });
    if (editing?.id === sessionId) setEditing(null);
  }

  if (state.status === "loading") return <p role="status">Loading calendar...</p>;
  if (state.status === "error") {
    return (
      <section>
        <p role="alert">Could not load the calendar.</p>
        <button type="button" onClick={() => {
          setState({ status: "loading" });
          setLoadVersion((version) => version + 1);
        }}>
          Try again
        </button>
      </section>
    );
  }

  const events = buildCalendarEvents(state.todos, state.sessions);
  const editingSession = state.sessions.find((item) => item.id === editing?.id) ?? null;

  return (
    <section ref={calendarRef} aria-labelledby="calendar-heading">
      <h2 id="calendar-heading">Calendar</h2>
      {events.length === 0 && (state.courses.length === 0 ? (
        // Sessions and tasks both belong to a course, so that comes first.
        <EmptyState message="Nothing on your calendar yet. Study sessions and tasks belong to a course, so create a course first.">
          <Link className="empty-state-action" to="/courses" state={{ focusCourseForm: true }}>Create a course</Link>
        </EmptyState>
      ) : (
        <EmptyState message="No dated tasks or study sessions yet.">
          <button type="button" className="empty-state-action"
            // The study session form below the calendar; its first field is the title.
            onClick={() => revealAndFocus(calendarRef.current?.querySelector<HTMLInputElement>("form input"))}>
            Plan a study session
          </button>
          <Link className="empty-state-action empty-state-action-secondary" to="/tasks">Add a task with a due date</Link>
        </EmptyState>
      ))}
      <CalendarMonth
        year={year}
        month={month}
        events={events}
        highlightDate={focusDate}
        onEditSession={(sessionId) => {
          const selected = state.sessions.find((item) => item.id === sessionId) ?? null;
          setEditing(selected);
          setActionError("");
        }}
        onDeleteSession={(sessionId) => void removeSession(sessionId)}
      />
      {actionError && <p className="form-error" role="alert">{actionError}</p>}
      <StudySessionForm
        key={editingSession ? `edit-${editingSession.id}` : "create"}
        courses={state.courses}
        session={editingSession}
        onSaved={saveSession}
        onCancelEdit={() => setEditing(null)}
      />
    </section>
  );
}
