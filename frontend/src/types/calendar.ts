// Shared display data; sourceId identifies the original task or study session.
export interface CalendarEvent {
  key: string;
  source: "todo" | "session";
  sourceId: number;
  title: string;
  courseId: number;
  date: string;
  time: string | null;
  isCompleted: boolean;
}
