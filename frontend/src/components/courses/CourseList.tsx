import { useEffect, useState } from "react";
import { listCourses, NotLoggedInError } from "../../api/courses";
import type { Course } from "../../types/course";

type ListState =
  | { status: "loading" }
  | { status: "logged-out" }
  | { status: "error"; message: string }
  | { status: "ready"; courses: Course[] };

function CourseList() {
  const [state, setState] = useState<ListState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;

    listCourses()
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
  }, []);

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
          {state.courses.map((course) => (
            <li key={course.id}>
              <strong>{course.name}</strong>
              {course.description !== "" && <p>{course.description}</p>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default CourseList;
