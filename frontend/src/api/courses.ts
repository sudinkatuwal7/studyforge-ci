import { getJson } from "./client";
import type { Course } from "../types/course";

export class NotLoggedInError extends Error {
  constructor() {
    super("Log in to see your courses.");
    this.name = "NotLoggedInError";
  }
}

export function listCourses(): Promise<Course[]> {
  const token = localStorage.getItem("access");
  if (!token) {
    return Promise.reject(new NotLoggedInError());
  }

  return getJson<Course[]>("/courses/", { token });
}
