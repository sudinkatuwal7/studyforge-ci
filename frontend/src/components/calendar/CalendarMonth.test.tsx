import "../../test/dialogMock";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import type { CalendarEvent } from "../../types/calendar";
import { courseColor } from "./calendarActivities";
import CalendarMonth from "./CalendarMonth";

const task: CalendarEvent = {
  key: "todo:1",
  source: "todo",
  sourceId: 1,
  title: "Read chapter",
  courseId: 1,
  date: "2026-10-18",
  time: null,
  isCompleted: true,
};

const session: CalendarEvent = {
  key: "session:4",
  source: "session",
  sourceId: 4,
  title: "Review graphs",
  courseId: 2,
  date: "2026-10-18",
  time: "09:30:00",
  isCompleted: false,
};

describe("CalendarMonth", () => {
  it("shows course-colored activities and one dot per activity", () => {
    const { container } = render(
      <CalendarMonth year={2026} month={10} events={[task, session]} />,
    );

    expect(screen.getByText("Read chapter")).toBeInTheDocument();
    expect(screen.getByText("Task")).toBeInTheDocument();
    expect(screen.getByText("Review graphs")).toBeInTheDocument();
    expect(screen.getByText("Study session")).toBeInTheDocument();

    const dots = container.querySelectorAll(".calendar-dot");
    expect(dots).toHaveLength(2);
    expect(dots[0]).toHaveStyle({ backgroundColor: courseColor(1) });
    expect(dots[1]).toHaveStyle({ backgroundColor: courseColor(2) });
    expect(container.querySelector(".calendar-activity-completed")).toBeInTheDocument();
  });

  it("shows the clicked day's activities and replaces them for another day", async () => {
    const user = userEvent.setup();
    render(<CalendarMonth year={2026} month={10} events={[task, session]} />);
    expect(screen.getByText("Select a date to see its activities.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Sunday, October 18, 2026, 2 activities/ }));
    const selected = screen.getByRole("region", { name: "October 18, 2026" });
    expect(within(selected).getByText("Read chapter")).toBeInTheDocument();
    expect(within(selected).getByText("Review graphs")).toBeInTheDocument();
    expect(within(selected).getByText("09:30")).toBeInTheDocument();
    expect(within(selected).getByText("Task")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Monday, October 19, 2026, no activities/ }));
    expect(screen.getByRole("region", { name: "October 19, 2026" })).toBeInTheDocument();
    expect(screen.getByText("No activities on this day.")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "October 18, 2026" })).not.toBeInTheDocument();
  });

  it("shows dots without activity titles in the compact layout", () => {
    const { container } = render(
      <CalendarMonth year={2026} month={10} events={[task]} variant="compact" />,
    );

    expect(screen.queryByText("Read chapter")).not.toBeInTheDocument();
    expect(container.querySelectorAll(".calendar-dot")).toHaveLength(1);
    expect(screen.getByText("Task: Read chapter")).toBeInTheDocument();
  });

  it("moves between months with the arrow buttons and marks today", async () => {
    const user = userEvent.setup();
    render(
      <CalendarMonth year={2026} month={10} events={[]} today={new Date(2026, 9, 18)} />,
    );

    expect(screen.getByText("October 2026")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Previous month" }));
    expect(screen.getByText("September 2026")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /October 18, 2026/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Next month" }));
    await user.click(screen.getByRole("button", { name: "Next month" }));
    expect(screen.getByText("November 2026")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Previous month" }));
    expect(screen.getByText("October 2026")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Sunday, October 18, 2026, no activities/ })).toHaveClass("calendar-day-today");
    expect(screen.queryByRole("button", { name: "Today" })).not.toBeInTheDocument();
  });

  it("shows a compact day's activities after that date is clicked", async () => {
    const user = userEvent.setup();
    render(<CalendarMonth year={2026} month={10} events={[task]} variant="compact" />);

    await user.click(screen.getByRole("button", { name: /Sunday, October 18, 2026, 1 activity/ }));
    const selected = screen.getByRole("dialog", { name: "October 18, 2026" });
    expect(within(selected).getByText("Read chapter")).toBeInTheDocument();
    expect(within(selected).getByText("Task")).toBeInTheDocument();
    await user.click(within(selected).getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Monday, October 19, 2026/ }));
    expect(within(screen.getByRole("dialog")).getByText("No activities on this day.")).toBeInTheDocument();
  });
});
