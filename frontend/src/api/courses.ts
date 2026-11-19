import { ApiError, getJson, postJson, request } from "./client";
import type { Course } from "../types/course";

// Lets the course list show a login message without sending an unauthenticated request.
export class NotLoggedInError extends Error {
  constructor() {
    super("Log in to see your courses.");
    this.name = "NotLoggedInError";
  }
}

// Components pass the current token from useAuth(); we do not read localStorage.
export function listCourses(accessToken: string | null): Promise<Course[]> {
  if (!accessToken) {
    return Promise.reject(new NotLoggedInError());
  }

  return getJson<Course[]>("/courses/", accessToken);
}

// Django assigns the owner, so the form sends only the name and description.
export function createCourse(
  accessToken: string | null,
  course: { name: string; description: string },
): Promise<Course> {
  if (!accessToken) {
    return Promise.reject(new NotLoggedInError());
  }

  return postJson<Course>("/courses/", course, accessToken);
}

// Fetch one course using the ID from the page URL. Django checks ownership.
export function getCourse(
  accessToken: string | null,
  courseId: string,
): Promise<Course> {
  if (!accessToken) {
    return Promise.reject(new NotLoggedInError());
  }

  return getJson<Course>(`/courses/${encodeURIComponent(courseId)}/`, accessToken);
}

export async function renameCourse(accessToken: string | null, courseId: number, name: string): Promise<Course> {
  if (!accessToken) throw new NotLoggedInError();
  const response = await request(`/courses/${courseId}/`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  }, accessToken);
  if (!response.ok) {
    const data = await response.json().catch(() => null) as { name?: string[] } | null;
    throw new ApiError(response.status, data?.name?.[0]);
  }
  return await response.json() as Course;
}

export async function deleteCourse(accessToken: string | null, courseId: number): Promise<void> {
  if (!accessToken) throw new NotLoggedInError();
  const response = await request(`/courses/${courseId}/`, { method: "DELETE" }, accessToken);
  if (!response.ok) throw new ApiError(response.status);
}
