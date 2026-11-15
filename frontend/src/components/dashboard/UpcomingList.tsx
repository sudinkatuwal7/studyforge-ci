import { Link } from "react-router-dom";
import type { CalendarEvent } from "../../types/calendar";
import type { Course } from "../../types/course";
import { courseColor } from "../calendar/calendarActivities";
import { addDaysToDate } from "../calendar/calendarDates";
import { UPCOMING_DAYS } from "../calendar/calendarEvents";
import EmptyState from "../shared/EmptyState";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// "Today", "Tomorrow", or "Wed, Oct 21". Built from the YYYY-MM-DD parts in UTC so the
// stored calendar day never shifts with the student's time zone.
function dayLabel(date: string, today: string): string {
  if (date === today) return "Today";
  if (date === addDaysToDate(today, 1)) return "Tomorrow";
  const [year, month, day] = date.split("-").map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return `${WEEKDAYS[weekday]}, ${MONTHS[month - 1]} ${day}`;
}

type Props = {
  // null while to-dos (or study sessions) are still loading.
  events: CalendarEvent[] | null;
  today: string;
  courses: Course[] | null;
  // Study sessions failed to load, so only tasks can be listed.
  sessionsFailed: boolean;
};

export default function UpcomingList({ events, today, courses, sessionsFailed }: Props) {
  const courseNames = new Map((courses ?? []).map((course) => [course.id, course.name]));

  return (
    <section className="upcoming-card" aria-labelledby="upcoming-heading">
      <div className="section-heading">
        <h2 id="upcoming-heading">Upcoming</h2>
        <Link className="new-link" to="/calendar">Open calendar</Link>
      </div>
      <p className="upcoming-range">Tasks and study sessions in the next {UPCOMING_DAYS} days</p>

      {events === null && <p role="status">Loading upcoming tasks and study sessions...</p>}
      {sessionsFailed && events !== null && (
        <p className="form-error" role="alert">Study sessions could not be loaded, so only tasks are shown.</p>
      )}
      {events !== null && events.length === 0 && (
        <EmptyState message={sessionsFailed ? `No tasks due in the next ${UPCOMING_DAYS} days.` : `Nothing due in the next ${UPCOMING_DAYS} days.`}>
          <Link className="empty-state-action" to="/tasks">Add a task</Link>
          <Link className="empty-state-action empty-state-action-secondary" to="/calendar">Plan a study session</Link>
        </EmptyState>
      )}
      {events !== null && events.length > 0 && (
        <ul className="upcoming-list">
          {events.map((event) => {
            const courseName = courseNames.get(event.courseId);
            return (
              <li key={event.key} className="upcoming-item">
                <span className="upcoming-dot" style={{ background: courseColor(event.courseId) }} aria-hidden="true" />
                <div className="upcoming-text">
                  <strong>{event.title}</strong>
                  {/* Type in words, so the course is not identified by colour alone. */}
                  <p>{event.source === "todo" ? "Task" : "Study session"}{courseName && ` · ${courseName}`}</p>
                </div>
                <time className="upcoming-when" dateTime={event.time ? `${event.date}T${event.time.slice(0, 5)}` : event.date}>
                  {dayLabel(event.date, today)}
                  {event.time && ` · ${event.time.slice(0, 5)}`}
                </time>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
