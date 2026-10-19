import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listStudySessions } from "../api/studySessions";
import { useAuth } from "../context/AuthContext";
import CalendarMonth from "../components/calendar/CalendarMonth";
import { formatCalendarDate, getLocalMonth } from "../components/calendar/calendarDates";
import { buildCalendarEvents, getUpcomingEvents } from "../components/calendar/calendarEvents";
import CourseForm from "../components/courses/CourseForm";
import CourseList from "../components/courses/CourseList";
import TodoPanel from "../components/todos/TodoPanel";
import type { CalendarEvent } from "../types/calendar";
import type { Course } from "../types/course";
import type { StudySession } from "../types/studySession";
import type { TodoItem } from "../types/todo";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export default function DashboardPage({
  refreshKey,
  onCourseCreated,
}: {
  refreshKey: number;
  onCourseCreated: () => void;
}) {
  const { user, accessToken } = useAuth();
  const [courses, setCourses] = useState<Course[] | null>(null);
  const [todos, setTodos] = useState<TodoItem[] | null>(null);
  const [sessions, setSessions] = useState<StudySession[] | null>(null);
  const [sessionError, setSessionError] = useState(false);
  const pending = todos?.filter((todo) => !todo.is_completed).length;
  // TodoPanel replaces this array when a task is added or completed, so the calendar follows that list.
  const calendarReady = todos !== null || sessions !== null;
  const upcomingReady = todos !== null && (sessions !== null || sessionError);
  const events = buildCalendarEvents(todos ?? [], sessions ?? []);
  const upcoming = getUpcomingEvents(events, formatCalendarDate(new Date()));
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
  }, [accessToken]);

  return (
    <div className="dashboard-page">
      <section className="welcome-banner">
        <div>
          <h2>{greeting}</h2>
          <p>Ready to make some progress today?</p>
          <a className="banner-button" href="#tasks">View my tasks →</a>
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

      <div className="dashboard-columns">
        <div className="dashboard-column">
          <div className="section-heading">
            <h2 id="courses">My Courses</h2>
            <a className="new-link" href="#course-name">+ New</a>
          </div>
          <CourseList refreshKey={refreshKey} onCourses={setCourses} embedded />
          <CourseForm onCreated={onCourseCreated} />
        </div>

        <div className="dashboard-column">
          <DashboardCalendar events={events} calendarReady={calendarReady} sessionError={sessionError} />
          <UpcomingActivities events={upcomingReady ? upcoming : null} />
          <TodoPanel refreshKey={refreshKey} onTodos={setTodos} />
        </div>
      </div>
    </div>
  );
}

function DashboardCalendar({
  events,
  calendarReady,
  sessionError,
}: {
  events: CalendarEvent[];
  calendarReady: boolean;
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
      {calendarReady && (
        <CalendarMonth year={year} month={month} events={events} variant="compact" />
      )}
    </section>
  );
}

function UpcomingActivities({ events }: { events: CalendarEvent[] | null }) {
  return (
    <section className="upcoming-card" aria-labelledby="upcoming-heading">
      <h2 id="upcoming-heading">Upcoming</h2>
      {events === null && <p role="status">Loading upcoming activities...</p>}
      {events?.length === 0 && <p className="upcoming-empty">No upcoming activities.</p>}
      {events && events.length > 0 && (
        <ul>
          {events.slice(0, 3).map((event) => (
            <li key={event.key}>
              <strong>{event.title}</strong>
              <span>
                {event.source === "todo" ? "Task" : "Study session"}
                {" · "}
                {formatActivityDate(event)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function formatActivityDate(event: CalendarEvent): string {
  const [year, month, day] = event.date.split("-").map(Number);
  const monthName = MONTHS[month - 1];
  const dateLabel = year && monthName && day ? `${monthName} ${day}, ${year}` : event.date;
  if (!event.time) return dateLabel;
  return `${dateLabel}, ${event.time.slice(0, 5)}`;
}

function Panda() {
  return (
    <svg className="panda" viewBox="0 0 120 120" role="img" aria-label="A panda reading">
      <circle cx="60" cy="64" r="46" fill="#FFE8C7" />
      <circle cx="34" cy="28" r="14" fill="#26334D" />
      <circle cx="86" cy="28" r="14" fill="#26334D" />
      <circle cx="60" cy="62" r="32" fill="#fff" />
      <ellipse cx="46" cy="58" rx="10" ry="12" fill="#26334D" />
      <ellipse cx="74" cy="58" rx="10" ry="12" fill="#26334D" />
      <circle cx="48" cy="56" r="3.5" fill="#fff" />
      <circle cx="76" cy="56" r="3.5" fill="#fff" />
      <ellipse cx="60" cy="72" rx="5" ry="3.5" fill="#26334D" />
      <path d="M52 78c3 4 13 4 16 0" fill="none" stroke="#26334D" strokeWidth="2" strokeLinecap="round" />
      <rect x="38" y="84" width="44" height="28" rx="4" fill="#F4E4C8" stroke="#26334D" strokeWidth="2" />
      <path d="M44 92h32M44 98h24" stroke="#7387E8" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
