import { describe, expect, it } from "vitest";
import type { StudySession } from "../../types/studySession";
import type { TodoItem } from "../../types/todo";
import { buildCalendarEvents, getUpcomingEvents } from "./calendarEvents";

function todo(overrides: Partial<TodoItem> = {}): TodoItem {
  return {
    id: 1, title: "Read chapter", course: 7, due_date: "2026-10-22",
    is_completed: false, created_at: "2026-10-18T12:00:00Z", ...overrides,
  };
}

function session(overrides: Partial<StudySession> = {}): StudySession {
  return {
    id: 1, title: "Review graphs", course: 8, date: "2026-10-22", time: "09:30:00",
    created_at: "2026-10-18T12:00:00Z", updated_at: "2026-10-18T12:00:00Z", ...overrides,
  };
}

describe("unified calendar events", () => {
  it("keeps source IDs distinct while preserving titles, courses, dates, and times", () => {
    expect(buildCalendarEvents([todo()], [session()])).toEqual([
      {
        key: "todo:1", source: "todo", sourceId: 1, title: "Read chapter", courseId: 7,
        date: "2026-10-22", time: null, isCompleted: false,
      },
      {
        key: "session:1", source: "session", sourceId: 1, title: "Review graphs", courseId: 8,
        date: "2026-10-22", time: "09:30:00", isCompleted: false,
      },
    ]);
  });

  it("includes completed dated tasks but excludes undated tasks", () => {
    const events = buildCalendarEvents([
      todo({ id: 1, is_completed: true }),
      todo({ id: 2, due_date: null }),
      todo({ id: 3 }),
    ], []);
    expect(events.map((event) => event.key)).toEqual(["todo:1", "todo:3"]);
    expect(events[0].isCompleted).toBe(true);
  });

  it("sorts across years, then untimed entries, clock time, source, and numeric ID", () => {
    const events = buildCalendarEvents([
      todo({ id: 10 }), todo({ id: 2 }),
      todo({ id: 3, due_date: "2027-01-01" }),
      todo({ id: 4, due_date: "2026-09-30" }),
    ], [
      session({ id: 10, time: "15:00:00" }),
      session({ id: 2, time: "15:00:00" }),
      session({ id: 3, time: "00:00:00" }),
      session({ id: 4, time: null }),
      session({ id: 5, date: "2025-12-31" }),
    ]);
    expect(events.map((event) => event.key)).toEqual([
      "session:5", "todo:4", "todo:2", "todo:10", "session:4", "session:3",
      "session:2", "session:10", "todo:3",
    ]);
  });

  it("preserves leap-day dates and local clock times without converting to timestamps", () => {
    const events = buildCalendarEvents(
      [todo({ due_date: "2028-02-29" })],
      [session({ date: "2028-02-29", time: "00:00:00" })],
    );
    expect(events.map((event) => event.date)).toEqual(["2028-02-29", "2028-02-29"]);
    expect(events[1].time).toBe("00:00:00");
  });

  it("does not change the original task/session records or their ordering", () => {
    const todos = Object.freeze([Object.freeze(todo({ id: 2 })), Object.freeze(todo({ id: 1 }))]);
    const sessions = Object.freeze([Object.freeze(session())]);
    const events = buildCalendarEvents(todos, sessions);
    events[0].title = "Display-only change";
    expect(todos.map((item) => item.id)).toEqual([2, 1]);
    expect(todos[1].title).toBe("Read chapter");
    expect(sessions[0].title).toBe("Review graphs");
  });

  it("handles empty sources", () => {
    expect(buildCalendarEvents([], [])).toEqual([]);
    expect(getUpcomingEvents([], "2026-10-22")).toEqual([]);
  });
});

describe("upcoming calendar events", () => {
  it("excludes overdue/completed work while keeping today's untimed and timed sessions", () => {
    const events = buildCalendarEvents([
      todo({ id: 1, due_date: "2026-10-21" }),
      todo({ id: 2, is_completed: true }),
      todo({ id: 3 }),
      todo({ id: 4, due_date: "2026-10-23" }),
    ], [
      session({ id: 1, date: "2026-10-21" }),
      session({ id: 2, time: "00:00:00" }),
      session({ id: 3, time: null }),
    ]);
    expect(getUpcomingEvents(events, "2026-10-22").map((event) => event.key)).toEqual([
      "todo:3", "session:3", "session:2", "todo:4",
    ]);
    // Filtering the preview must not remove completed or past events from the calendar.
    expect(events).toHaveLength(7);
  });

  it("sorts a new list without mutating the calendar's input order", () => {
    const events = Object.freeze(buildCalendarEvents([], [
      session({ id: 1, date: "2026-12-31" }),
      session({ id: 2, date: "2027-01-01" }),
    ]).reverse());
    expect(getUpcomingEvents(events, "2026-12-31").map((event) => event.key)).toEqual([
      "session:1", "session:2",
    ]);
    expect(events.map((event) => event.key)).toEqual(["session:2", "session:1"]);
    expect(getUpcomingEvents(events, "2027-01-01").map((event) => event.key)).toEqual(["session:2"]);
  });
});
