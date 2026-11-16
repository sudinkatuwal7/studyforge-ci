import { useEffect, useRef } from "react";
import type { QuizResult } from "../../types/quiz";
import type { SurvivalSession } from "../../types/survival";
import QuizReview from "./QuizReview";
import SurvivalHearts from "./SurvivalHearts";
import type { ReviewState } from "./useSurvivalGame";
import "./survival.css";

type Props = {
  session: SurvivalSession;
  busy: boolean;
  review: QuizResult | null;
  reviewState: ReviewState;
  onReview: () => void;
  onPlayAgain: () => void;
  onExit: () => void;
};

// Shown once the server reports GAME_OVER or COMPLETED. Every number is the server's final state.
export default function SurvivalSummary({ session, busy, review, reviewState, onReview, onPlayAgain, onExit }: Props) {
  const heading = useRef<HTMLHeadingElement>(null);
  const reviewHeading = useRef<HTMLHeadingElement>(null);
  // The Continue button that had focus is gone, so start keyboard and screen reader users here.
  useEffect(() => heading.current?.focus(), []);
  // The Review answers button disappears once the review loads, so move focus to it.
  useEffect(() => { if (review) reviewHeading.current?.focus(); }, [review]);
  const survived = session.status === "COMPLETED";
  const livesLeft = session.lives === 1 ? "1 life" : `${session.lives} lives`;
  const loadingReview = reviewState === "loading";

  return <section className={`survival-summary ${survived ? "survival-summary-won" : "survival-summary-lost"}`} aria-label="Survival results">
    <h3 ref={heading} tabIndex={-1}>{survived ? "You survived!" : "Game over"}</h3>
    <SurvivalHearts lives={session.lives} maxLives={session.max_lives} />
    <p className="survival-final-score">Final score: <strong>{session.score}</strong> out of {session.total_questions}</p>
    <p>{survived
      ? `You answered every question with ${livesLeft} left.`
      : `You ran out of lives on question ${session.current_position} of ${session.total_questions}.`}</p>
    <div className="survival-actions">
      <button type="button" className="survival-primary" disabled={busy} onClick={onPlayAgain}>
        {busy ? "Starting a new game..." : "Play again"}
      </button>
      {!review && <button type="button" disabled={busy || loadingReview} onClick={onReview}>
        {loadingReview ? "Loading answers..." : "Review answers"}
      </button>}
      <button type="button" disabled={busy} onClick={onExit}>Exit</button>
    </div>
    {busy && <p role="status">Writing your questions. This can take several seconds.</p>}
    {reviewState === "error" && <p role="alert" className="quiz-error">Your answers could not be loaded. Try again.</p>}
    {review && <section className="survival-review" aria-label="Your answers">
      <h4 ref={reviewHeading} tabIndex={-1}>Your answers</h4>
      <QuizReview questions={review.questions} unansweredLabel="Not reached" />
    </section>}
  </section>;
}
