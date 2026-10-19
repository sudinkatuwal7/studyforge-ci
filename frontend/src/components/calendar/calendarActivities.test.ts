import { describe, expect, it } from "vitest";
import type { CalendarEvent } from "../../types/calendar";
import { courseColor, groupActivitiesByDate } from "./calendarActivities";

function event(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    key: "todo:1",
    source: "todo",
    sourceId: 1,
    title: "Read chapter",
    courseId: 1,
    date: "2026-10-18",
    time: null,
    isCompleted: false,
    ...overrides,
  };
}

describe("courseColor", () => {
  it("keeps one color per course and repeats after the palette ends", () => {
    expect(courseColor(1)).toBe("#1d4ed8");
    expect(courseColor(2)).not.toBe(courseColor(1));
    expect(courseColor(9)).toBe(courseColor(1));
  });

  it("uses a neutral color when the course id is not a positive integer", () => {
    expect(courseColor(0)).toBe("#64748b");
    expect(courseColor(-3)).toBe("#64748b");
  });
});

describe("groupActivitiesByDate", () => {
  it("colors each activity by course and labels tasks separately from study sessions", () => {
    const grouped = groupActivitiesByDate([
      event(),
      event({
        key: "session:4",
        source: "session",
        sourceId: 4,
        title: "Review graphs",
        courseId: 2,
        time: "09:30:00",
      }),
    ]);
    const day = grouped.get("2026-10-18");

    expect(day?.activities).toEqual([
      {
        key: "todo:1",
        title: "Read chapter",
        courseId: 1,
        color: courseColor(1),
        source: "todo",
        sourceLabel: "Task",
        isCompleted: false,
        time: null,
      },
      {
        key: "session:4",
        title: "Review graphs",
        courseId: 2,
        color: courseColor(2),
        source: "session",
        sourceLabel: "Study session",
        isCompleted: false,
        time: "09:30:00",
      },
    ]);
    expect(day?.dots.map((dot) => dot.color)).toEqual([courseColor(1), courseColor(2)]);
    expect(day?.extraDotCount).toBe(0);
  });

  it("keeps a completed task and caps the visible dots", () => {
    const events = [1, 2, 3, 4].map((id) => event({
      key: `todo:${id}`,
      sourceId: id,
      courseId: id,
      isCompleted: id === 1,
    }));
    const day = groupActivitiesByDate(events).get("2026-10-18");

    expect(day?.activities[0].isCompleted).toBe(true);
    expect(day?.dots).toHaveLength(3);
    expect(day?.extraDotCount).toBe(1);
  });

  it("does not change the original events", () => {
    const events = Object.freeze([Object.freeze(event())]);
    groupActivitiesByDate(events);
    expect(events[0].title).toBe("Read chapter");
  });
});
