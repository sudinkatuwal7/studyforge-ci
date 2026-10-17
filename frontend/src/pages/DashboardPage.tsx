import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import CourseForm from "../components/courses/CourseForm";
import CourseList from "../components/courses/CourseList";
import TodoPanel from "../components/todos/TodoPanel";
import type { Course } from "../types/course";
import type { TodoItem } from "../types/todo";

export default function DashboardPage({
  refreshKey,
  onCourseCreated,
}: {
  refreshKey: number;
  onCourseCreated: () => void;
}) {
  const { user } = useAuth();
  const [courses, setCourses] = useState<Course[] | null>(null);
  const [todos, setTodos] = useState<TodoItem[] | null>(null);
  const pending = todos?.filter((todo) => !todo.is_completed).length;
  const upcoming = todos?.filter((todo) => !todo.is_completed && todo.due_date) ?? [];
  const greeting = user?.first_name ? `Welcome back, ${user.first_name}!` : "Welcome back!";

  return (
    <div className="dashboard-page">
      <section className="welcome-banner">
        <div>
          <h2>{greeting}</h2>
          <p>Ready to make some progress today?</p>
          <a className="banner-button" href="#tasks">View my tasks →</a>
        </div>
        <Panda />
      </section>

      <section className="stat-row" aria-label="Study summary">
        <article className="stat-card stat-lavender">
          <p>Courses</p>
          <strong>{courses ? courses.length : "–"}</strong>
        </article>
        <article className="stat-card stat-sage">
          <p>Pending tasks</p>
          <strong>{pending ?? "–"}</strong>
        </article>
        <article className="stat-card stat-peach">
          <p>Upcoming</p>
          <strong>{todos ? upcoming.length : "–"}</strong>
        </article>
      </section>

      <div className="dashboard-columns">
        <div className="dashboard-column">
          <div className="section-heading">
            <h2 id="courses">My Courses</h2>
            <a className="new-link" href="#course-name">+ New</a>
          </div>
          <CourseList refreshKey={refreshKey} onCourses={setCourses} embedded />
          <CourseForm onCreated={onCourseCreated} />
        </div>

        <div className="dashboard-column">
          <TodoPanel refreshKey={refreshKey} onTodos={setTodos} />
          <section className="upcoming-card" aria-labelledby="upcoming-heading">
            <h2 id="upcoming-heading">Upcoming</h2>
            {upcoming.length === 0 ? (
              <p className="upcoming-empty">Your calendar will appear here</p>
            ) : (
              <ul>
                {upcoming.slice(0, 3).map((todo) => (
                  <li key={todo.id}>
                    <strong>{todo.title}</strong>
                    <span>{formatDueDate(todo.due_date)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formatDueDate(dueDate: string | null): string {
  if (!dueDate) return "No due date";
  const [year, month, day] = dueDate.split("-").map(Number);
  const monthName = MONTHS[month - 1];
  if (!year || !monthName || !day) return dueDate;
  return `${monthName} ${day}, ${year}`;
}

function Panda() {
  return (
    <svg className="panda" viewBox="0 0 120 120" role="img" aria-label="A panda reading">
      <circle cx="60" cy="64" r="46" fill="#FFE8C7" />
      <circle cx="34" cy="28" r="14" fill="#26334D" />
      <circle cx="86" cy="28" r="14" fill="#26334D" />
      <circle cx="60" cy="62" r="32" fill="#fff" />
      <ellipse cx="46" cy="58" rx="10" ry="12" fill="#26334D" />
      <ellipse cx="74" cy="58" rx="10" ry="12" fill="#26334D" />
      <circle cx="48" cy="56" r="3.5" fill="#fff" />
      <circle cx="76" cy="56" r="3.5" fill="#fff" />
      <ellipse cx="60" cy="72" rx="5" ry="3.5" fill="#26334D" />
      <path d="M52 78c3 4 13 4 16 0" fill="none" stroke="#26334D" strokeWidth="2" strokeLinecap="round" />
      <rect x="38" y="84" width="44" height="28" rx="4" fill="#F4E4C8" stroke="#26334D" strokeWidth="2" />
      <path d="M44 92h32M44 98h24" stroke="#7387E8" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
