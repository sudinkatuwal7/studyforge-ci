import QuizHistory from "../components/quizzes/QuizHistory";

// /quiz-history: every finished quiz and Survival game, across courses, filterable by course.
// The top bar's "Quiz History" (AppShell) is the page's only <h1>.
export default function QuizHistoryPage() {
  return (
    <div className="dashboard-page quiz-history-page">
      <QuizHistory />
    </div>
  );
}
