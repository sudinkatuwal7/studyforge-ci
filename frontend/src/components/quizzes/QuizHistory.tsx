import { useEffect, useId, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { listCourses } from "../../api/courses";
import { listQuizHistory } from "../../api/quizHistory";
import { useAuth } from "../../context/AuthContext";
import type { Course } from "../../types/course";
import type { QuizHistoryItem } from "../../types/quizHistory";
import { coursePath } from "../courses/courseSections";
import EmptyState from "../shared/EmptyState";
import { formatDate, loadErrorMessage, modeLabel, scoreLabel } from "./quizHistoryFormat";
import "./QuizHistory.css";

type LoadState<T> =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; value: T };

// The filter is in the URL (?course=7) so a refresh, a shared link and Back keep it.
function parseCourseId(value: string | null): number | undefined {
  if (value === null || !/^[1-9]\d*$/.test(value)) return undefined;
  const id = Number(value);
  return Number.isSafeInteger(id) ? id : undefined;
}

export default function QuizHistory() {
  const { accessToken } = useAuth();
  if (!accessToken) return <p role="alert">Sign in to see your quiz history.</p>;
  return <History accessToken={accessToken} />;
}

function History({ accessToken }: { accessToken: string }) {
  const filterId = useId();
  const [searchParams, setSearchParams] = useSearchParams();
  const [courses, setCourses] = useState<LoadState<Course[]>>({ status: "loading" });
  // Tagged with the filter it was loaded for, so a list never shows under the wrong course.
  const [history, setHistory] = useState<{ filter: string; result: LoadState<QuizHistoryItem[]> } | null>(null);

  const rawCourse = searchParams.get("course");
  const requestedId = parseCourseId(rawCourse);
  const knownCourse = courses.status === "ready" ? courses.value.find((course) => course.id === requestedId) : undefined;
  // Not a course id, or not one of the student's courses (deleted, or another student's).
  const staleFilter = rawCourse !== null && (requestedId === undefined || (courses.status === "ready" && !knownCourse));
  const courseId = staleFilter ? undefined : requestedId;
  const filter = String(courseId ?? "all");

  useEffect(() => {
    let cancelled = false;
    listCourses(accessToken)
      .then((value) => { if (!cancelled) setCourses({ status: "ready", value }); })
      .catch((cause: unknown) => { if (!cancelled) setCourses({ status: "error", message: loadErrorMessage(cause, "courses") }); });
    return () => { cancelled = true; };
  }, [accessToken]);

  useEffect(() => {
    // Aborting on a filter change keeps a slower, older response from replacing the new list.
    const controller = new AbortController();
    listQuizHistory(accessToken, courseId, controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) setHistory({ filter, result: { status: "ready", value } });
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) setHistory({ filter, result: { status: "error", message: loadErrorMessage(cause, "quiz history") } });
      });
    return () => controller.abort();
  }, [accessToken, courseId, filter]);

  // Drop a filter that cannot apply, without adding a history entry.
  useEffect(() => {
    if (!staleFilter) return;
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.delete("course");
      return next;
    }, { replace: true });
  }, [staleFilter, setSearchParams]);

  // Each filter change is a history entry, so Back returns to the previous course.
  function chooseCourse(value: string) {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      if (value) next.set("course", value);
      else next.delete("course");
      return next;
    });
  }

  const result: LoadState<QuizHistoryItem[]> = history?.filter === filter ? history.result : { status: "loading" };

  return (
    <section className="quiz-history" aria-labelledby={`${filterId}-heading`}>
      <div className="section-heading quiz-history-toolbar">
        <h2 id={`${filterId}-heading`}>Past results</h2>
        <div className="quiz-history-filter">
          <label htmlFor={filterId}>Course</label>
          <select
            id={filterId}
            value={courseId ?? ""}
            disabled={courses.status !== "ready"}
            onChange={(event) => chooseCourse(event.target.value)}
          >
            <option value="">All courses</option>
            {courses.status === "ready" && courses.value.map((course) => (
              <option key={course.id} value={course.id}>{course.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* The results still list without courses; only the filter is lost. */}
      {courses.status === "error" && (
        <p className="form-error" role="alert">{courses.message} The course filter is unavailable.</p>
      )}

      {result.status === "loading" && <p role="status">Loading quiz history…</p>}
      {result.status === "error" && <p className="form-error" role="alert">{result.message}</p>}
      {result.status === "ready" && result.value.length === 0 && (
        courseId === undefined ? (
          <EmptyState message="No quiz results yet. Open a course and take a quiz or play Survival.">
            <Link to="/courses" className="empty-state-action">Go to my courses</Link>
          </EmptyState>
        ) : (
          <EmptyState message={`No quiz results for ${knownCourse?.name ?? "this course"} yet.`}>
            <Link to={coursePath(courseId, "quizzes")} className="empty-state-action">Take a quiz in this course</Link>
          </EmptyState>
        )
      )}
      {result.status === "ready" && result.value.length > 0 && <HistoryList items={result.value} />}
    </section>
  );
}

export function HistoryList({ items }: { items: QuizHistoryItem[] }) {
  return (
    <ul className="quiz-history-list">
      {items.map((item) => (
        <li key={item.quiz_id} className="quiz-history-item">
          <div className="quiz-history-main">
            <span className="quiz-history-title">{item.title}</span>
            <span className="quiz-history-score">{scoreLabel(item)}</span>
          </div>
          <p className="quiz-history-meta">
            <span>{item.course_name}</span>
            <span>{modeLabel(item)}</span>
            <time dateTime={item.submitted_at}>{formatDate(item.submitted_at)}</time>
          </p>
        </li>
      ))}
    </ul>
  );
}
