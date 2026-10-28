import { useState } from "react";
import type { Quiz, QuizAnswer } from "../../types/quiz";

type Props = {
  quiz: Quiz;
  submitting: boolean;
  error: string;
  onSubmit: (answers: QuizAnswer[]) => void;
};

// Answers live here as { questionId: optionIndex }; a missing key is unanswered.
// Nothing is sent to the server until the final Submit Quiz, so a student can
// move around and change their mind freely.
export default function QuizPlayer({ quiz, submitting, error, onSubmit }: Props) {
  const questions = [...quiz.questions].sort((a, b) => a.position - b.position);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [confirming, setConfirming] = useState(false);

  const question = questions[index];
  const answered = questions.filter((item) => answers[item.id] !== undefined).length;
  const unanswered = questions.length - answered;
  const isLast = index === questions.length - 1;

  const go = (next: number) => { setConfirming(false); setIndex(next); };
  const submit = () => onSubmit(questions.map((item) => ({
    question_id: item.id,
    selected_option_index: answers[item.id] ?? null,
  })));

  if (!question) return <p role="alert">This quiz has no questions.</p>;

  return <section className="quiz-player" aria-label={quiz.title}>
    <header>
      <h3>{quiz.title}</h3>
      <p role="status" className="quiz-progress">
        Question {index + 1} of {questions.length} · {answered} of {questions.length} answered
      </p>
      <progress value={answered} max={questions.length} aria-label="Quiz progress" />
    </header>

    <fieldset key={question.id} disabled={submitting} className="quiz-question">
      <legend>{question.text}</legend>
      {question.options.map((option, optionIndex) => <label key={optionIndex} className="quiz-option">
        <input type="radio" name={`question-${question.id}`} checked={answers[question.id] === optionIndex}
          onChange={() => { setConfirming(false); setAnswers((current) => ({ ...current, [question.id]: optionIndex })); }} />
        <span>{option}</span>
      </label>)}
    </fieldset>

    <nav aria-label="Questions" className="quiz-dots">
      {questions.map((item, itemIndex) => <button key={item.id} type="button" disabled={submitting}
        aria-label={`Question ${itemIndex + 1}${answers[item.id] !== undefined ? ", answered" : ", unanswered"}`}
        aria-current={itemIndex === index ? "step" : undefined}
        className={answers[item.id] !== undefined ? "quiz-dot quiz-dot-answered" : "quiz-dot"}
        onClick={() => go(itemIndex)}>{itemIndex + 1}</button>)}
    </nav>

    <div className="quiz-nav">
      <button type="button" onClick={() => go(index - 1)} disabled={submitting || index === 0}>Previous</button>
      {!isLast && <button type="button" onClick={() => go(index + 1)} disabled={submitting}>Next</button>}
      {isLast && !confirming && <button type="button" className="quiz-submit" disabled={submitting}
        onClick={() => unanswered ? setConfirming(true) : submit()}>
        {submitting ? "Submitting..." : "Submit Quiz"}
      </button>}
    </div>

    {confirming && <div role="alert" className="quiz-confirm">
      <p>{unanswered === 1 ? "1 question is" : `${unanswered} questions are`} unanswered. Unanswered questions count as incorrect.</p>
      <button type="button" className="quiz-submit" disabled={submitting} onClick={submit}>
        {submitting ? "Submitting..." : "Submit anyway"}
      </button>
      <button type="button" disabled={submitting} onClick={() => setConfirming(false)}>Keep answering</button>
    </div>}

    {error && <p role="alert" className="quiz-error">{error}</p>}
  </section>;
}
