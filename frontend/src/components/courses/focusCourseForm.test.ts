import { afterEach, expect, it, vi } from "vitest";
import { focusCourseForm } from "./focusCourseForm";

afterEach(() => {
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function addCourseForm() {
  document.body.innerHTML = `<button id="start">Start</button><form><input id="course-name" /></form>`;
  const input = document.getElementById("course-name") as HTMLInputElement;
  const scrollIntoView = vi.fn();
  input.scrollIntoView = scrollIntoView;
  return { input, scrollIntoView };
}

it("focuses the course name field and scrolls it into view smoothly", () => {
  const { input, scrollIntoView } = addCourseForm();
  document.getElementById("start")!.focus();

  expect(focusCourseForm()).toBe(true);
  expect(input).toHaveFocus();
  expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "center" });
});

it("jumps without animation when the student prefers reduced motion", () => {
  vi.stubGlobal("matchMedia", vi.fn((query: string) => ({ matches: query === "(prefers-reduced-motion: reduce)" })));
  const { scrollIntoView } = addCourseForm();

  focusCourseForm();
  expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "auto", block: "center" });
});

it("leaves the address and history unchanged", () => {
  addCourseForm();
  const before = { url: window.location.href, length: window.history.length };

  focusCourseForm();
  expect(window.location.href).toBe(before.url);
  expect(window.history.length).toBe(before.length);
});

it("does nothing when the page has no course form", () => {
  expect(focusCourseForm()).toBe(false);
});

it("still focuses the field where scrollIntoView is unavailable", () => {
  document.body.innerHTML = `<input id="course-name" />`;
  const input = document.getElementById("course-name") as HTMLInputElement;
  Object.defineProperty(input, "scrollIntoView", { value: undefined });

  expect(focusCourseForm()).toBe(true);
  expect(input).toHaveFocus();
});
