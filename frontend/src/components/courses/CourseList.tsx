import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listCourses, NotLoggedInError } from "../../api/courses";
import { useAuth } from "../../context/AuthContext";
import type { Course } from "../../types/course";

// The list shows one of these states: loading, logged out, an error, or courses.
type ListState =
  | { status: "loading" }
  | { status: "logged-out" }
  | { status: "error"; message: string }
  | { status: "ready"; courses: Course[] };

function CourseList({ refreshKey }: { refreshKey: number }) {
  const { accessToken } = useAuth();
  const [state, setState] = useState<ListState>({ status: "loading" });

  useEffect(() => {
    // Ignore an old response if this component unmounts or a new request starts.
    let cancelled = false;

    listCourses(accessToken)
      .then((courses) => {
        if (!cancelled) {
          setState({ status: "ready", courses });
        }
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }

        if (error instanceof NotLoggedInError) {
          setState({ status: "logged-out" });
          return;
        }

        const message =
          error instanceof Error ? error.message : "Could not load courses.";
        setState({ status: "error", message });
      });

    return () => {
      cancelled = true;
    };
  // Fetch again after login or when App signals that a course was created.
  }, [accessToken, refreshKey]);

  return (
    <section className="course-list">
      <h2>Your courses</h2>
      {state.status === "loading" && <p>Loading courses...</p>}
      {state.status === "logged-out" && <p>Log in to see your courses.</p>}
      {state.status === "error" && <p className="form-error">{state.message}</p>}
      {state.status === "ready" && state.courses.length === 0 && (
        <p>You have no courses yet.</p>
      )}
      {state.status === "ready" && state.courses.length > 0 && (
        <ul>
          {/* Each card links to its own course page without a full page reload. */}
          {state.courses.map((course) => (
            <li key={course.id}>
              <Link className="course-card" to={`/courses/${course.id}`}>
                <strong>{course.name}</strong>
                {course.description !== "" && <p>{course.description}</p>}
                <span className="course-card-action">Open course →</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default CourseList;
