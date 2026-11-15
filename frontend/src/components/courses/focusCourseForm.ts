import { revealAndFocus } from "../shared/revealAndFocus";

// Shortcut for every "create a course" button: bring the course form into view and put the
// cursor in its name field. Unlike an #course-name link, this focuses the field and leaves the
// URL and history alone. Returns false when the page has no course form.
export function focusCourseForm(): boolean {
  const input = document.getElementById("course-name");
  return input instanceof HTMLInputElement && revealAndFocus(input);
}
