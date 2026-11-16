import { useEffect, useRef } from "react";
import type { QuizResult } from "../../types/quiz";
import QuizReview from "./QuizReview";

type Props = { result: QuizResult; onRestart: () => void };

// Shown only after a graded submission exists, so showing the correct answers
// and explanations here cannot leak anything mid-quiz.
export default function QuizResults({ result, onRestart }: Props) {
  const heading = useRef<HTMLHeadingElement>(null);
  // The Submit button that had focus is gone, so start keyboard and screen reader users here.
  useEffect(() => heading.current?.focus(), []);
  return <section className="quiz-results" aria-label="Quiz results">
    <h3 ref={heading} tabIndex={-1}>{result.title}</h3>
    <p className="quiz-score" role="status">
      You scored {result.score} out of {result.total_questions} ({result.percentage}%)
    </p>
    <QuizReview questions={result.questions} />
    <button type="button" onClick={onRestart}>Take another quiz</button>
  </section>;
}
