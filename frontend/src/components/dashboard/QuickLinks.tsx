import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { Course } from "../../types/course";
import { coursePath } from "../courses/courseSections";
import { focusCourseForm } from "../courses/focusCourseForm";
import { forgetLastCourse, readLastCourse, saveLastCourse } from "../courses/lastCourse";

type Props = {
  // null while the dashboard's course list is still loading. Must be userId's own courses:
  // a saved course missing from this list is forgotten. App keys the dashboard by account to ensure it.
  courses: Course[] | null;
  loadFailed: boolean;
  userId: number | undefined;
};

function savedCourseFor(userId: number | undefined) {
  return userId === undefined ? null : readLastCourse(userId);
}

export default function QuickLinks({ courses, loadFailed, userId }: Props) {
  const [chosenId, setChosenId] = useState(() => savedCourseFor(userId));
  const [picking, setPicking] = useState(false);
  // The account this card's choice belongs to. When it changes (including signing in after the
  // card mounted), start again from that account's own saved course, never the previous one's.
  const [chosenFor, setChosenFor] = useState(userId);
  if (chosenFor !== userId) {
    setChosenFor(userId);
    setChosenId(savedCourseFor(userId));
    setPicking(false);
  }
  const course = courses?.find((item) => item.id === chosenId) ?? null;
  // The saved course was deleted or is no longer the student's: fall back to the picker.
  const stale = courses !== null && chosenId !== null && course === null;

  useEffect(() => {
    if (stale && userId !== undefined && chosenId !== null) forgetLastCourse(userId, chosenId);
  }, [stale, userId, chosenId]);

  function choose(courseId: number) {
    setChosenId(courseId);
    setPicking(false);
    if (userId !== undefined) saveLastCourse(userId, courseId);
  }

  const showLinks = course !== null && !picking;

  return (
    <section className="quick-links" aria-labelledby="quick-links-heading">
      <div className="section-heading">
        <h2 id="quick-links-heading">Quick links</h2>
        {showLinks && courses !== null && courses.length > 1 && (
          <button type="button" className="new-link link-button" onClick={() => setPicking(true)}>
            Change course
          </button>
        )}
        {picking && course !== null && (
          <button type="button" className="new-link link-button" onClick={() => setPicking(false)}>
            Cancel
          </button>
        )}
      </div>

      {loadFailed && (
        <p className="form-error" role="alert">Could not load your courses, so quick links are unavailable.</p>
      )}
      {!loadFailed && courses === null && <p role="status">Loading quick links...</p>}
      {/* Shown for this visit only: the missing ID is already forgotten, and picking a course clears it. */}
      {!loadFailed && stale && (
        <p className="quick-links-notice" role="status">Your last opened course is no longer available.</p>
      )}
      {!loadFailed && courses !== null && courses.length === 0 && (
        <div className="quick-links-empty">
          <p>Create a course to get quick links to its materials, notes, quizzes and Pandu.</p>
          {/* The dashboard's course form sits below this card. */}
          <button type="button" className="quick-links-action" onClick={focusCourseForm}>Create your first course</button>
        </div>
      )}
      {!loadFailed && showLinks && (
        <>
          <p className="quick-links-course">{course.name}</p>
          <ul className="quick-links-grid">
            <li><Link className="quick-link quick-link-materials" to={coursePath(course.id, "materials")}><strong>Materials</strong><span>Upload and review files</span></Link></li>
            <li><Link className="quick-link quick-link-notes" to={coursePath(course.id, "notes")}><strong>Notes</strong><span>Generate study notes</span></Link></li>
            <li><Link className="quick-link quick-link-quizzes" to={coursePath(course.id, "quizzes")}><strong>Quizzes</strong><span>Test yourself</span></Link></li>
            <li><Link className="quick-link quick-link-pandu" to={`${coursePath(course.id, "materials")}?pandu=open`}><strong>Ask Pandu</strong><span>Chat about this course</span></Link></li>
          </ul>
        </>
      )}
      {!loadFailed && courses !== null && courses.length > 0 && !showLinks && (
        <>
          <p>Choose a course for your quick links.</p>
          <ul className="quick-links-picker" aria-label="Choose a course">
            {courses.map((item) => (
              <li key={item.id}>
                <button type="button" aria-pressed={item.id === course?.id} onClick={() => choose(item.id)}>{item.name}</button>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
