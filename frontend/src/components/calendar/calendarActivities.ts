import type { CalendarEvent } from "../../types/calendar";

// Eight distinct colors. The same course id always lands on the same color.
const COURSE_COLORS = [
  "#1d4ed8",
  "#15803d",
  "#b45309",
  "#7e22ce",
  "#be123c",
  "#0f766e",
  "#c2410c",
  "#4338ca",
] as const;

const UNKNOWN_COURSE_COLOR = "#64748b";
// A day cell shows at most this many dots; further activities are counted beside them.
const MAX_DOTS = 3;

export interface ColoredActivity {
  key: string;
  title: string;
  courseId: number;
  color: string;
  source: CalendarEvent["source"];
  sourceLabel: "Task" | "Study session";
  isCompleted: boolean;
  time: string | null;
}

export interface ActivityDot {
  key: string;
  courseId: number;
  color: string;
}

export interface DayActivityDisplay {
  activities: ColoredActivity[];
  dots: ActivityDot[];
  extraDotCount: number;
}

export function courseColor(courseId: number): string {
  // Course ids from the API start at 1. Anything else still gets a visible neutral color.
  if (!Number.isInteger(courseId) || courseId < 1) return UNKNOWN_COURSE_COLOR;
  return COURSE_COLORS[(courseId - 1) % COURSE_COLORS.length];
}

function colorActivity(event: CalendarEvent): ColoredActivity {
  return {
    key: event.key,
    title: event.title,
    courseId: event.courseId,
    color: courseColor(event.courseId),
    source: event.source,
    // Text label so the course is not identified by color alone.
    sourceLabel: event.source === "todo" ? "Task" : "Study session",
    isCompleted: event.isCompleted,
    time: event.time,
  };
}

export function groupActivitiesByDate(
  events: readonly CalendarEvent[],
): Map<string, DayActivityDisplay> {
  const grouped = new Map<string, DayActivityDisplay>();
  for (const event of events) {
    const activity = colorActivity(event);
    const existing = grouped.get(event.date);
    if (existing) {
      existing.activities.push(activity);
      continue;
    }
    grouped.set(event.date, { activities: [activity], dots: [], extraDotCount: 0 });
  }

  for (const day of grouped.values()) {
    // One dot per activity, in the same order, capped so a busy day stays readable.
    day.dots = day.activities.slice(0, MAX_DOTS).map((activity) => ({
      key: activity.key,
      courseId: activity.courseId,
      color: activity.color,
    }));
    day.extraDotCount = day.activities.length - day.dots.length;
  }
  return grouped;
}
