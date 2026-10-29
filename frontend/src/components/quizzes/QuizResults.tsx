import type { QuizResult } from "../../types/quiz";

type Props = { result: QuizResult; onRestart: () => void };

// Shown only after a graded submission exists, so showing the correct answers
// and explanations here cannot leak anything mid-quiz.
export default function QuizResults({ result, onRestart }: Props) {
  const questions = [...result.questions].sort((a, b) => a.position - b.position);
  return <section className="quiz-results" aria-label="Quiz results">
    <h3>{result.title}</h3>
    <p className="quiz-score" role="status">
      You scored {result.score} out of {result.total_questions} ({result.percentage}%)
    </p>
    <ol className="quiz-review">
      {questions.map((question) => <li key={question.id} className={question.is_correct ? "quiz-correct" : "quiz-incorrect"}>
        <p><strong>{question.text}</strong></p>
        <p className="quiz-verdict">
          {question.is_correct ? "Correct" : question.selected_option_index === null ? "Not answered" : "Incorrect"}
        </p>
        <ul>
          {question.options.map((option, optionIndex) => {
            const isCorrect = optionIndex === question.correct_option_index;
            const isSelected = optionIndex === question.selected_option_index;
            return <li key={optionIndex} className={isCorrect ? "quiz-option-correct" : isSelected ? "quiz-option-wrong" : undefined}>
              {option}
              {isCorrect && <span> (correct answer)</span>}
              {isSelected && !isCorrect && <span> (your answer)</span>}
            </li>;
          })}
        </ul>
        <p className="quiz-explanation">{question.explanation}</p>
      </li>)}
    </ol>
    <button type="button" onClick={onRestart}>Take another quiz</button>
  </section>;
}
