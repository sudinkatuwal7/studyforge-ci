import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import CourseForm from "../components/courses/CourseForm";
import CourseList from "../components/courses/CourseList";
import { focusCourseForm } from "../components/courses/focusCourseForm";

// /courses: every course the student owns, plus the form to add one.
// The page's only <h1> is the top bar's "My Courses" (AppShell), so there is no heading here.
export default function CoursesPage({
  refreshKey,
  onCourseCreated,
}: {
  refreshKey: number;
  onCourseCreated: () => void;
}) {
  const location = useLocation();
  const focusOnArrival = (location.state as { focusCourseForm?: boolean } | null)?.focusCourseForm === true;

  useEffect(() => {
    if (focusOnArrival) focusCourseForm();
  }, [focusOnArrival, location.key]);

  return (
    <div className="dashboard-page courses-page">
      <div className="section-heading courses-toolbar">
        <p>Open a course to work with its materials, notes, quizzes and Pandu.</p>
        <button type="button" className="new-link link-button" aria-label="New course" onClick={focusCourseForm}>
          + New
        </button>
      </div>
      <CourseList refreshKey={refreshKey} onCourseChanged={onCourseCreated} embedded />
      <CourseForm onCreated={onCourseCreated} />
    </div>
  );
}
