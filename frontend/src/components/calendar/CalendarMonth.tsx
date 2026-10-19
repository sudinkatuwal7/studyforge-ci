import { useEffect, useId, useMemo, useState } from "react";
import type { CalendarEvent } from "../../types/calendar";
import { groupActivitiesByDate, type ColoredActivity } from "./calendarActivities";
import { buildMonthGrid, getLocalMonth, shiftMonth } from "./calendarDates";
import "./Calendar.css";

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

type CalendarMonthProps = {
  year: number;
  month: number;
  events: readonly CalendarEvent[];
  variant?: "compact" | "full";
  today?: Date;
};

function formatCalendarDayLabel(date: string): string {
  // Split the stored YYYY-MM-DD string. Parsing it with Date would use UTC and can show the previous day.
  const [year, month, day] = date.split("-");
  return `${MONTH_NAMES[Number(month) - 1]} ${Number(day)}, ${year}`;
}

function formatActivityTime(time: string | null): string | null {
  // Keep the entered clock time. The first five characters are HH:MM.
  if (!time) return null;
  return time.slice(0, 5);
}

function ActivityList({ activities }: { activities: readonly ColoredActivity[] }) {
  return (
    <ul className="calendar-activities">
      {activities.map((activity) => (
        <li
          key={activity.key}
          className={activity.isCompleted ? "calendar-activity calendar-activity-completed" : "calendar-activity"}
          style={{ borderColor: activity.color }}
        >
          <span className="calendar-activity-label">{activity.sourceLabel}</span>
          <span className="calendar-activity-title">{activity.title}</span>
          {formatActivityTime(activity.time) && (
            <span className="calendar-activity-time">{formatActivityTime(activity.time)}</span>
          )}
        </li>
      ))}
    </ul>
  );
}

export default function CalendarMonth({
  year,
  month,
  events,
  variant = "full",
  today,
}: CalendarMonthProps) {
  const selectedHeadingId = useId();
  const [visibleYear, setVisibleYear] = useState(year);
  const [visibleMonth, setVisibleMonth] = useState(month);
  // A parent can still choose the starting month. The buttons then move this copy.
  useEffect(() => {
    setVisibleYear(year);
    setVisibleMonth(month);
  }, [year, month]);

  const weeks = buildMonthGrid(visibleYear, visibleMonth);
  const activitiesByDate = useMemo(() => groupActivitiesByDate(events), [events]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  function showMonth(offset: number) {
    // Stay put when the move would leave the four-digit year range.
    let next: { year: number; month: number };
    try {
      next = shiftMonth(visibleYear, visibleMonth, offset);
    } catch (error) {
      if (error instanceof RangeError) return;
      throw error;
    }
    setVisibleYear(next.year);
    setVisibleMonth(next.month);
  }

  function showToday() {
    const current = getLocalMonth(today);
    setVisibleYear(current.year);
    setVisibleMonth(current.month);
  }

  // Drop a selection that is no longer on screen after the month changes.
  const visibleDate = selectedDate && weeks.some((week) => week.some((day) => day.date === selectedDate))
    ? selectedDate
    : null;
  const selectedActivities = visibleDate ? activitiesByDate.get(visibleDate)?.activities ?? [] : [];

  return (
    <div className={`calendar-month calendar-month-${variant}`}>
      <div className="calendar-nav">
        <button type="button" onClick={() => showMonth(-1)}>Previous month</button>
        <p className="calendar-month-label" aria-live="polite">
          {MONTH_NAMES[visibleMonth - 1]} {visibleYear}
        </p>
        <button type="button" onClick={showToday}>Today</button>
        <button type="button" onClick={() => showMonth(1)}>Next month</button>
      </div>
      <div className="calendar-weekdays" aria-hidden="true">
        {WEEKDAYS.map((weekday) => (
          <div key={weekday}>{weekday.slice(0, 3)}</div>
        ))}
      </div>
      {weeks.map((week) => (
        <div key={week[0].date} className="calendar-week">
          {week.map((day, dayIndex) => {
            const activities = activitiesByDate.get(day.date)?.activities ?? [];
            const dots = activitiesByDate.get(day.date);
            const isSelected = visibleDate === day.date;
            const activityCount = activities.length === 1 ? "1 activity" : `${activities.length} activities`;
            return (
              <button
                key={day.date}
                type="button"
                aria-pressed={isSelected}
                aria-label={`${WEEKDAYS[dayIndex]}, ${formatCalendarDayLabel(day.date)}, ${activities.length === 0 ? "no activities" : activityCount}`}
                className={[
                  "calendar-day-button",
                  day.inCurrentMonth ? "" : "calendar-day-outside",
                  isSelected ? "calendar-day-selected" : "",
                ].filter(Boolean).join(" ")}
                onClick={() => setSelectedDate(day.date)}
              >
                <span className="calendar-day-number">{day.dayNumber}</span>
                {activities.length > 0 && (
                  <span className="calendar-dots" aria-hidden="true">
                    {dots?.dots.map((dot) => (
                      <span
                        key={dot.key}
                        className="calendar-dot"
                        style={{ backgroundColor: dot.color }}
                      />
                    ))}
                    {(dots?.extraDotCount ?? 0) > 0 && (
                      <span className="calendar-dot-extra">+{dots?.extraDotCount}</span>
                    )}
                  </span>
                )}
                {variant === "full" && activities.length > 0 && <ActivityList activities={activities} />}
                {variant === "compact" && activities.length > 0 && (
                  <span className="calendar-activity-summary">
                    {activities.map((activity) => `${activity.sourceLabel}: ${activity.title}`).join(", ")}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      ))}
      <section className="calendar-selected" aria-live="polite" aria-labelledby={selectedHeadingId}>
        {visibleDate ? (
          <>
            <h2 id={selectedHeadingId}>{formatCalendarDayLabel(visibleDate)}</h2>
            {selectedActivities.length > 0 ? (
              <ActivityList activities={selectedActivities} />
            ) : (
              <p>No activities on this day.</p>
            )}
          </>
        ) : (
          <>
            <h2 id={selectedHeadingId} className="calendar-activity-summary">Selected day</h2>
            <p>Select a date to see its activities.</p>
          </>
        )}
      </section>
    </div>
  );
}
