import { useEffect, useState } from "react";
import { Link, Navigate, useLocation, useParams } from "react-router-dom";
import { ApiError } from "../api/client";
import { getCourse } from "../api/courses";
import CourseWorkspace from "../components/courses/CourseWorkspace";
import { type CourseSection, coursePath, isCourseSection } from "../components/courses/courseSections";
import { useAuth } from "../context/AuthContext";
import type { Course } from "../types/course";

// Keep loading and error messages separate from the successfully loaded course.
type CourseState =
  | { status: "loading" }
  | { status: "ready"; course: Course }
  | { status: "error"; message: string };

function CourseDetail({ courseId, section }: { courseId: string; section: CourseSection }) {
  const { accessToken } = useAuth();
  const [state, setState] = useState<CourseState>({ status: "loading" });

  useEffect(() => {
    // Do not show an old response after the student leaves or switches courses.
    let cancelled = false;

    // Load the course from Django so a direct link or page refresh also works.
    getCourse(accessToken, courseId)
      .then((course) => {
        if (!cancelled) setState({ status: "ready", course });
      })
      .catch((error: unknown) => {
        if (cancelled) return;

        // Explain missing courses and expired logins using the API's status code.
        let message = "Could not load this course. Please reload the page to try again.";
        if (error instanceof ApiError && error.status === 404) {
          message = "Course not found or you do not have access to it.";
        } else if (error instanceof ApiError && error.status === 401) {
          message = "Your session has expired. Please reload the page to sign in again.";
        }
        setState({ status: "error", message });
      });

    return () => {
      cancelled = true;
    };
  }, [accessToken, courseId]);

  // Hand the authenticated course to the workspace only after it loads successfully.
  if (state.status === "ready") return <CourseWorkspace course={state.course} section={section} />;

  return (
    <section className="course-detail">
      <Link to="/">← My courses</Link>
      {state.status === "loading" && <p role="status">Loading course...</p>}
      {state.status === "error" && <p className="form-error" role="alert">{state.message}</p>}

    </section>
  );
}

export default function CourseDetailPage() {
  // For /courses/7/notes, React Router provides courseId "7" and section "notes".
  const { courseId = "", section } = useParams();
  const { search } = useLocation();
  const { user } = useAuth();

  // A bare or unknown section opens Materials without adding a history entry, keeping ?pandu.
  if (!isCourseSection(section)) {
    return <Navigate to={{ pathname: coursePath(courseId), search }} replace />;
  }

  // Reset for another course or account, but preserve in-flight chat work when the token refreshes.
  // The key leaves out the section so switching sections keeps the workspace (and Pandu) mounted.
  return <CourseDetail key={`${courseId}:${user?.id ?? "signed-out"}`} courseId={courseId} section={section} />;
}
