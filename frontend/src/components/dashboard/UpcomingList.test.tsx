import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { expect, it } from "vitest";
import type { CalendarEvent } from "../../types/calendar";
import type { Course } from "../../types/course";
import UpcomingList from "./UpcomingList";

const today = "2026-10-18"; // a Sunday
const courses: Course[] = [
  { id: 7, name: "English", description: "", owner: 1, created_at: "2026-10-01" },
  { id: 8, name: "Graphs", description: "", owner: 1, created_at: "2026-10-01" },
];
const event = (overrides: Partial<CalendarEvent>): CalendarEvent => ({
  key: "todo:1", source: "todo", sourceId: 1, title: "Read chapter", courseId: 7,
  date: today, time: null, isCompleted: false, ...overrides,
});

function renderList(events: CalendarEvent[] | null, sessionsFailed = false) {
  render(<MemoryRouter><UpcomingList events={events} today={today} courses={courses} sessionsFailed={sessionsFailed} /></MemoryRouter>);
  return within(screen.getByRole("region", { name: "Upcoming" }));
}

it("lists each item in the order given, with its type, course and day", () => {
  const list = renderList([
    event({ key: "session:4", source: "session", sourceId: 4, title: "Review graphs", courseId: 8, time: "09:30:00" }),
    event({ key: "todo:1", date: "2026-10-19" }),
    event({ key: "todo:2", sourceId: 2, title: "Essay outline", date: "2026-10-21" }),
  ]);

  const items = list.getAllByRole("listitem");
  expect(items.map((item) => item.querySelector("strong")?.textContent)).toEqual(["Review graphs", "Read chapter", "Essay outline"]);
  expect(items[0]).toHaveTextContent("Study session · Graphs");
  expect(items[0]).toHaveTextContent("Today · 09:30");
  expect(items[1]).toHaveTextContent("Task · English");
  expect(items[1]).toHaveTextContent("Tomorrow");
  expect(items[2]).toHaveTextContent("Wed, Oct 21");
  expect(items[0].querySelector("time")).toHaveAttribute("datetime", "2026-10-18T09:30");
  expect(items[2].querySelector("time")).toHaveAttribute("datetime", "2026-10-21");
  expect(list.getByText("Tasks and study sessions in the next 7 days")).toBeInTheDocument();
  expect(list.getByRole("link", { name: "Open calendar" })).toHaveAttribute("href", "/calendar");
});

it("leaves out the course name when it is not known yet", () => {
  const list = renderList([event({ courseId: 99 })]);
  expect(list.getByRole("listitem")).toHaveTextContent("Task");
  expect(list.getByRole("listitem")).not.toHaveTextContent("·  ");
  expect(list.getByRole("listitem").querySelector("p")?.textContent).toBe("Task");
});

it("shows loading, not the empty state, before the lists arrive", () => {
  const list = renderList(null);
  expect(list.getByRole("status")).toHaveTextContent("Loading upcoming tasks and study sessions...");
  expect(list.queryByText(/Nothing due/)).not.toBeInTheDocument();
});

it("offers to add a task or plan a session when nothing is due", () => {
  const list = renderList([]);
  expect(list.getByText("Nothing due in the next 7 days.")).toBeInTheDocument();
  expect(list.getByRole("link", { name: "Add a task" })).toHaveAttribute("href", "/tasks");
  expect(list.getByRole("link", { name: "Plan a study session" })).toHaveAttribute("href", "/calendar");
});

it("says only tasks are shown when study sessions failed, and does not claim nothing is due", () => {
  const withTasks = renderList([event({})], true);
  expect(withTasks.getByRole("alert")).toHaveTextContent("Study sessions could not be loaded, so only tasks are shown.");
  expect(withTasks.getByText("Read chapter")).toBeInTheDocument();
});

it("with sessions failed and no tasks, says no tasks are due rather than nothing", () => {
  const list = renderList([], true);
  expect(list.getByRole("alert")).toBeInTheDocument();
  expect(list.getByText("No tasks due in the next 7 days.")).toBeInTheDocument();
  expect(list.queryByText(/Nothing due/)).not.toBeInTheDocument();
});
