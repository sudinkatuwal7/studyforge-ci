// The dashboard's quick links open the student's last opened course. Only the course ID is kept,
// and the key includes the account, so another student on the same computer never sees it.
// localStorage (not sessionStorage) so the choice survives closing the browser.
function lastCourseKey(userId: number) { return `studyforge:lastCourse:${userId}`; }

export function readLastCourse(userId: number): number | null {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(lastCourseKey(userId)) ?? "null");
    if (Number.isSafeInteger(value)) return value as number;
  } catch { /* Private browsing or a stale entry: no last course. */ }
  return null;
}

export function saveLastCourse(userId: number, courseId: number) {
  try {
    localStorage.setItem(lastCourseKey(userId), String(courseId));
  } catch { /* Quick links fall back to the course picker. */ }
}

// Only forgets the course if it is still the saved one, so a newer visit is never erased.
export function forgetLastCourse(userId: number, courseId: number) {
  try {
    if (readLastCourse(userId) === courseId) localStorage.removeItem(lastCourseKey(userId));
  } catch { /* Nothing saved to forget. */ }
}
