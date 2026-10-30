import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CalendarEvent } from "../../types/calendar";
import { groupActivitiesByDate, type ColoredActivity } from "./calendarActivities";
import { buildMonthGrid, formatCalendarDate, shiftMonth } from "./calendarDates";
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
  highlightDate?: string | null;
  onEditSession?: (sessionId: number) => void;
  onDeleteSession?: (sessionId: number) => void;
};

function formatCalendarDayLabel(date: string): string {
  // Split the stored YYYY-MM-DD string. Parsing it with Date would use UTC and can show the previous day.
  const [year, month, day] = date.split("-");
  return `${MONTH_NAMES[Number(month) - 1]} ${Number(day)}, ${year}`;
}

type PopupPlace = {
  top: number;
  left: number;
  tail: number;
  above: boolean;
};

// Place the dashboard cloud next to the clicked date instead of covering the screen.
function placeCloud(button: HTMLButtonElement, popup: HTMLElement): PopupPlace {
  const day = button.getBoundingClientRect();
  const width = popup.offsetWidth;
  const height = popup.offsetHeight;
  const gap = 10;
  const margin = 8;
  // Keep the cloud on screen when the date is near the left or right edge.
  const left = Math.max(margin, Math.min(day.left + day.width / 2 - width / 2, window.innerWidth - width - margin));
  const belowTop = day.bottom + gap;
  // Flip above the date only when the cloud would otherwise leave the viewport.
  const above = belowTop + height > window.innerHeight - margin && day.top - gap - height > margin;
  return {
    top: above ? day.top - gap - height : belowTop,
    left,
    // The pointer still aims at the date after the cloud is shifted inward.
    tail: Math.min(Math.max(day.left + day.width / 2 - left, 16), Math.max(width - 16, 16)),
    above,
  };
}

function formatActivityTime(time: string | null): string | null {
  // Keep the entered clock time. The first five characters are HH:MM.
  if (!time) return null;
  return time.slice(0, 5);
}

function ActivityList({
  activities,
  pendingDeleteId,
  onEditSession,
  onAskDelete,
  onConfirmDelete,
  onCancelDelete,
}: {
  activities: readonly ColoredActivity[];
  pendingDeleteId?: number | null;
  onEditSession?: (sessionId: number) => void;
  onAskDelete?: (sessionId: number) => void;
  onConfirmDelete?: (sessionId: number) => void;
  onCancelDelete?: () => void;
}) {
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
          {activity.source === "session" && onEditSession && onAskDelete && (
            <span className="calendar-session-actions">
              <button type="button" onClick={() => onEditSession(activity.sourceId)}>
                Edit {activity.title}
              </button>
              {pendingDeleteId === activity.sourceId ? (
                <>
                  <span>Delete this study session?</span>
                  <button type="button" onClick={() => onConfirmDelete?.(activity.sourceId)}>
                    Confirm delete {activity.title}
                  </button>
                  <button type="button" onClick={onCancelDelete}>Cancel delete</button>
                </>
              ) : (
                <button type="button" onClick={() => onAskDelete(activity.sourceId)}>
                  Delete {activity.title}
                </button>
              )}
            </span>
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
  highlightDate = null,
  onEditSession,
  onDeleteSession,
}: CalendarMonthProps) {
  const selectedHeadingId = useId();
  // Names the cloud for assistive technology through its date heading.
  const popupHeadingId = useId();
  const popupRef = useRef<HTMLDivElement>(null);
  // The date button the cloud should stay attached to.
  const anchorButtonRef = useRef<HTMLButtonElement | null>(null);
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
  // The compact dashboard calendar opens a cloud. The full calendar uses the panel below.
  const [popupOpen, setPopupOpen] = useState(false);
  // Null until the cloud has been measured, so it is not painted at the corner first.
  const [popupPlace, setPopupPlace] = useState<PopupPlace | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);
  // After a save, show the session's own date without making the student click it.
  useEffect(() => {
    if (highlightDate) setSelectedDate(highlightDate);
  }, [highlightDate]);

  function showMonth(offset: number) {
    // Stay put when the move would leave the four-digit year range.
    let next: { year: number; month: number };
    try {
      next = shiftMonth(visibleYear, visibleMonth, offset);
    } catch (error) {
      if (error instanceof RangeError) return;
      throw error;
    }
    // A cloud for the old month should not stay open over the new one.
    setPopupOpen(false);
    setVisibleYear(next.year);
    setVisibleMonth(next.month);
  }

  const todayDate = formatCalendarDate(today ?? new Date());

  // Drop a selection that is no longer on screen after the month changes.
  const visibleDate = selectedDate && weeks.some((week) => week.some((day) => day.date === selectedDate))
    ? selectedDate
    : null;
  const selectedActivities = visibleDate ? activitiesByDate.get(visibleDate)?.activities ?? [] : [];
  // The cloud grows with its list, so a new count means it must be measured again.
  const popupActivityCount = selectedActivities.length;

  // Measure before paint, then follow the date when the page resizes or scrolls.
  useLayoutEffect(() => {
    if (!popupOpen || !anchorButtonRef.current || !popupRef.current) return;
    const button = anchorButtonRef.current;
    const popup = popupRef.current;
    const update = () => {
      const next = placeCloud(button, popup);
      // Reuse the same object when nothing moved, so measuring does not retrigger itself.
      setPopupPlace((current) => (
        current
        && current.top === next.top
        && current.left === next.left
        && current.tail === next.tail
        && current.above === next.above
          ? current
          : next
      ));
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [popupOpen, visibleDate, popupActivityCount]);

  // Dismiss the cloud from outside it. Another date is handled by that date's own click.
  useEffect(() => {
    if (!popupOpen) return;
    function onPointerDown(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (popupRef.current?.contains(target) || anchorButtonRef.current?.contains(target)) return;
      if (target instanceof Element && target.closest(".calendar-day-button")) return;
      setPopupOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setPopupOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [popupOpen]);

  return (
    <div className={`calendar-month calendar-month-${variant}`}>
      <div className="calendar-nav">
        <button type="button" aria-label="Previous month" onClick={() => showMonth(-1)}>‹</button>
        <p className="calendar-month-label" aria-live="polite">
          {MONTH_NAMES[visibleMonth - 1]} {visibleYear}
        </p>
        <button type="button" aria-label="Next month" onClick={() => showMonth(1)}>›</button>
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
            const isToday = day.date === todayDate;
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
                  isToday ? "calendar-day-today" : "",
                  isSelected ? "calendar-day-selected" : "",
                ].filter(Boolean).join(" ")}
                onClick={(event) => {
                  setSelectedDate(day.date);
                  if (variant === "compact") {
                    anchorButtonRef.current = event.currentTarget;
                    // Clear the previous spot so the cloud is measured against this date.
                    setPopupPlace(null);
                    setPopupOpen(true);
                  }
                }}
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
      {/* Stay hidden until placeCloud has a position, or the cloud flashes at the corner. */}
      {variant === "compact" && popupOpen && visibleDate && (
        <div
          ref={popupRef}
          className={popupPlace?.above ? "calendar-day-popup calendar-day-popup-above" : "calendar-day-popup"}
          role="dialog"
          aria-labelledby={popupHeadingId}
          style={{
            top: popupPlace?.top ?? 0,
            left: popupPlace?.left ?? 0,
            visibility: popupPlace ? "visible" : "hidden",
            "--tail": popupPlace ? `${popupPlace.tail}px` : "50%",
          }}
        >
          <div className="calendar-popup-header">
            <h2 id={popupHeadingId}>{formatCalendarDayLabel(visibleDate)}</h2>
            {/* The visible control is a cross. The label keeps the button name for assistive technology. */}
            <button type="button" aria-label="Close" onClick={() => setPopupOpen(false)}>×</button>
          </div>
          {selectedActivities.length > 0 ? (
            <ActivityList activities={selectedActivities} />
          ) : (
            <p>No activities on this day.</p>
          )}
        </div>
      )}
      {/* The full calendar lists the day under the grid, so it does not use the cloud. */}
      {variant === "full" && (
      <section className="calendar-selected" aria-live="polite" aria-labelledby={selectedHeadingId}>
        {visibleDate ? (
          <>
            <h2 id={selectedHeadingId}>{formatCalendarDayLabel(visibleDate)}</h2>
            {selectedActivities.length > 0 ? (
              <ActivityList
                activities={selectedActivities}
                pendingDeleteId={pendingDeleteId}
                onEditSession={onEditSession}
                onAskDelete={onDeleteSession ? setPendingDeleteId : undefined}
                onConfirmDelete={(sessionId) => {
                  setPendingDeleteId(null);
                  onDeleteSession?.(sessionId);
                }}
                onCancelDelete={() => setPendingDeleteId(null)}
              />
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
      )}
    </div>
  );
}
