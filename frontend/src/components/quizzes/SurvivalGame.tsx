import { useEffect, useRef, useState } from "react";
import type { QuizQuestion } from "../../types/quiz";
import type { SurvivalAnswerResult, SurvivalFeedback, SurvivalSession } from "../../types/survival";
import SurvivalHearts from "./SurvivalHearts";
import "./survival.css";

// "C. Correct 1": the letter matches the option button, so the two are easy to connect.
function optionLabel(options: string[], index: number): string {
  const text = options[index];
  return text === undefined ? "" : `${String.fromCharCode(65 + index)}. ${text}`;
}

// The visible verdict and the screen-reader announcement, worded from the server's answer.
function describeAnswer(result: SurvivalAnswerResult, session: SurvivalSession, question: QuizQuestion) {
  if (result.is_correct) {
    return { verdict: "Correct! +1 point", correctOption: "", announcement: `Correct. Your score is ${session.score}.` };
  }
  // Named in the feedback because on a short screen the green option can be scrolled out of view.
  const correctOption = optionLabel(question.options, result.correct_option_index);
  const outOfLives = session.lives === 0;
  const lifeLost = outOfLives
    ? "Wrong answer. You lost your last life."
    : `Wrong answer. You lost a life. ${session.lives} of ${session.max_lives} left.`;
  const reveal = correctOption ? ` The correct answer was ${correctOption}.` : "";
  return {
    verdict: outOfLives ? "Out of lives!" : "Not quite. You lost a life.",
    correctOption,
    announcement: lifeLost + reveal,
  };
}

type Props = {
  session: SurvivalSession;
  // Set after an answer until the student presses Continue.
  feedback: SurvivalFeedback | null;
  answering: boolean;
  error: string;
  notice: string;
  onAnswer: (optionIndex: number) => void;
  onContinue: () => void;
};

// Display only: lives, score, progress and correctness all come from the latest
// server response. The panel sends answers; this component never grades one.
export default function SurvivalGame({ session, feedback, answering, error, notice, onAnswer, onContinue }: Props) {
  // While feedback is showing, the server has already moved on, so keep showing the answered question.
  const question = feedback?.question ?? session.current_question;
  const result = feedback?.result ?? null;
  const [chosen, setChosen] = useState<number | null>(null);
  const pending = answering ? chosen : null;
  const headingRef = useRef<HTMLHeadingElement>(null);
  const continueRef = useRef<HTMLButtonElement>(null);
  const questionId = question?.id;

  // The option that had focus is disabled after an answer: move to Continue, then to the next question.
  useEffect(() => { if (feedback) continueRef.current?.focus(); }, [feedback]);
  useEffect(() => { if (!feedback) headingRef.current?.focus(); }, [feedback, questionId]);

  if (!question) return <p role="alert">This game has no question to show. Reload the page to continue.</p>;

  const answered = session.status === "ACTIVE" ? session.current_position - 1 : session.current_position;
  const lostLife = result !== null && !result.is_correct;
  const described = result ? describeAnswer(result, session, question) : null;
  const waitingText = answering ? "Checking your answer." : "";
  const announcement = described ? described.announcement : waitingText;
  const outcome = !result ? "" : result.is_correct ? " survival-was-correct" : " survival-was-wrong";

  return <section className={`survival${outcome}`} aria-label="Survival quiz">
    <header className="survival-hud">
      <SurvivalHearts lives={session.lives} maxLives={session.max_lives} losing={lostLife ? session.lives : null} />
      <p className="survival-score">Score: <strong key={session.score} className={result?.is_correct ? "survival-bump" : undefined}>{session.score}</strong></p>
    </header>

    <div className="survival-progress">
      <p>Question {question.position} of {session.total_questions}</p>
      <progress value={Math.max(0, answered)} max={session.total_questions} aria-label="Game progress" />
    </div>

    {notice && <p role="alert" className="survival-notice">{notice}</p>}

    <h3 ref={headingRef} tabIndex={-1} className="survival-question">{question.text}</h3>

    <div className="survival-options" role="group" aria-label="Answer options">
      {question.options.map((option, index) => {
        const isCorrect = result?.correct_option_index === index;
        const isChosen = result ? result.selected_option_index === index : pending === index;
        const state = result ? (isCorrect ? "correct" : isChosen ? "wrong" : "dim") : isChosen ? "pending" : "";
        return <button key={`${question.id}-${index}`} type="button" disabled={answering || result !== null}
          className={`survival-option${state ? ` survival-option-${state}` : ""}`}
          onClick={() => { setChosen(index); onAnswer(index); }}>
          <span className="survival-option-letter" aria-hidden="true">{String.fromCharCode(65 + index)}</span>
          <span className="survival-option-text">{option}</span>
          {/* The space keeps the accessible name "Stack Correct answer", not "StackCorrect answer". */}
          {result && isCorrect && <>{" "}<span className="survival-option-tag">Correct answer</span></>}
          {result && isChosen && !isCorrect && <>{" "}<span className="survival-option-tag">Your answer</span></>}
        </button>;
      })}
    </div>

    {/* Always mounted so screen readers hear each result. */}
    <p role="status" className="survival-sr-only">{announcement}</p>

    {result && <div className={`survival-feedback ${result.is_correct ? "survival-feedback-correct" : "survival-feedback-wrong"}`}>
      <p className="survival-verdict">{described?.verdict}</p>
      {described?.correctOption && <p className="survival-answer">The correct answer was <strong>{described.correctOption}</strong></p>}
      {result.explanation && <p className="survival-explanation">{result.explanation}</p>}
      <button ref={continueRef} type="button" className="survival-primary" onClick={onContinue}>
        {session.status === "ACTIVE" ? "Next question" : "See results"}
      </button>
    </div>}

    {error && <p role="alert" className="quiz-error">{error}</p>}
  </section>;
}
