// One cell in the month grid. date stays YYYY-MM-DD so later event matching does not use timestamps.
export interface CalendarDay {
  date: string;
  dayNumber: number;
  inCurrentMonth: boolean;
}

function formatCalendarDate(date: Date): string {
  // Local calendar parts avoid Date.parse("YYYY-MM-DD"), which is UTC and can land on the previous day.
  const year = date.getFullYear();
  // getMonth() is 0–11, so add 1 before padding to 01–12.
  const month = String(date.getMonth() + 1).padStart(2, "0");
  // getDate() is the day of the month, 1–31, padded to 01–31.
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function buildMonthGrid(year: number, month: number): CalendarDay[][] {
  // A four-digit year keeps dates as YYYY-MM-DD. Years 0–99 would be remapped to 1900–1999.
  if (
    !Number.isInteger(year) || year < 1000 || year > 9999
    || !Number.isInteger(month) || month < 1 || month > 12
  ) {
    throw new RangeError("year must be 1000–9999 and month must be an integer from 1 to 12");
  }

  // Date months are 0–11, so October (10) is passed as 9. Day 1 is the first of that month.
  const firstOfMonth = new Date(year, month - 1, 1);
  // getDay() is 0 on Sunday, so this walks back to the Sunday that starts the first week.
  const gridStart = new Date(year, month - 1, 1 - firstOfMonth.getDay());
  // Day 0 of the next month is the last day of this month, including the 29th in a leap year.
  const lastOfMonth = new Date(year, month, 0);
  // Finish the week that contains the last day, ending on Saturday.
  const gridEnd = new Date(year, month - 1, lastOfMonth.getDate() + (6 - lastOfMonth.getDay()));

  const weeks: CalendarDay[][] = [];
  const cursor = new Date(gridStart);
  while (cursor <= gridEnd) {
    const week: CalendarDay[] = [];
    for (let dayIndex = 0; dayIndex < 7; dayIndex += 1) {
      week.push({
        date: formatCalendarDate(cursor),
        dayNumber: cursor.getDate(),
        // Leading and trailing days belong to the adjacent month, so the UI can dim them.
        inCurrentMonth: cursor.getFullYear() === year && cursor.getMonth() === month - 1,
      });
      // Move one calendar day forward. setDate handles month and year rollover.
      cursor.setDate(cursor.getDate() + 1);
    }
    weeks.push(week);
  }
  return weeks;
}

export function shiftMonth(
  year: number,
  month: number,
  offset: number,
): { year: number; month: number } {
  // Previous passes -1 and Next passes 1. Any other integer offset is also a whole-month move.
  if (
    !Number.isInteger(year) || year < 1000 || year > 9999
    || !Number.isInteger(month) || month < 1 || month > 12
    || !Number.isInteger(offset)
  ) {
    throw new RangeError("year must be 1000–9999 and month must be an integer from 1 to 12");
  }

  // Day 1 of (month + offset). January minus one lands on 1 December of the previous year.
  const shifted = new Date(year, month - 1 + offset, 1);
  const nextYear = shifted.getFullYear();
  const nextMonth = shifted.getMonth() + 1;
  // Reject a result outside 1000–9999 so the grid is never asked to format a bad year.
  if (nextYear < 1000 || nextYear > 9999) {
    throw new RangeError("year must be 1000–9999 and month must be an integer from 1 to 12");
  }
  return { year: nextYear, month: nextMonth };
}

export function getLocalMonth(now: Date = new Date()): { year: number; month: number } {
  // Local parts match the grid. The default Date is the student's current month, not UTC midnight.
  // An invalid Date returns NaN, and NaN comparisons would skip the year check below.
  if (Number.isNaN(now.getTime())) {
    throw new RangeError("date must be valid");
  }
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  if (!Number.isInteger(year) || year < 1000 || year > 9999 || !Number.isInteger(month)) {
    throw new RangeError("year must be 1000–9999 and month must be an integer from 1 to 12");
  }
  return { year, month };
}