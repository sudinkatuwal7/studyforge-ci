import { describe, expect, it } from "vitest";
import { buildMonthGrid, getLocalMonth } from "./calendarDates";

describe("buildMonthGrid", () => {
  it("builds Sunday-first weeks and marks days outside the requested month", () => {
    // 1 Oct 2026 is a Thursday, so the first week starts on Sunday 27 Sep.
    const weeks = buildMonthGrid(2026, 10);

    expect(weeks[0].map((day) => day.date)).toEqual([
      "2026-09-27", "2026-09-28", "2026-09-29", "2026-09-30",
      "2026-10-01", "2026-10-02", "2026-10-03",
    ]);
    expect(weeks[0].map((day) => day.inCurrentMonth)).toEqual([
      false, false, false, false, true, true, true,
    ]);
    expect(weeks.at(-1)?.at(-1)?.date).toBe("2026-10-31");
    expect(weeks.every((week) => week.length === 7)).toBe(true);
  });

  it("crosses the year boundary in January and December", () => {
    const january = buildMonthGrid(2026, 1);
    expect(january[0][0]).toMatchObject({ date: "2025-12-28", dayNumber: 28, inCurrentMonth: false });
    expect(january[0][4]).toMatchObject({ date: "2026-01-01", dayNumber: 1, inCurrentMonth: true });

    const december = buildMonthGrid(2026, 12);
    expect(december.at(-1)?.at(-1)).toMatchObject({
      date: "2027-01-02", dayNumber: 2, inCurrentMonth: false,
    });
  });

  it("includes 29 February in a leap year and stops on the 28th otherwise", () => {
    const leapDates = buildMonthGrid(2028, 2).flat().map((day) => day.date);
    expect(leapDates).toContain("2028-02-29");

    const nonLeapDates = buildMonthGrid(2026, 2).flat().filter((day) => day.inCurrentMonth);
    expect(nonLeapDates).toHaveLength(28);
    expect(nonLeapDates.at(-1)?.date).toBe("2026-02-28");
  });

  it("rejects a month outside 1–12", () => {
    expect(() => buildMonthGrid(2026, 0)).toThrow(RangeError);
    expect(() => buildMonthGrid(2026, 13)).toThrow(RangeError);
  });
  it("rejects a year that is not four digits", () => {
    expect(() => buildMonthGrid(-1, 1)).toThrow(RangeError);
    expect(() => buildMonthGrid(0, 1)).toThrow(RangeError);
    expect(() => buildMonthGrid(99, 1)).toThrow(RangeError);
    expect(() => buildMonthGrid(10000, 1)).toThrow(RangeError);
  });
});

describe("getLocalMonth", () => {
  it("reads the local month from a valid date", () => {
    expect(getLocalMonth(new Date(2026, 9, 18))).toEqual({ year: 2026, month: 10 });
  });

  it("rejects an invalid date", () => {
    expect(() => getLocalMonth(new Date(NaN))).toThrow(RangeError);
    expect(() => getLocalMonth(new Date("not-a-date"))).toThrow(RangeError);
  });
});
