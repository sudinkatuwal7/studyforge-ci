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

const COURSE_TONES = ["lavender", "sage", "peach", "blue"] as const;

function CourseList({
  refreshKey,
  onCourses,
  embedded = false,
}: {
  refreshKey: number;
  onCourses?: (courses: Course[]) => void;
  embedded?: boolean;
}) {
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

  useEffect(() => {
    if (state.status === "ready") onCourses?.(state.courses);
  }, [onCourses, state]);

  return (
    <section className={embedded ? "course-list course-list-embedded" : "course-list"}>
      {!embedded && <h2>Your courses</h2>}
      {state.status === "loading" && <p>Loading courses...</p>}
      {state.status === "logged-out" && <p>Log in to see your courses.</p>}
      {state.status === "error" && <p className="form-error">{state.message}</p>}
      {state.status === "ready" && state.courses.length === 0 && (
        <p>You have no courses yet.</p>
      )}
      {state.status === "ready" && state.courses.length > 0 && (
        <ul>
          {/* Each card links to its own course page without a full page reload. */}
          {state.courses.map((course, index) => (
            <li key={course.id}>
              <Link className="course-card" to={`/courses/${course.id}`}>
                <span className={`course-icon course-icon-${COURSE_TONES[index % COURSE_TONES.length]}`} aria-hidden="true">
                  <CourseGlyph index={index} />
                </span>
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

function CourseGlyph({ index }: { index: number }) {
  const kind = index % 4;
  if (kind === 1) {
    return (
      <svg viewBox="0 0 24 24">
        <circle cx="7" cy="8" r="2.2" /><circle cx="17" cy="8" r="2.2" /><circle cx="12" cy="16" r="2.2" />
        <path d="M9 9.2 10.8 14M15 9.2 13.2 14" />
      </svg>
    );
  }
  if (kind === 2) {
    return (
      <svg viewBox="0 0 24 24">
        <rect x="4" y="5" width="16" height="11" rx="2" /><path d="M8 20h8M12 16v4" />
      </svg>
    );
  }
  if (kind === 3) {
    return (
      <svg viewBox="0 0 24 24">
        <path d="M7 4.5h8.5a2 2 0 0 1 2 2V19l-4-2.2L9.5 19V6.5a2 2 0 0 0-2-2H7z" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24">
      <path d="M8 8.5 4.5 12 8 15.5M16 8.5 19.5 12 16 15.5M13 6.5 11 17.5" />
    </svg>
  );
}

export default CourseList;
