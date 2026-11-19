import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listStudySessions } from "../api/studySessions";
import { useAuth } from "../context/AuthContext";
import CalendarMonth from "../components/calendar/CalendarMonth";
import { formatCalendarDate, getLocalMonth } from "../components/calendar/calendarDates";
import { buildCalendarEvents, getUpcomingEvents, UPCOMING_DAYS } from "../components/calendar/calendarEvents";
import CourseForm from "../components/courses/CourseForm";
import CourseList from "../components/courses/CourseList";
import { focusCourseForm } from "../components/courses/focusCourseForm";
import QuickLinks from "../components/dashboard/QuickLinks";
import UpcomingList from "../components/dashboard/UpcomingList";
import EmptyState from "../components/shared/EmptyState";
import TodoPanel from "../components/todos/TodoPanel";
import type { CalendarEvent } from "../types/calendar";
import type { Course } from "../types/course";
import type { StudySession } from "../types/studySession";
import type { TodoItem } from "../types/todo";
import Panda from "../components/shared/Panda";

export default function DashboardPage({
  refreshKey,
  onCourseCreated,
}: {
  refreshKey: number;
  onCourseCreated: () => void;
}) {
  const { user, accessToken } = useAuth();
  const [courses, setCourses] = useState<Course[] | null>(null);
  const [coursesFailed, setCoursesFailed] = useState(false);
  // Stable callbacks, because CourseList calls them from an effect that depends on them.
  const showCourses = useCallback((loaded: Course[]) => {
    setCourses(loaded);
    setCoursesFailed(false);
  }, []);
  const courseLoadFailed = useCallback(() => setCoursesFailed(true), []);
  const [todos, setTodos] = useState<TodoItem[] | null>(null);
  const [sessions, setSessions] = useState<StudySession[] | null>(null);
  const [sessionError, setSessionError] = useState(false);
  const pending = todos?.filter((todo) => !todo.is_completed).length;
  // TodoPanel replaces this array when a task is added or completed, so the calendar follows that list.
  const calendarReady = todos !== null || sessions !== null;
  // Upcoming waits for to-dos, and for sessions unless they failed (then it lists tasks only).
  const upcomingReady = todos !== null && (sessions !== null || sessionError);
  const events = buildCalendarEvents(todos ?? [], sessions ?? []);
  // Only "nothing dated" once both lists have arrived; one list alone can look empty too early.
  const calendarEmpty = todos !== null && sessions !== null && events.length === 0;
  const today = formatCalendarDate(new Date());
  // The list and the "Upcoming" stat card count the same window.
  const upcoming = getUpcomingEvents(events, today, UPCOMING_DAYS);
  const greeting = user?.first_name ? `Welcome back, ${user.first_name}!` : "Welcome back!";

  useEffect(() => {
    let cancelled = false;
    listStudySessions(accessToken)
      .then((loaded) => {
        if (!cancelled) setSessions(loaded);
      })
      .catch(() => {
        if (!cancelled) setSessionError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken, refreshKey]);

  return (
    <div className="dashboard-page dashboard-columns">
      <div className="dashboard-main">
      <section className="welcome-banner">
        <div>
          <h2>{greeting}</h2>
          <p>Ready to make some progress today?</p>
          <Link className="banner-button" to="/tasks">View my tasks →</Link>
        </div>
        <Panda />
      </section>

      <section className="stat-row" aria-label="Study summary">
        <article className="stat-card stat-lavender">
          <p>Courses</p>
          <strong>{courses ? courses.length : "–"}</strong>
        </article>
        <article className="stat-card stat-sage">
          <p>Pending tasks</p>
          <strong>{pending ?? "–"}</strong>
        </article>
        <article className="stat-card stat-peach">
          <p>Upcoming</p>
          <strong>{upcomingReady ? upcoming.length : "–"}</strong>
        </article>
      </section>

      <QuickLinks courses={courses} loadFailed={coursesFailed} userId={user?.id} />

      <UpcomingList events={upcomingReady ? upcoming : null} today={today} courses={courses} sessionsFailed={sessionError} />

        <div className="dashboard-column">
          <div className="section-heading">
            <h2 id="courses">My Courses</h2>
            <button type="button" className="new-link link-button" aria-label="New course" onClick={focusCourseForm}>
              + New
            </button>
          </div>
          <CourseList refreshKey={refreshKey} onCourses={showCourses} onLoadFailed={courseLoadFailed} onCourseChanged={onCourseCreated} embedded />
          <CourseForm onCreated={onCourseCreated} />
        </div>
      </div>
      <aside className="dashboard-sidebar" aria-label="Calendar and tasks">
          <DashboardCalendar events={events} calendarReady={calendarReady} calendarEmpty={calendarEmpty} sessionError={sessionError} />
          <TodoPanel refreshKey={refreshKey} onTodos={setTodos} onCreateCourse={focusCourseForm} />
      </aside>
    </div>
  );
}

function DashboardCalendar({
  events,
  calendarReady,
  calendarEmpty,
  sessionError,
}: {
  events: CalendarEvent[];
  calendarReady: boolean;
  calendarEmpty: boolean;
  sessionError: boolean;
}) {
  const { year, month } = getLocalMonth();

  return (
    <section className="dashboard-calendar" aria-labelledby="dashboard-calendar-heading">
      <div className="section-heading">
        <h2 id="dashboard-calendar-heading">Calendar</h2>
        <Link className="new-link" to="/calendar">Open calendar</Link>
      </div>
      {!calendarReady && !sessionError && <p role="status">Loading calendar...</p>}
      {sessionError && <p className="form-error" role="alert">Could not load study sessions.</p>}
      {calendarEmpty && (
        // Study sessions are planned on the Calendar page, which has the form.
        <EmptyState message="No dated tasks or study sessions yet.">
          <Link className="empty-state-action" to="/calendar">Plan a study session</Link>
        </EmptyState>
      )}
      {calendarReady && (
        <CalendarMonth year={year} month={month} events={events} variant="compact" />
      )}
    </section>
  );
}
