import type { CalendarEvent } from "../../types/calendar";
import type { StudySession } from "../../types/studySession";
import type { TodoItem } from "../../types/todo";

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

export function getUpcomingEvents(
  events: readonly CalendarEvent[],
  today: string,
): CalendarEvent[] {
  // The caller supplies local today as YYYY-MM-DD; keep all of today's sessions.
  return events
    .filter((event) => event.date >= today && !event.isCompleted)
    .sort(compareEvents);
}
