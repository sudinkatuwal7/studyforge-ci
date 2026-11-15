import type { CalendarEvent } from "../../types/calendar";
import type { StudySession } from "../../types/studySession";
import type { TodoItem } from "../../types/todo";
import { addDaysToDate } from "./calendarDates";

function compareEvents(left: CalendarEvent, right: CalendarEvent): number {
  // ISO dates sort as strings; avoiding Date parsing keeps the original calendar day.
  const byDate = left.date.localeCompare(right.date);
  if (byDate !== 0) return byDate;
  const byTime = (left.time ?? "").localeCompare(right.time ?? "");
  if (byTime !== 0) return byTime;
  // Untimed entries come first, with stable ordering when sources share a date/time.
  if (left.source !== right.source) return left.source === "todo" ? -1 : 1;
  return left.sourceId - right.sourceId;
}

export function buildCalendarEvents(
  todos: readonly TodoItem[],
  sessions: readonly StudySession[],
): CalendarEvent[] {
  const events: CalendarEvent[] = [];
  for (const todo of todos) {
    // Undated tasks remain in the To-Do list; completed dated tasks stay on the calendar.
    if (!todo.due_date) continue;
    events.push({
      key: `todo:${todo.id}`,
      source: "todo",
      sourceId: todo.id,
      title: todo.title,
      courseId: todo.course,
      date: todo.due_date,
      time: null,
      isCompleted: todo.is_completed,
    });
  }
  for (const session of sessions) {
    events.push({
      key: `session:${session.id}`,
      source: "session",
      sourceId: session.id,
      title: session.title,
      courseId: session.course,
      date: session.date,
      time: session.time,
      isCompleted: false,
    });
  }
  return events.sort(compareEvents);
}

// The dashboard's Upcoming window: today and the next 6 days (SCRUM-124 criterion 1, "the next 7 days").
export const UPCOMING_DAYS = 7;

export function getUpcomingEvents(
  events: readonly CalendarEvent[],
  today: string,
  // How many calendar days to include, counting today (7 = today and the next 6 days).
  // Leave it out to include every future day.
  days?: number,
): CalendarEvent[] {
  // The caller supplies local today as YYYY-MM-DD; keep all of today's sessions.
  const last = days === undefined ? null : addDaysToDate(today, days - 1);
  return events
    .filter((event) => event.date >= today && (last === null || event.date <= last) && !event.isCompleted)
    .sort(compareEvents);
}
