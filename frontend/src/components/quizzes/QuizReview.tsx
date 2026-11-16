import type { QuestionResult } from "../../types/quiz";

type Props = {
  questions: QuestionResult[];
  // What a question with no answer is called: "Not answered" in a regular quiz,
  // "Not reached" in Survival, where every question reached was answered.
  unansweredLabel?: string;
};

// The graded question-by-question list, shared by the regular results and the
// Survival summary. Only rendered from a results response, so it cannot leak answers mid-quiz.
export default function QuizReview({ questions, unansweredLabel = "Not answered" }: Props) {
  const sorted = [...questions].sort((a, b) => a.position - b.position);
  return <ol className="quiz-review">
    {sorted.map((question) => <li key={question.id} className={question.is_correct ? "quiz-correct" : "quiz-incorrect"}>
      <p><strong>{question.text}</strong></p>
      <p className="quiz-verdict">
        {question.is_correct ? "Correct" : question.selected_option_index === null ? unansweredLabel : "Incorrect"}
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
  </ol>;
}
