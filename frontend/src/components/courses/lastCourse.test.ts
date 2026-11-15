import { afterEach, expect, it, vi } from "vitest";
import { forgetLastCourse, readLastCourse, saveLastCourse } from "./lastCourse";

afterEach(() => { vi.restoreAllMocks(); localStorage.clear(); });

it("saves and reads the last course per account", () => {
  saveLastCourse(1, 7);
  saveLastCourse(2, 8);
  expect(readLastCourse(1)).toBe(7);
  expect(readLastCourse(2)).toBe(8);
  expect(readLastCourse(3)).toBeNull();
});

it("ignores a stale or corrupted entry", () => {
  localStorage.setItem("studyforge:lastCourse:1", "not json");
  expect(readLastCourse(1)).toBeNull();
  localStorage.setItem("studyforge:lastCourse:1", "\"7\"");
  expect(readLastCourse(1)).toBeNull();
});

it("forgets the course only if it is still the saved one", () => {
  saveLastCourse(1, 7);
  forgetLastCourse(1, 8);
  expect(readLastCourse(1)).toBe(7);
  forgetLastCourse(1, 7);
  expect(readLastCourse(1)).toBeNull();
});

it("keeps working when storage is blocked", () => {
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
  expect(() => saveLastCourse(1, 7)).not.toThrow();
  expect(readLastCourse(1)).toBeNull();
  expect(() => forgetLastCourse(1, 7)).not.toThrow();
});
