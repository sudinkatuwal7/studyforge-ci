// Each course workspace section has its own URL: /courses/:courseId/:section.
export const courseSections = [
  { slug: "materials", label: "Materials" },
  { slug: "notes", label: "Notes" },
  { slug: "quizzes", label: "Quizzes" },
  { slug: "tasks", label: "Tasks" },
] as const;

export type CourseSection = typeof courseSections[number]["slug"];

export function isCourseSection(value: string | undefined): value is CourseSection {
  return courseSections.some((section) => section.slug === value);
}

export function coursePath(courseId: number | string, section: CourseSection = "materials") {
  return `/courses/${courseId}/${section}`;
}
