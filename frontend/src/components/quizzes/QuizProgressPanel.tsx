import { useEffect, useState } from "react";
import { getQuizProgress } from "../../api/quizHistory";
import type { QuizProgress } from "../../types/quizHistory";
import { formatDate, loadErrorMessage, modeLabel } from "./quizHistoryFormat";

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; value: QuizProgress };

const percent = (value: number | null) => (value === null ? "None yet" : `${value}%`);

// One course's progress: quizzes taken, best score per mode, and the latest scores.
// Remount it (key) for a different course so an old course's numbers never show.
export default function QuizProgressPanel({ courseId, courseName, accessToken }: {
  courseId: number; courseName: string | undefined; accessToken: string;
}) {
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    getQuizProgress(courseId, accessToken, controller.signal)
      .then((value) => { if (!controller.signal.aborted) setState({ status: "ready", value }); })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) setState({ status: "error", message: loadErrorMessage(cause, "progress") });
      });
    return () => controller.abort();
  }, [accessToken, courseId]);

  const name = courseName ?? "this course";
  if (state.status === "loading") return <p role="status">Loading progress…</p>;
  if (state.status === "error") return <p className="form-error" role="alert">{state.message}</p>;
  // Nothing finished yet: the history's empty state already says what to do.
  if (state.value.quizzes_taken === 0) return null;

  const { quizzes_taken: taken, best_percentage: best, recent } = state.value;
  return (
    <section className="quiz-progress" aria-label={`Progress in ${name}`}>
      <h3>Progress in {name}</h3>
      <dl className="quiz-progress-stats">
        <div><dt>Quizzes taken</dt><dd>{taken}</dd></div>
        <div><dt>Best quiz score</dt><dd>{percent(best.regular)}</dd></div>
        <div><dt>Best Survival score</dt><dd>{percent(best.survival)}</dd></div>
      </dl>
      <h4>Recent scores</h4>
      <ol className="quiz-progress-recent" aria-label="Recent scores, newest first">
        {recent.map((item) => (
          <li key={item.quiz_id}>
            <strong>{item.percentage}%</strong>
            <span>{modeLabel(item)}</span>
            <time dateTime={item.submitted_at}>{formatDate(item.submitted_at)}</time>
          </li>
        ))}
      </ol>
    </section>
  );
}
